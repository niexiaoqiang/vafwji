// 炸飞机游戏服务：静态页面 + 实时对战。
// 对局规则全部在 shared/game-engine.js，这里只负责 HTTP 和把 WebSocket 事件转给引擎。
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRealtime } from './server/realtime.js';
import { createMiniAppAuthenticator } from './server/mini-app-auth.js';
import { attachGameSessions } from './server/game-sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TURN_MS = Number(process.env.TURN_MS) || 30_000;
// DEBUG=1 时输出每条事件，便于排查
const DEBUG = process.env.DEBUG === '1';

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
const server = createServer(app);

// 实时通信：
//   /ws           独立网页版使用，不鉴权
//   /mini-app/ws  社区微应用使用；配置 MINI_APP_* 环境变量后校验平台 JWT
const miniAppAuthenticate = createMiniAppAuthenticator();
if (!miniAppAuthenticate) {
  console.warn('未配置微应用鉴权，/mini-app/ws 将拒绝连接；网页版 /ws 仍可使用');
}
const io = createRealtime(server, {
  paths: [
    { path: '/ws' },
    { path: '/mini-app/ws', authenticate: miniAppAuthenticate || (() => { throw new Error('MINI_APP_NOT_CONFIGURED'); }) },
  ],
});

const sessions = attachGameSessions(io, {
  turnMs: TURN_MS,
  log: (message) => console.info(message),
  debug: DEBUG,
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, connections: io.sockets.sockets.size, rooms: sessions.roomCount });
});

// 生产环境由本服务提供前端页面
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.info(`炸飞机服务已启动，端口 ${PORT}`);
});
