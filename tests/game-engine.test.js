import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../shared/game-engine.js';
import { randomPlanes } from '../shared/planes.js';
import { PlaneHunter } from '../src/local/ai.js';

function game(t) {
  const events = [];
  const engine = new GameEngine({ send: (id, event, data) => events.push({ id, event, data }) });
  engine.connect('a'); engine.connect('b');
  const a = engine.clients.get('a'), b = engine.clients.get('b');
  const { roomId } = engine.createRoom(a, { username: '甲' });
  engine.joinRoom(b, { roomId, username: '乙' });
  engine.playerReady(a, { planes: randomPlanes() });
  engine.playerReady(b, { planes: randomPlanes() });
  engine.startGame(a);
  const room = engine.rooms.get(roomId);
  t.after(() => engine.clearTurnTimer(room));
  engine.setTurn(room, a.id);
  return { engine, room, a, b, events, target: room.players[1].planes[0] };
}

test('普通命中与刷新快照都不泄露敌机编号或未击落坐标', (t) => {
  const { engine, room, a, target, events } = game(t);
  const initial = engine.syncRoom(a).game;
  assert(initial.players[1].planes.every((p) => !p.coordinates));
  engine.performAttack(room.id, a.id, target.coordinates.find((c) => !c.isHead));
  const hit = events.find((e) => e.id === a.id && e.event === 'attackResult').data;
  assert.equal(hit.result, 'hit');
  assert(!('planeIndex' in hit));
  const snapshot = engine.syncRoom(a).game;
  assert(!('planeIndex' in snapshot.history[0]));
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.players[0].planes.length, 3);
});

test('击落可以连击，重复攻击及残骸攻击不消耗回合', (t) => {
  const { engine, room, a, target } = game(t);
  const head = target.coordinates.find((c) => c.isHead);
  assert.equal(engine.performAttack(room.id, a.id, head), null);
  assert.equal(room.currentTurn, a.id);
  assert(engine.performAttack(room.id, a.id, head));
  assert(engine.performAttack(room.id, a.id, target.coordinates.find((c) => !c.isHead)));
  assert.equal(room.currentTurn, a.id);
  assert.equal(room.history.length, 1);
});

test('退出先向双方结算，刷新仍可恢复完整结局，再战清除旧结局', (t) => {
  const { engine, room, a, b, events } = game(t);
  const res = engine.leaveRoom(b.id);
  const results = events.filter((e) => e.event === 'gameOver');
  assert.deepEqual(results.map((e) => e.id).sort(), ['a', 'b']);
  assert.equal(res.result.winner, a.id);
  assert.equal(res.result.reveal.length, 2);
  const restored = engine.syncRoom(a).game;
  assert.equal(restored.players.length, 2);
  assert.equal(restored.players[0].planes.length, 3);
  assert.equal(restored.result.gameId, res.result.gameId);
  engine.restartGame(a);
  assert.equal(engine.syncRoom(a).game, null);
  assert.equal(room.phase, 'waiting');
});

test('三次连续超时判负，自动攻击不打残骸', (t) => {
  const { engine, room, a, target } = game(t);
  engine.performAttack(room.id, a.id, target.coordinates.find((c) => c.isHead));
  const wreck = new Set(target.coordinates.map((c) => `${c.row},${c.col}`));
  for (let i = 0; i < 3; i++) {
    engine.setTurn(room, a.id);
    engine.handleTurnTimeout(room.id);
  }
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.winner, 'b');
  assert(room.history.filter((e) => e.auto).every((e) => !wreck.has(`${e.position.row},${e.position.col}`)));
});

test('AI 的随机分支避开已知残骸', () => {
  const hunter = new PlaneHunter({ level: 'easy', random: () => 0 });
  hunter.record({ row: 2, col: 'A' }, 'sink', [{ row: 2, col: 'A' }, { row: 1, col: 'A' }]);
  assert.deepEqual(hunter.next(), { row: 1, col: 'B' });
});

test('拒绝越权攻击及不规范布局', (t) => {
  const { engine, room, b } = game(t);
  assert(engine.performAttack(room.id, b.id, { row: 1, col: 'A' }));
  assert.equal(room.history.length, 0);
  engine.finishGame(room, 'a'); engine.restartGame(b);
  assert.equal(engine.playerReady(b, { planes: [] }).success, false);
});
