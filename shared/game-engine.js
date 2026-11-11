// 炸飞机对局引擎：房间、准备、开局、攻击、回合计时、再来一局、掉线处理。
//
// 与传输层无关：服务端用它跑联机对局（server.js 把 WebSocket 事件转进来），
// 浏览器用它跑人机对战（src/local/ 里的本地会话），两边规则完全一致。
//
// 接入方式：
//   const engine = new GameEngine({ send(clientId, event, payload) {...} });
//   engine.connect(clientId)
//   engine.handle(clientId, event, payload, ack)   // 客户端事件，见 CLIENT_EVENTS
//   engine.detach(clientId, graceMs) / engine.reattach(clientId) / engine.disconnect(clientId)
//
// 发给客户端的事件：
//   roomState   { roomId, leaderId, phase, players }   房间成员 / 准备状态 / 阶段变化
//   roomsList   [{ id, players }]                       大厅可加入的房间
//   gameStart   { currentTurn, turnMs, players }        players 中只有自己的飞机带坐标
//   attackResult{ attacker, position, result, planeIndex, sunkPlane, auto }
//   turnChange  { currentTurn, continueTurn, turnMs }
//   turnSync    { currentTurn, remainingMs }            重连后校准倒计时
//   gameOver    { winner, reason, roomId, reveal }      reveal 为双方完整布局
//   playerOffline / playerOnline / playerLeft / rematchRequested
//   gameError   { message, code?, position? }
import { normalizePlanes, COLUMNS } from './planes.js';

export const CLIENT_EVENTS = [
  'createRoom', 'joinRoom', 'quickMatch', 'cancelMatch', 'syncRoom', 'listRooms', 'leaveRoom',
  'playerReady', 'playerUnready', 'startGame', 'attack', 'restartGame',
];

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_TIMEOUTS = 3;
const MAX_NAME = 20;

const cellKey = (row, col) => `${row},${col}`;

function cleanName(value, fallback) {
  const name = typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';
  return name || fallback;
}

export class GameEngine {
  constructor({ send, turnMs = 30_000, prepareMs = 60_000, log = () => {} }) {
    this.send = send;
    this.turnMs = turnMs;
    this.prepareMs = prepareMs;
    this.log = log;
    this.rooms = new Map();
    this.clients = new Map(); // clientId -> { id, username, roomId }
  }

  // ---------------------------------------------------------------- 连接

  connect(clientId) {
    this.clients.set(clientId, { id: clientId, username: '', roomId: null, online: true });
    this.broadcastRooms();
  }

  detach(clientId, graceMs) {
    const client = this.clients.get(clientId);
    if (client) client.online = false;
    const { room, player } = this.locate(clientId);
    if (!player) { this.broadcastRooms(); return; }
    player.offline = true;
    this.toOthers(room, clientId, 'playerOffline', { playerId: clientId, username: player.username, graceMs });
    this.broadcastRoom(room);
    this.broadcastRooms();
    this.log(`玩家 ${player.username} 暂时断线`);
  }

  reattach(clientId) {
    const client = this.clients.get(clientId);
    if (client) client.online = true;
    const { room, player } = this.locate(clientId);
    if (!player) { this.broadcastRooms(); return; }
    player.offline = false;
    this.toOthers(room, clientId, 'playerOnline', { playerId: clientId, username: player.username });
    this.broadcastRoom(room);
    this.maybeStartPublic(room);
    this.broadcastRooms();
    if (room.phase === 'playing') {
      this.send(clientId, 'turnSync', {
        currentTurn: room.currentTurn,
        remainingMs: Math.max(0, room.turnDeadline - Date.now()),
      });
    }
    this.log(`玩家 ${player.username} 已重连`);
  }

  disconnect(clientId) {
    this.leaveRoom(clientId, '对手离开了游戏');
    this.clients.delete(clientId);
    this.broadcastRooms();
  }

  // ---------------------------------------------------------------- 事件分发

