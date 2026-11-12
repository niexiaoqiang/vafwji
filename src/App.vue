<template>
  <div :class="['app', { 'app--mini': isMiniApp }]">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">✈</span>
        <span class="brand-name">全民打飞机</span>
      </div>
      <nav class="crumb" aria-label="当前位置">
        <span class="crumb-item" :class="{ on: view === 'lobby' }">大厅</span>
        <template v-if="view !== 'lobby'">
          <span class="crumb-sep" aria-hidden="true">/</span>
          <span class="crumb-item on">{{ crumbText }}</span>
        </template>
      </nav>
      <div class="topbar-actions">
        <button type="button" class="btn btn-ghost btn-sm" @click="showSkins = true">🎨 <span class="hide-sm">皮肤</span></button>
        <button type="button" class="btn btn-ghost btn-sm" @click="showTutorial = true">教程</button>
      </div>
    </header>

    <div v-if="connectionLost && mode === 'online' && view !== 'lobby'" class="conn-banner" role="status">
      连接中断，正在重连…对局会保留约 45 秒
    </div>

    <main class="app-main">
      <LobbyView
        v-if="view === 'lobby'"
        :socket="netSocket"
        :defaultUsername="defaultUsername"
        :netNotice="netNotice"
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
        :level="aiLevel"
        @gameStart="onGameStart"
        @leave="backToLobby"
        @startAi="onStartAi"
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
    </main>

    <TutorialDialog
      v-if="showTutorial"
      :canStartAi="view === 'lobby'"
      @close="closeTutorial"
      @startAi="startTutorialAi"
      @openRules="showRules = true"
    />
    <RulesDialog v-if="showRules" @close="showRules = false" />
    <SkinPicker v-if="showSkins" @close="showSkins = false" />
  </div>
</template>

<script>
import { markRaw } from 'vue';
import { notify } from './ui/dialog.js';
import { initPlatform, connectRealtime, markRendered, isMiniApp, persistent, storage } from './platform.js';
import { createLocalSession } from './local/session.js';
import RoomView from './components/RoomView.vue';
import GameView from './components/GameView.vue';
import LobbyView from './components/LobbyView.vue';
import RulesDialog from './components/RulesDialog.vue';
import TutorialDialog from './components/TutorialDialog.vue';
import SkinPicker from './components/SkinPicker.vue';
import { loadSavedSkin } from './skins/index.js';
import { LEVELS } from './local/ai.js';

const TUTORIAL_KEY = 'tutorial-seen';

