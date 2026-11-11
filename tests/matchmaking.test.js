import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../shared/game-engine.js';
import { randomPlanes } from '../shared/planes.js';

function setup(t, count = 4) {
  const events = [];
  const engine = new GameEngine({ send: (id, event, data) => events.push({ id, event, data }) });
  const clients = Array.from({ length: count }, (_, i) => {
    const id = `player${i}`;
    engine.connect(id);
    return engine.clients.get(id);
  });
  t.after(() => {
    for (const room of engine.rooms.values()) {
      engine.clearTurnTimer(room);
      engine.clearPreparation(room);
    }
  });
  return { engine, clients, events };
}

test('好友房不公开，快速游戏和手动加入共享公开房间', (t) => {
  const { engine, clients: [a, b, c, d] } = setup(t);
  const friend = engine.createRoom(a, { username: '朋友' });
  assert.equal(engine.openRooms().length, 0);
  const match = engine.quickMatch(b, { username: '路人' });
  assert.notEqual(match.roomId, friend.roomId);
  assert.equal(engine.openRooms()[0].host, '路人');
  assert.equal(engine.joinRoom(c, { roomId: match.roomId }).success, true);
  assert.equal(engine.openRooms().length, 0);
  assert.equal(engine.joinRoom(d, { roomId: friend.roomId }).success, true);
  assert.equal(engine.rooms.get(friend.roomId).visibility, 'private');
});

test('重复快速请求幂等，多人到达不会超员或匹配自己', (t) => {
  const { engine, clients } = setup(t, 6);
  const first = engine.quickMatch(clients[0]);
  assert.equal(engine.quickMatch(clients[0]).roomId, first.roomId);
  for (const client of clients.slice(1)) engine.quickMatch(client);
  assert.equal(engine.rooms.size, 3);
  for (const room of engine.rooms.values()) {
    assert.equal(room.players.length, 2);
    assert.notEqual(room.players[0].id, room.players[1].id);
  }
});

test('等待时可提前准备，双方准备即自动开局，对战中不能再匹配或取消', (t) => {
  const { engine, clients: [a, b], events } = setup(t);
  const { roomId } = engine.quickMatch(a);
  engine.playerReady(a, { planes: randomPlanes() });
  assert.equal(engine.rooms.get(roomId).phase, 'waiting');
  engine.quickMatch(b);
  const before = engine.syncRoom(a);
  assert.equal(before.state.visibility, 'public');
  assert.equal(before.ownPlanes.length, 3);
  assert(before.state.prepareDeadline > Date.now());
  engine.playerReady(b, { planes: randomPlanes() });
  const room = engine.rooms.get(roomId);
  assert.equal(room.phase, 'playing');
  assert.equal(room.prepareTimer, null);
  assert.equal(events.filter((e) => e.event === 'gameStart').length, 2);
  assert.equal(engine.quickMatch(a).success, false);
  assert.equal(engine.createRoom(a).success, false);
  assert.equal(engine.cancelMatch(a, { roomId }).success, false);
  assert.equal(room.players.length, 2);
});

test('取消后不留占位，迟到取消不能影响新房间', (t) => {
  const { engine, clients: [a, b] } = setup(t);
  const first = engine.quickMatch(a);
  engine.quickMatch(b);
  engine.playerReady(b, { planes: randomPlanes() });
  assert.equal(engine.cancelMatch(a, { roomId: first.roomId }).success, true);
  assert.equal(engine.rooms.get(first.roomId).prepareTimer, null);
  assert.equal(engine.rooms.get(first.roomId).players[0].ready, true);
  engine.cancelMatch(b, { roomId: first.roomId });
  assert.equal(engine.rooms.size, 0);
  const next = engine.quickMatch(a);
  assert.equal(engine.cancelMatch(a, { roomId: first.roomId }).success, false);
  assert.equal(a.roomId, next.roomId);
});

test('掉线等待者不能被匹配，恢复后可再次进入候选池', (t) => {
  const { engine, clients: [a, b], events } = setup(t);
  const first = engine.quickMatch(a);
  engine.detach(a.id, 45000);
  assert.equal(engine.openRooms().length, 0);
  assert.equal(engine.joinRoom(b, { roomId: first.roomId }).success, false);
  const second = engine.quickMatch(b);
  assert.notEqual(first.roomId, second.roomId);
  engine.cancelMatch(b, { roomId: second.roomId });
  engine.reattach(a.id);
  assert.equal(engine.quickMatch(b).roomId, first.roomId);
  engine.sendLobby(b.id);
  assert.equal(events.at(-1).data.online, 4);
});

