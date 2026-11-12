<template>
  <div class="room-view">
    <section class="card board-card">
      <div class="board-head">
        <h2>布置你的飞机</h2>
        <p class="muted">
          {{ isReady ? '已提交布局，取消准备后才能再调整' : '拖动飞机调整位置；点一下选中后可以旋转（电脑上也可右键旋转）' }}
        </p>
      </div>
      <div class="board">
        <div class="board-col-labels"><span v-for="col in columns" :key="'col-' + col">{{ col }}</span></div>
        <div class="board-row-labels"><span v-for="i in 10" :key="'row-' + i">{{ i }}</span></div>
        <div class="board-grid" :class="{ locked: isReady }">
          <div v-for="row in 10" :key="'r' + row" class="board-row">
            <div
              v-for="col in columns"
              :key="'c' + col"
              class="board-cell"
              :class="getCellClass(row, col)"
              :data-row="row"
              :data-col="col"
              @contextmenu.prevent="handleRightClick(row, col)"
              @pointerdown="handleCellPointerDown($event, row, col)"
            ></div>
          </div>
        </div>
      </div>
      <p class="muted board-foot">三种颜色代表三架飞机，带圆点的格子是机头</p>
    </section>

    <aside class="side">
      <section class="card room-card">
        <div v-if="isPublic" class="match-status" :class="{ found: players.length >= 2 }">
          <div class="match-top">
            <span class="radar" aria-hidden="true"></span>
            <div class="match-text">
              <h2>{{ players.length < 2 ? '正在寻找对手' : '已找到对手，准备出发' }}</h2>
              <p class="match-clock" role="status">{{ players.length < 2 ? `已等待 ${clock(waitingSeconds)}` : `准备剩余 ${prepareSeconds} 秒` }}</p>
            </div>
          </div>
          <div class="match-actions">
            <button class="btn btn-cancel" :disabled="leaving" @click="leaveRoom"><span aria-hidden="true">✕</span>{{ leaving ? '取消中…' : '取消匹配' }}</button>
            <button v-if="players.length < 2 && waitingSeconds >= 20" class="btn" :disabled="leaving" @click="switchToAi"><span aria-hidden="true">🤖</span>改玩人机</button>
          </div>
          <p class="muted match-tip">{{ players.length < 2 ? '等待时可以先布置飞机，匹配成功后不用重新准备' : '双方准备后自动开局' }}</p>
        </div>
        <div class="room-head">
          <div v-if="!isAi">
            <span class="muted">{{ isPublic ? '公开房间' : '好友房间' }}</span>
            <b class="room-code">{{ roomId }}</b>
          </div>
          <div v-else>
            <span class="muted">人机对战</span>
            <b class="room-mode">{{ levelLabel }}难度</b>
          </div>
          <div class="room-head-actions">
            <button v-if="!isAi" type="button" class="btn btn-sm" @click="copyInvite">⧉ 复制邀请</button>
            <button v-if="!isPublic" type="button" class="btn btn-danger btn-sm leave-sm" :disabled="leaving" @click="leaveRoom">离开</button>
          </div>
        </div>
        <ul class="players">
          <li v-for="player in players" :key="player.id">
            <span class="avatar" :class="{ me: player.id === myId }">{{ (player.username || '?').slice(0, 1) }}</span>
            <span class="player-name">
              {{ player.username }}
              <span v-if="player.id === myId" class="muted">（我）</span>
              <span v-if="player.id === leaderId && !isAi" class="chip">房主</span>
            </span>
            <span v-if="player.offline" class="chip chip-warning">掉线中</span>
            <span v-else-if="player.ready" class="chip chip-success">✓ 已准备</span>
            <span v-else class="chip">布置中</span>
          </li>
          <li v-if="players.length < 2" class="waiting">
            <span class="avatar ghost">?</span>
            <span class="muted">{{ isPublic ? '正在等另一位飞行员加入…' : '等待好友加入…把房间号发给朋友吧' }}</span>
          </li>
        </ul>
      </section>

      <section class="card fleet-card">
        <h3 class="card-title">我的机队</h3>
        <ul class="fleet">
          <li v-for="(plane, index) in planes" :key="plane.id" :class="{ on: index === selectedPlaneIndex }">
            <i class="swatch" :class="'pi-' + index"></i>
            <span>{{ ['一', '二', '三'][index] }}号机</span>
            <span class="fleet-state">{{ index === selectedPlaneIndex ? '已选中' : '已放置' }}</span>
          </li>
          <li v-if="!planes.length" class="muted">还没有飞机，点「随机布置」生成一组</li>
        </ul>
        <p class="muted shortcuts">快捷键：<kbd>R</kbd> 旋转　<kbd>Space</kbd> 随机　<kbd>Enter</kbd> 准备</p>
      </section>

      <section class="card actions-card">
        <div class="setup-controls">
          <button class="btn" @click="generateRandomPlanes" :disabled="isReady">🎲 随机布置</button>
          <button class="btn" @click="rotateSelected" :disabled="isReady || selectedPlaneIndex === -1">⟳ 旋转所选</button>
          <button class="btn btn-ghost" @click="clearPlanes" :disabled="isReady">清除</button>
          <button v-if="!isReady" class="btn btn-primary main-action" @click="ready" :disabled="planes.length < 3 || preparing">{{ preparing ? '提交中…' : isAi ? '准备并开始' : '准备' }}</button>
          <button v-else-if="phase === 'waiting'" class="btn main-action" :disabled="preparing || starting" @click="unready">重新布置</button>
          <button v-if="!isAi && !isPublic && isLeader && canStartGame" class="btn btn-primary main-action" :disabled="starting" @click="startGame">开始游戏</button>
        </div>
        <p class="setup-tip" v-if="isReady">{{ readyTip }}</p>
        <!-- 手机上匹配卡片在页面顶部，取消按钮固定放在底部操作栏 -->
        <div v-if="isPublic" class="cancel-dock">
          <button type="button" class="btn btn-cancel" :disabled="leaving" @click="leaveRoom"><span aria-hidden="true">✕</span>{{ leaving ? '取消中…' : '取消匹配' }}</button>
          <button v-if="players.length < 2 && waitingSeconds >= 20" type="button" class="btn" :disabled="leaving" @click="switchToAi"><span aria-hidden="true">🤖</span>改玩人机</button>
        </div>
        <button v-if="!isPublic" type="button" class="btn btn-danger btn-sm leave" :disabled="leaving" @click="leaveRoom">离开房间</button>
      </section>
    </aside>
  </div>
