// 平台适配：同一套界面既能作为独立网页运行，也能作为社区微应用运行。
// 微应用构建时 __MINI_APP__ 为 true，其余情况下 SDK 相关代码会被摇树移除。
import { createSocket } from './net/socket.js';

// __MINI_APP__ 由 vite.config.js / vite.mini-app.config.js 在构建时注入
export const isMiniApp = __MINI_APP__;

let sdk = null;
let pageRendered = false;
let platformReady = false;
let renderedReported = false;
const memoryStore = new Map();

/**
 * 初始化平台：微应用模式下等待 SDK 就绪并读取社区用户资料。
 * 任一能力失败都不阻塞游戏，只回退到默认行为。
 */
export async function initPlatform() {
  if (!isMiniApp) return { user: null };
  const { getSDK } = await import('@discourse-mini-app/sdk');
  sdk = getSDK();
  await sdk.ready;
  platformReady = true;
  // 挂载和 SDK 加载可能以任意顺序完成；读取用户失败也不阻塞首屏就绪。
  await reportRendered();
  let user = null;
  if (sdk.permissions.has('user.read')) {
    try {
      user = await sdk.user.getCurrent({ timeoutMs: 10_000 });
    } catch (error) {
      console.warn('读取社区用户资料失败:', error);
    }
  }
  return { user };
}

/** 创建实时连接；微应用使用 manifest 中名为 game 的 WebSocket 端点。 */
export function connectRealtime() {
  if (isMiniApp && !sdk?.permissions.has('network.websocket')) {
    throw new Error('未获批 network.websocket 权限，无法联机');
  }
  return createSocket({ sdk: isMiniApp ? sdk : null, endpoint: 'game' });
}

/** 首次渲染（或显示错误）后通知容器，只调用一次。 */
export async function markRendered() {
  pageRendered = true;
  await reportRendered();
}

async function reportRendered() {
  if (!isMiniApp || !pageRendered || !platformReady || renderedReported) return;
  renderedReported = true;
  try {
    await sdk.lifecycle.ready();
  } catch (error) {
    console.warn('lifecycle.ready 调用失败:', error);
  }
}

/** 复制文本：微应用走 SDK（需 clipboard.write，用户会看到确认），网页版走浏览器 API。 */
export async function copyText(text) {
  if (isMiniApp) {
    if (!sdk?.permissions.has('clipboard.write')) throw new Error('未获批剪贴板权限');
    await sdk.clipboard.writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

/**
 * 同步键值存储。沙箱 iframe 中原生 localStorage 可能不可用，
 * 这里以内存为准，原生存储仅作尽力而为的持久化。
 */
export const storage = {
  getItem(key) {
    if (memoryStore.has(key)) return memoryStore.get(key);
    if (isMiniApp) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    memoryStore.set(key, String(value));
    if (isMiniApp) return;
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // 忽略：存储不可用时只保留在内存
    }
  },
  removeItem(key) {
    memoryStore.delete(key);
    if (isMiniApp) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 忽略
    }
  },
};

/**
 * 持久化存储（异步）：微应用使用 SDK 的 localStorage（需 storage.read / storage.write），
 * 网页版使用浏览器 localStorage；都不可用时退回内存。
 */
export const persistent = {
  async get(key) {
    try {
      if (isMiniApp) {
        if (!sdk?.permissions.has('storage.read')) return memoryStore.get(`p:${key}`) ?? null;
        return await sdk.localStorage.getItem(key);
      }
      return window.localStorage.getItem(key);
    } catch (error) {
      console.warn('读取存储失败:', error);
      return memoryStore.get(`p:${key}`) ?? null;
    }
  },
  async set(key, value) {
    memoryStore.set(`p:${key}`, String(value));
    try {
      if (isMiniApp) {
        if (sdk?.permissions.has('storage.write')) await sdk.localStorage.setItem(key, String(value));
        return;
      }
      window.localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn('写入存储失败:', error);
    }
  },
};

