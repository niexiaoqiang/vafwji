// 在构建及打包前检查最终配置，环境变量覆盖与打包器共用同一份逻辑。
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function releaseManifest(source, env = {}) {
  const manifest = structuredClone(source);
  manifest.id = env.MINI_APP_ID ?? manifest.id;
  manifest.version = env.MINI_APP_VERSION ?? manifest.version;
  if (!manifest.id || manifest.id === '00000000-0000-7000-8000-000000000000'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(manifest.id)) {
    throw new Error('请使用社区应用页分配的真实 UUIDv7，不能使用占位应用 ID');
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) {
    throw new Error('版本必须是三段数字，例如 1.0.0');
  }
  const game = manifest.websockets?.game;
  if (!game || game.auth !== 'platform') throw new Error('联机端点 game 必须使用 platform 鉴权');
  game.url = env.MINI_APP_WS_URL ?? game.url;
  let url;
  try { url = new URL(game.url); } catch { throw new Error('请配置有效的公网 WSS 地址'); }
  if (url.protocol !== 'wss:' || url.username || url.password || url.hash
    || /(^|\.)example\.(com|org|net)$/.test(url.hostname)
    || url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('请配置真实公网 WSS 地址，不能使用示例地址、凭据或片段');
  }
  return manifest;
}

export async function loadReleaseManifest(env = process.env) {
  const source = JSON.parse(await readFile(new URL('../mini-app/manifest.json', import.meta.url), 'utf8'));
  return releaseManifest(source, env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const manifest = await loadReleaseManifest();
    console.log(`微应用配置通过：${manifest.id} / ${manifest.version}`);
  } catch (error) {
    console.error(`微应用配置无效：${error.message}`);
    process.exitCode = 1;
  }
}
