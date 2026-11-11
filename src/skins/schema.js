// 皮肤规范 v1：一套皮肤必须提供的样式变量、可选图标和特效开关。
// 页面样式只读取这里列出的 CSS 变量（--sk-<名称>），所以只要按规范填满，
// 新皮肤就能覆盖全部界面，且不会改变布局。
//
// 本文件不依赖 Vue / 浏览器，皮肤检查脚本（scripts/check-skins.mjs）也会使用。

export const SKIN_SPEC_VERSION = 1;

/**
 * 样式变量。kind 决定校验方式：
 *   color       单个颜色（#rgb / #rrggbb / #rrggbbaa / rgb() / rgba() / hsl()）
 *   paint       颜色或渐变（可用于背景）
 *   length      长度（px / rem）
 *   font        字体栈
 *   shadow      box-shadow 值或 none
 */
export const TOKENS = [
  // 页面与卡片
  { name: 'bg', kind: 'paint', group: '页面与卡片', desc: '页面背景，可以是纯色或渐变' },
  { name: 'surface', kind: 'color', group: '页面与卡片', desc: '卡片、弹窗背景' },
  { name: 'surface-2', kind: 'color', group: '页面与卡片', desc: '卡片内的次级块：输入框、列表项、分段按钮底色' },
  { name: 'line', kind: 'color', group: '页面与卡片', desc: '边框、分隔线' },
  { name: 'overlay', kind: 'color', group: '页面与卡片', desc: '弹窗后面的遮罩' },
  { name: 'shadow', kind: 'shadow', group: '页面与卡片', desc: '卡片阴影' },
  // 文字
  { name: 'text', kind: 'color', group: '文字', desc: '正文与标题' },
  { name: 'text-dim', kind: 'color', group: '文字', desc: '说明文字、坐标、次要信息' },
  // 强调与按钮
  { name: 'accent', kind: 'color', group: '强调与按钮', desc: '主按钮、选中状态、轮到你的提示' },
  { name: 'accent-ink', kind: 'color', group: '强调与按钮', desc: '主按钮上的文字（要和 accent 有足够对比）' },
  { name: 'accent-2', kind: 'color', group: '强调与按钮', desc: '辅助强调色：倒计时进度条渐变的另一端、链接' },
  { name: 'glow', kind: 'shadow', group: '强调与按钮', desc: '主按钮的光晕 / 阴影，不需要就写 none' },
  // 提示色
  { name: 'success', kind: 'color', group: '提示色', desc: '已准备、胜利、在线' },
  { name: 'warning', kind: 'color', group: '提示色', desc: '倒计时紧急、掉线提醒' },
  { name: 'danger', kind: 'color', group: '提示色', desc: '退出、失败、被击落' },
  // 棋盘
  { name: 'enemy-cell', kind: 'color', group: '棋盘', desc: '对方棋盘的格子' },
  { name: 'enemy-line', kind: 'color', group: '棋盘', desc: '对方棋盘的格线（格子之间的缝）' },
  { name: 'mine-cell', kind: 'color', group: '棋盘', desc: '我的棋盘的格子（布阵页也用它）' },
  { name: 'mine-line', kind: 'color', group: '棋盘', desc: '我的棋盘的格线' },
  { name: 'grid-gap', kind: 'length', group: '棋盘', desc: '格子之间的缝宽，纸面风可以设为 0px 配合虚线' },
  { name: 'cell-radius', kind: 'length', group: '棋盘', desc: '格子圆角' },
  // 飞机
  { name: 'plane-1', kind: 'color', group: '飞机', desc: '一号机颜色（机头用原色，机身自动调淡）' },
  { name: 'plane-2', kind: 'color', group: '飞机', desc: '二号机颜色' },
  { name: 'plane-3', kind: 'color', group: '飞机', desc: '三号机颜色' },
  { name: 'head-dot', kind: 'color', group: '飞机', desc: '机头上的圆点' },
  // 攻击结果
  { name: 'miss', kind: 'color', group: '攻击结果', desc: '未命中的空心圈' },
  { name: 'hit', kind: 'color', group: '攻击结果', desc: '命中机身的符号' },
  { name: 'hit-bg', kind: 'color', group: '攻击结果', desc: '命中格的底色' },
  { name: 'sink', kind: 'color', group: '攻击结果', desc: '击落（打中机头）格的底色' },
  { name: 'sink-ink', kind: 'color', group: '攻击结果', desc: '击落格上的符号' },
  { name: 'wreck', kind: 'color', group: '攻击结果', desc: '已击落飞机的残骸格' },
  { name: 'mark', kind: 'color', group: '攻击结果', desc: '玩家自己的猜测标记（虚线）' },
  { name: 'latest', kind: 'color', group: '攻击结果', desc: '最近一次攻击的描边' },
  // 形状与字体
  { name: 'radius', kind: 'length', group: '形状与字体', desc: '卡片圆角' },
  { name: 'radius-sm', kind: 'length', group: '形状与字体', desc: '按钮、输入框圆角' },
  { name: 'font', kind: 'font', group: '形状与字体', desc: '正文字体栈（只能用系统字体，微应用不能加载外部字体）' },
  { name: 'font-title', kind: 'font', group: '形状与字体', desc: '标题字体栈' },
];