  handle(clientId, event, payload = {}, ack) {
    const client = this.clients.get(clientId);
    if (!client || !CLIENT_EVENTS.includes(event)) return;
    const reply = typeof ack === 'function' ? ack : () => {};
    const data = payload && typeof payload === 'object' ? payload : {};
    try {
      switch (event) {
        case 'createRoom': return reply(this.createRoom(client, data));
        case 'joinRoom': return reply(this.joinRoom(client, data));
        case 'quickMatch': return reply(this.quickMatch(client, data));
        case 'cancelMatch': return reply(this.cancelMatch(client, data));
        case 'syncRoom': return reply(this.syncRoom(client));
        case 'listRooms': return this.sendLobby(clientId);
        case 'leaveRoom': return reply(this.leaveRoom(clientId, '对手离开了游戏'));
        case 'playerReady': return reply(this.playerReady(client, data));
        case 'playerUnready': return reply(this.playerUnready(client));
        case 'startGame': return reply(this.startGame(client));
        case 'attack': return reply(this.attack(client, data));
        case 'restartGame': return reply(this.restartGame(client));
        default: return undefined;
      }
    } catch (error) {
      this.log(`处理 ${event} 出错: ${error?.stack || error}`);
      reply({ success: false, message: '服务器内部错误' });
      return undefined;
    }
  }

  // ---------------------------------------------------------------- 房间

