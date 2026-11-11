// 社区微应用构建：输出单个 IIFE app.js 与 app.css，再由 scripts/pack-mini-app.mjs 打包成 app.zip。
// 参考: https://github.com/linux-do/mapp-developer-guide/blob/main/docs/developer-guide.md
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const debug = process.env.MINI_APP_DEBUG === '1'

export default defineConfig({
  plugins: [vue()],
  publicDir: false,
  define: {
    __MINI_APP__: 'true',
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist/mini-app/web',
    emptyOutDir: true,
    target: 'es2020',
    minify: !debug,
    sourcemap: debug ? 'inline' : false,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./src/main.js', import.meta.url)),
      name: 'AirplaneGame',
      formats: ['iife'],
      fileName: () => 'app.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (asset) => (asset.name?.endsWith('.css') ? 'app.css' : '[name][extname]'),
      },
    },
  },
})