</template>

<script>
import { notify } from '../ui/dialog.js';
import { copyText, storage } from '../platform.js';
import { buildPlane, randomPlanes, COLUMNS } from '../../shared/planes.js';
import { LEVELS } from '../local/ai.js';

const key = (row, col) => `${row},${col}`;
let planeSeq = 0;
const withId = (plane) => ({ ...plane, id: `p${++planeSeq}` });

export default {
  name: 'RoomView',
  props: {
    socket: { type: Object, required: true },
    roomId: { type: String, required: true },
    username: { type: String, required: true },
    initialState: { type: Object, default: null },
    mode: { type: String, default: 'online' },
    level: { type: String, default: 'normal' },
  },
  emits: ['gameStart', 'leave', 'startAi'],
  data() {
    return {
      columns: COLUMNS,
      players: this.initialState?.players || [],
      leaderId: this.initialState?.leaderId || null,
      phase: this.initialState?.phase || 'waiting',
      visibility: this.initialState?.visibility || 'private',
      waitingSince: this.initialState?.waitingSince || Date.now(),
      prepareDeadline: this.initialState?.prepareDeadline || 0,
      clockOffset: (this.initialState?.serverNow || Date.now()) - Date.now(),
      now: Date.now(),
      leaving: false,
      planes: (this.initialState?.ownPlanes?.length ? this.initialState.ownPlanes : randomPlanes()).map(withId),
      isReady: !!this.initialState?.players?.find((p) => p.id === this.socket.id)?.ready,
      preparing: false,
      starting: false,
      selectedPlaneIndex: -1,
      // 拖拽状态
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      cellSize: 40,
      ghostPlane: null,
      ghostPlaneValid: false,
      originalPlane: null,
    };
  },
  computed: {
    isPublic() { return !this.isAi && this.visibility === 'public'; },
    waitingSeconds() { return Math.max(0, Math.floor((this.now + this.clockOffset - this.waitingSince) / 1000)); },
    prepareSeconds() { return Math.max(0, Math.ceil((this.prepareDeadline - this.now - this.clockOffset) / 1000)); },
    isAi() {
      return this.mode === 'ai';
    },
    levelLabel() {
      return LEVELS[this.level]?.label || '';
    },
    myId() {
      return this.socket.id;
    },
    isLeader() {
      return this.leaderId === this.myId;
    },
    canStartGame() {
      return this.phase === 'waiting' && this.players.length === 2 && this.players.every((p) => p.ready);
    },
    readyTip() {
      if (this.players.length < 2) return '已准备，等待对手加入';
      if (!this.canStartGame) return '已准备，等待对手准备';
      if (this.isPublic) return '双方已准备，正在自动开局';
      return this.isLeader ? '双方都准备好了，点「开始游戏」' : '已准备，等待房主开始游戏';
    },
  },
  watch: {
    canStartGame(value) {
      if (value && this.isAi) this.startGame();
    },
  },
  mounted() {
    this.ticker = setInterval(() => { this.now = Date.now(); }, 1000);
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('keydown', this.onKeyDown);
    this.listeners = {
      roomState: (state) => this.applyState(state),
      gameStart: (data) => this.$emit('gameStart', data),
      gameError: (data) => this.onGameError(data),
      playerLeft: (data) => notify(`${data?.username || '对手'} 离开了房间`),
      rematchRequested: (data) => notify(`${data?.username || '对手'} 想再来一局`),
    };
    for (const [event, handler] of Object.entries(this.listeners)) this.socket.on(event, handler);
    // 进入房间后同步一次最新状态（防止错过事件）
    this.socket.emit('syncRoom', {});
  },
  beforeUnmount() {
    clearInterval(this.ticker);
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('keydown', this.onKeyDown);
    for (const [event, handler] of Object.entries(this.listeners || {})) this.socket.off(event, handler);
  },
  methods: {
    // 快捷键：R 旋转、空格随机、回车准备（输入框和弹窗里不响应）
    onKeyDown(event) {
      if (event.target.closest?.('input, textarea, [role="dialog"]') || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        if (this.selectedPlaneIndex === -1 && this.planes.length) this.selectedPlaneIndex = 0;
        this.rotateSelected();
      } else if (event.key === ' ' && !this.isReady) {
        if (event.target.closest?.('button')) return;
        event.preventDefault();
        this.generateRandomPlanes();
      } else if (event.key === 'Enter' && !this.isReady && !event.target.closest?.('button')) {
        event.preventDefault();
        this.ready();
      }
    },
    // ---------- 房间 ----------
    applyState(state) {
      if (!state || state.roomId !== this.roomId) return;
      this.players = state.players || [];
      this.leaderId = state.leaderId;
      this.phase = state.phase;
      this.visibility = state.visibility || 'private';
      this.waitingSince = state.waitingSince || this.waitingSince;
      this.prepareDeadline = state.prepareDeadline || 0;
      this.now = Date.now();
      this.clockOffset = (state.serverNow || this.now) - this.now;
      const me = this.players.find((p) => p.id === this.myId);
      // 服务端为准：重置后（比如对局结束回到房间）解除本地准备
      // 准备请求还在路上时不覆盖，避免棋盘被中途解锁、显示的布局和提交的不一致
      if (me && !this.preparing) this.isReady = !!me.ready;
    },
    onGameError(data) {
      if (data?.code === 'ATTACK_REJECTED') return;
      if (data?.code === 'INVALID_PLANES') this.isReady = false;
      notify(data?.message || '操作失败');
    },
    ready() {
      if (this.preparing) return;
      if (this.planes.length !== 3) {
        notify('请放置 3 架飞机');
        return;
      }
      this.preparing = true;
      this.isReady = true;
      this.selectedPlaneIndex = -1;
      const planes = this.planes.map((p) => ({ coordinates: p.coordinates.map(({ row, col }) => ({ row, col })) }));
      this.socket.emit('playerReady', { planes }, (res) => {
        this.preparing = false;
        this.isReady = !!res?.success;
        if (!res?.success) notify(res?.message || '准备失败，请重试');
      });
    },
    unready() {
      // 取消准备后才能调整布局，避免房主用旧布局开局
      this.socket.emit('playerUnready', {}, (res) => {
        if (res?.success) this.isReady = false;
        else notify(res?.message || '取消准备失败，请重试');
      });
    },
    startGame() {
      if (this.starting) return;
      this.starting = true;
      this.socket.emit('startGame', {}, (res) => {
        this.starting = false;
        if (!res?.success) notify(res?.message || '开始失败，请重试');
      });
    },
    leaveRoom() {
      this.exitWaiting(false);
    },
    switchToAi() {
      this.exitWaiting(true);
    },
    exitWaiting(toAi) {
      if (this.leaving) return;
      this.leaving = true;
      const event = this.isPublic ? 'cancelMatch' : 'leaveRoom';
      this.socket.emit(event, { roomId: this.roomId }, (res) => {
        this.leaving = false;
        // 断网或超时：先在本地离开，App 会在重连后补发离开请求
        const offline = ['DISCONNECTED', 'TIMEOUT', 'SEND_FAILED'].includes(res?.code);
        if (!res?.success && !offline) { notify(res?.message || '离开失败，请重试'); return; }
        if (toAi) this.$emit('startAi', { username: this.username, level: storage.getItem('aiLevel') || 'normal' });
        else this.$emit('leave');
      });
    },
    clock(seconds) {
      return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    },
    async copyInvite() {
      try {
        await copyText(`来全民打飞机对战吧！房间号：${this.roomId}`);
        notify('邀请已复制，发给朋友即可加入');
      } catch {
        notify(`房间号：${this.roomId}`);
      }
    },

    // ---------- 布置飞机 ----------
    createPlane(row, col, direction) {
      const plane = buildPlane(row, COLUMNS.indexOf(col), direction);
      return plane ? withId(plane) : null;
    },
    generateRandomPlanes() {
      if (this.isReady) return;
      this.planes = randomPlanes().map(withId);
      this.selectedPlaneIndex = -1;
      this.ghostPlane = null;
    },
    clearPlanes() {
      this.planes = [];
      this.selectedPlaneIndex = -1;
      this.ghostPlane = null;
    },
    isValidPlacement(plane, ignoreId = plane?.id) {
      if (!plane || plane.coordinates.length !== 10) return false;
      const inBounds = plane.coordinates.every((c) => c.row >= 1 && c.row <= 10 && COLUMNS.includes(c.col));
      if (!inBounds) return false;
      const occupied = new Set();
      for (const other of this.planes) {
        if (other.id === ignoreId) continue;
        other.coordinates.forEach((c) => occupied.add(key(c.row, c.col)));
      }
      return plane.coordinates.every((c) => !occupied.has(key(c.row, c.col)));
    },
    getPlaneAt(row, col) {
      return this.planes.find((p) => p.coordinates.some((c) => c.row === row && c.col === col)) || null;
    },
    getSelectedPlane() {
      return this.selectedPlaneIndex !== -1 ? this.planes[this.selectedPlaneIndex] : null;
    },
    handleCellPointerDown(event, row, col) {
      if (this.isReady) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const plane = this.getPlaneAt(row, col);
      if (!plane) {
        this.selectedPlaneIndex = -1;
        return;
      }
      // 按住飞机拖动时阻止页面滚动 / 文本选择
      event.preventDefault();
      this.cellSize = event.currentTarget.getBoundingClientRect().width || 40;
      this.selectedPlaneIndex = this.planes.findIndex((p) => p.id === plane.id);
      this.isDragging = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.originalPlane = JSON.parse(JSON.stringify(plane));
      this.ghostPlane = null;
      this.ghostPlaneValid = true;
    },
    onPointerMove(event) {
      if (!this.isDragging || !this.originalPlane) return;
      const deltaRow = Math.round((event.clientY - this.dragStartY) / this.cellSize);
      const deltaCol = Math.round((event.clientX - this.dragStartX) / this.cellSize);
      if (deltaRow === 0 && deltaCol === 0) {
        this.ghostPlane = null;
        return;
      }
      const moved = {
        ...this.originalPlane,
        coordinates: this.originalPlane.coordinates.map((c) => {
          const colIndex = COLUMNS.indexOf(c.col) + deltaCol;
          return { ...c, row: c.row + deltaRow, col: COLUMNS[colIndex] || null };
        }),
      };
      this.ghostPlaneValid = this.isValidPlacement(moved, this.originalPlane.id);
      // 虚影只显示棋盘内的格子
      this.ghostPlane = { ...moved, coordinates: moved.coordinates.filter((c) => c.col && c.row >= 1 && c.row <= 10) };
      this.ghostFull = moved;
    },
    onPointerUp() {
      if (!this.isDragging) return;
      if (this.ghostPlane && this.ghostPlaneValid) {
        const index = this.planes.findIndex((p) => p.id === this.originalPlane.id);
        if (index !== -1) this.planes.splice(index, 1, this.ghostFull);
      } else if (this.ghostPlane) {
        notify('这里放不下，飞机需要完整在棋盘内且不能重叠');
      }
      this.isDragging = false;
      this.ghostPlane = null;
      this.ghostFull = null;
      this.originalPlane = null;
    },
    rotateSelected() {
      const plane = this.getSelectedPlane();
      if (plane) this.rotatePlane(plane);
    },
    handleRightClick(row, col) {
      if (this.isReady) return;
      const plane = this.getPlaneAt(row, col);
      if (!plane) return;
      this.selectedPlaneIndex = this.planes.findIndex((p) => p.id === plane.id);
      this.rotatePlane(plane);
    },
    rotatePlane(plane) {
      if (!plane || this.isReady) return;
      const center = plane.coordinates.find((c) => c.part === 'wing-center');
      if (!center) return;
      // 依次尝试顺时针的三个方向，取第一个放得下的
      for (let step = 1; step <= 3; step++) {
        const rotated = this.createPlane(center.row, center.col, (plane.direction + step) % 4);
        if (rotated && this.isValidPlacement(rotated, plane.id)) {
          rotated.id = plane.id;
          const index = this.planes.findIndex((p) => p.id === plane.id);
          this.planes.splice(index, 1, rotated);
          return;
        }
      }
      notify('这里转不开，先把飞机拖到空一些的位置');
    },
    getCellClass(row, col) {
      const classes = { 'valid-cell': !this.isReady };
      const ghost = this.ghostPlane?.coordinates.find((c) => c.row === row && c.col === col);
      if (ghost) {
        classes['cell-ghost'] = true;
        classes['cell-head'] = ghost.isHead || ghost.part === 'head';
        classes[`pi-${this.planes.findIndex((p) => p.id === this.ghostPlane.id)}`] = true;
        classes[this.ghostPlaneValid ? 'ghost-valid' : 'ghost-invalid'] = true;
        return classes;
      }
      for (const plane of this.planes) {
        // 拖动中的飞机由虚影代替显示
        if (this.ghostPlane && plane.id === this.originalPlane?.id) continue;
        const cell = plane.coordinates.find((c) => c.row === row && c.col === col);
        if (cell) {
          classes['cell-plane'] = true;
          classes[`pi-${this.planes.indexOf(plane)}`] = true;
          classes['cell-head'] = cell.isHead || cell.part === 'head';
          classes['cell-selected'] = plane.id === this.getSelectedPlane()?.id;
          break;
        }
      }
      return classes;
    },
  },
};
</script>

