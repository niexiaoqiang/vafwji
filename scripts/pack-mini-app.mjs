// 将微应用构建产物打包为社区可上传的 dist/mini-app/package/app.zip。
//
// 用法：
//   MINI_APP_ID=<应用ID> MINI_APP_VERSION=1.0.0 \
//   MINI_APP_WS_URL=wss://plane.example.com/mini-app/ws \
//   npm run build:mini-app
//
// MINI_APP_ID 必须从社区个人资料的应用页复制，不要自行生成。
import { copyFile, readFile } from 'node:fs/promises';
import { pack } from '@discourse-mini-app/sdk/pack';

const webDir = 'dist/mini-app/web';
const manifest = JSON.parse(await readFile('mini-app/manifest.json', 'utf8'));

manifest.id = process.env.MINI_APP_ID || manifest.id;
manifest.version = process.env.MINI_APP_VERSION || manifest.version;
if (process.env.MINI_APP_WS_URL) {
  manifest.websockets.game.url = process.env.MINI_APP_WS_URL;
}

if (manifest.id === '00000000-0000-7000-8000-000000000000') {
  console.warn('⚠️  仍在使用占位应用 ID，上传前请设置 MINI_APP_ID 为社区分配的 ID');
}
if (manifest.websockets.game.url.includes('example.com')) {
  console.warn('⚠️  仍在使用示例 WSS 地址，请设置 MINI_APP_WS_URL 为你部署的游戏服务地址');
}

await copyFile('mini-app/template.html', `${webDir}/index.html`);
await copyFile('mini-app/strings.json', `${webDir}/strings.json`);

const files = {};
for (const name of ['index.html', 'app.js', 'app.css', 'strings.json']) {
  files[name] = await readFile(`${webDir}/${name}`);
}

const result = await pack({ manifest, files, outputDirectory: 'dist/mini-app/package' });
console.log(
  `已生成 ${result.file}（${result.size} 字节），应用 ${manifest.id}，版本 ${manifest.version}，WSS ${manifest.websockets.game.url}`
);
