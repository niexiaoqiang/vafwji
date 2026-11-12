// 生成所有皮肤的对比预览页：dist/skins-preview.html
//   npm run skins:preview
// 每套皮肤画一张电脑端对局示意和一张手机端大厅示意，直接用浏览器打开即可。
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKENS, validateSkin, withDefaults } from '../src/skins/schema.js';
import { loadSkinFiles } from './check-skins.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../dist/skins-preview.html');
const includeTemplate = process.argv.includes('--template');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cols = 'ABCDEFGHIJ'.split('');

// 示意数据：我方三架飞机、对方一架已击落 + 若干攻击
const SHAPE = [[-1, 0, 1], [0, 0], [0, -1], [0, -2], [0, 1], [0, 2], [1, 0], [2, 0], [2, -1], [2, 1]];
const rot = ([r, c], d) => (d === 1 ? [c, -r] : d === 2 ? [-r, -c] : d === 3 ? [-c, r] : [r, c]);
const plane = (row, col, dir) => SHAPE.map(([r, c, h]) => { const [dr, dc] = rot([r, c], dir); return { row: row + dr, col: col + dc, head: !!h }; });
const mine = [plane(3, 4, 0), plane(6, 8, 3), plane(8, 3, 1)];
const enemySunk = plane(2, 6, 2);
const k = (r, c) => `${r},${c}`;
const misses = new Set(['1,1', '1,8', '3,0', '4,5', '5,8', '8,1', '9,6', '10,3', '2,2', '6,6']);
const hits = new Set(['6,3', '5,3', '7,7']);
const marks = new Set(['6,4', '8,7']);
const incomingHit = new Set(['4,5', '3,3']);
const incomingMiss = new Set(['9,2', '1,0', '5,9']);

function enemyCells(skin) {
  const wreck = new Set(enemySunk.map((p) => k(p.row, p.col)));
  const head = enemySunk.find((p) => p.head);
  let html = '';
  for (let r = 1; r <= 10; r++) for (let c = 0; c < 10; c++) {
    const key = k(r, c);
    let cls = '';
    let txt = '';
    if (r === head.row && c === head.col) { cls = 'sink'; txt = skin.icons.sink; }
    else if (wreck.has(key)) cls = 'wreck';
    else if (hits.has(key)) { cls = 'hit' + (key === '7,7' ? ' latest' : ''); txt = skin.icons.hit; }
    else if (misses.has(key)) { cls = 'miss'; txt = skin.icons.miss; }
    else if (marks.has(key)) { cls = 'mark'; txt = skin.icons.mark; }
    html += `<i class="c ${cls}">${esc(txt)}</i>`;
  }
  return html;
}

function mineCells(skin) {
  let html = '';
  for (let r = 1; r <= 10; r++) for (let c = 0; c < 10; c++) {
    const key = k(r, c);
    let cls = '';
    mine.forEach((p, i) => { const hit = p.find((x) => x.row === r && x.col === c); if (hit) cls = `p p${i}${hit.head ? ' head' : ''}`; });
    let txt = '';
    if (incomingHit.has(key)) { cls += ' hitme'; txt = skin.icons.hit; }
    else if (incomingMiss.has(key)) { cls += ' miss'; txt = skin.icons.miss; }
    html += `<i class="c ${cls}">${esc(txt)}</i>`;
  }
  return html;
}

function board(type, cells) {
  return `<div class="bw"><div class="cols">${cols.map((c) => `<span>${c}</span>`).join('')}</div><div class="rows">${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div><div class="grid ${type}">${cells}</div></div>`;
}

