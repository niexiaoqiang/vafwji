<template>
  <div class="room-view">
    <div class="card room-info">
      <h2>{{ isAi ? '人机对战' : '房间信息' }}</h2>
      <div v-if="!isAi" class="info-row">
        <span class="info-label">房间号</span>
        <span class="info-value">{{ roomId }}</span>
        <button class="copy-btn" @click="copyInvite">复制邀请</button>
      </div>
      <div class="info-row">
        <span class="info-label">玩家</span>
        <span class="info-value">{{ players.length }}/2</span>
      </div>
      <div class="players-list">
        <div v-for="player in players" :key="player.id" class="player-item">
          <div class="player-info">
            <span class="player-name">{{ player.username }}</span>
            <span class="player-status" :class="{ ready: player.ready }">
              {{ player.offline ? '掉线中' : player.ready ? '已准备' : '未准备' }}
            </span>
          </div>
          <div class="player-tags">
            <span v-if="player.id === myId" class="player-tag player-me">我</span>
            <span v-if="player.id === leaderId" class="player-tag player-leader">房主</span>
          </div>
        </div>
      </div>
      <div v-if="players.length < 2" class="room-status">
        等待对手加入…把房间号发给朋友吧
      </div>
      <div class="room-actions">
        <button class="btn-danger" @click="leaveRoom">离开房间</button>
      </div>
    </div>

    <div class="card setup-board">
      <h2>放置飞机</h2>
      <p class="setup-instruction">
        {{ planes.length ? '已为你布置 3 架飞机。拖动调整位置，选中后旋转；也可以换一组布局。' : '点击「随机布置」生成布局，再拖动、旋转调整。' }}
      </p>

      <div class="board-container">
        <div class="board-wrapper">
          <div class="board">
            <div class="board-labels board-row-labels">
              <div class="label" v-for="i in 10" :key="'row-' + i">{{ i }}</div>
            </div>
            <div class="board-labels board-col-labels">
              <div class="label" v-for="col in columns" :key="'col-' + col">{{ col }}</div>
            </div>
            <div class="board-grid">
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
        </div>

        <div class="setup-controls">
          <button class="btn-secondary" @click="generateRandomPlanes" :disabled="isReady">随机布置</button>
          <button class="btn-secondary" @click="rotateSelected" :disabled="isReady || selectedPlaneIndex === -1">旋转所选</button>
          <button class="btn-secondary" @click="clearPlanes" :disabled="isReady">清除</button>
          <button v-if="!isReady" class="btn-primary" @click="ready" :disabled="planes.length < 3 || preparing">{{ preparing ? '提交中…' : isAi ? '准备并开始' : '准备' }}</button>
          <button v-else-if="phase === 'waiting'" class="btn-secondary" :disabled="preparing || starting" @click="unready">重新布置</button>
          <button v-if="!isAi && isLeader && canStartGame" class="btn-primary" :disabled="starting" @click="startGame">开始游戏</button>
        </div>
        <p class="setup-tip" v-if="isReady">{{ readyTip }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import { notify } from '../ui/dialog.js';
import { copyText } from '../platform.js';
import { buildPlane, randomPlanes, COLUMNS } from '../../shared/planes.js';

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
  },
  emits: ['gameStart', 'leave'],
  data() {
    return {
      columns: COLUMNS,
      players: this.initialState?.players || [],
      leaderId: this.initialState?.leaderId || null,
      phase: this.initialState?.phase || 'waiting',
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
    isAi() {
      return this.mode === 'ai';
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
      return this.isLeader ? '双方都准备好了，点「开始游戏」' : '已准备，等待房主开始游戏';
    },
  },
  watch: {
    canStartGame(value) {
      if (value && this.isAi) this.startGame();
    },
  },
  mounted() {
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('pointercancel', this.onPointerUp);
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
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('pointercancel', this.onPointerUp);
    for (const [event, handler] of Object.entries(this.listeners || {})) this.socket.off(event, handler);
  },
  methods: {
    // ---------- 房间 ----------
    applyState(state) {
      if (!state || state.roomId !== this.roomId) return;
      this.players = state.players || [];
      this.leaderId = state.leaderId;
      this.phase = state.phase;
      const me = this.players.find((p) => p.id === this.myId);
      // 服务端为准：重置后（比如对局结束回到房间）解除本地准备
      if (me && !me.ready && this.isReady) this.isReady = false;
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
      this.socket.emit('leaveRoom', {});
      this.$emit('leave');
    },
    async copyInvite() {
      try {
        await copyText(`来炸飞机对战吧！房间号：${this.roomId}`);
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
        classes[`plane-${ghost.part}`] = true;
        classes[`direction-${this.ghostPlane.direction}`] = true;
        classes[this.ghostPlaneValid ? 'ghost-valid' : 'ghost-invalid'] = true;
        return classes;
      }
      for (const plane of this.planes) {
        // 拖动中的飞机由虚影代替显示
        if (this.ghostPlane && plane.id === this.originalPlane?.id) continue;
        const cell = plane.coordinates.find((c) => c.row === row && c.col === col);
        if (cell) {
          classes['cell-plane'] = true;
          classes[`plane-${cell.part}`] = true;
          classes[`direction-${plane.direction}`] = true;
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
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.room-info {
  flex: 1;
  min-width: 300px;
}

.setup-board {
  flex: 2;
  min-width: 400px;
}

.setup-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.setup-tip {
  margin-top: 10px;
  text-align: center;
  color: var(--secondary-color);
}

.board {
  --cell: 40px;
}

h2 {
  margin-bottom: 20px;
  text-align: center;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.info-label {
  font-weight: 500;
  min-width: 80px;
}

.info-value {
  font-weight: 600;
  color: var(--primary-color);
}

.copy-btn {
  margin-left: 10px;
  padding: 5px 10px;
  font-size: 12px;
}

.players-list {
  margin: 20px 0;
}

.player-item {
  padding: 10px;
  border-radius: 5px;
  background-color: var(--background-color);
  margin-bottom: 10px;
}

.player-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.player-name {
  font-weight: 500;
}

.player-status {
  font-size: 14px;
  color: var(--miss-color);
}

.player-status.ready {
  color: var(--secondary-color);
}

.player-tags {
  display: flex;
  gap: 5px;
}

.player-tag {
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
}

.player-tag.player-me {
  background-color: var(--secondary-color);
  color: white;
}

.player-tag.player-leader {
  background-color: var(--primary-color);
  color: white;
}

.room-status {
  text-align: center;
  margin-top: 20px;
  color: #666;
}

.room-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.setup-instruction {
  text-align: center;
  margin-bottom: 20px;
  color: #666;
}

.board-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.board-wrapper {
  position: relative;
  margin-bottom: 20px;
}

.board {
  position: relative;
  display: grid;
  grid-template-columns: 30px 1fr;
  grid-template-rows: 30px 1fr;
  gap: 0;
}

.board-labels {
  display: flex;
  align-items: center;
  justify-content: center;
}

.board-row-labels {
  grid-column: 1;
  grid-row: 2;
  display: flex;
  flex-direction: column;
}

.board-col-labels {
  grid-column: 2;
  grid-row: 1;
}

.label {
  width: var(--cell);
  height: var(--cell);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
}

.board-grid {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--border-color);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.board-row {
  display: flex;
}

.board-cell {
  width: var(--cell);
  height: var(--cell);
  border: 1px solid var(--border-color);
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  background-color: white;
  transition: all 0.3s ease;
  position: relative;
}

.board-cell.valid-cell:hover {
  background-color: rgba(52, 152, 219, 0.1);
}

/* 飞机基本样式 */
.board-cell.cell-plane {
  background-color: var(--plane-color-1);
  position: relative;
  z-index: 1;
}

/* 飞机头部样式 */
.board-cell.plane-head {
  background-color: var(--plane-color-2);
  z-index: 2;
  border: none;
}

/* 飞机机身样式 */
.board-cell.plane-body {
  background-color: var(--plane-color-1);
  border: none;
}

/* 机翼中心部分样式 */
.board-cell.plane-wing-center {
  background-color: var(--plane-color-1);
  position: relative;
  z-index: 1;
  border: none;
}

/* 机翼侧面样式 */
.board-cell.plane-wing-left,
.board-cell.plane-wing-right,
.board-cell.plane-wing-up,
.board-cell.plane-wing-down {
  background-color: var(--plane-color-1);
  border: none;
}

/* 机翼尖端样式 */
.board-cell.plane-wing-left-tip,
.board-cell.plane-wing-right-tip,
.board-cell.plane-wing-up-tip,
.board-cell.plane-wing-down-tip {
  background-color: var(--plane-color-1);
  border: none;
}

/* 尾翼中心部分样式 */
.board-cell.plane-tail-center {
  background-color: var(--plane-color-1);
  border: none;
}

/* 尾翼侧面样式 */
.board-cell.plane-tail-left,
.board-cell.plane-tail-right,
.board-cell.plane-tail-up,
.board-cell.plane-tail-down {
  background-color: var(--plane-color-1);
  border: none;
}

/* 朝上的飞机样式 */
.direction-0.plane-head {
  border-top-left-radius: 50%;
  border-top-right-radius: 50%;
  border-bottom: none;
}

.direction-0.plane-wing-center {
  border-top: none;
}

.direction-0.plane-body {
  border-left: none;
  border-right: none;
}

.direction-0.plane-wing-left-tip {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-0.plane-wing-right-tip {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-0.plane-tail-center {
  border-radius: 0;
}

.direction-0.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-0.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝右的飞机样式 */
.direction-1.plane-head {
  border-top-right-radius: 50%;
  border-bottom-right-radius: 50%;
  border-left: none;
}

.direction-1.plane-wing-center {
  border-right: none;
}

.direction-1.plane-body {
  border-top: none;
  border-bottom: none;
}

.direction-1.plane-wing-up-tip {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-1.plane-wing-down-tip {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-1.plane-tail-center {
  border-radius: 0;
}

.direction-1.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-1.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝下的飞机样式 */
.direction-2.plane-head {
  border-bottom-left-radius: 50%;
  border-bottom-right-radius: 50%;
  border-top: none;
}

.direction-2.plane-wing-center {
  border-bottom: none;
}

.direction-2.plane-body {
  border-left: none;
  border-right: none;
}

.direction-2.plane-wing-left-tip {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-2.plane-wing-right-tip {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-2.plane-tail-center {
  border-radius: 0;
}

.direction-2.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-2.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝左的飞机样式 */
.direction-3.plane-head {
  border-top-left-radius: 50%;
  border-bottom-left-radius: 50%;
  border-right: none;
}

.direction-3.plane-wing-center {
  border-left: none;
}

.direction-3.plane-body {
  border-top: none;
  border-bottom: none;
}

.direction-3.plane-wing-up-tip {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-3.plane-wing-down-tip {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-3.plane-tail-center {
  border-radius: 0;
}

.direction-3.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-3.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 飞机部分的阴影效果 */
.cell-plane {
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
}

.setup-controls {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

/* 飞机虚影样式 */
.board-cell.cell-ghost {
  opacity: 0.9;
  z-index: 30;
  transition: all 0.05s ease;
  transform: scale(1);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.5);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(0.95);
  }
}

.board-cell.ghost-valid {
  background-color: rgba(46, 204, 113, 0.9);
  box-shadow: 0 0 15px rgba(46, 204, 113, 0.8);
  border-color: rgba(255, 255, 255, 0.7);
}

.board-cell.ghost-valid.plane-head {
  background-color: rgba(46, 204, 113, 1);
  box-shadow: 0 0 15px rgba(46, 204, 113, 0.9);
}

.board-cell.ghost-invalid {
  background-color: rgba(231, 76, 60, 0.9);
  box-shadow: 0 0 15px rgba(231, 76, 60, 0.8);
  border-color: rgba(255, 255, 255, 0.7);
}

.board-cell.ghost-invalid.plane-head {
  background-color: rgba(231, 76, 60, 1);
  box-shadow: 0 0 15px rgba(231, 76, 60, 0.9);
}

.board-cell.cell-plane,
.board-cell.cell-ghost {
  /* 按住飞机拖动时不触发页面滚动 */
  touch-action: none;
  cursor: grab;
}

.board-cell.cell-selected {
  outline: 3px solid var(--warning-color);
  outline-offset: -3px;
}

@media (max-width: 768px) {
  .room-info { padding: 12px 16px; margin-bottom: 0; }
  .room-info h2 { text-align: left; font-size: 1rem; margin-bottom: 8px; }
  .room-info > .info-row { margin-bottom: 6px; }
  .players-list { display: flex; gap: 8px; margin: 8px 0; }
  .player-item { flex: 1; min-width: 0; padding: 8px; margin-bottom: 0; }
  .player-info { flex-wrap: wrap; gap: 4px; font-size: 0.85rem; }
  .player-name { overflow-wrap: anywhere; }
  .player-status { font-size: 0.75rem; }
  .room-actions { margin-top: 8px; }
  .room-actions button { padding: 5px 10px; font-size: 0.8rem; background: #edf2f6; color: #526579; box-shadow: none; }
  .setup-board { padding-bottom: 12px; }
  .setup-board h2 { margin-bottom: 8px; font-size: 1.15rem; }
  .setup-controls {
    position: sticky;
    bottom: max(8px, env(safe-area-inset-bottom));
    z-index: 10;
    width: 100%;
    padding: 10px;
    border: 1px solid #dfe6e9;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(25, 48, 70, 0.12);
    gap: 6px;
  }
  .setup-controls button { padding: 9px 10px; font-size: 0.82rem; flex: 1 0 auto; }
  .room-view {
    flex-direction: column;
    gap: 12px;
  }

  .room-info,
  .setup-board {
    min-width: 0;
  }

  .board {
    /* 屏幕宽度减去页面与卡片内边距、行号列 */
    --cell: min(36px, calc((100vw - 84px) / 10));
    grid-template-columns: 20px 1fr;
    grid-template-rows: 20px 1fr;
  }

  .board-row-labels .label,
  .board-col-labels .label {
    font-size: 12px;
  }

  .board-row-labels .label {
    width: 20px;
  }

  .board-col-labels .label {
    height: 20px;
  }

  .setup-instruction {
    font-size: 13px;
    margin-bottom: 12px;
  }

  .room-actions {
    flex-wrap: wrap;
    gap: 8px;
  }
}

/* 尾翼样式增强 */
/* 朝上的飞机尾翼 */
.direction-0.plane-tail-center {
  border-radius: 0;
}

.direction-0.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-0.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝右的飞机尾翼 */
.direction-1.plane-tail-center {
  border-radius: 0;
}

.direction-1.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-1.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝下的飞机尾翼 */
.direction-2.plane-tail-center {
  border-radius: 0;
}

.direction-2.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-2.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝左的飞机尾翼 */
.direction-3.plane-tail-center {
  border-radius: 0;
}

.direction-3.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-3.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}
</style>