export default {
  name: 'App',
  components: { RoomView, GameView, LobbyView, RulesDialog, TutorialDialog, SkinPicker },
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
      showTutorial: false,
      showSkins: false,
    };
  },
  computed: {
    activeSocket() {
      return this.mode === 'ai' ? this.localSocket : this.netSocket;
    },
    crumbText() {
      if (this.mode === 'ai') return `人机对战 · ${LEVELS[this.aiLevel]?.label || ''}`;
      if (this.view === 'game') {
        const opponent = this.gameData?.players?.find((p) => p.id !== this.netSocket?.id);
        return opponent ? `对战 ${opponent.username}` : '对战中';
      }
      return `房间 ${this.roomId}`;
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
        // 平台就绪后才能读取社区存储里的皮肤选择和教程记录
        loadSavedSkin();
        this.maybeShowTutorial();
        this.netSocket = markRaw(connectRealtime());
      } catch (error) {
        console.error('联机初始化失败:', error);
        loadSavedSkin();
        this.maybeShowTutorial();
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
      this.netSocket.on('matchCancelled', (data) => {
        if (this.mode === 'online' && (!this.roomId || this.roomId === data.roomId)) {
          notify(data.message);
          this.backToLobby();
        }
      });
      this.netSocket.on('reconnect', () => {
        this.connectionLost = false;
        if (this.mode === 'online' && this.view !== 'lobby') notify('已重新连接');
        if (this.pendingLeave) {
          this.pendingLeave = false;
          this.netSocket.emit('leaveRoom', {});
          return;
        }
        this.restoreSession();
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
    // 第一次进入游戏时自动打开教程，看完或跳过后不再自动弹出
    async maybeShowTutorial() {
      try {
        if (!(await persistent.get(TUTORIAL_KEY)) && this.view === 'lobby') this.showTutorial = true;
      } catch {
        // 读不到记录就不打扰玩家
      }
    },
    closeTutorial() {
      this.showTutorial = false;
      persistent.set(TUTORIAL_KEY, '1').catch(() => {});
    },
    startTutorialAi() {
      this.closeTutorial();
      const username = storage.getItem('username') || this.defaultUsername || `飞行员 ${Math.floor(1000 + Math.random() * 9000)}`;
      this.onStartAi({ username, level: 'easy' });
    },
    restoreSession() {
      this.netSocket.emit('syncRoom', {}, (res) => {
        if (this.mode !== 'online') return;
        if (!res?.success) {
          if (this.view === 'room' && !res?.code) this.backToLobby();
          return;
        }
        const me = res.state.players.find((p) => p.id === this.netSocket.id);
        this.roomId = res.roomId;
        this.username = me?.username || this.username;
        // 同一页面重连由事件补发恢复；刷新后的大厅需要完整快照。
        if (this.view !== 'lobby') return;
        if (res.game && (res.state.phase !== 'waiting' || res.game.result)) {
          this.onGameStart(res.game);
        } else {
          this.openRoom(res.roomId, this.username, { ...res.state, ownPlanes: res.ownPlanes });
        }
      });
    },
    onEnterRoom({ roomId, username, state }) {
      this.mode = 'online';
      this.openRoom(roomId, username, state);
    },
    onStartAi({ username, level }) {
      // 从联机房间（断网时）直接改玩人机，同样要在重连后补发离开
      if (this.mode === 'online' && this.roomId && !this.netSocket?.connected) this.pendingLeave = true;
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
      // 联机时断网回到大厅：服务端还不知道我们离开了，重连后补发离开，而不是把人拉回旧房间
      if (this.mode === 'online' && this.roomId && !this.netSocket?.connected) this.pendingLeave = true;
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

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app--mini {
  /* 微应用容器按内容高度自适应 */
  min-height: auto;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px clamp(14px, 3vw, 32px);
  border-bottom: 1px solid var(--sk-line);
  background: color-mix(in srgb, var(--sk-surface) 82%, transparent);
  backdrop-filter: blur(10px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--sk-accent);
  color: var(--sk-accent-ink);
  font-size: 18px;
  box-shadow: var(--sk-glow);
}

.brand-name {
  font-family: var(--sk-font-title);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 1px;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--sk-text-dim);
}

.crumb-item {
  padding: 4px 10px;
  border-radius: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crumb-item.on {
  background: var(--sk-surface-2);
  color: var(--sk-text);
}

.crumb-sep {
  opacity: 0.5;
}

.topbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.conn-banner {
  position: sticky;
  top: 58px;
  z-index: 40;
  margin: 10px auto 0;
  padding: 8px 14px;
  border: 1px solid color-mix(in srgb, var(--sk-warning) 50%, transparent);
  border-radius: var(--sk-radius-sm);
  background: color-mix(in srgb, var(--sk-warning) 16%, var(--sk-surface));
  color: var(--sk-text);
  font-size: 13px;
  text-align: center;
}

.app-main {
  flex: 1;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px clamp(12px, 3vw, 32px) 32px;
}

@media (max-width: 760px) {
  .topbar {
    gap: 10px;
    padding: 10px 12px;
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    font-size: 15px;
  }

  .brand-name {
    font-size: 17px;
  }

  .crumb .crumb-item:first-child,
  .crumb-sep,
  .hide-sm {
    display: none;
  }

  .app-main {
    padding: 12px 12px 20px;
  }
}
</style>