/** 棋盘符号，只能是 0～2 个字符的文字或 emoji；留空则使用样式绘制的默认图形。 */
export const ICONS = [
  { name: 'miss', default: '', desc: '未命中（留空 = 空心圈）' },
  { name: 'hit', default: '✕', desc: '命中机身' },
  { name: 'sink', default: '✹', desc: '击落' },
  { name: 'mark', default: '?', desc: '猜测标记' },
];

/** 特效开关，全部可选。 */
export const EFFECTS = [
  { name: 'glow', default: false, desc: '命中、击落、主按钮发光' },
  { name: 'radar', default: false, desc: '对方棋盘中心的雷达光晕、大厅卡片上的雷达圈' },
  { name: 'paper', default: false, desc: '页面横线纸纹理' },
  { name: 'dashedGrid', default: false, desc: '格子用虚线描边（通常配合 grid-gap: 0px）' },
  { name: 'pulse', default: true, desc: '最近一次攻击的闪动圆圈' },
];

const COLOR_RE = /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|rgba|hsl|hsla)\([^()]*\)|transparent)$/i;
const LENGTH_RE = /^\d+(\.\d+)?(px|rem)$/;

/** 校验一套皮肤，返回 { errors, warnings }。 */
export function validateSkin(skin) {
  const errors = [];
  const warnings = [];
  if (!skin || typeof skin !== 'object') return { errors: ['皮肤必须导出一个对象'], warnings };
  for (const field of ['id', 'name', 'author', 'description']) {
    if (typeof skin[field] !== 'string' || !skin[field].trim()) errors.push(`缺少 ${field}`);
  }
  if (skin.id && !/^[a-z][a-z0-9-]{1,31}$/.test(skin.id)) errors.push('id 只能用小写字母、数字和连字符，以字母开头，2～32 位');
  if (!['dark', 'light'].includes(skin.mode)) errors.push('mode 必须是 dark 或 light');
  const tokens = skin.tokens || {};
  for (const token of TOKENS) {
    const value = tokens[token.name];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`tokens.${token.name} 未填写（${token.desc}）`);
      continue;
    }
    const v = value.trim();
    if (/url\(|expression|javascript:|[;{}<>]/i.test(v)) errors.push(`tokens.${token.name} 含有不允许的内容`);
    else if (token.kind === 'color' && !COLOR_RE.test(v)) errors.push(`tokens.${token.name} 不是合法颜色：${v}`);
    else if (token.kind === 'length' && !LENGTH_RE.test(v)) errors.push(`tokens.${token.name} 必须是 px 或 rem 长度：${v}`);
    else if (token.kind === 'paint' && !COLOR_RE.test(v) && !/^(linear|radial|conic)-gradient\(.+\)$/i.test(v)) {
      errors.push(`tokens.${token.name} 必须是颜色或渐变：${v}`);
    }
  }
  for (const name of Object.keys(tokens)) {
    if (!TOKENS.some((t) => t.name === name)) warnings.push(`tokens.${name} 不在规范中，会被忽略`);
  }
  for (const [name, value] of Object.entries(skin.icons || {})) {
    if (!ICONS.some((i) => i.name === name)) warnings.push(`icons.${name} 不在规范中，会被忽略`);
    else if (typeof value !== 'string' || [...value].length > 2) errors.push(`icons.${name} 必须是 0～2 个字符`);
  }
  for (const [name, value] of Object.entries(skin.effects || {})) {
    if (!EFFECTS.some((e) => e.name === name)) warnings.push(`effects.${name} 不在规范中，会被忽略`);
    else if (typeof value !== 'boolean') errors.push(`effects.${name} 必须是 true / false`);
  }
  if (skin.extraCss != null) {
    if (typeof skin.extraCss !== 'string') errors.push('extraCss 必须是字符串');
    else if (/url\(|@import/i.test(skin.extraCss)) errors.push('extraCss 不能引用外部资源（url / @import）');
    else if (skin.extraCss.trim() && !skin.extraCss.includes(`[data-skin="${skin.id}"]`)) {
      warnings.push(`extraCss 的选择器应以 [data-skin="${skin.id}"] 开头，避免影响其他皮肤`);
    }
  }
  return { errors, warnings };
}

/** 补齐图标和特效的默认值。 */
export function withDefaults(skin) {
  const icons = Object.fromEntries(ICONS.map((i) => [i.name, skin.icons?.[i.name] ?? i.default]));
  const effects = Object.fromEntries(EFFECTS.map((e) => [e.name, skin.effects?.[e.name] ?? e.default]));
  return { ...skin, icons, effects };
}
