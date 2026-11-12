import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 浏览器回归测试时设置 NO_DEVTOOLS=1：DevTools 悬浮按钮会挡住手机底部的按钮
    process.env.NO_DEVTOOLS === '1' ? null : vueDevTools(),
  ].filter(Boolean),
  define: {
    // 独立网页版；微应用构建见 vite.mini-app.config.js
    __MINI_APP__: 'false',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: '0.0.0.0', // 监听所有网络接口
    port: 5173, // 默认Vite端口
  },
})
