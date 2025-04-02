import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { io } from 'socket.io-client'

const app = createApp(App)

// 创建全局socket实例
const socket = io('http://localhost:3000')

// 将socket实例添加到全局属性
app.config.globalProperties.$socket = socket

app.use(createPinia())

app.mount('#app')
