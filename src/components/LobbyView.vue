<template>
  <div class="lobby">
    <div class="greeting">
      <label class="name-field">
        <span class="muted">昵称</span>
        <input v-model.trim="username" class="input name-input" maxlength="20" placeholder="输入你的昵称" />
      </label>
      <span class="muted greeting-tip">对局中会显示给对手</span>
    </div>

    <div class="modes">
      <!-- 人机对战 -->
      <section class="card hero hero-ai">
        <div class="hero-text">
          <h2>快速开始</h2>
          <p class="muted">和电脑对战，不用等人，随时练手</p>
        </div>
        <div class="seg level-seg" role="group" aria-label="难度">
          <button
            v-for="(info, level) in levels"
            :key="level"
            type="button"
            :class="{ on: aiLevel === level }"
            @click="aiLevel = level"
          >{{ info.label }}<small>{{ levelHints[level] }}</small></button>
        </div>
        <button type="button" class="btn btn-primary btn-lg btn-block start-ai" :disabled="!username" @click="startAi">▶ 开始人机对战</button>
      </section>

      <!-- 联机对战 -->
      <section class="card hero hero-online">
        <div class="hero-text">
          <h2>好友对战</h2>
          <p class="muted">建个房间，把房间号发给朋友</p>
        </div>
        <p v-if="!connected" class="net-state">{{ netNotice || '正在连接游戏服务器…' }}</p>
        <div class="row create-row">
          <input v-model.trim="createId" class="input" maxlength="12" placeholder="自定义房间号（可选）" @keyup.enter="createRoom" />
          <button type="button" class="btn btn-primary" :disabled="!canOnline" @click="createRoom">创建房间</button>
        </div>
        <div class="row">
          <input v-model.trim="joinId" class="input" maxlength="12" placeholder="输入好友的房间号" @keyup.enter="joinRoom()" />
          <button type="button" class="btn" :disabled="!canOnline || !joinId" @click="joinRoom()">加入</button>
        </div>

        <div class="rooms">
          <div class="rooms-head">
            <span class="muted">等待对手的房间</span>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="!connected" @click="refreshRooms">刷新</button>
          </div>
          <p v-if="rooms.length === 0" class="muted empty">暂时没有，创建一个等朋友来吧</p>
          <ul v-else>
            <li v-for="room in rooms" :key="room.id">
              <b class="room-id">{{ room.id }}</b>
              <span class="chip chip-success">{{ room.players }}/2 等待中</span>
              <button type="button" class="btn btn-sm" :disabled="!canOnline" @click="joinRoom(room.id)">加入房间</button>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <section class="stats" aria-label="我的战绩">
      <div class="card stat"><b>{{ stats.online.win }}</b><span>联机胜</span></div>
      <div class="card stat"><b>{{ stats.online.lose }}</b><span>联机负</span></div>
      <div class="card stat"><b>{{ aiWins }}</b><span>人机胜</span></div>
      <div class="card stat"><b>{{ hitRate }}</b><span>命中率</span></div>
      <div class="card stat"><b>{{ stats.best || '—' }}</b><span>最少攻击获胜</span></div>
    </section>
  </div>
</template>

<script>
import { notify } from '../ui/dialog.js';
import { storage } from '../platform.js';
import { loadStats } from '../stats.js';
import { LEVELS } from '../local/ai.js';

