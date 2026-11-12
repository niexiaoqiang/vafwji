// 将微应用构建产物打包为社区可上传的 dist/mini-app/package/app.zip。
//
// 用法：
//   MINI_APP_ID=<应用ID> MINI_APP_VERSION=1.0.0 \
//   MINI_APP_WS_URL=wss://zha-fei-ji.onrender.com/mini-app/ws \
//   npm run build:mini-app
//
// MINI_APP_ID 必须从社区个人资料的应用页复制，不要自行生成。
import { copyFile, readFile } from 'node:fs/promises';
import { pack } from '@discourse-mini-app/sdk/pack';
import { loadReleaseManifest } from './mini-app-config.mjs';

// 所有检查都在写文件前完成；支持独立目录，便于保留旧构建。
const manifest = await loadReleaseManifest();
const webDir = process.env.MINI_APP_WEB_DIR || 'dist/mini-app/web';
const outputDirectory = process.env.MINI_APP_OUTPUT_DIR || 'dist/mini-app/package';

await copyFile('mini-app/template.html', `${webDir}/index.html`);
await copyFile('mini-app/strings.json', `${webDir}/strings.json`);

const files = {};
for (const name of ['index.html', 'app.js', 'app.css', 'strings.json']) {
  files[name] = await readFile(`${webDir}/${name}`);
}

const result = await pack({ manifest, files, outputDirectory });
console.log(
  `已生成 ${result.file}（${result.size} 字节），应用 ${manifest.id}，版本 ${manifest.version}，WSS ${manifest.websockets.game.url}`
);