function section(skin) {
  const vars = TOKENS.map((t) => `--sk-${t.name}:${skin.tokens[t.name]}`).join(';');
  const fx = Object.entries(skin.effects).filter(([, on]) => on).map(([name]) => `fx-${name}`).join(' ');
  return `
  <section class="skin ${fx}" style="${esc(vars)}">
    <header class="skin-head">
      <h2>${esc(skin.name)} <small>${esc(skin.id)} · ${skin.mode === 'dark' ? '深色' : '浅色'} · 作者 ${esc(skin.author)}</small></h2>
      <p>${esc(skin.description)}</p>
    </header>
    <div class="shots">
      <div class="desk">
        <div class="topbar"><span class="mark">✈</span><b class="title">全民打飞机</b><span class="crumb">对战 小王</span><span class="sp"></span><span class="ghost">🎨 皮肤</span><span class="ghost">规则</span></div>
        <div class="main">
          <div class="card status"><b class="title">你的回合</b><span class="bar"><i></i></span><b class="timer">20s</b><span class="dim">对方 2/3　我方 3/3</span></div>
          <div class="battle">
            <div class="card"><div class="ph"><b>对方棋盘</b><span class="seg"><span class="on">攻击</span><span>标记</span></span></div>${board('enemy', enemyCells(skin))}</div>
            <div class="card"><div class="ph"><b>我的棋盘</b><span class="dim">被命中 2 次</span></div>${board('mine', mineCells(skin))}</div>
          </div>
        </div>
      </div>
      <div class="phone"><div class="screen">
        <div class="topbar"><span class="mark">✈</span><b class="title">全民打飞机</b><span class="sp"></span><span class="ghost">🎨</span></div>
        <div class="pmain">
          <div class="card hero"><b class="title big">快速开始</b><span class="dim">和电脑对战，不用等人</span><span class="seg"><span>简单</span><span class="on">普通</span><span>困难</span></span><span class="btn">▶ 开始人机对战</span></div>
          <div class="card hero"><b class="title big">好友对战</b><span class="dim">把房间号发给朋友</span><span class="btn">创建房间</span><span class="row"><span class="input">输入房间号</span><span class="btn2">加入</span></span></div>
          <div class="stats"><span class="card"><b>12</b>联机胜</span><span class="card"><b>20</b>人机胜</span><span class="card"><b>34%</b>命中率</span></div>
        </div>
      </div></div>
    </div>
  </section>`;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#dfe4ec;color:#1d2433;padding:24px}
h1{font-size:22px;margin-bottom:4px}.intro{color:#5b6577;margin-bottom:22px;font-size:14px}
.skin{margin-bottom:34px;font-family:var(--sk-font)}
.skin-head{margin-bottom:10px}.skin-head h2{font-size:18px}.skin-head small{font-size:12px;color:#5b6577;font-weight:400;margin-left:8px}.skin-head p{color:#5b6577;font-size:13px}
.shots{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:22px;align-items:start}
.desk,.screen{background:var(--sk-bg);color:var(--sk-text);border-radius:14px;overflow:hidden;box-shadow:0 16px 40px rgba(20,28,45,.22)}
.fx-paper .desk,.fx-paper .screen{background-image:linear-gradient(rgba(150,125,80,.09) 1px,transparent 1px);background-size:100% 22px}
.phone{background:#11151c;border-radius:28px;padding:7px}.screen{border-radius:22px;height:520px}
.topbar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--sk-line);font-size:12px}
.mark{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--sk-accent);color:var(--sk-accent-ink);box-shadow:var(--sk-glow)}
.title{font-family:var(--sk-font-title);font-weight:900}.big{font-size:17px}
.crumb{padding:3px 8px;border-radius:6px;background:var(--sk-surface-2)}.sp{flex:1}
.ghost{padding:3px 9px;border:1px solid var(--sk-line);border-radius:999px;color:var(--sk-text-dim)}
.main{padding:14px 16px;display:grid;gap:12px}.pmain{padding:10px;display:grid;gap:9px}
.card{background:var(--sk-surface);border:1px solid var(--sk-line);border-radius:var(--sk-radius);box-shadow:var(--sk-shadow);padding:10px}
.status{display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;border-color:color-mix(in srgb,var(--sk-accent) 60%,transparent);background:linear-gradient(135deg,color-mix(in srgb,var(--sk-accent) 22%,var(--sk-surface)),var(--sk-surface))}
.bar{height:5px;border-radius:5px;background:var(--sk-surface-2);overflow:hidden}.bar i{display:block;width:64%;height:100%;background:linear-gradient(90deg,var(--sk-accent),var(--sk-accent-2))}
.timer{color:var(--sk-accent)}.dim{color:var(--sk-text-dim);font-size:11px}
.battle{display:grid;grid-template-columns:1.3fr 1fr;gap:12px;align-items:start}
.ph{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px}
.seg{display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:2px;border-radius:var(--sk-radius-sm);background:var(--sk-surface-2);font-size:11px;color:var(--sk-text-dim);text-align:center}
.seg span{padding:4px 8px;border-radius:calc(var(--sk-radius-sm) - 2px)}.seg .on{background:var(--sk-accent);color:var(--sk-accent-ink)}
.hero .seg .on{background:var(--sk-surface);color:var(--sk-text)}
.bw{display:grid;grid-template-columns:14px 1fr;grid-template-rows:14px auto}
.cols,.rows{display:grid;color:var(--sk-text-dim);font-size:8px;text-align:center}.cols{grid-column:2;grid-template-columns:repeat(10,1fr);align-items:center}.rows{grid-row:2;grid-template-rows:repeat(10,1fr);align-items:center}
.grid{grid-column:2;grid-row:2;display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr);aspect-ratio:1;gap:var(--sk-grid-gap);padding:var(--sk-grid-gap);border-radius:calc(var(--sk-cell-radius) + 5px)}
.grid.enemy{background:var(--sk-enemy-line);--cb:var(--sk-enemy-cell)}.grid.mine{background:var(--sk-mine-line);--cb:var(--sk-mine-cell)}
.fx-radar .grid.enemy{background-image:radial-gradient(circle,color-mix(in srgb,var(--sk-accent) 22%,transparent),transparent 70%)}
.fx-dashedGrid .grid{border:2px solid var(--sk-enemy-line)}.fx-dashedGrid .grid.mine{border-color:var(--sk-mine-line)}
.c{position:relative;min-width:0;min-height:0;display:grid;place-items:center;border-radius:var(--sk-cell-radius);background:var(--cb);font-style:normal;font-weight:800;font-size:11px;line-height:1}
.fx-dashedGrid .c{border:.5px dashed var(--sk-enemy-line)}
.c.miss{color:var(--sk-miss)}.c.miss:empty::after{content:"";width:32%;height:32%;border-radius:50%;border:1.5px solid var(--sk-miss)}
.c.hit{background:var(--sk-hit-bg);color:var(--sk-hit)}.c.hitme{color:var(--sk-hit)}
.c.sink{background:var(--sk-sink);color:var(--sk-sink-ink)}.c.wreck{background:var(--sk-wreck)}
.fx-glow .c.hit{text-shadow:0 0 8px var(--sk-hit)}.fx-glow .c.sink{box-shadow:0 0 10px var(--sk-sink)}
.c.mark{color:var(--sk-mark);outline:1.5px dashed var(--sk-mark);outline-offset:-3px;font-size:9px}
.c.latest{box-shadow:inset 0 0 0 2px var(--sk-latest)}
.c.p0{--pl:var(--sk-plane-1)}.c.p1{--pl:var(--sk-plane-2)}.c.p2{--pl:var(--sk-plane-3)}
.c.p{background:color-mix(in srgb,var(--pl) 58%,var(--sk-mine-cell))}.c.p.head{background:var(--pl)}
.c.head:empty::before{content:"";width:32%;height:32%;border-radius:50%;background:var(--sk-head-dot)}
.hero{display:grid;gap:7px;background:linear-gradient(140deg,var(--sk-surface-2),var(--sk-surface) 70%)}
.btn{padding:8px;border-radius:var(--sk-radius-sm);background:var(--sk-accent);color:var(--sk-accent-ink);box-shadow:var(--sk-glow);text-align:center;font-weight:800;font-size:12px}
.row{display:flex;gap:6px}.input{flex:1;padding:7px;border:1px solid var(--sk-line);border-radius:var(--sk-radius-sm);background:var(--sk-surface-2);color:var(--sk-text-dim);font-size:11px}
.btn2{padding:7px 10px;border-radius:var(--sk-radius-sm);background:var(--sk-surface-2);font-size:11px;font-weight:700}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.stats .card{display:grid;font-size:10px;color:var(--sk-text-dim);padding:7px}.stats b{font-size:15px;color:var(--sk-text)}
@media (max-width:900px){.shots{grid-template-columns:1fr}.phone{max-width:280px}}
`;

async function main() {
  const entries = await loadSkinFiles({ includeTemplate });
  const skins = entries
    .map(({ skin }) => skin)
    .filter((skin) => validateSkin(skin).errors.length === 0)
    .map(withDefaults)
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>全民打飞机皮肤预览</title><style>${CSS}</style></head><body>
<h1>全民打飞机 · 皮肤预览</h1><p class="intro">共 ${skins.length} 套皮肤，由 npm run skins:preview 生成。不符合规范的皮肤不会出现在这里，先运行 npm run skins:check 查看原因。</p>
${skins.map(section).join('\n')}
</body></html>`;
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`已生成 ${path.relative(process.cwd(), out)}（${skins.length} 套皮肤），用浏览器打开即可。`);
}

main();