<style scoped>
.room-view {
  display: grid;
  grid-template-columns: minmax(0, 600px) minmax(300px, 1fr);
  gap: 24px;
  align-items: start;
}

.board-head {
  margin-bottom: 14px;
}

.board-head h2 {
  font-size: 18px;
  font-weight: 800;
  margin-bottom: 2px;
}

/* 棋盘：坐标 + 10×10 格子，宽度随卡片缩放，始终是正方形 */
.board {
  display: grid;
  grid-template-columns: 20px 1fr;
  grid-template-rows: 20px auto;
}

.board-col-labels,
.board-row-labels {
  display: grid;
  color: var(--sk-text-dim);
  font-size: 11px;
  text-align: center;
}

.board-col-labels {
  grid-column: 2;
  grid-template-columns: repeat(10, 1fr);
  align-items: center;
}

.board-row-labels {
  grid-row: 2;
  grid-template-rows: repeat(10, 1fr);
  align-items: center;
}

.board-grid {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-template-rows: repeat(10, 1fr);
  aspect-ratio: 1;
  gap: var(--sk-grid-gap);
  padding: var(--sk-grid-gap);
  border-radius: calc(var(--sk-cell-radius) + 6px);
  background: var(--sk-mine-line);
}

html[data-fx-dashed-grid] .board-grid {
  border: 2px solid var(--sk-mine-line);
}

