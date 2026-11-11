<template>
  <div class="lobby">
    <section class="card">
      <label class="field">
        <span>昵称</span>
        <input v-model.trim="username" maxlength="20" placeholder="输入你的昵称" />
      </label>
    </section>

    <section class="card">
      <h2>人机对战</h2>
      <p class="hint">和电脑练练手，不需要联网等人</p>
      <div class="segmented" role="group" aria-label="难度">
        <button
          v-for="(info, level) in levels"
          :key="level"
          type="button"
          :class="{ active: aiLevel === level }"
          @click="aiLevel = level"
        >{{ info.label }}</button>
      </div>
      <button type="button" class="btn-primary wide" :disabled="!username" @click="startAi">开始人机对战</button>
    </section>

    <section class="card">
      <h2>联机对战</h2>
      <p v-if="!connected" class="hint warn">正在连接游戏服务器…</p>
      <div class="row">
        <input v-model.trim="createId" maxlength="12" placeholder="自定义房间号（可选）" @keyup.enter="createRoom" />
        <button type="button" class="btn-primary" :disabled="!canOnline" @click="createRoom">创建房间</button>
      </div>
      <div class="row">
        <input v-model.trim="joinId" maxlength="12" placeholder="输入好友的房间号" @keyup.enter="joinRoom()" />
        <button type="button" class="btn-primary" :disabled="!canOnline || !joinId" @click="joinRoom()">加入</button>
      </div>

      <div class="rooms">
        <div class="rooms-head">
          <h3>等待对手的房间</h3>
          <button type="button" class="btn-link" :disabled="!connected" @click="refreshRooms">刷新</button>
        </div>
        <p v-if="rooms.length === 0" class="hint">暂时没有，创建一个等朋友来吧</p>
        <ul v-else>
          <li v-for="room in rooms" :key="room.id">
            <span class="room-id">{{ room.id }}</span>
            <span class="hint">{{ room.players }}/2</span>
            <button type="button" class="btn-secondary" :disabled="!canOnline" @click="joinRoom(room.id)">加入</button>
          </li>
        </ul>
      </div>
    </section>

    <section class="card stats">
      <h2>我的战绩</h2>
      <div class="stat-grid">
        <div><b>{{ stats.online.win }}</b><span>联机胜</span></div>
        <div><b>{{ stats.online.lose }}</b><span>联机负</span></div>
        <div><b>{{ aiWins }}</b><span>人机胜</span></div>
        <div><b>{{ hitRate }}</b><span>命中率</span></div>
      </div>
      <p v-if="stats.best" class="hint">最少攻击获胜：{{ stats.best }} 次攻击</p>
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
  },
  emits: ['enter', 'startAi'],
  data() {
    return {
      username: storage.getItem('username') || this.defaultUsername || '',
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
      if (!this.username && value) this.username = value;
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
  gap: 14px;
  max-width: 560px;
  margin: 0 auto;
}

.card {
  margin-bottom: 0;
  padding: 18px;
}

h2 {
  font-size: 1.15rem;
  margin-bottom: 4px;
}

h3 {
  font-size: 0.95rem;
}

.hint {
  color: #7f8c8d;
  font-size: 0.85rem;
  margin-bottom: 10px;
}

.hint.warn {
  color: #b9770e;
}

.field {
  display: grid;
  gap: 6px;
  font-weight: 600;
}

.row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.row input {
  flex: 1;
  min-width: 0;
}

.row button {
  flex-shrink: 0;
}

.wide {
  width: 100%;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.segmented button {
  border-radius: 0;
  background: #fff;
  color: var(--text-color);
  box-shadow: none;
}

.segmented button:hover {
  transform: none;
  background: #f2f4f7;
}

.segmented button.active {
  background: var(--primary-color);
  color: #fff;
}

.rooms {
  margin-top: 6px;
  border-top: 1px solid #eef1f4;
  padding-top: 10px;
}

.rooms-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.btn-link {
  padding: 4px 10px;
  font-size: 0.85rem;
  background: transparent;
  color: var(--primary-color);
  box-shadow: none;
}

.btn-link:hover {
  transform: none;
  background: #eef6fc;
}

.rooms ul {
  list-style: none;
  display: grid;
  gap: 6px;
}

.rooms li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--background-color);
  border-radius: 8px;
}

.rooms li .hint {
  margin: 0 auto 0 0;
}

.room-id {
  font-weight: 700;
  letter-spacing: 1px;
}

.btn-secondary {
  background: #ecf0f1;
  color: var(--text-color);
  padding: 6px 14px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 10px 0 6px;
  text-align: center;
}

.stat-grid div {
  display: grid;
  gap: 2px;
  padding: 8px 0;
  background: var(--background-color);
  border-radius: 8px;
}

.stat-grid b {
  font-size: 1.2rem;
}

.stat-grid span {
  font-size: 0.78rem;
  color: #7f8c8d;
}
</style>
