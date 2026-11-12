// 轻量实时通信层：在原生 WebSocket（ws）之上提供与 Socket.io 服务端相近的 API，
// 让原有游戏逻辑（socket.on / socket.emit / io.to(room).emit ...）无需大改。
//
// 微应用运行在社区沙箱中，只能通过 SDK 的 sdk.webSocket / sdk.network.reconnectSocket
// 连接 manifest 中声明的 WSS 端点，无法使用 Socket.io 客户端，所以服务端改为普通 WebSocket。
//
// 线上协议（JSON 文本帧）：
//   客户端 -> 服务端  { t: "hi", resume?: { id, k } }       连接后第一帧；带上次的 id/k 表示断线续接
//                     { t: "e", e: 事件名, d: [参数...], a?: ackId }
//   服务端 -> 客户端  { t: "hello", id, k, resumed }       会话建立（resumed=true 表示续接成功）
//                     { t: "e", e: 事件名, d: [参数...] }  事件
//                     { t: "ack", a: ackId, d: [参数...] } 回调应答
//
// 断线续接：传输层断开后会话保留 RESUME_GRACE_MS（默认 45 秒），期间发给它的事件先排队；
// 客户端用同一 id/k 重连即可接回原会话（id、房间、事件处理器都不变），排队事件按序补发。
// 超时未回来才真正触发 'disconnect'。会话断开 / 接回时分别触发 'detached' / 'reattached'。
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

const MAX_PAYLOAD = 256 * 1024;
const HEARTBEAT_MS = 25_000;
const HELLO_TIMEOUT_MS = 10_000;
const MAX_QUEUE = 500;
export const RESUME_GRACE_MS = Number(process.env.RESUME_GRACE_MS) || 45_000;

function makeId() {
  return randomBytes(12).toString('base64url');
}

/** 只有同一接入端点、社区、应用、渠道和用户才能续接旧会话。 */
export function canResumeSession(previous, next) {
  if (previous.endpoint !== next.endpoint) return false;
  const a = previous.platformUser;
  const b = next.platformUser;
  if (!a || !b) return !a && !b;
  return ['issuer', 'id', 'appId', 'channel'].every((field) => a[field] === b[field]);
}

