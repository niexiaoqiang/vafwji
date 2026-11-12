// 皮肤注册与切换。
//
// src/skins/ 下除 index.js、schema.js 和以 _ 开头的文件外，每个 .js 都是一套皮肤，
// 放进来就会自动出现在皮肤列表里（按 order 排序）。规范见 schema.js 和 docs/skins.md。
import { reactive } from 'vue';
import { persistent } from '../platform.js';
import { TOKENS, EFFECTS, validateSkin, withDefaults } from './schema.js';

const modules = import.meta.glob(['./*.js', '!./index.js', '!./schema.js', '!./_*.js'], { eager: true });

export const SKINS = Object.values(modules)
  .map((mod) => mod.default)
  .filter((skin) => {
    const { errors } = validateSkin(skin);
    if (errors.length) console.warn(`皮肤 ${skin?.id || '(未命名)'} 不符合规范，已跳过：`, errors);
    return errors.length === 0;
  })
  .map(withDefaults)
  .sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.name.localeCompare(b.name));

const STORAGE_KEY = 'skin';
const SYSTEM = 'system';
// 没有选过皮肤的玩家默认使用经典蓝；“跟随系统”仍可在皮肤列表中选择
const DEFAULT_SKIN = 'classic';

/** 当前皮肤状态：组件读取 skinState.skin.icons 来显示棋盘符号。 */
export const skinState = reactive({
  choice: DEFAULT_SKIN, // 玩家的选择：皮肤 id，或 system（跟随系统深浅色）
  skin: SKINS[0],
});

let extraSheet = null;
const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function systemSkin() {
  const mode = darkQuery?.matches ? 'dark' : 'light';
  return SKINS.find((s) => s.mode === mode) || SKINS[0];
}

function resolve(choice) {
  return (choice !== SYSTEM && SKINS.find((s) => s.id === choice)) || systemSkin();
}

function apply(skin) {
  const root = document.documentElement;
  for (const token of TOKENS) root.style.setProperty(`--sk-${token.name}`, skin.tokens[token.name]);
  root.dataset.skin = skin.id;
  root.style.colorScheme = skin.mode;
  for (const effect of EFFECTS) {
    if (skin.effects[effect.name]) root.dataset[`fx${effect.name[0].toUpperCase()}${effect.name.slice(1)}`] = '';
    else delete root.dataset[`fx${effect.name[0].toUpperCase()}${effect.name.slice(1)}`];
  }
  // 补充样式用可构造样式表挂载，不往页面里插入 <style> 标签
  try {
    if (!extraSheet && typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in document) {
      extraSheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, extraSheet];
    }
    extraSheet?.replaceSync(skin.extraCss || '');
  } catch (error) {
    console.warn('应用皮肤补充样式失败:', error);
  }
  skinState.skin = skin;
}

/** 选择皮肤（皮肤 id 或 'system'）并记住。 */
export function setSkin(choice, { persist = true } = {}) {
  skinState.choice = choice === SYSTEM || SKINS.some((s) => s.id === choice) ? choice : DEFAULT_SKIN;
  apply(resolve(skinState.choice));
  if (persist) persistent.set(STORAGE_KEY, skinState.choice).catch(() => {});
}

/** 启动时先套用默认皮肤，平台就绪后再读取玩家保存的选择。 */
export function initSkin() {
  apply(resolve(DEFAULT_SKIN));
  darkQuery?.addEventListener?.('change', () => {
    if (skinState.choice === SYSTEM) apply(systemSkin());
  });
}

export async function loadSavedSkin() {
  try {
    const saved = await persistent.get(STORAGE_KEY);
    if (saved) setSkin(saved, { persist: false });
  } catch {
    // 读取失败就保持跟随系统
  }
}

export { SYSTEM as SYSTEM_SKIN };