.board-row {
  display: contents;
}

.board-cell {
  min-width: 0;
  min-height: 0;
  position: relative;
  display: grid;
  place-items: center;
  border-radius: var(--sk-cell-radius);
  background: var(--sk-mine-cell);
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

html[data-fx-dashed-grid] .board-cell {
  border: 0.5px dashed var(--sk-mine-line);
}

/* 三架飞机三种颜色：机头用原色加圆点，机身调淡 */
.board-cell.pi-0 { --plane: var(--sk-plane-1); }
.board-cell.pi-1 { --plane: var(--sk-plane-2); }
.board-cell.pi-2 { --plane: var(--sk-plane-3); }

.board-cell.cell-plane {
  background: color-mix(in srgb, var(--plane) 58%, var(--sk-mine-cell));
  touch-action: none;
  cursor: grab;
}

.board-cell.cell-plane.cell-head {
  background: var(--plane);
}

.board-cell.cell-head::before {
  content: '';
  width: 34%;
  height: 34%;
  border-radius: 50%;
  background: var(--sk-head-dot);
}

.board-cell.cell-selected {
  outline: 2px solid var(--sk-text);
  outline-offset: -2px;
}

.board-cell.cell-ghost {
  touch-action: none;
}

.board-cell.ghost-valid {
  background: color-mix(in srgb, var(--plane, var(--sk-accent)) 32%, var(--sk-mine-cell));
  outline: 2px dashed var(--plane, var(--sk-accent));
  outline-offset: -2px;
}

.board-cell.ghost-invalid {
  background: color-mix(in srgb, var(--sk-danger) 32%, var(--sk-mine-cell));
  outline: 2px dashed var(--sk-danger);
  outline-offset: -2px;
}

.board-grid.locked .board-cell {
  cursor: default;
}

.board-foot {
  margin-top: 12px;
  text-align: center;
}

/* ---------- 侧栏 ---------- */
.side {
  display: grid;
  gap: 16px;
}

/* 匹配中卡片：雷达动画 + 计时 + 醒目的取消按钮 */
.match-status {
  margin: -6px -6px 16px;
  padding: 16px;
  border: 1.5px solid color-mix(in srgb, var(--sk-accent) 55%, transparent);
  border-radius: var(--sk-radius-sm);
  background: linear-gradient(150deg, color-mix(in srgb, var(--sk-accent) 14%, var(--sk-surface)), var(--sk-surface) 75%);
}

.match-top { display: flex; align-items: center; gap: 14px; }
.match-text { min-width: 0; }
.match-status h2 { font-size: 17px; font-weight: 800; }
.match-clock { margin-top: 2px; color: var(--sk-accent); font-size: 20px; font-weight: 900; font-variant-numeric: tabular-nums; }

.radar {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--sk-accent) 45%, transparent);
  background: radial-gradient(circle, transparent 36%, color-mix(in srgb, var(--sk-accent) 22%, transparent) 37%, transparent 41%);
}

