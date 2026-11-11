<template>
  <div :class="['app', { 'app--mini': isMiniApp }]">
    <div class="app-header">
      <h1>炸飞机</h1>
      <button type="button" class="rules-btn" @click="showRules = true">规则</button>
    </div>

    <div v-if="connectionLost && mode === 'online' && view !== 'lobby'" class="conn-banner" role="status">
      连接中断，正在重连…对局会保留约 45 秒
    </div>

    <div class="app-content">
      <LobbyView
        v-if="view === 'lobby'"
        :socket="netSocket"
        :defaultUsername="defaultUsername"
        @enter="onEnterRoom"
        @startAi="onStartAi"
      />
      <RoomView
        v-else-if="view === 'room'"
        :key="'room-' + viewKey"
        :socket="activeSocket"
        :roomId="roomId"
        :username="username"
        :initialState="roomState"
        :mode="mode"
        @gameStart="onGameStart"
        @leave="backToLobby"
      />
      <GameView
        v-else-if="view === 'game'"
        :key="'game-' + viewKey"
        :socket="activeSocket"
        :gameData="gameData"
        :roomId="roomId"
        :username="username"
        :mode="mode"
        :level="aiLevel"
        @returnToRoom="onReturnToRoom"
        @endGame="backToLobby"
      />
      <p v-if="view === 'lobby' && netNotice" class="net-notice">{{ netNotice }}</p>
    </div>

    <div class="app-footer">
      <p>炸飞机 · 联机或人机对战</p>
    </div>

    <RulesDialog v-if="showRules" @close="showRules = false" />
  </div>
</template>

<script>
import { markRaw } from 'vue';
import { notify } from './ui/dialog.js';
import { initPlatform, connectRealtime, markRendered, isMiniApp } from './platform.js';
import { createLocalSession } from './local/session.js';
import RoomView from './components/RoomView.vue';
import GameView from './components/GameView.vue';
import LobbyView from './components/LobbyView.vue';
import RulesDialog from './components/RulesDialog.vue';

export default {
  name: 'App',
  components: { RoomView, GameView, LobbyView, RulesDialog },
  data() {
    return {
      isMiniApp,
      view: 'lobby', // lobby | room | game
      viewKey: 0,
      mode: 'online', // online | ai
      aiLevel: 'normal',
      netSocket: null,
      localSocket: null,
      username: '',
      roomId: '',
      roomState: null,
      gameData: null,
      defaultUsername: '',
      connectionLost: false,
      netNotice: '',
      showRules: false,
    };
  },
  computed: {
    activeSocket() {
      return this.mode === 'ai' ? this.localSocket : this.netSocket;
    },
  },
  created() {
    this.initNetwork();
  },
  mounted() {
    // 首屏（大厅）已渲染，通知微应用容器；人机对战不依赖网络，大厅可以立即使用
    markRendered();
  },
  beforeUnmount() {
    this.netSocket?.disconnect();
    this.localSession?.close();
  },
  methods: {
    async initNetwork() {
      try {
        const { user } = await initPlatform();
        if (user) this.defaultUsername = user.name || user.username || '';
        this.netSocket = markRaw(connectRealtime());
      } catch (error) {
        console.error('联机初始化失败:', error);
        this.netNotice = `暂时无法联机（${error?.message || error}），可以先玩人机对战`;
        return;
      }
      // 免费云实例休眠后首次连接需要唤醒（约 1 分钟）
      const slowTimer = setTimeout(() => {
        if (!this.netSocket?.connected) this.netNotice = '游戏服务器正在唤醒，首次连接最长约需 1 分钟；可以先玩人机对战';
      }, 5000);
      this.netSocket.on('connect', () => {
        clearTimeout(slowTimer);
        this.netNotice = '';
        this.connectionLost = false;
      });
      this.netSocket.on('disconnect', () => {
        this.connectionLost = true;
      });
      this.netSocket.on('reconnect', () => {
        this.connectionLost = false;
        if (this.mode === 'online' && this.view !== 'lobby') notify('已重新连接');
      });
      // 重连成功但原会话已过期：服务器已判定离开，回到大厅
      this.netSocket.on('session_lost', () => {
        this.connectionLost = false;
        if (this.mode === 'online' && this.view !== 'lobby') {
          notify('断线时间过长，已离开房间');
          this.backToLobby();
        }
      });
    },
    onEnterRoom({ roomId, username, state }) {
      this.mode = 'online';
      this.openRoom(roomId, username, state);
    },
    onStartAi({ username, level }) {
      this.localSession?.close();
      this.localSession = createLocalSession({ level });
      this.localSocket = markRaw(this.localSession.socket);
      this.mode = 'ai';
      this.aiLevel = level;
      this.localSocket.emit('createRoom', { username }, (res) => {
        if (!res?.success) {
          notify(res?.message || '无法开始人机对战');
          this.backToLobby();
          return;
        }
        this.openRoom(res.roomId, username, res.state);
      });
    },
    openRoom(roomId, username, state) {
      this.roomId = roomId;
      this.username = username;
      this.roomState = state || null;
      this.viewKey += 1;
      this.view = 'room';
    },
    onGameStart(data) {
      this.gameData = data;
      this.viewKey += 1;
      this.view = 'game';
    },
    onReturnToRoom({ roomId, state } = {}) {
      this.openRoom(roomId || this.roomId, this.username, state);
    },
    backToLobby() {
      if (this.mode === 'ai') {
        this.localSession?.close();
        this.localSession = null;
        this.localSocket = null;
        this.mode = 'online';
      }
      this.view = 'lobby';
      this.roomId = '';
      this.roomState = null;
      this.gameData = null;
    },
  },
};
</script>

