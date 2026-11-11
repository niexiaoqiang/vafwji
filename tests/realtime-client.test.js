import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClient } from '../src/net/socket.js';

function connection(options = {}) {
  const sent = [];
  const client = new RealtimeClient({ start() {}, send: (frame) => sent.push(JSON.parse(frame)), close() {} }, options);
  client.handleFrame({ t: 'hello', id: 'a', k: 'secret', resumed: false });
  return { client, sent };
}

test('未连接、断线和请求超时均返回失败，不会永久等待', async () => {
  const { client } = connection({ requestTimeoutMs: 15 });
  const timeout = await new Promise((resolve) => client.emit('createRoom', {}, resolve));
  assert.equal(timeout.code, 'TIMEOUT');
  const pending = new Promise((resolve) => client.emit('joinRoom', {}, resolve));
  client.handleClose('test');
  assert.equal((await pending).code, 'DISCONNECTED');
  const offline = await new Promise((resolve) => client.emit('createRoom', {}, resolve));
  assert.equal(offline.code, 'DISCONNECTED');
  assert.equal(client.acks.size, 0);
});

test('正常应答只调用一次，迟到应答不重复操作', async () => {
  const { client, sent } = connection();
  let count = 0;
  client.emit('joinRoom', {}, () => count++);
  await Promise.resolve();
  const frame = { t: 'ack', a: sent[0].a, d: [{ success: true }] };
  client.handleFrame(frame); client.handleFrame(frame);
  assert.equal(count, 1);
  assert.equal(client.acks.size, 0);
});

test('存储的会话可恢复，刷新前后的请求 ID 不冲突', () => {
  const values = new Map();
  const sessionStore = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  const first = connection({ sessionStore }).client;
  const second = new RealtimeClient({ start() {} }, { sessionStore });
  assert.equal(second.id, 'a');
  assert.equal(second.resumeKey, 'secret');
  assert.notEqual(first.requestPrefix, second.requestPrefix);
  let resumed = false;
  second.on('reconnect', () => { resumed = true; });
  second.handleFrame({ t: 'hello', id: 'a', k: 'secret', resumed: true });
  assert(resumed);
});
