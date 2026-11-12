import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createMiniAppAuthenticator } from '../server/mini-app-auth.js';
import { releaseManifest, loadReleaseManifest } from '../scripts/mini-app-config.mjs';
import { canResumeSession } from '../server/realtime.js';
import { attachGameSessions } from '../server/game-sessions.js';

test('发布配置使用真实 ID，拒绝占位、格式错误和示例地址', async () => {
  const manifest = await loadReleaseManifest({});
  assert.equal(manifest.id, '01a1cdba-4aad-77cd-9c6e-89dcc61b7ffa');
  assert.equal(manifest.websockets.game.url, 'wss://zha-fei-ji.onrender.com/mini-app/ws');
  for (const env of [
    { MINI_APP_ID: '00000000-0000-7000-8000-000000000000' },
    { MINI_APP_ID: 'wrong' }, { MINI_APP_VERSION: '01.0.0' },
    { MINI_APP_WS_URL: 'wss://plane.example.com/mini-app/ws' },
    { MINI_APP_WS_URL: 'ws://localhost:3000/ws' },
    { MINI_APP_WS_URL: 'wss://user:secret@host.invalid/ws' },
  ]) assert.throws(() => releaseManifest(manifest, env));
  assert.equal(releaseManifest(manifest, { MINI_APP_VERSION: '1.0.1' }).version, '1.0.1');
  assert.equal(manifest.version, '1.0.0');
});

test('首屏与 SDK 任意先后就绪都只通知一次，用户读取失败不阻塞通知', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const source = (await readFile(new URL('../src/platform.js', import.meta.url), 'utf8'))
    .replace("import { createSocket } from './net/socket.js';", 'const createSocket = () => ({});')
    .replaceAll('__MINI_APP__', 'true')
    .replace("const { getSDK } = await import('@discourse-mini-app/sdk');", 'const getSDK = () => globalThis.__platformTestSdk;');
  const old = globalThis.__platformTestSdk;
  try {
    for (const renderFirst of [true, false]) {
      let resolveReady, count = 0;
      globalThis.__platformTestSdk = {
        ready: new Promise((resolve) => { resolveReady = resolve; }),
        permissions: { has: () => true },
        lifecycle: { ready: async () => { count++; } },
        user: { getCurrent: async () => { throw new Error('PERMISSION_DENIED'); } },
      };
      const mod = await import(`data:text/javascript;base64,${Buffer.from(source + `\n// ${renderFirst}`).toString('base64')}`);
      if (renderFirst) await mod.markRendered();
      const init = mod.initPlatform();
      assert.equal(count, 0);
      resolveReady();
      await init;
      if (!renderFirst) { assert.equal(count, 0); await mod.markRendered(); }
      await mod.markRendered();
      assert.equal(count, 1);
    }
  } finally { globalThis.__platformTestSdk = old; }
});

test('平台握手验证签名、应用、渠道、Origin 和有效期，缺失配置不启用鉴权器', async (t) => {
  const names = ['MINI_APP_ISSUER', 'MINI_APP_ID', 'MINI_APP_PUBLIC_ORIGIN', 'MINI_APP_CHANNELS'];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => { for (const name of names) {
    if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name];
  } });
  for (const name of names) delete process.env[name];
  assert.equal(createMiniAppAuthenticator(), null);
  Object.assign(process.env, {
    MINI_APP_ISSUER: 'https://community.invalid', MINI_APP_ID: '01a1cdba-4aad-77cd-9c6e-89dcc61b7ffa',
    MINI_APP_PUBLIC_ORIGIN: 'https://game.invalid', MINI_APP_CHANNELS: 'sandbox',
  });
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const kid = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' };
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://community.invalid/mini-app-api/jwks');
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  });
  const auth = createMiniAppAuthenticator();
  function request(patch = {}) {
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: process.env.MINI_APP_ISSUER, aud: process.env.MINI_APP_PUBLIC_ORIGIN,
      sub: '1', app_id: process.env.MINI_APP_ID, channel: 'sandbox', version: '1.0.0',
      scopes: ['network.websocket'], iat: now, nbf: now, exp: now + 900,
      jti: '1234567890123456', htm: 'GET', htu: 'https://game.invalid/mini-app/ws', query_keys: [], ...patch };
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode({ alg: 'ES256', typ: 'mini-app-access+jwt', kid })}.${encode(claims)}`;
    const signature = sign('sha256', Buffer.from(body), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return { headers: { origin: 'https://community.invalid' }, url: `/mini-app/ws?mini_app_token=${body}.${signature}` };
  }
  assert.equal((await auth(request())).platformUser.channel, 'sandbox');
  for (const patch of [{ app_id: 'wrong' }, { channel: 'production' }, { exp: 1 }]) {
    await assert.rejects(auth(request(patch)));
  }
  await assert.rejects(auth({ headers: { origin: 'https://community.invalid' }, url: '/mini-app/ws' }));
  await assert.rejects(auth({ ...request(), headers: { origin: 'https://other.invalid' } }));
});

const user = (channel, id = '1') => ({ issuer: 'https://community.invalid', appId: 'app', channel, id });

test('续接只允许同一端点、用户、社区、应用和渠道', () => {
  const a = { endpoint: '/mini-app/ws', platformUser: user('sandbox') };
  assert(canResumeSession(a, structuredClone(a)));
  for (const [key, value] of [['issuer', 'other'], ['appId', 'other'], ['channel', 'production'], ['id', '2']]) {
    assert(!canResumeSession(a, { ...a, platformUser: { ...a.platformUser, [key]: value } }));
  }
  assert(!canResumeSession(a, { endpoint: '/ws' }));
  assert(!canResumeSession({ endpoint: '/ws' }, a));
  assert(canResumeSession({ endpoint: '/ws' }, { endpoint: '/ws' }));
});

test('网页版、沙箱、正式版不能互相查看或加入房间，同渠道可正常匹配', () => {
  const io = new EventEmitter();
  io.sockets = { sockets: new Map() };
  attachGameSessions(io);
  function client(id, platformUser) {
    const socket = new EventEmitter();
    Object.assign(socket, { id, data: { platformUser } });
    io.sockets.sockets.set(id, socket);
    io.emit('connection', socket);
    return socket;
  }
  function call(socket, event, data = {}) {
    let response;
    socket.emit(event, data, (result) => { response = result; });
    return response;
  }
  const sandbox = client('s1', user('sandbox'));
  const prod = client('p1', user('production'));
  const web = client('w1');
  const room = call(sandbox, 'quickMatch');
  for (const other of [prod, web]) {
    let list;
    other.on('roomsList', (value) => { list = value; });
    call(other, 'listRooms');
    assert.deepEqual(list, []);
    assert.equal(call(other, 'joinRoom', { roomId: room.roomId }).success, false);
  }
  const s2 = client('s2', user('sandbox', '2'));
  assert.equal(call(s2, 'quickMatch').roomId, room.roomId);
  for (const socket of [sandbox, prod, web, s2]) socket.emit('disconnect');
});