<style>
/* 不再加载外部字体：微应用不允许远程样式/字体 URL，使用系统字体栈 */

:root {
  --primary-color: #3498db;
  --secondary-color: #2ecc71;
  --danger-color: #e74c3c;
  --warning-color: #f39c12;
  --background-color: #f5f7fa;
  --text-color: #2c3e50;
  --border-color: #dfe6e9;
  --plane-color-1: #3498db;
  --plane-color-2: #2ecc71;
  --plane-color-3: #e74c3c;
  --hit-color: #e74c3c;
  --miss-color: #7f8c8d;
  --sink-color: #000000;
  --mark-color: #f39c12;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background-color: var(--background-color);
  color: var(--text-color);
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  padding: 20px;
}

.app.app--mini {
  /* 微应用容器按内容高度自适应，避免 100vh 与内边距叠加造成循环增高 */
  min-height: auto;
}

.loading-error {
  color: var(--danger-color);
}

.app-header {
  position: relative;
  text-align: center;
  margin-bottom: 24px;
  color: var(--primary-color);
  font-size: 2.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.rules-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  padding: 6px 14px;
  font-size: 0.9rem;
  background: #fff;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
  box-shadow: none;
  text-shadow: none;
}

.rules-btn:hover {
  transform: translateY(-50%);
  background: #eef6fc;
}

.net-notice {
  max-width: 560px;
  margin: 12px auto 0;
  color: #b9770e;
  font-size: 0.9rem;
  text-align: center;
}

.conn-banner {
  position: sticky;
  top: 0;
  z-index: 1500;
  margin: 0 auto 12px;
  max-width: 560px;
  padding: 8px 14px;
  border-radius: 8px;
  background: #fff4e5;
  color: #8a4b00;
  border: 1px solid #f5c27a;
  text-align: center;
  font-size: 14px;
}

.app-content {
  flex: 1;
}

.app-footer {
  text-align: center;
  padding: 10px;
  background-color: var(--primary-color);
  color: white;
}

button {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

button:hover {
  background-color: #2980b9;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

button:active {
  transform: translateY(0);
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.1);
}

button.secondary {
  background-color: var(--secondary-color);
}

button.secondary:hover {
  background-color: #27ae60;
}

button.danger {
  background-color: var(--danger-color);
}

button.danger:hover {
  background-color: #c0392b;
}

input {
  padding: 10px 15px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  font-size: 16px;
  width: 100%;
  transition: border-color 0.3s ease;
}

input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.card {
  background-color: white;
  border-radius: 10px;
  padding: 30px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
}

.btn-group {
  display: flex;
  gap: 10px;
}

@media (max-width: 768px) {
  .app {
    padding: 12px;
  }

  .app-header {
    font-size: 1.6rem;
    margin-bottom: 12px;
  }

  .card {
    padding: 16px;
  }
}
</style>