.radar::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, color-mix(in srgb, var(--sk-accent) 50%, transparent), transparent 30%);
  animation: radar-spin 1.8s linear infinite;
}

.radar::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px;
  border-radius: 50%;
  background: var(--sk-accent);
}

/* 找到对手后雷达停转 */
.match-status.found .radar::after { animation: none; opacity: 0.35; }

@keyframes radar-spin { to { transform: rotate(360deg); } }

.match-actions { display: flex; gap: 8px; margin-top: 14px; }
.match-actions .btn { flex: 1; min-height: 42px; }
.match-tip { margin-top: 10px; }

.btn-cancel {
  background: transparent;
  border: 1.5px solid color-mix(in srgb, var(--sk-danger) 70%, transparent);
  color: var(--sk-danger);
}

@media (hover: hover) {
  .btn-cancel:hover:not(:disabled) { background: color-mix(in srgb, var(--sk-danger) 12%, transparent); }
}

.cancel-dock { display: none; }

.room-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.room-head > div:first-child {
  display: grid;
}

.room-head-actions {
  display: flex;
  gap: 8px;
}

.leave-sm {
  display: none;
}

.room-code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 26px;
  letter-spacing: 4px;
}

.room-mode {
  font-size: 20px;
}

.players {
  list-style: none;
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.players li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
}

