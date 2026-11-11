// 炸飞机游戏服务：静态页面 + 实时对战。
// 对局规则全部在 shared/game-engine.js，这里只负责 HTTP 和把 WebSocket 事件转给引擎。
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRealtime } from './server/realtime.js';
import { createMiniAppAuthenticator } from './server/mini-app-auth.js';
import { GameEngine, CLIENT_EVENTS } from './shared/game-engine.js';

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
  console.warn('未配置 MINI_APP_ISSUER/MINI_APP_ID/MINI_APP_PUBLIC_ORIGIN，/mini-app/ws 不校验平台 JWT（仅适合本地开发）');
}
const io = createRealtime(server, {
  paths: [
    { path: '/ws' },
    { path: '/mini-app/ws', authenticate: miniAppAuthenticate || undefined },
  ],
});

const engine = new GameEngine({
  turnMs: TURN_MS,
  send: (clientId, event, payload) => io.sockets.sockets.get(clientId)?.emit(event, payload),
  log: (message) => console.info(message),
});

io.on('connection', (socket) => {
  engine.connect(socket.id);
  if (DEBUG) console.debug(`连接 ${socket.id}`);
  for (const event of CLIENT_EVENTS) {
    socket.on(event, (payload, ack) => {
      if (DEBUG) console.debug(`${socket.id} -> ${event}`, JSON.stringify(payload ?? null).slice(0, 300));
      engine.handle(socket.id, event, payload, ack);
    });
  }
  // 传输层断开但会话仍在等待重连（见 server/realtime.js）
  socket.on('detached', (graceMs) => engine.detach(socket.id, graceMs));
  socket.on('reattached', () => engine.reattach(socket.id));
  socket.on('disconnect', () => engine.disconnect(socket.id));
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, connections: io.sockets.sockets.size, rooms: engine.rooms.size });
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