export default {
  name: 'LobbyView',
  props: {
    socket: { type: Object, default: null },
    defaultUsername: { type: String, default: '' },
    netNotice: { type: String, default: '' },
  },
  emits: ['enter', 'startAi'],
  data() {
    return {
      // 没填过昵称时自动生成一个，玩家想改再改
      username: storage.getItem('username') || this.defaultUsername || `飞行员 ${Math.floor(1000 + Math.random() * 9000)}`,
      levelHints: { easy: '适合新手', normal: '会顺着命中追击', hard: '概率推理' },
      createId: '',
      joinId: '',
      rooms: [],
      connected: !!this.socket?.connected,
      busy: false,
      aiLevel: storage.getItem('aiLevel') || 'normal',
      levels: LEVELS,
      stats: { online: { win: 0, lose: 0 }, ai: {}, shots: 0, hits: 0, best: null },
    };
  },
  computed: {
    canOnline() {
      return this.connected && !!this.username && !this.busy;
    },
    aiWins() {
      return Object.values(this.stats.ai).reduce((sum, b) => sum + (b.win || 0), 0);
    },
    hitRate() {
      return this.stats.shots ? `${Math.round((this.stats.hits / this.stats.shots) * 100)}%` : '—';
    },
  },
  watch: {
    username(value) {
      storage.setItem('username', value);
    },
    aiLevel(value) {
      storage.setItem('aiLevel', value);
    },
    defaultUsername(value) {
      // 社区昵称优先于自动生成的昵称
      if (value && (!this.username || !storage.getItem('username'))) this.username = value;
    },
    // 联机连接在平台初始化后才创建，大厅可能先于它挂载
    socket(next, previous) {
      this.detach(previous);
      this.attach(next);
    },
  },
  async mounted() {
    this.listeners = {
      connect: () => this.onConnected(),
      reconnect: () => this.onConnected(),
      disconnect: () => {
        this.connected = false;
      },
      roomsList: (list) => {
        this.rooms = Array.isArray(list) ? list : [];
      },
    };
    this.attach(this.socket);
    this.stats = await loadStats();
  },
  beforeUnmount() {
    this.detach(this.socket);
  },
  methods: {
    attach(socket) {
      if (!socket) return;
      for (const [event, handler] of Object.entries(this.listeners)) socket.on(event, handler);
      if (socket.connected) this.onConnected();
    },
    detach(socket) {
      if (!socket) return;
      for (const [event, handler] of Object.entries(this.listeners || {})) socket.off(event, handler);
    },
    onConnected() {
      this.connected = true;
      this.refreshRooms();
    },
    refreshRooms() {
      this.socket?.emit('listRooms', {});
    },
    startAi() {
      if (!this.username) return;
      this.$emit('startAi', { username: this.username, level: this.aiLevel });
    },
    createRoom() {
      if (!this.canOnline) return;
      this.busy = true;
      this.socket.emit('createRoom', { username: this.username, roomId: this.createId }, (res) => {
        this.busy = false;
        if (!res?.success) {
          notify(res?.message || '创建房间失败');
          return;
        }
        if (res.renamed) notify(`房间号 ${this.createId.toUpperCase()} 已被占用，已为你分配 ${res.roomId}`);
        this.$emit('enter', { roomId: res.roomId, username: this.username, state: res.state });
      });
    },
    joinRoom(roomId = this.joinId) {
      if (!this.canOnline || !roomId) return;
      this.busy = true;
      this.socket.emit('joinRoom', { username: this.username, roomId }, (res) => {
        this.busy = false;
        if (!res?.success) {
          notify(res?.message || '加入房间失败');
          this.refreshRooms();
          return;
        }
        this.$emit('enter', { roomId: res.roomId, username: this.username, state: res.state });
      });
    },
  },
};
</script>

<style scoped>
.lobby {
  display: grid;
  gap: 20px;
}

.greeting {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.name-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.name-input {
  width: 220px;
  font-weight: 700;
}

.modes {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 20px;
  align-items: stretch;
}

.hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  background: linear-gradient(140deg, var(--sk-surface-2), var(--sk-surface) 70%);
}

.hero > * {
  position: relative;
  z-index: 1;
}

.hero h2 {
  font-size: 26px;
  font-weight: 900;
}

/* 雷达特效：卡片右上角的雷达圈 */
html[data-fx-radar] .hero::after {
  content: '';
  position: absolute;
  right: -70px;
  top: -70px;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(circle, transparent 30%, color-mix(in srgb, var(--sk-accent) 24%, transparent) 31%, transparent 32.5%),
    radial-gradient(circle, transparent 52%, color-mix(in srgb, var(--sk-accent) 18%, transparent) 53%, transparent 54.5%),
    radial-gradient(circle, transparent 72%, color-mix(in srgb, var(--sk-accent) 14%, transparent) 73%, transparent 74.5%),
    conic-gradient(from 20deg, color-mix(in srgb, var(--sk-accent) 34%, transparent), transparent 22%);
}

/* 纸面特效：卡片角落的纸飞机 */
html[data-fx-paper] .hero::after {
  content: '✈';
  position: absolute;
  right: 22px;
  top: 6px;
  font-size: 96px;
  color: color-mix(in srgb, var(--sk-accent) 13%, transparent);
  transform: rotate(-20deg);
  pointer-events: none;
}

.start-ai {
  margin-top: auto;
}

.net-state {
  padding: 8px 12px;
  border-radius: var(--sk-radius-sm);
  background: color-mix(in srgb, var(--sk-warning) 14%, transparent);
  color: var(--sk-warning);
  font-size: 13px;
}

.row {
  display: flex;
  gap: 10px;
}

.row .input {
  flex: 1;
  min-width: 0;
}

.rooms {
  display: grid;
  gap: 8px;
}

.rooms-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rooms ul {
  list-style: none;
  display: grid;
  gap: 8px;
}

.rooms li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 8px 14px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
}

.rooms li .btn {
  margin-left: auto;
}

.room-id {
  letter-spacing: 2px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.empty {
  padding: 6px 0;
}

.stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

.stat {
  display: grid;
  gap: 2px;
  padding: 14px 18px;
}

.stat b {
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.stat span {
  color: var(--sk-text-dim);
  font-size: 12px;
}

@media (max-width: 900px) {
  .modes {
    grid-template-columns: 1fr;
  }

  .stats {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 760px) {
  .lobby {
    gap: 12px;
  }

  .greeting-tip {
    display: none;
  }

  .name-field {
    width: 100%;
  }

  .name-input {
    flex: 1;
    width: auto;
  }

  .hero {
    padding: 18px;
    gap: 12px;
  }

  .hero h2 {
    font-size: 21px;
  }

  .stats {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .stat {
    padding: 10px 12px;
  }

  .stat b {
    font-size: 18px;
  }
}
</style>