  createRoom(client, { username, roomId, visibility = 'private' } = {}) {
    const kind = visibility === 'public' ? 'public' : 'private';
    const wanted = typeof roomId === 'string' ? roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) : '';
    const current = client.roomId && this.rooms.get(client.roomId);
    // 重复请求：已经独自在同类等待房里（或请求的就是当前房间），直接返回当前房间
    if (current && current.phase === 'waiting' && current.players.length === 1 && current.visibility === kind
      && (!wanted || wanted === current.id)) {
      return this.syncRoom(client);
    }
    const blocked = this.releaseIdleRoom(client, '对局进行中，不能创建新房间');
    if (blocked) return blocked;
    client.username = cleanName(username, `玩家${client.id.slice(0, 4)}`);
    const id = wanted && !this.rooms.has(wanted) ? wanted : this.newRoomId();
    const room = {
      id,
      leaderId: client.id,
      phase: 'waiting',
      visibility: kind,
      waitingSince: Date.now(),
      prepareDeadline: 0,
      prepareTimer: null,
      players: [],
      currentTurn: null,
      turnDeadline: 0,
      turnTimer: null,
      shots: {},
      timeouts: {},
    };
    this.rooms.set(id, room);
    this.addPlayer(room, client);
    this.log(`房间 ${id} 已创建，房主 ${client.username}`);
    this.broadcastRooms();
    return { success: true, roomId: id, state: this.roomState(room), renamed: !!wanted && wanted !== id };
  }

  joinRoom(client, { username, roomId } = {}) {
    client.username = cleanName(username, `玩家${client.id.slice(0, 4)}`);
    const id = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
    const room = this.rooms.get(id);
    if (!room) return { success: false, message: '房间不存在' };
    if (room.players.some((p) => p.id === client.id)) return this.syncRoom(client);
    if (room.players.length >= 2) return { success: false, message: '房间已满' };
    if (room.phase === 'playing') return { success: false, message: '对局进行中' };
    if (room.visibility === 'public' && !this.isMatchable(room)) return { success: false, message: '该房间暂时无法加入，请刷新大厅' };
    const blocked = this.releaseIdleRoom(client, '对局进行中，请先在对局页面退出');
    if (blocked) return blocked;
    this.addPlayer(room, client);
    this.log(`${client.username} 加入房间 ${id}`);
    this.broadcastRoom(room);
    this.broadcastRooms();
    return { success: true, roomId: id, state: this.roomState(room) };
  }

  quickMatch(client, { username } = {}) {
    const current = client.roomId && this.rooms.get(client.roomId);
    // 重复请求：已经在公开等待房里，直接返回当前房间
    if (current?.visibility === 'public' && current.phase === 'waiting' && !current.result) return this.syncRoom(client);
    const blocked = this.releaseIdleRoom(client, '对局进行中，请先在对局页面退出再开始快速游戏');
    if (blocked) return blocked;
    const room = [...this.rooms.values()].filter((r) => this.isMatchable(r))
      .sort((a, b) => a.waitingSince - b.waitingSince)[0];
    return room ? this.joinRoom(client, { username, roomId: room.id })
      : this.createRoom(client, { username, visibility: 'public' });
  }

  /**
   * 客户端已回到大厅却仍挂在旧房间里（例如断网时从结算页返回）时，自动离开该房间。
   * 对局进行中不能这样离开，返回错误；否则返回 null。
   */
  releaseIdleRoom(client, playingMessage) {
    if (!client.roomId) return null;
    const current = this.rooms.get(client.roomId);
    if (!current) {
      client.roomId = null;
      return null;
    }
    if (current.phase === 'playing') return { success: false, message: playingMessage };
    this.leaveRoom(client.id, '对手离开了房间');
    return null;
  }

  cancelMatch(client, { roomId } = {}) {
    if (!client.roomId) return { success: true };
    const room = this.rooms.get(client.roomId);
    if (room?.id !== roomId || room.visibility !== 'public') return { success: false, message: '房间状态已变化，请重试' };
    if (room.phase !== 'waiting') return { success: false, message: '对局已开始，请在对局页面选择退出' };
    return this.leaveRoom(client.id, '对手取消了匹配');
  }

  isMatchable(room) {
    return room.visibility === 'public' && room.phase === 'waiting' && !room.result
      && room.players.length === 1 && !room.players[0].offline;
  }

  maybeStartPublic(room) {
    if (room.visibility === 'public' && room.phase === 'waiting' && room.players.length === 2
      && room.players.every((p) => p.ready && !p.offline)) {
      this.startGame(this.clients.get(room.leaderId));
    }
  }

  beginPreparation(room) {
    if (room.visibility !== 'public' || room.players.length !== 2 || room.phase !== 'waiting') return;
    if (room.prepareTimer) return;
    room.prepareDeadline = Date.now() + this.prepareMs;
    room.prepareTimer = setTimeout(() => this.expirePreparation(room.id), this.prepareMs);
  }

  expirePreparation(roomId) {
    const room = this.rooms.get(roomId);
    // 没有正在进行的准备倒计时（比如再战时对手还没回到房间）就什么都不做
    if (!room || room.phase !== 'waiting' || !room.prepareDeadline) return;
    this.clearPreparation(room);
    const expired = room.players.filter((p) => !p.ready || p.offline);
    for (const player of expired) {
      this.leaveRoom(player.id, '准备超时');
      this.send(player.id, 'matchCancelled', { roomId, message: '准备超时，已退出本次配对；可以重新快速游戏' });
    }
  }

  clearPreparation(room) {
    clearTimeout(room.prepareTimer);
    room.prepareTimer = null;
    room.prepareDeadline = 0;
  }

  syncRoom(client) {
    const room = client.roomId && this.rooms.get(client.roomId);
    if (!room) return { success: false, message: '你不在房间中' };
    const state = this.roomState(room);
    this.send(client.id, 'roomState', state);
    const player = room.players.find((p) => p.id === client.id);
    return {
      success: true, roomId: room.id, state,
      ownPlanes: player?.planes || [],
      game: room.gameId && (!room.result || room.resultPlayers.some((p) => p.id === client.id)) ? {
        gameId: room.gameId, roomId: room.id, currentTurn: room.currentTurn,
        turnMs: Math.max(0, room.turnDeadline - Date.now()),
        players: (room.resultPlayers || room.players).map((p) => ({
          ...this.publicPlayer(p),
          planes: p.id === client.id ? p.planes : (p.planes || []).map((plane) => ({ sunk: plane.sunk })),
        })),
        history: room.history || [], result: room.result || null,
      } : null,
    };
  }

  leaveRoom(clientId, reason) {
    const { room, player } = this.locate(clientId);
    const client = this.clients.get(clientId);
    if (client) client.roomId = null;
    if (!room || !player) return { success: true };
    this.clearPreparation(room);
    // 先结算再移除成员，双方都能收到结果和完整布局。
    if (room.phase === 'playing') {
      const opponent = room.players.find((p) => p.id !== clientId);
      this.finishGame(room, opponent.id, `${player.username} 离开了游戏`);
    }
    const result = room.result || null;
    room.players = room.players.filter((p) => p.id !== clientId);
    this.log(`${player.username} 离开房间 ${room.id}`);
    if (room.players.length === 0) {
      this.clearTurnTimer(room);
      this.rooms.delete(room.id);
    } else {
      const rest = room.players[0];
      room.waitingSince = Date.now();
      if (room.leaderId === clientId) room.leaderId = rest.id;
      this.send(rest.id, 'playerLeft', { playerId: clientId, username: player.username });
      if (room.phase === 'finished') {
        // 只剩一人时回到等待阶段，准备状态清零
        room.phase = 'waiting';
        rest.ready = false;
        rest.planes = null;
      }
      this.broadcastRoom(room);
    }
    this.broadcastRooms();
    return { success: true, result };
  }

  // ---------------------------------------------------------------- 准备与开局

  playerReady(client, { planes } = {}) {
    const { room, player } = this.locate(client.id);
    if (!player) return this.fail(client, '你不在房间中');
    if (room.phase !== 'waiting') return this.fail(client, '当前不能更改布局');
    const checked = normalizePlanes(planes);
    if (checked.error) return this.fail(client, `飞机布局无效：${checked.error}`, 'INVALID_PLANES');
    player.planes = checked.planes;
    player.ready = true;
    this.broadcastRoom(room);
    this.maybeStartPublic(room);
    this.broadcastRooms();
    return { success: true };
  }

  playerUnready(client) {
    const { room, player } = this.locate(client.id);
    if (!player || room.phase !== 'waiting') return { success: false };
    player.ready = false;
    player.planes = null;
    this.broadcastRoom(room);
    this.broadcastRooms();
    return { success: true };
  }

  startGame(client) {
    const { room, player } = this.locate(client.id);
    if (!player) return this.fail(client, '你不在房间中');
    if (room.leaderId !== client.id) return this.fail(client, '只有房主才能开始游戏');
    if (room.phase !== 'waiting') return this.fail(client, '游戏已经开始');
    if (room.players.length !== 2 || !room.players.every((p) => p.ready && !p.offline)) {
      return this.fail(client, '等待双方都准备好');
    }
    room.phase = 'playing';
    this.clearPreparation(room);
    room.shots = {};
    room.timeouts = {};
    room.startedAt = Date.now();
    room.gameId = `${room.id}-${room.startedAt}-${Math.random().toString(36).slice(2)}`;
    room.history = [];
    room.result = null;
    room.resultPlayers = null;
    room.players.forEach((p) => p.planes.forEach((plane) => { plane.sunk = false; }));
    const first = room.players[Math.floor(Math.random() * 2)];
    for (const viewer of room.players) {
      this.send(viewer.id, 'gameStart', {
        gameId: room.gameId,
        roomId: room.id,
        currentTurn: first.id,
        turnMs: this.turnMs,
        players: room.players.map((p) => ({
          ...this.publicPlayer(p),
          planes: p.id === viewer.id ? p.planes : p.planes.map(() => ({ sunk: false })),
        })),
      });
    }
    this.log(`房间 ${room.id} 开局，${first.username} 先手`);
    this.broadcastRooms();
    this.setTurn(room, first.id);
    return { success: true };
  }

  // ---------------------------------------------------------------- 对局

  attack(client, { position } = {}) {
    const error = this.performAttack(client.roomId, client.id, position);
    if (error) {
      this.send(client.id, 'gameError', { message: error, code: 'ATTACK_REJECTED', position });
      return { success: false, message: error };
    }
    return { success: true };
  }

  performAttack(roomId, attackerId, position, { auto = false } = {}) {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== 'playing') return '游戏未开始';
    if (room.currentTurn !== attackerId) return '现在不是你的回合';
    const row = Number(position?.row);
    const col = typeof position?.col === 'string' ? position.col.toUpperCase() : '';
    if (!Number.isInteger(row) || row < 1 || row > 10 || !COLUMNS.includes(col)) return '攻击位置无效';

    const shots = (room.shots[attackerId] = room.shots[attackerId] || new Set());
    const k = cellKey(row, col);
    if (shots.has(k)) return '这个格子已经攻击过了';
    const opponent = room.players.find((p) => p.id !== attackerId);
    if (opponent.planes.some((plane) => plane.sunk && plane.coordinates.some((c) => c.row === row && c.col === col))) {
      return '这架飞机已经击落，请选择其他格子';
    }
    shots.add(k);
    if (!auto) room.timeouts[attackerId] = 0;

    let result = 'miss';
    let planeIndex = -1;
    opponent.planes.forEach((plane, index) => {
      const hit = plane.coordinates.find((c) => c.row === row && c.col === col);
      if (hit) {
        planeIndex = index;
        result = hit.isHead ? 'sink' : 'hit';
      }
    });
    let sunkPlane = null;
    if (result === 'sink') {
      opponent.planes[planeIndex].sunk = true;
      sunkPlane = opponent.planes[planeIndex].coordinates; // 只公开被击落的这架
    }
    // 普通命中不能透露属于哪架飞机。历史也只存双方可见的信息。
    const event = { attacker: attackerId, position: { row, col }, result, auto,
      ...(result === 'sink' ? { planeIndex, sunkPlane } : {}),
    };
    room.history.push(event);
    this.toRoom(room, 'attackResult', event);

    if (opponent.planes.every((plane) => plane.sunk)) {
      this.finishGame(room, attackerId);
    } else if (result === 'sink') {
      this.setTurn(room, attackerId, { continueTurn: true }); // 击落机头可继续攻击
    } else {
      this.setTurn(room, opponent.id);
    }
    return null;
  }

  setTurn(room, playerId, { continueTurn = false } = {}) {
    this.clearTurnTimer(room);
    room.currentTurn = playerId;
    room.turnDeadline = Date.now() + this.turnMs;
    room.turnTimer = setTimeout(() => this.handleTurnTimeout(room.id), this.turnMs);
    this.toRoom(room, 'turnChange', { currentTurn: playerId, continueTurn, turnMs: this.turnMs });
  }

  handleTurnTimeout(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== 'playing') return;
    const playerId = room.currentTurn;
    room.timeouts[playerId] = (room.timeouts[playerId] || 0) + 1;
    const opponent = room.players.find((p) => p.id !== playerId);
    if (room.timeouts[playerId] >= MAX_TIMEOUTS) {
      this.finishGame(room, opponent.id, '对方连续超时未操作');
      return;
    }
    const shots = room.shots[playerId] || new Set();
    const free = [];
    const wrecks = new Set(opponent.planes.filter((p) => p.sunk).flatMap((p) => p.coordinates.map((c) => cellKey(c.row, c.col))));
    for (let row = 1; row <= 10; row++) {
      for (const col of COLUMNS) if (!shots.has(cellKey(row, col)) && !wrecks.has(cellKey(row, col))) free.push({ row, col });
    }
    if (free.length) this.performAttack(room.id, playerId, free[Math.floor(Math.random() * free.length)], { auto: true });
  }

  finishGame(room, winner, reason) {
    if (room.phase !== 'playing') return;
    this.clearTurnTimer(room);
    room.phase = 'finished';
    room.currentTurn = null;
    room.players.forEach((p) => { p.ready = false; });
    const reveal = room.players.map((p) => ({ id: p.id, planes: p.planes || [] }));
    room.resultPlayers = room.players.map((p) => ({ ...p }));
    room.result = {
      gameId: room.gameId,
      winner,
      reason: reason || '',
      roomId: room.id,
      reveal,
      durationMs: room.startedAt ? Date.now() - room.startedAt : 0,
    };
    this.toRoom(room, 'gameOver', room.result);
    const name = room.players.find((p) => p.id === winner)?.username || winner;
    this.log(`房间 ${room.id} 对局结束，胜者 ${name}${reason ? `（${reason}）` : ''}`);
    this.broadcastRoom(room);
    this.broadcastRooms();
  }

  restartGame(client) {
    const { room, player } = this.locate(client.id);
    if (!player) return this.fail(client, '你不在房间中');
    if (room.phase === 'playing') return this.fail(client, '对局进行中');
    this.toOthers(room, client.id, 'rematchRequested', { playerId: client.id, username: player.username });
    room.gameId = null;
    room.history = [];
    room.result = null;
    room.resultPlayers = null;
    // 双方都会点“再来一局”：第一位到达时重置；后到者不能清掉先到者已摆好的布局
    if (room.phase === 'finished') {
      room.phase = 'waiting';
      room.players.forEach((p) => {
        p.ready = false;
        p.planes = null;
      });
      // 准备计时等对手也回到房间（第二个人点再来一局）后再开始，避免把还在看结算的人踢走
      this.broadcastRoom(room);
      this.broadcastRooms();
    } else {
      this.beginPreparation(room);
      this.broadcastRoom(room);
      this.broadcastRooms();
    }
    return { success: true, roomId: room.id, state: this.roomState(room) };
  }

  // ---------------------------------------------------------------- 工具

  locate(clientId) {
    const client = this.clients.get(clientId);
    const room = client?.roomId ? this.rooms.get(client.roomId) : null;
    const player = room?.players.find((p) => p.id === clientId) || null;
    return { client, room, player };
  }

  addPlayer(room, client) {
    room.players.push({ id: client.id, username: client.username, ready: false, planes: null, offline: false });
    client.roomId = room.id;
    this.beginPreparation(room);
    this.broadcastRoom(room);
  }

  newRoomId() {
    let id;
    do {
      id = Array.from({ length: 6 }, () => ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)]).join('');
    } while (this.rooms.has(id));
    return id;
  }

  publicPlayer(p) {
    return { id: p.id, username: p.username, ready: !!p.ready, offline: !!p.offline };
  }

  roomState(room) {
    return { roomId: room.id, leaderId: room.leaderId, phase: room.phase,
      visibility: room.visibility, waitingSince: room.waitingSince,
      prepareDeadline: room.prepareDeadline, serverNow: Date.now(),
      players: room.players.map((p) => this.publicPlayer(p)) };
  }

  openRooms() {
    return [...this.rooms.values()]
      .filter((room) => this.isMatchable(room))
      .sort((a, b) => a.waitingSince - b.waitingSince)
      .map((room) => ({ id: room.id, players: room.players.length,
        host: room.players[0].username, ready: room.players[0].ready,
        waitingSince: room.waitingSince, serverNow: Date.now() }));
  }

  onlineCount() {
    let count = 0;
    for (const client of this.clients.values()) if (client.online) count += 1;
    return count;
  }

  sendLobby(clientId, list = this.openRooms(), online = this.onlineCount()) {
    this.send(clientId, 'roomsList', list);
    this.send(clientId, 'lobbyInfo', { online });
  }

  broadcastRoom(room) {
    this.toRoom(room, 'roomState', this.roomState(room));
  }

  // 只通知还在大厅（不在房间里）的客户端
  broadcastRooms() {
    // 房间列表和在线数只算一次，再分发给大厅里的每个客户端
    const list = this.openRooms();
    const online = this.onlineCount();
    for (const client of this.clients.values()) {
      if (!client.roomId && client.online) this.sendLobby(client.id, list, online);
    }
  }

  toRoom(room, event, payload) {
    for (const p of room.players) this.send(p.id, event, payload);
  }

  toOthers(room, clientId, event, payload) {
    for (const p of room.players) if (p.id !== clientId) this.send(p.id, event, payload);
  }

  clearTurnTimer(room) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }

  fail(client, message, code) {
    this.send(client.id, 'gameError', { message, code });
    return { success: false, message, code };
  }
}