test('准备超时只移除未准备者，双方未准备则回收房间', (t) => {
  const { engine, clients: [a, b, c, d], events } = setup(t);
  const { roomId } = engine.quickMatch(a);
  engine.quickMatch(b);
  engine.playerReady(a, { planes: randomPlanes() });
  const deadline = engine.rooms.get(roomId).prepareDeadline;
  engine.syncRoom(a); engine.playerUnready(b);
  assert.equal(engine.rooms.get(roomId).prepareDeadline, deadline);
  engine.expirePreparation(roomId);
  assert.equal(b.roomId, null);
  assert.equal(a.roomId, roomId);
  assert.equal(engine.openRooms()[0].ready, true);
  assert(events.some((e) => e.id === b.id && e.event === 'matchCancelled'));
  engine.cancelMatch(a, { roomId });
  const other = engine.quickMatch(c);
  engine.quickMatch(d);
  engine.expirePreparation(other.roomId);
  assert.equal(engine.rooms.size, 0);
  assert.equal(events.filter((e) => e.event === 'gameOver').length, 0);
});

test('公开房再战保留自动开局规则，好友房仍由房主开始', (t) => {
  const { engine, clients: [a, b, c, d] } = setup(t);
  const { roomId } = engine.quickMatch(a); engine.quickMatch(b);
  for (const p of [a, b]) engine.playerReady(p, { planes: randomPlanes() });
  engine.finishGame(engine.rooms.get(roomId), a.id);
  engine.restartGame(a); engine.restartGame(b);
  for (const p of [a, b]) engine.playerReady(p, { planes: randomPlanes() });
  assert.equal(engine.rooms.get(roomId).phase, 'playing');
  const friend = engine.createRoom(c);
  engine.joinRoom(d, { roomId: friend.roomId });
  for (const p of [c, d]) engine.playerReady(p, { planes: randomPlanes() });
  assert.equal(engine.rooms.get(friend.roomId).phase, 'waiting');
  assert.equal(engine.startGame(d).success, false);
  assert.equal(engine.startGame(c).success, true);
});

test('再战准备计时等双方都回到房间后才开始，不会踢走还在看结算的人', (t) => {
  const { engine, clients: [a, b], events } = setup(t);
  const { roomId } = engine.quickMatch(a); engine.quickMatch(b);
  for (const p of [a, b]) engine.playerReady(p, { planes: randomPlanes() });
  engine.finishGame(engine.rooms.get(roomId), a.id);
  engine.restartGame(a);
  const room = engine.rooms.get(roomId);
  assert.equal(room.prepareTimer, null);
  engine.expirePreparation(roomId);
  assert.equal(b.roomId, roomId);
  assert(!events.some((e) => e.event === 'matchCancelled'));
  engine.restartGame(b);
  assert.notEqual(room.prepareTimer, null);
  assert(room.prepareDeadline > Date.now());
});

test('仍挂在空闲旧房间时，快速游戏 / 建房 / 加入会自动离开旧房间', (t) => {
  const { engine, clients: [a, b, c, d] } = setup(t);
  // a、b 打完一局后 a 回到大厅但服务端仍记着他在房间里
  const { roomId } = engine.quickMatch(a); engine.quickMatch(b);
  for (const p of [a, b]) engine.playerReady(p, { planes: randomPlanes() });
  engine.finishGame(engine.rooms.get(roomId), a.id);
  const next = engine.quickMatch(a);
  assert.equal(next.success, true);
  assert.notEqual(next.roomId, roomId);
  assert.equal(engine.rooms.get(roomId).players.length, 1);
  // 在好友等待房里的人可以直接去加入别的房间
  const friend = engine.createRoom(c, { username: '朋友' });
  assert.equal(engine.joinRoom(c, { roomId: next.roomId }).success, true);
  assert.equal(engine.rooms.has(friend.roomId), false);
  // 重复建同类房间仍然幂等
  const own = engine.createRoom(d, { username: '房主' });
  assert.equal(engine.createRoom(d, { username: '房主' }).roomId, own.roomId);
});

test('大厅广播对每个人发送同一份房间列表', (t) => {
  const { engine, clients: [a], events } = setup(t);
  events.length = 0;
  engine.quickMatch(a);
  const lists = events.filter((e) => e.event === 'roomsList');
  assert(lists.length >= 2);
  assert(lists.every((e) => e.data === lists[0].data));
});
