// 检查 src/skins/ 下所有皮肤是否符合规范：必填项、取值格式、文字对比度、id 是否重复。
//   npm run skins:check            检查全部皮肤
//   npm run skins:check -- radar   只检查指定皮肤
// 有错误时退出码为 1；对比度不足等只给警告。
import { readdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateSkin, TOKENS } from '../src/skins/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const skinsDir = path.resolve(here, '../src/skins');
const only = process.argv.slice(2);

export async function loadSkinFiles({ includeTemplate = false } = {}) {
  const files = (await readdir(skinsDir))
    .filter((f) => f.endsWith('.js') && !['index.js', 'schema.js'].includes(f))
    .filter((f) => includeTemplate || !f.startsWith('_'))
    .sort();
  const skins = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(skinsDir, file)).href);
    skins.push({ file, skin: mod.default });
  }
  return skins;
}

// ---------------- 颜色与对比度 ----------------
function parseColor(value) {
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: a.endsWith('%') ? parseFloat(a) / 100 : +a };
  }
  return null; // hsl / 渐变等不做对比度计算
}

function over(top, bottom) {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

function luminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// 需要检查对比度的组合：[前景, 背景, 最低要求, 说明]
const PAIRS = [
  ['text', 'surface', 4.5, '正文 / 卡片'],
  ['text-dim', 'surface', 3, '说明文字 / 卡片'],
  ['text', 'surface-2', 4.5, '正文 / 次级块'],
  ['accent-ink', 'accent', 4.5, '主按钮文字 / 主按钮'],
  ['sink-ink', 'sink', 3, '击落符号 / 击落格'],
  ['hit', 'enemy-cell', 3, '命中符号 / 对方格子'],
  ['miss', 'enemy-cell', 2, '未命中圈 / 对方格子'],
  ['danger', 'surface', 3, '危险色 / 卡片'],
];

function checkContrast(skin) {
  const warnings = [];
  const surface = parseColor(skin.tokens.surface);
  const base = surface && surface.a < 1 ? over(surface, skin.mode === 'dark' ? { r: 10, g: 15, b: 25, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }) : surface;
  for (const [fgName, bgName, min, label] of PAIRS) {
    let bg = parseColor(skin.tokens[bgName] || '');
    let fg = parseColor(skin.tokens[fgName] || '');
    if (!bg || !fg || !base) continue;
    if (bg.a < 1) bg = over(bg, base);
    if (fg.a < 1) fg = over(fg, bg);
    const ratio = contrast(fg, bg);
    if (ratio < min) warnings.push(`对比度不足：${label}（${fgName} 对 ${bgName}）为 ${ratio.toFixed(2)}，建议至少 ${min}`);
  }
  return warnings;
}

async function main() {
  const entries = await loadSkinFiles({ includeTemplate: true });
  const seen = new Map();
  let failed = 0;
  console.log(`皮肤规范 v1：${TOKENS.length} 个样式变量\n`);
  for (const { file, skin } of entries) {
    if (only.length && !only.includes(skin?.id) && !only.includes(file)) continue;
    const { errors, warnings } = validateSkin(skin);
    if (skin?.id && !file.startsWith('_')) {
      if (seen.has(skin.id)) errors.push(`id「${skin.id}」与 ${seen.get(skin.id)} 重复`);
      seen.set(skin.id, file);
    }
    if (errors.length === 0) warnings.push(...checkContrast(skin));
    const title = `${file}  ${skin?.name || ''}${file.startsWith('_') ? '（模板，不会出现在列表中）' : ''}`;
    if (errors.length) {
      failed += 1;
      console.log(`✗ ${title}`);
      errors.forEach((e) => console.log(`    错误：${e}`));
    } else {
      console.log(`✓ ${title}`);
    }
    warnings.forEach((w) => console.log(`    提示：${w}`));
  }
  console.log(failed ? `\n${failed} 套皮肤有错误，修正后再提交。` : '\n全部皮肤符合规范。');
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
