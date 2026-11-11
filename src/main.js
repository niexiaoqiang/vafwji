import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import { isMiniApp } from './platform.js'
import { initSkin } from './skins/index.js'

// 生产构建默认关闭调试日志（console.log / debug），警告和错误照常输出。
// 排查问题时：网页版加 ?debug=1，或在控制台执行 localStorage.debug = '1' 后刷新。
function debugEnabled() {
  if (!import.meta.env.PROD) return true
  if (isMiniApp) return false
  try {
    return new URLSearchParams(window.location.search).has('debug') || window.localStorage.getItem('debug') === '1'
  } catch {
    return false
  }
}
if (!debugEnabled()) {
  console.log = () => {}
  console.debug = () => {}
}

if (isMiniApp) {
  document.documentElement.classList.add('mini-app')
}

// 先按系统深浅色套用默认皮肤，避免首屏闪烁；玩家保存的选择在平台就绪后读取
initSkin()

createApp(App).mount('#app')
