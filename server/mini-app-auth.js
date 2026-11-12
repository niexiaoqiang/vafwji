// 社区微应用平台 JWT 鉴权（WSS 握手阶段验证 mini_app_token）。
// 参考: https://github.com/linux-do/mapp-developer-guide/blob/main/docs/server-auth.md
//
// 环境变量：
//   MINI_APP_ISSUER         社区基地址，含子目录且不以 / 结尾，如 https://linux.do
//   MINI_APP_ID             社区应用页分配的应用 ID
//   MINI_APP_PUBLIC_ORIGIN  本服务对外的 HTTPS origin，如 https://plane.example.com（JWT audience）
//   MINI_APP_CHANNELS       允许的渠道，逗号分隔，默认 production；sandbox 调试时可设为 production,sandbox
import { PlatformAuthError, verifyPlatformWebSocketRequest } from '@discourse-mini-app/sdk/server';

const JWKS_REFRESH_COOLDOWN_MS = 60_000;

function readConfig() {
  const issuer = (process.env.MINI_APP_ISSUER || '').replace(/\/+$/, '');
  const appId = process.env.MINI_APP_ID || '';
  const audience = (process.env.MINI_APP_PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  const channels = (process.env.MINI_APP_CHANNELS || 'production')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item === 'production' || item === 'sandbox');
  if (!issuer && !appId && !audience) return null;
  if (!issuer || !appId || !audience) {
    throw new Error('MINI_APP_ISSUER、MINI_APP_ID、MINI_APP_PUBLIC_ORIGIN 需要同时配置');
  }
  for (const value of [issuer, audience]) {
    if (new URL(value).protocol !== 'https:') throw new Error(`${value} 必须是 https 地址`);
  }
  return { issuer, appId, audience, channels: channels.length ? channels : ['production'] };
}

function validateJwk(body) {
  const key = Array.isArray(body?.keys) && body.keys.length === 1 ? body.keys[0] : undefined;
  if (
    !key ||
    key.kty !== 'EC' ||
    key.crv !== 'P-256' ||
    key.alg !== 'ES256' ||
    key.use !== 'sig' ||
    typeof key.kid !== 'string' ||
    !key.kid ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    Object.hasOwn(key, 'd')
  ) {
    throw new Error('社区 JWKS 格式无效');
  }
  return key;
}

/**
 * 返回 WebSocket 握手鉴权函数；未配置时返回 null，由服务入口拒绝微应用连接。
 */
export function createMiniAppAuthenticator() {
  const config = readConfig();
  if (!config) return null;

  let publicKey = null;
  let loading = null;
  let lastLoad = 0;

  async function loadPublicKey(force = false) {
    if (publicKey && !force) return publicKey;
    if (loading) return loading;
    if (force && Date.now() - lastLoad < JWKS_REFRESH_COOLDOWN_MS) return publicKey;
    loading = (async () => {
      try {
        const response = await fetch(`${config.issuer}/mini-app-api/jwks`, {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`JWKS 请求失败: ${response.status}`);
        publicKey = validateJwk(await response.json());
        lastLoad = Date.now();
        return publicKey;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  async function verify(request, key) {
    const target = request.url || '';
    if (!target.startsWith('/')) throw new PlatformAuthError();
    let lastError;
    for (const channel of config.channels) {
      try {
        return await verifyPlatformWebSocketRequest({
          issuer: config.issuer,
          audience: config.audience,
          appId: config.appId,
          channel,
          publicKey: key,
          url: `${config.audience}${target}`,
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new PlatformAuthError();
  }

  // 启动时预取公钥，失败不阻塞启动，握手时会再次尝试
  loadPublicKey().catch((error) => console.error('获取社区 JWT 公钥失败:', error.message));

  console.log(
    `微应用鉴权已启用: issuer=${config.issuer}, audience=${config.audience}, channels=${config.channels.join(',')}`
  );

  return async function authenticate(request) {
    if (request.headers.origin !== new URL(config.issuer).origin) {
      throw new PlatformAuthError();
    }
    const key = await loadPublicKey();
    let identity;
    try {
      identity = await verify(request, key);
    } catch (error) {
      // 公钥可能已轮换：有冷却地刷新一次后重试
      const refreshed = await loadPublicKey(true).catch(() => null);
      if (!refreshed || refreshed === key) throw error;
      identity = await verify(request, refreshed);
    }
    return { platformUser: { issuer: identity.iss, id: identity.sub, appId: identity.app_id, channel: identity.channel } };
  };
}