.player-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-wrap: anywhere;
}

.avatar {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--sk-plane-3), var(--sk-danger));
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.avatar.me {
  background: linear-gradient(135deg, var(--sk-accent-2), var(--sk-accent));
}

.avatar.ghost {
  background: transparent;
  border: 1.5px dashed var(--sk-text-dim);
  color: var(--sk-text-dim);
}

.fleet {
  list-style: none;
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.fleet li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
}

.fleet li.on {
  border-color: var(--sk-accent);
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

.swatch.pi-0 { background: var(--sk-plane-1); }
.swatch.pi-1 { background: var(--sk-plane-2); }
.swatch.pi-2 { background: var(--sk-plane-3); }

.fleet-state {
  margin-left: auto;
  font-size: 12px;
  color: var(--sk-success);
}

.fleet li.on .fleet-state {
  color: var(--sk-accent);
}

.shortcuts {
  margin-top: 12px;
}

kbd {
  padding: 1px 6px;
  border: 1px solid var(--sk-line);
  border-radius: 5px;
  color: var(--sk-text);
  font-family: inherit;
  font-size: 11px;
}

.setup-controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.setup-controls .main-action {
  grid-column: 1 / -1;
  min-height: 46px;
  font-size: 15px;
}

.setup-tip {
  margin-top: 10px;
  color: var(--sk-success);
  text-align: center;
  font-weight: 600;
}

.leave {
  margin-top: 12px;
  width: 100%;
}

@media (max-width: 900px) {
  /* 手机：顶部卡片只显示状态，取消按钮放进吸底操作栏 */
  .match-status { margin: -2px -2px 10px; padding: 10px 12px; }
  .match-status .match-actions,
  .match-status .match-tip { display: none; }
  .radar { width: 34px; height: 34px; }
  .match-status h2 { font-size: 15px; }
  .match-clock { font-size: 15px; }
  .cancel-dock { display: flex; gap: 6px; margin-top: 8px; }
  .cancel-dock .btn { flex: 1; min-height: 40px; }

  .room-view {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .side {
    gap: 12px;
  }

  /* 手机上：房间信息放在棋盘上面，操作栏吸底 */
  .side {
    display: contents;
  }

  .room-card {
    order: -1;
  }

  .fleet-card {
    display: none;
  }

  .actions-card {
    position: sticky;
    bottom: max(8px, env(safe-area-inset-bottom));
    z-index: 10;
    padding: 10px;
    box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.18);
  }

  .setup-controls {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .setup-controls .btn {
    min-height: 38px;
    padding: 0 8px;
    font-size: 13px;
  }

  .setup-controls .main-action {
    min-height: 42px;
  }

  .leave {
    display: none;
  }

  .leave-sm {
    display: inline-flex;
  }

  .room-card {
    padding: 12px 14px;
  }

  .room-code {
    font-size: 20px;
  }

  .players {
    grid-template-columns: 1fr 1fr;
    margin-top: 10px;
  }

  .players li {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    padding: 7px 9px;
    font-size: 13px;
  }

  .players li > .chip { grid-column: 2; justify-self: start; }
  .player-name { display: block; }
  .player-name .chip { display: none; }

  .player-name .muted {
    display: none;
  }

  .players .waiting {
    grid-column: 1 / -1;
  }

  .board-card {
    padding: 12px;
  }

  .board-head h2 {
    font-size: 16px;
  }

  .board {
    grid-template-columns: 16px 1fr;
    grid-template-rows: 16px auto;
  }
}
</style>
