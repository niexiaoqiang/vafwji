// 不同接入渠道使用独立引擎；渠道只来自服务端握手结果，不接受业务消息指定。
import { GameEngine, CLIENT_EVENTS } from '../shared/game-engine.js';

export function attachGameSessions(io, { turnMs = 30_000, log = () => {}, debug = false } = {}) {
  const engines = new Map();
  io.on('connection', (socket) => {
    const user = socket.data.platformUser;
    const scope = user ? JSON.stringify([user.issuer, user.appId, user.channel]) : 'web';
    if (!engines.has(scope)) {
      engines.set(scope, new GameEngine({
        turnMs,
        send: (clientId, event, payload) => io.sockets.sockets.get(clientId)?.emit(event, payload),
        log: (message) => log(`[${scope}] ${message}`),
      }));
    }
    const engine = engines.get(scope);
    engine.connect(socket.id);
    for (const event of CLIENT_EVENTS) {
      socket.on(event, (payload, ack) => {
        if (debug) log(`${socket.id} -> ${event}`);
        engine.handle(socket.id, event, payload, ack);
      });
    }
    socket.on('detached', (graceMs) => engine.detach(socket.id, graceMs));
    socket.on('reattached', () => engine.reattach(socket.id));
    socket.on('disconnect', () => engine.disconnect(socket.id));
  });
  return {
    get roomCount() {
      return [...engines.values()].reduce((sum, engine) => sum + engine.rooms.size, 0);
    },
  };
}
