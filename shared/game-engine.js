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
  'createRoom', 'joinRoom', 'syncRoom', 'listRooms', 'leaveRoom',
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
  constructor({ send, turnMs = 30_000, log = () => {} }) {
    this.send = send;
    this.turnMs = turnMs;
    this.log = log;
    this.rooms = new Map();
    this.clients = new Map(); // clientId -> { id, username, roomId }
  }

  // ---------------------------------------------------------------- 连接

  connect(clientId) {
    this.clients.set(clientId, { id: clientId, username: '', roomId: null });
  }

  detach(clientId, graceMs) {
    const { room, player } = this.locate(clientId);
    if (!player) return;
    player.offline = true;
    this.toOthers(room, clientId, 'playerOffline', { playerId: clientId, username: player.username, graceMs });
    this.broadcastRoom(room);
    this.log(`玩家 ${player.username} 暂时断线`);
  }

  reattach(clientId) {
    const { room, player } = this.locate(clientId);
    if (!player) return;
    player.offline = false;
    this.toOthers(room, clientId, 'playerOnline', { playerId: clientId, username: player.username });
    this.broadcastRoom(room);
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
        case 'syncRoom': return reply(this.syncRoom(client));
        case 'listRooms': return this.send(clientId, 'roomsList', this.openRooms());
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

  createRoom(client, { username, roomId } = {}) {
    client.username = cleanName(username, `玩家${client.id.slice(0, 4)}`);
    const wanted = typeof roomId === 'string' ? roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) : '';
    if (client.roomId && client.roomId === wanted && this.rooms.has(wanted)) {
      return this.syncRoom(client); // 已在该房间：视为回到房间
    }
    this.leaveRoom(client.id, '对手离开了游戏');
    const id = wanted && !this.rooms.has(wanted) ? wanted : this.newRoomId();
    const room = {
      id,
      leaderId: client.id,
      phase: 'waiting',
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
    this.leaveRoom(client.id, '对手离开了游戏');
    this.addPlayer(room, client);
    this.log(`${client.username} 加入房间 ${id}`);
    this.broadcastRoom(room);
    this.broadcastRooms();
    return { success: true, roomId: id, state: this.roomState(room) };
  }

  syncRoom(client) {
    const room = client.roomId && this.rooms.get(client.roomId);
    if (!room) return { success: false, message: '你不在房间中' };
    const state = this.roomState(room);
    this.send(client.id, 'roomState', state);
    return { success: true, roomId: room.id, state };
  }

  leaveRoom(clientId, reason) {
    const { room, player } = this.locate(clientId);
    const client = this.clients.get(clientId);
    if (client) client.roomId = null;
    if (!room || !player) return { success: true };
    room.players = room.players.filter((p) => p.id !== clientId);
    this.log(`${player.username} 离开房间 ${room.id}`);
    if (room.players.length === 0) {
      this.clearTurnTimer(room);
      this.rooms.delete(room.id);
    } else {
      const rest = room.players[0];
      if (room.leaderId === clientId) room.leaderId = rest.id;
      this.send(rest.id, 'playerLeft', { playerId: clientId, username: player.username });
      if (room.phase === 'playing') {
        this.finishGame(room, rest.id, reason);
      }
      if (room.phase === 'finished') {
        // 只剩一人时回到等待阶段，准备状态清零
        room.phase = 'waiting';
        rest.ready = false;
        rest.planes = null;
      }
      this.broadcastRoom(room);
    }
    this.broadcastRooms();
    return { success: true };
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
    return { success: true };
  }

  playerUnready(client) {
    const { room, player } = this.locate(client.id);
    if (!player || room.phase !== 'waiting') return { success: false };
    player.ready = false;
    player.planes = null;
    this.broadcastRoom(room);
    return { success: true };
  }

  startGame(client) {
    const { room, player } = this.locate(client.id);
    if (!player) return this.fail(client, '你不在房间中');
    if (room.leaderId !== client.id) return this.fail(client, '只有房主才能开始游戏');
    if (room.phase !== 'waiting') return this.fail(client, '游戏已经开始');
    if (room.players.length !== 2 || !room.players.every((p) => p.ready)) {
      return this.fail(client, '等待双方都准备好');
    }
    room.phase = 'playing';
    room.shots = {};
    room.timeouts = {};
    room.startedAt = Date.now();
    room.players.forEach((p) => p.planes.forEach((plane) => { plane.sunk = false; }));
    const first = room.players[Math.floor(Math.random() * 2)];
    for (const viewer of room.players) {
      this.send(viewer.id, 'gameStart', {
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
    shots.add(k);
    if (!auto) room.timeouts[attackerId] = 0;

    const opponent = room.players.find((p) => p.id !== attackerId);
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
    this.toRoom(room, 'attackResult', { attacker: attackerId, position: { row, col }, result, planeIndex, sunkPlane, auto });

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
    for (let row = 1; row <= 10; row++) {
      for (const col of COLUMNS) if (!shots.has(cellKey(row, col))) free.push({ row, col });
    }
    if (free.length) this.performAttack(room.id, playerId, free[Math.floor(Math.random() * free.length)], { auto: true });
  }

  finishGame(room, winner, reason) {
    this.clearTurnTimer(room);
    room.phase = 'finished';
    room.currentTurn = null;
    room.players.forEach((p) => { p.ready = false; });
    const reveal = room.players.map((p) => ({ id: p.id, planes: p.planes || [] }));
    this.toRoom(room, 'gameOver', {
      winner,
      reason: reason || '',
      roomId: room.id,
      reveal,
      durationMs: room.startedAt ? Date.now() - room.startedAt : 0,
    });
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
    // 双方都会点“再来一局”：第一位到达时重置；后到者不能清掉先到者已摆好的布局
    if (room.phase === 'finished') {
      room.phase = 'waiting';
      room.players.forEach((p) => {
        p.ready = false;
        p.planes = null;
      });
      this.broadcastRoom(room);
      this.broadcastRooms();
    } else {
      this.send(client.id, 'roomState', this.roomState(room));
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
    return { roomId: room.id, leaderId: room.leaderId, phase: room.phase, players: room.players.map((p) => this.publicPlayer(p)) };
  }

  openRooms() {
    return [...this.rooms.values()]
      .filter((room) => room.phase === 'waiting' && room.players.length < 2)
      .map((room) => ({ id: room.id, players: room.players.length }));
  }

  broadcastRoom(room) {
    this.toRoom(room, 'roomState', this.roomState(room));
  }

  // 只通知还在大厅（不在房间里）的客户端
  broadcastRooms() {
    const list = this.openRooms();
    for (const client of this.clients.values()) {
      if (!client.roomId) this.send(client.id, 'roomsList', list);
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
