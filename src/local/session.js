// 人机对战：在浏览器里运行与服务端相同的对局引擎，接入一个电脑玩家。
// 返回的 socket 与联机连接的用法一致（on / off / emit / id），
// 所以房间页和对局页不需要区分联机还是人机。
import { GameEngine } from '../../shared/game-engine.js';
import { randomPlanes } from '../../shared/planes.js';
import { PlaneHunter } from './ai.js';

const HUMAN_ID = 'me';
const BOT_ID = 'bot';
export const BOT_NAME = '电脑';

class LocalSocket {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.connected = true;
    this.isLocal = true;
    this.handlers = new Map();
    this.anyHandlers = new Set();
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return this;
  }

  off(event, handler) {
    if (!handler) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(handler);
    return this;
  }

  onAny(handler) {
    this.anyHandlers.add(handler);
    return this;
  }

  offAny(handler) {
    if (handler) this.anyHandlers.delete(handler);
    else this.anyHandlers.clear();
    return this;
  }

  emit(event, payload, ack) {
    if (typeof payload === 'function') {
      ack = payload;
      payload = {};
    }
    if (!this.connected) return this;
    // 异步处理，模拟网络往返，避免在事件回调里同步重入
    setTimeout(() => {
      this.engine.handle(this.id, event, payload, (reply) => {
        if (typeof ack === 'function') setTimeout(() => ack(reply), 0);
      });
    }, 0);
    return this;
  }

  deliver(event, payload) {
    setTimeout(() => {
      if (!this.connected) return;
      for (const handler of [...this.anyHandlers]) handler(event, payload);
      for (const handler of [...(this.handlers.get(event) || [])]) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`处理事件 ${event} 时出错:`, error);
        }
      }
    }, 0);
  }

  disconnect() {
    this.connected = false;
  }
}

/** 电脑玩家：自动加入房间、随机布置、按策略攻击。 */
class Bot {
  constructor(engine, socket, { thinkMs = [500, 1100], level = 'normal' } = {}) {
    this.engine = engine;
    this.socket = socket;
    this.thinkMs = thinkMs;
    this.hunter = new PlaneHunter({ level });
    this.timers = new Set();
    socket.on('roomState', (state) => this.onRoomState(state));
    socket.on('gameStart', () => this.hunter.reset());
    socket.on('turnChange', ({ currentTurn }) => {
      if (currentTurn === BOT_ID) this.later(() => this.attack());
    });
    socket.on('attackResult', ({ attacker, position, result, sunkPlane }) => {
      if (attacker === BOT_ID) this.hunter.record(position, result, sunkPlane);
    });
  }

  later(fn) {
    const [min, max] = this.thinkMs;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, min + Math.random() * (max - min));
    this.timers.add(timer);
  }

  onRoomState(state) {
    const me = state.players.find((p) => p.id === BOT_ID);
    if (me && state.phase === 'waiting' && !me.ready && !this.readying) {
      this.readying = true;
      this.later(() => {
        this.readying = false;
        this.socket.emit('playerReady', { planes: randomPlanes() });
      });
    }
  }

  attack() {
    this.socket.emit('attack', { position: this.hunter.next() });
  }

  join(roomId) {
    this.socket.emit('joinRoom', { roomId, username: BOT_NAME });
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.socket.disconnect();
  }
}

/**
 * 创建人机对战会话。玩家照常 emit('createRoom')，电脑会自动加入该房间。
 * @returns {{ socket: LocalSocket, close(): void }}
 */
export function createLocalSession({ turnMs = 60_000, level = 'normal' } = {}) {
  const sockets = new Map();
  const engine = new GameEngine({
    turnMs,
    send: (clientId, event, payload) => sockets.get(clientId)?.deliver(event, payload),
  });
  const human = new LocalSocket(engine, HUMAN_ID);
  const botSocket = new LocalSocket(engine, BOT_ID);
  sockets.set(HUMAN_ID, human);
  sockets.set(BOT_ID, botSocket);
  engine.connect(HUMAN_ID);
  engine.connect(BOT_ID);
  const bot = new Bot(engine, botSocket, { level });

  // 玩家建好房间、且房间里只有自己时，电脑加入
  human.on('roomState', (state) => {
    if (state.players.length === 1 && state.phase === 'waiting') bot.join(state.roomId);
  });

  return {
    socket: human,
    close() {
      bot.stop();
      human.disconnect();
      for (const room of engine.rooms.values()) engine.clearTurnTimer(room);
    },
  };
}