class Emitter {
  constructor() {
    this.handlers = new Map();
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
  dispatch(event, args) {
    for (const handler of [...(this.handlers.get(event) || [])]) {
      try {
        handler(...args);
      } catch (error) {
        console.error(`处理事件 ${event} 时出错:`, error);
      }
    }
  }
}

class Broadcast {
  constructor(hub, rooms, exceptId) {
    this.hub = hub;
    this.rooms = rooms;
    this.exceptId = exceptId;
  }
  to(room) {
    return new Broadcast(this.hub, [...this.rooms, room], this.exceptId);
  }
  emit(event, ...args) {
    const targets = new Set();
    if (this.rooms.length === 0) {
      for (const socket of this.hub.sockets.sockets.values()) targets.add(socket);
    } else {
      for (const room of this.rooms) {
        for (const id of this.hub.roomMembers.get(room) || []) {
          const socket = this.hub.sockets.sockets.get(id);
          if (socket) targets.add(socket);
        }
      }
    }
    for (const socket of targets) {
      if (socket.id !== this.exceptId) socket.emit(event, ...args);
    }
    return true;
  }
}

class RealtimeSocket extends Emitter {
  constructor(hub, ws, request, data) {
    super();
    this.hub = hub;
    this.ws = ws;
    this.id = makeId();
    this.resumeKey = makeId();
    this.request = request;
    this.data = data || {};
    this.rooms = new Set([this.id]);
    this.connected = true;
    this.closed = false;
    this.queue = [];
    this.graceTimer = null;
  }
  get broadcast() {
    return new Broadcast(this.hub, [], this.id);
  }
  to(room) {
    return new Broadcast(this.hub, [room], this.id);
  }
  join(room) {
    this.rooms.add(room);
    if (!this.hub.roomMembers.has(room)) this.hub.roomMembers.set(room, new Set());
    this.hub.roomMembers.get(room).add(this.id);
  }
  leave(room) {
    this.rooms.delete(room);
    const members = this.hub.roomMembers.get(room);
    if (members) {
      members.delete(this.id);
      if (members.size === 0) this.hub.roomMembers.delete(room);
    }
  }
  send(frame) {
    if (this.closed) return false;
    if (!this.connected || this.ws.readyState !== this.ws.OPEN) {
      // 会话暂时断开：排队，等续接后补发
      if (this.queue.length < MAX_QUEUE) this.queue.push(frame);
      return false;
    }
    this.ws.send(JSON.stringify(frame));
    return true;
  }
  emit(event, ...args) {
    return this.send({ t: 'e', e: event, d: args });
  }
  disconnect() {
    this.finalize('server disconnect');
    this.ws.close(1000, 'server disconnect');
  }
  handleFrame(raw) {
    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (!frame || frame.t !== 'e' || typeof frame.e !== 'string') return;
    // 保留事件名不允许由客户端触发
    if (['disconnect', 'connection', 'detached', 'reattached'].includes(frame.e)) return;
    const args = Array.isArray(frame.d) ? frame.d : [];
    if (typeof frame.a === 'number' || typeof frame.a === 'string') {
      const ackId = frame.a;
      let answered = false;
      args.push((...reply) => {
        if (answered) return;
        answered = true;
        this.send({ t: 'ack', a: ackId, d: reply });
      });
    }
    this.dispatch(frame.e, args);
  }
  /** 绑定（或换绑）底层连接。 */
  attach(ws, { resumed }) {
    const previous = this.ws;
    this.ws = ws;
    clearTimeout(this.graceTimer);
    this.graceTimer = null;
    const wasDetached = !this.connected;
    this.connected = true;
    if (previous && previous !== ws && previous.readyState === previous.OPEN) {
      previous.close(4000, 'session resumed elsewhere');
    }
    this.send({ t: 'hello', id: this.id, k: this.resumeKey, resumed });
    const pending = this.queue.splice(0);
    for (const frame of pending) this.send(frame);
    if (resumed && wasDetached) this.dispatch('reattached', []);
  }
  /** 底层连接关闭：进入续接等待期。 */
  handleTransportClose(ws) {
    if (ws !== this.ws || this.closed || !this.connected) return;
    this.connected = false;
    this.dispatch('detached', [RESUME_GRACE_MS]);
    this.graceTimer = setTimeout(() => this.finalize('transport close'), RESUME_GRACE_MS);
    this.graceTimer.unref?.();
  }
  /** 会话彻底结束。 */
  finalize(reason) {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    clearTimeout(this.graceTimer);
    this.queue = [];
    for (const room of [...this.rooms]) this.leave(room);
    this.hub.sockets.sockets.delete(this.id);
    this.dispatch('disconnect', [reason]);
  }
}

/**
 * 创建实时通信中心。
 * @param {object} options
 * @param {Array<{ path: string, authenticate?: (req: import('http').IncomingMessage) => Promise<object|null> }>} options.paths
 *   可连接的路径；authenticate 抛错时拒绝握手，返回值挂到 socket.data。
 */
export function createRealtime(server, { paths }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  const hub = new Emitter();
  hub.sockets = { sockets: new Map() };
  hub.roomMembers = new Map();
  hub.to = (room) => new Broadcast(hub, [room]);
  hub.in = hub.to;
  hub.emit = (event, ...args) => new Broadcast(hub, []).emit(event, ...args);

  server.on('upgrade', async (request, netSocket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    const route = paths.find((item) => item.path === pathname);
    if (!route) {
      netSocket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      netSocket.destroy();
      return;
    }
    let data = {};
    if (route.authenticate) {
      try {
        data = (await route.authenticate(request)) || {};
      } catch (error) {
        console.warn(`拒绝 ${pathname} 的 WebSocket 握手: ${error?.code || error?.message || error}`);
        netSocket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        netSocket.destroy();
        return;
      }
    }
    data = { ...data, endpoint: route.path };
    wss.handleUpgrade(request, netSocket, head, (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      let socket = null;

      // 新会话
      const startSession = () => {
        socket = new RealtimeSocket(hub, ws, request, data);
        hub.sockets.sockets.set(socket.id, socket);
        socket.attach(ws, { resumed: false });
        hub.dispatch('connection', [socket]);
      };

      // 等待客户端第一帧 hi，决定新建还是续接；旧客户端不发 hi 时按新会话处理
      const helloTimer = setTimeout(() => {
        if (!socket) startSession();
      }, HELLO_TIMEOUT_MS);

      ws.on('message', (raw, isBinary) => {
        if (isBinary) return;
        const text = raw.toString('utf8');
        if (socket) {
          socket.handleFrame(text);
          return;
        }
        clearTimeout(helloTimer);
        let frame = null;
        try {
          frame = JSON.parse(text);
        } catch {
          // 交给下面按新会话处理
        }
        if (frame?.t === 'hi') {
          const resume = frame.resume;
          const existing = resume && typeof resume.id === 'string' ? hub.sockets.sockets.get(resume.id) : null;
          if (existing && !existing.closed && existing.resumeKey === resume.k && canResumeSession(existing.data, data)) {
            socket = existing;
            socket.attach(ws, { resumed: true });
          } else {
            startSession();
          }
          return;
        }
        startSession();
        socket.handleFrame(text);
      });
      const onClose = () => {
        clearTimeout(helloTimer);
        socket?.handleTransportClose(ws);
      };
      ws.on('close', onClose);
      ws.on('error', onClose);
    });
  });

  // 心跳：清理已经失联但没有正常关闭的连接
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return hub;
}
