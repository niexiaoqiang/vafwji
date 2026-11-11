// 与 Socket.io 客户端用法相近的实时连接：on / off / emit / id / connected / disconnect。
// 两种传输方式：
//   - 独立网页版：浏览器原生 WebSocket，连接同源 /ws，断线自动重连；
//   - 社区微应用：SDK 的 sdk.network.reconnectSocket，连接 manifest 声明的 WSS 端点。
// 协议见 server/realtime.js。
//
// 连接事件：
//   connect       会话建立（首次连接，或旧会话过期后的新会话）
//   disconnect    传输断开（服务端会保留会话一段时间，客户端自动重连）
//   reconnect     重连并接回原会话：连接 ID、房间、对局都保持不变
//   session_lost  重连成功但原会话已过期（之后会收到新的 connect，连接 ID 已变化）

const RESERVED = new Set(['connect', 'disconnect', 'connect_error', 'error', 'reconnect', 'session_lost']);

export class RealtimeClient {
  constructor(transport, { sessionStore = null, requestTimeoutMs = 8000 } = {}) {
    this.transport = transport;
    this.handlers = new Map();
    this.anyHandlers = new Set();
    this.acks = new Map();
    this.nextAck = 1;
    this.requestPrefix = Math.random().toString(36).slice(2);
    this.id = undefined;
    this.connected = false;
    this.closed = false;
    this.resumeKey = undefined;
    this.sessionStore = sessionStore;
    this.requestTimeoutMs = requestTimeoutMs;
    try {
      const saved = JSON.parse(sessionStore?.getItem('plane-session-v1') || 'null');
      if (typeof saved?.id === 'string' && typeof saved?.k === 'string') {
        this.id = saved.id;
        this.resumeKey = saved.k;
      }
    } catch { /* 存储不可用时仍可在当前页面断线续接。 */ }
    transport.start({
      // 每次底层连接建立后先发 hi；带上次的 id/k 请求接回原会话
      onOpen: (sendRaw = (text) => this.transport.send(text)) => {
        const hi = { t: 'hi' };
        if (this.id && this.resumeKey) hi.resume = { id: this.id, k: this.resumeKey };
        Promise.resolve().then(() => sendRaw(JSON.stringify(hi))).catch((error) => {
          console.warn('发送握手失败:', error);
        });
      },
      onMessage: (text) => this.handleFrame(text),
      onClose: (reason) => this.handleClose(reason),
      onError: (error) => this.dispatch('connect_error', [error]),
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return this;
  }

  once(event, handler) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    return this.on(event, wrapper);
  }

  off(event, handler) {
    if (event === undefined) this.handlers.clear();
    else if (!handler) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(handler);
    return this;
  }

  /** 监听所有服务端事件（与 Socket.io 的 onAny 一致，不含连接类保留事件）。 */
  onAny(handler) {
    this.anyHandlers.add(handler);
    return this;
  }

  offAny(handler) {
    if (handler) this.anyHandlers.delete(handler);
    else this.anyHandlers.clear();
    return this;
  }

  emit(event, ...args) {
    if (RESERVED.has(event)) {
      this.dispatch(event, args);
      return this;
    }
    const frame = { t: 'e', e: event, d: args };
    if (typeof args[args.length - 1] === 'function') {
      const callback = args.pop();
      frame.a = `${this.requestPrefix}-${this.nextAck++}`;
      const timer = setTimeout(() => this.completeAck(frame.a, [{ success: false, message: '请求超时，请重试', code: 'TIMEOUT' }]), this.requestTimeoutMs);
      this.acks.set(frame.a, { callback, timer });
    }
    if (!this.connected) {
      console.warn(`连接未就绪，事件 ${event} 未发送`);
      this.completeAck(frame.a, [{ success: false, message: '连接中断，请稍后重试', code: 'DISCONNECTED' }]);
      return this;
    }
    Promise.resolve().then(() => this.transport.send(JSON.stringify(frame))).catch((error) => {
      console.warn(`发送事件 ${event} 失败:`, error);
      this.completeAck(frame.a, [{ success: false, message: '发送失败，请重试', code: 'SEND_FAILED' }]);
    });
    return this;
  }

  disconnect() {
    this.closed = true;
    this.transport.close();
    this.handleClose('io client disconnect');
    return this;
  }

  completeAck(id, args) {
    const pending = this.acks.get(id);
    if (!pending) return;
    this.acks.delete(id);
    clearTimeout(pending.timer);
    pending.callback(...args);
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

  handleFrame(text) {
    let frame;
    try {
      frame = typeof text === 'string' ? JSON.parse(text) : text;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object') return;
    if (frame.t === 'hello') {
      const previousId = this.id;
      this.id = frame.id;
      this.resumeKey = frame.k;
      try {
        this.sessionStore?.setItem('plane-session-v1', JSON.stringify({ id: this.id, k: this.resumeKey }));
      } catch { /* 私密模式等环境允许不持久化。 */ }
      this.connected = true;
      if (frame.resumed && previousId === frame.id) {
        this.dispatch('reconnect', []);
      } else {
        if (previousId) this.dispatch('session_lost', [previousId]);
        this.dispatch('connect', []);
      }
    } else if (frame.t === 'e' && typeof frame.e === 'string') {
      const args = Array.isArray(frame.d) ? frame.d : [];
      for (const handler of [...this.anyHandlers]) {
        try {
          handler(frame.e, ...args);
        } catch (error) {
          console.error(`onAny 处理事件 ${frame.e} 时出错:`, error);
        }
      }
      this.dispatch(frame.e, args);
    } else if (frame.t === 'ack') {
      this.completeAck(frame.a, Array.isArray(frame.d) ? frame.d : []);
    }
  }

  handleClose(reason) {
    const wasConnected = this.connected;
    this.connected = false;
    for (const id of [...this.acks.keys()]) {
      this.completeAck(id, [{ success: false, message: '连接中断，请稍后重试', code: 'DISCONNECTED' }]);
    }
    if (!wasConnected) return;
    this.dispatch('disconnect', [reason]);
  }
}

/** 浏览器原生 WebSocket 传输（独立网页版）。 */
function nativeTransport(url) {
  let ws = null;
  let stopped = false;
  let attempt = 0;
  let timer = null;
  let handlers;

  function open() {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      attempt = 0;
      handlers.onOpen();
    });
    ws.addEventListener('message', (event) => handlers.onMessage(event.data));
    ws.addEventListener('error', () => handlers.onError(new Error('WebSocket 连接失败')));
    ws.addEventListener('close', () => {
      handlers.onClose('transport close');
      if (stopped) return;
      const delay = Math.min(5_000, 500 * 2 ** attempt++);
      timer = setTimeout(open, delay);
    });
  }

  return {
    start(callbacks) {
      handlers = callbacks;
      open();
    },
    send(text) {
      if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('SOCKET_CLOSED');
      ws.send(text);
    },
    close() {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}

/** 社区微应用 SDK 传输：只能连接 manifest 中声明并获批的 WSS 端点。 */
function sdkTransport(sdk, endpoint) {
  let connection = null;
  return {
    start(handlers) {
      connection = sdk.network.reconnectSocket(endpoint, {
        textMode: 'text',
        // 服务器冷启动（如 Render 免费实例约 1 分钟）期间保持较密的重试
        retry: {
          maxDelayMs: 5_000,
          onRetry: ({ attempt }) => console.warn(`实时连接断开，正在第 ${attempt} 次重连`),
        },
        onOpen: (socket) => {
          socket.on('close', () => handlers.onClose('transport close'));
          socket.on('error', ({ code } = {}) => handlers.onError(new Error(code || 'SOCKET_ERROR')));
          // 此时 ready 尚未完成，用本次连接对象直接发送握手
          handlers.onOpen((text) => socket.sendText(text));
        },
        onMessage: (message) => handlers.onMessage(message),
      });
      connection.ready.catch((error) => handlers.onError(error));
      connection.done
        .catch((error) => handlers.onError(error))
        .finally(() => handlers.onClose('transport close'));
    },
    send(text) {
      return connection.sendText(text);
    },
    close() {
      connection?.close().catch(() => {});
    },
  };
}

function defaultWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 开发模式下前端（5173）与后端（3000）分开运行；生产模式由后端同源提供页面
  const host = import.meta.env.DEV ? `${window.location.hostname}:3000` : window.location.host;
  return `${protocol}//${host}/ws`;
}

export function createSocket({ sdk = null, endpoint = 'game' } = {}) {
  // 编译期分支：微应用包里不包含原生 WebSocket 代码，网页版里不包含 SDK 传输
  if (__MINI_APP__) return new RealtimeClient(sdkTransport(sdk, endpoint));
  let sessionStore = null;
  try { sessionStore = window.sessionStorage; } catch { /* 存储不可用。 */ }
  return new RealtimeClient(nativeTransport(defaultWebSocketUrl()), { sessionStore });
}
