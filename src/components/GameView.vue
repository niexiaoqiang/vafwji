<template>
  <div class="game-view">
    <!-- 状态栏：回合、倒计时、剩余飞机 -->
    <div class="game-status" :class="{ 'is-my-turn': isYourTurn && !gameOver }">
      <div class="status-main">
        <div class="status-text">{{ statusMessage }}</div>
        <div v-if="!gameOver && remainingSeconds !== null" class="turn-timer" :class="{ urgent: remainingSeconds <= 10 }">
          {{ remainingSeconds }}s
        </div>
      </div>
      <div class="status-sub">
        <span>对方飞机 <b>{{ enemyAlive }}</b>/{{ planeCount }}</span>
        <span>我方飞机 <b>{{ myAlive }}</b>/{{ planeCount }}</span>
        <button type="button" class="link-btn" @click="leaveGame">退出</button>
      </div>
      <div v-if="opponentOffline && !gameOver" class="status-warning">
        {{ enemyName }} 掉线了，正在等待重连…
      </div>
      <div v-if="lastAutoMessage" class="status-note">{{ lastAutoMessage }}</div>
    </div>

    <!-- 手机端用标签切换两个棋盘 -->
    <div class="board-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :class="{ active: activeTab === 'enemy' }"
        :aria-selected="activeTab === 'enemy'"
        @click="activeTab = 'enemy'"
      >
        对方棋盘<span v-if="isYourTurn && !gameOver" class="tab-dot"></span>
      </button>
      <button
        type="button"
        role="tab"
        :class="{ active: activeTab === 'mine' }"
        :aria-selected="activeTab === 'mine'"
        @click="activeTab = 'mine'"
      >
        我的棋盘<span v-if="unseenHits > 0" class="tab-badge">{{ unseenHits }}</span>
      </button>
    </div>

    <div class="boards">
      <!-- 对方棋盘（攻击区） -->
      <section class="board-panel" :class="{ 'tab-hidden': activeTab !== 'enemy' }">
        <div class="board-header">
          <h3>对方棋盘</h3>
          <div class="mode-switch" role="group" aria-label="点击格子的作用">
            <button type="button" :class="{ active: clickMode === 'attack' }" @click="clickMode = 'attack'">攻击</button>
            <button type="button" :class="{ active: clickMode === 'mark' }" @click="clickMode = 'mark'">标记</button>
          </div>
        </div>
        <p class="board-hint">
          {{ clickMode === 'attack' ? '点击格子发起攻击；击中机头可继续攻击' : '点击格子做标记：· → ✕ → ○ → 清除（电脑上也可右键标记）' }}
        </p>
        <div class="grid-wrap">
          <div class="col-labels"><span v-for="col in columns" :key="col">{{ col }}</span></div>
          <div class="row-labels"><span v-for="row in 10" :key="row">{{ row }}</span></div>
          <div class="grid" :class="{ attackable: canAttack && clickMode === 'attack' }">
            <template v-for="row in 10" :key="'er' + row">
              <button
                v-for="col in columns"
                :key="'e' + row + col"
                type="button"
                class="cell"
                :class="enemyCellClass(row, col)"
                :aria-label="`${col}${row}`"
                @click="onEnemyCell(row, col)"
                @contextmenu.prevent="cycleMark(row, col)"
              >{{ enemyCellText(row, col) }}</button>
            </template>
          </div>
        </div>
        <div class="legend">
          <span><i class="lg lg-miss">·</i>未命中</span>
          <span><i class="lg lg-hit">✕</i>命中机身</span>
          <span><i class="lg lg-sink">○</i>击落（机头）</span>
          <span><i class="lg lg-mark">?</i>我的标记</span>
        </div>
      </section>

      <!-- 我的棋盘（防守区） -->
      <section class="board-panel" :class="{ 'tab-hidden': activeTab !== 'mine' }">
        <div class="board-header">
          <h3>我的棋盘</h3>
        </div>
        <p class="board-hint">对方的每次攻击都会标在这里</p>
        <div class="grid-wrap">
          <div class="col-labels"><span v-for="col in columns" :key="col">{{ col }}</span></div>
          <div class="row-labels"><span v-for="row in 10" :key="row">{{ row }}</span></div>
          <div class="grid">
            <template v-for="row in 10" :key="'mr' + row">
              <div
                v-for="col in columns"
                :key="'m' + row + col"
                class="cell"
                :class="myCellClass(row, col)"
              >{{ myCellText(row, col) }}</div>
            </template>
          </div>
        </div>
      </section>
    </div>

    <!-- 对局记录 -->
    <details class="game-log">
      <summary>对局记录<span v-if="logs.length" class="log-latest">：{{ logs[0].text }}</span></summary>
      <ol>
        <li v-for="item in logs" :key="item.id" :class="'log-' + item.type">{{ item.text }}</li>
      </ol>
    </details>

    <!-- 结束弹窗 -->
    <div v-if="gameOver && showResult" class="game-overlay">
      <div class="game-result" role="dialog" aria-modal="true">
        <h2>{{ winner === myId ? '你赢了！' : '你输了' }}</h2>
        <p v-if="gameOverReason" class="result-reason">{{ gameOverReason }}</p>
        <p class="result-stats">
          攻击 {{ myShotCount }} 次 · 命中率 {{ hitRateText }}<span v-if="durationText"> · 用时 {{ durationText }}</span>
        </p>
        <p v-if="opponentWantsRematch" class="result-rematch">{{ enemyName }} 想再来一局</p>
        <div class="result-actions">
          <button type="button" class="btn-primary" @click="playAgain">再来一局</button>
          <button type="button" class="btn-secondary" @click="showResult = false">查看棋盘</button>
          <button type="button" class="btn-secondary" @click="backToLobby">返回大厅</button>
        </div>
      </div>
    </div>
    <div v-if="gameOver && !showResult" class="after-game-bar">
      <span v-if="opponentWantsRematch">{{ enemyName }} 想再来一局</span>
      <button type="button" class="btn-primary" @click="playAgain">再来一局</button>
      <button type="button" class="btn-secondary" @click="backToLobby">返回大厅</button>
    </div>
  </div>
</template>

<script>
import { storage } from '../platform.js';
import { notify, confirmDialog } from '../ui/dialog.js';
import { recordResult } from '../stats.js';

const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const MARK_CYCLE = { undefined: 'miss', miss: 'hit', hit: 'sink', sink: undefined };
const key = (row, col) => `${row},${col}`;
let logSeq = 0;

export default {
  name: 'GameView',
  props: {
    username: { type: String, required: true },
    roomId: { type: String, required: true },
    socket: { type: Object, required: true },
    gameData: { type: Object, default: null },
    mode: { type: String, default: 'online' },
    level: { type: String, default: 'normal' },
  },
  emits: ['endGame', 'returnToRoom'],
  data() {
    return {
      columns: COLUMNS,
      myId: null,
      players: [],
      currentTurn: null,
      turnDeadline: null,
      now: Date.now(),
      myShots: {},        // 我对对方的攻击：key -> pending | miss | hit | sink
      sunkCells: {},      // 对方被击落飞机的格子（由服务器在击落时公开）
      incoming: {},       // 对方对我的攻击：key -> miss | hit | sink
      marks: {},          // 我在对方棋盘上的标记
      revealed: null,     // 对局结束后公开的对方布局
      clickMode: 'attack', // 点击对方棋盘的作用：攻击 / 标记
      activeTab: 'enemy',
      unseenHits: 0,
      isAttacking: false,
      gameOver: false,
      showResult: true,
      winner: null,
      gameOverReason: '',
      opponentOffline: false,
      opponentWantsRematch: false,
      lastAutoMessage: '',
      durationMs: 0,
      logs: [],
    };
  },
  computed: {
    me() {
      return this.players.find((p) => p.id === this.myId) || { planes: [] };
    },
    enemy() {
      return this.players.find((p) => p.id !== this.myId) || { planes: [] };
    },
    enemyName() {
      return this.enemy.username || '对手';
    },
    planeCount() {
      return this.me.planes?.length || 3;
    },
    isYourTurn() {
      return this.currentTurn === this.myId;
    },
    canAttack() {
      return this.isYourTurn && !this.gameOver && !this.isAttacking;
    },
    enemyAlive() {
      return (this.enemy.planes || []).filter((p) => !p.sunk).length;
    },
    myAlive() {
      return (this.me.planes || []).filter((p) => !p.sunk).length;
    },
    remainingSeconds() {
      if (!this.turnDeadline) return null;
      return Math.max(0, Math.ceil((this.turnDeadline - this.now) / 1000));
    },
    statusMessage() {
      if (this.gameOver) return this.winner === this.myId ? '你赢了！' : '你输了';
      if (this.isYourTurn) return this.isAttacking ? '攻击中…' : '你的回合：选择攻击位置';
      return `等待 ${this.enemyName} 攻击…`;
    },
    myShotCount() {
      return Object.values(this.myShots).filter((r) => r !== 'pending').length;
    },
    hitRateText() {
      return this.myShotCount ? `${Math.round((this.myHitCount / this.myShotCount) * 100)}%` : '—';
    },
    durationText() {
      if (!this.durationMs) return '';
      const total = Math.round(this.durationMs / 1000);
      return total >= 60 ? `${Math.floor(total / 60)} 分 ${total % 60} 秒` : `${total} 秒`;
    },
    myHitCount() {
      return Object.values(this.myShots).filter((r) => r === 'hit' || r === 'sink').length;
    },
    // 我的飞机：格子 -> { planeIndex, part, isHead }
    myPlaneCells() {
      const map = {};
      (this.me.planes || []).forEach((plane, planeIndex) => {
        (plane.coordinates || []).forEach((c) => {
          map[key(c.row, c.col)] = { planeIndex, part: c.part, isHead: c.isHead || c.part === 'head' };
        });
      });
      return map;
    },
    revealedCells() {
      const map = {};
      (this.revealed || []).forEach((plane, planeIndex) => {
        (plane.coordinates || []).forEach((c) => {
          map[key(c.row, c.col)] = { planeIndex, isHead: c.isHead || c.part === 'head' };
        });
      });
      return map;
    },
  },
  watch: {
    isYourTurn(mine) {
      // 轮到自己时切回对方棋盘
      if (mine && !this.gameOver) this.activeTab = 'enemy';
    },
    activeTab(tab) {
      if (tab === 'mine') this.unseenHits = 0;
    },
  },
  mounted() {
    this.myId = this.socket.id;
    this.ticker = setInterval(() => {
      this.now = Date.now();
    }, 250);
    this.listeners = {
      gameStart: (data) => this.onGameStart(data),
      attackResult: (data) => this.onAttackResult(data),
      turnChange: (data) => this.onTurnChange(data),
      turnSync: (data) => this.onTurnSync(data),
      gameOver: (data) => this.onGameOver(data),
      playerOffline: () => {
        this.opponentOffline = true;
        this.addLog(`${this.enemyName} 掉线了，等待重连`, 'warn');
      },
      playerOnline: () => {
        this.opponentOffline = false;
        this.addLog(`${this.enemyName} 已重新连接`, 'info');
      },
      rematchRequested: () => {
        this.opponentWantsRematch = true;
      },
      playerLeft: (data) => {
        this.opponentWantsRematch = false;
        this.addLog(`${data?.username || this.enemyName} 离开了房间`, 'warn');
        if (this.gameOver) notify(`${data?.username || this.enemyName} 已离开房间`);
      },
      gameError: (data) => this.onGameError(data),
    };
    for (const [event, handler] of Object.entries(this.listeners)) this.socket.on(event, handler);
    if (this.gameData) this.onGameStart(this.gameData);
  },
  beforeUnmount() {
    clearInterval(this.ticker);
    clearTimeout(this.pendingTimer);
    for (const [event, handler] of Object.entries(this.listeners || {})) this.socket.off(event, handler);
  },
  methods: {
    addLog(text, type = 'info') {
      this.logs.unshift({ id: ++logSeq, text, type });
      if (this.logs.length > 60) this.logs.pop();
    },
    setDeadline(ms) {
      this.turnDeadline = typeof ms === 'number' ? Date.now() + ms : null;
    },

    // ---------- 服务器事件 ----------
    onGameStart(data) {
      this.players = (data.players || []).map((p) => ({ ...p, planes: (p.planes || []).map((plane) => ({ ...plane })) }));
      this.currentTurn = data.currentTurn || data.firstPlayer;
      this.setDeadline(data.turnMs);
      const first = this.players.find((p) => p.id === this.currentTurn);
      this.addLog(`对局开始：${this.me.username || '我'} vs ${this.enemyName}，${first?.id === this.myId ? '你' : first?.username || '对方'}先手`, 'system');
    },
    onTurnChange(data) {
      this.currentTurn = data.currentTurn;
      this.isAttacking = false;
      this.setDeadline(data.turnMs);
      if (data.continueTurn && data.currentTurn === this.myId) this.addLog('击落机头，继续攻击', 'sink');
    },
    onTurnSync(data) {
      this.currentTurn = data.currentTurn;
      this.setDeadline(data.remainingMs);
    },
    onAttackResult(data) {
      const { row, col } = data.position || {};
      const k = key(row, col);
      const label = `${col}${row}`;
      const resultText = { miss: '未命中', hit: '命中机身', sink: '击落一架飞机' }[data.result] || data.result;
      const markSunk = (list, planeIndex) => {
        const plane = list.planes?.[planeIndex];
        if (plane) plane.sunk = true;
      };

      if (data.attacker === this.myId) {
        clearTimeout(this.pendingTimer);
        this.isAttacking = false;
        this.myShots = { ...this.myShots, [k]: data.result };
        if (this.marks[k]) {
          const marks = { ...this.marks };
          delete marks[k];
          this.marks = marks;
        }
        if (data.result === 'sink') {
          markSunk(this.enemy, data.planeIndex);
          const cells = { ...this.sunkCells };
          (data.sunkPlane || []).forEach((c) => {
            cells[key(c.row, c.col)] = true;
          });
          this.sunkCells = cells;
        }
        this.lastAutoMessage = data.auto ? `你超时了，系统代你攻击了 ${label}` : '';
        this.addLog(`${data.auto ? '（超时代打）' : ''}你攻击 ${label}：${resultText}`, data.result);
      } else {
        this.incoming = { ...this.incoming, [k]: data.result };
        if (data.result === 'sink') markSunk(this.me, data.planeIndex);
        if (data.result !== 'miss' && this.activeTab !== 'mine') this.unseenHits += 1;
        this.lastAutoMessage = data.auto ? `${this.enemyName} 超时，系统代其攻击了 ${label}` : '';
        this.addLog(`${this.enemyName} 攻击 ${label}：${resultText}`, data.result === 'miss' ? 'info' : 'danger');
      }
    },
    onGameOver(data) {
      this.gameOver = true;
      this.showResult = true;
      this.winner = data.winner;
      this.gameOverReason = data.reason || '';
      this.turnDeadline = null;
      this.isAttacking = false;
      const enemyReveal = (data.reveal || []).find((p) => p.id !== this.myId);
      if (enemyReveal) this.revealed = enemyReveal.planes;
      this.durationMs = data.durationMs || 0;
      this.addLog(this.winner === this.myId ? '你赢得了这局' : `这局 ${this.enemyName} 获胜`, 'system');
      recordResult({
        mode: this.mode,
        level: this.level,
        win: this.winner === this.myId,
        shots: this.myShotCount,
        hits: this.myHitCount,
      }).catch((error) => console.warn('记录战绩失败:', error));
    },
    onGameError(data) {
      if (data?.code !== 'ATTACK_REJECTED') return;
      const p = data.position;
      if (p) {
        const k = key(Number(p.row), String(p.col).toUpperCase());
        if (this.myShots[k] === 'pending') {
          const shots = { ...this.myShots };
          delete shots[k];
          this.myShots = shots;
        }
      }
      clearTimeout(this.pendingTimer);
      this.isAttacking = false;
      notify(data.message || '攻击未被接受');
    },

    // ---------- 操作 ----------
    onEnemyCell(row, col) {
      if (this.clickMode === 'mark') {
        this.cycleMark(row, col);
        return;
      }
      this.attack(row, col);
    },
    attack(row, col) {
      if (this.gameOver) return;
      if (!this.isYourTurn) {
        notify('还没轮到你');
        return;
      }
      if (this.isAttacking) return;
      const k = key(row, col);
      if (this.myShots[k]) {
        notify('这个格子已经攻击过了');
        return;
      }
      if (!this.socket.connected) {
        notify('连接中断，请稍候重试');
        return;
      }
      this.isAttacking = true;
      this.myShots = { ...this.myShots, [k]: 'pending' };
      this.socket.emit('attack', { position: { row, col } });
      clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        if (this.myShots[k] === 'pending') {
          const shots = { ...this.myShots };
          delete shots[k];
          this.myShots = shots;
          this.isAttacking = false;
          notify('攻击没有得到响应，请重试');
        }
      }, 6000);
    },
    cycleMark(row, col) {
      const k = key(row, col);
      if (this.myShots[k] || this.gameOver) return;
      const next = MARK_CYCLE[this.marks[k]];
      const marks = { ...this.marks };
      if (next) marks[k] = next;
      else delete marks[k];
      this.marks = marks;
    },
    playAgain() {
      this.socket.emit('restartGame', {}, (res) => {
        if (!res?.success) {
          notify(res?.message || '无法再来一局');
          this.backToLobby();
          return;
        }
        this.$emit('returnToRoom', { roomId: res.roomId, state: res.state });
      });
    },
    backToLobby() {
      this.socket.emit('leaveRoom', {});
      this.$emit('endGame');
    },
    async leaveGame() {
      if (this.gameOver) {
        this.backToLobby();
        return;
      }
      if (await confirmDialog('对局还没结束，退出将直接判负。确定退出吗？', { okText: '退出' })) {
        this.backToLobby();
      }
    },

    // ---------- 渲染 ----------
    enemyCellClass(row, col) {
      const k = key(row, col);
      const shot = this.myShots[k];
      const classes = [];
      if (shot) classes.push(`cell-${shot}`);
      else if (this.sunkCells[k]) classes.push('cell-sunk-part');
      else if (this.revealed && this.revealedCells[k]) classes.push('cell-revealed');
      else if (this.marks[k]) classes.push(`cell-mark cell-mark-${this.marks[k]}`);
      if (this.sunkCells[k] && shot) classes.push('cell-in-sunk');
      if (!shot && this.canAttack && this.clickMode === 'attack') classes.push('cell-target');
      return classes;
    },
    enemyCellText(row, col) {
      const k = key(row, col);
      const shot = this.myShots[k];
      if (shot === 'miss') return '·';
      if (shot === 'hit') return '✕';
      if (shot === 'sink') return '○';
      if (!shot && !this.sunkCells[k] && this.marks[k]) return { miss: '·', hit: '✕', sink: '○' }[this.marks[k]];
      return '';
    },
    myCellClass(row, col) {
      const k = key(row, col);
      const cell = this.myPlaneCells[k];
      const classes = [];
      if (cell) {
        classes.push('cell-plane', `plane-${cell.planeIndex}`);
        if (cell.isHead) classes.push('cell-head');
        if (this.me.planes?.[cell.planeIndex]?.sunk) classes.push('cell-plane-sunk');
      }
      const hit = this.incoming[k];
      if (hit) classes.push(`cell-incoming-${hit}`);
      return classes;
    },
    myCellText(row, col) {
      const hit = this.incoming[key(row, col)];
      if (hit === 'miss') return '·';
      if (hit === 'hit') return '✕';
      if (hit === 'sink') return '○';
      return '';
    },
  },
};
</script>

<style scoped>
.game-view {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
}

/* ---------- 状态栏 ---------- */
.game-status {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 2px solid transparent;
}

.game-status.is-my-turn {
  border-color: var(--secondary-color);
}

.status-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.status-text {
  font-size: 1.15rem;
  font-weight: 600;
}

.turn-timer {
  min-width: 52px;
  text-align: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef6fc;
  color: var(--primary-color);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.turn-timer.urgent {
  background: #fdecea;
  color: var(--danger-color);
}

.status-sub {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 6px;
  font-size: 0.9rem;
  color: #5d6d7e;
}

.status-sub b {
  color: var(--text-color);
}

.link-btn {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 0.85rem;
  background: transparent;
  color: var(--danger-color);
  border: 1px solid var(--danger-color);
  box-shadow: none;
}

.link-btn:hover {
  background: var(--danger-color);
  color: #fff;
  transform: none;
}

.status-warning,
.status-note {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
}

.status-warning {
  background: #fff4e5;
  color: #8a4b00;
}

.status-note {
  background: #f2f4f7;
  color: #5d6d7e;
}

/* ---------- 棋盘 ---------- */
.board-tabs {
  display: none;
}

.boards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.board-panel {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  min-width: 0;
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.board-header h3 {
  font-size: 1.05rem;
}

.board-hint {
  margin: 4px 0 10px;
  font-size: 0.8rem;
  color: #7f8c8d;
  min-height: 1.2em;
}

.mode-switch {
  display: inline-flex;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.mode-switch button {
  padding: 5px 14px;
  font-size: 0.85rem;
  border-radius: 0;
  background: #fff;
  color: var(--text-color);
  box-shadow: none;
}

.mode-switch button:hover {
  transform: none;
  background: #f2f4f7;
}

.mode-switch button.active {
  background: var(--primary-color);
  color: #fff;
}

/* 带坐标的 10×10 网格，随容器宽度缩放 */
.grid-wrap {
  display: grid;
  grid-template-columns: 18px 1fr;
  grid-template-rows: 18px auto;
  max-width: 440px;
  margin: 0 auto;
}

.col-labels {
  grid-column: 2;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
}

.row-labels {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  grid-template-rows: repeat(10, 1fr);
}

.col-labels span,
.row-labels span {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #95a5a6;
}

.grid {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
  background: #e3e8ee;
  padding: 2px;
  border-radius: 6px;
  touch-action: manipulation;
}

.cell {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 3px;
  background: #f8fafc;
  color: var(--text-color);
  font-size: clamp(0.8rem, 3.6vw, 1.1rem);
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  transition: background-color 0.15s;
  cursor: default;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

button.cell:hover {
  transform: none;
  box-shadow: none;
  background: #f8fafc;
}

.grid.attackable .cell-target {
  cursor: crosshair;
}

.grid.attackable .cell-target:hover {
  background: #d6eaf8;
}

.cell-pending {
  background: #fef5e7;
  animation: pulse 0.8s infinite alternate;
}

.cell-miss {
  background: #eceff1;
  color: #90a4ae;
}

.cell-hit {
  background: #fadbd8;
  color: var(--danger-color);
}

.cell-sink {
  background: #1f2d3d;
  color: #fff;
}

button.cell-sink:hover,
.cell-sink {
  background: #1f2d3d;
}

.cell-sunk-part {
  background: #c9d1d9;
}

.cell-hit.cell-in-sunk {
  background: #e6b0aa;
}

.cell-revealed {
  background: #d6eaf8;
  outline: 1px dashed var(--primary-color);
  outline-offset: -3px;
}

.cell-mark {
  color: var(--warning-color);
  background: #fffaf0;
}

/* 我的棋盘：三架飞机三种颜色，机头加深 */
.cell-plane.plane-0 { background: #aed6f1; }
.cell-plane.plane-1 { background: #a9dfbf; }
.cell-plane.plane-2 { background: #f5cba7; }
.cell-plane.cell-head.plane-0 { background: #3498db; }
.cell-plane.cell-head.plane-1 { background: #27ae60; }
.cell-plane.cell-head.plane-2 { background: #e67e22; }

.cell-plane-sunk {
  filter: grayscale(0.8);
  opacity: 0.7;
}

.cell-incoming-miss { color: #90a4ae; }
.cell-incoming-hit { color: var(--danger-color); }
.cell-incoming-sink { color: #fff; background: #1f2d3d !important; }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 10px;
  font-size: 0.78rem;
  color: #7f8c8d;
  justify-content: center;
}

.lg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 4px;
  border-radius: 3px;
  font-style: normal;
  font-weight: 700;
}

.lg-miss { background: #eceff1; color: #90a4ae; }
.lg-hit { background: #fadbd8; color: var(--danger-color); }
.lg-sink { background: #1f2d3d; color: #fff; }
.lg-mark { background: #fffaf0; color: var(--warning-color); }

/* ---------- 对局记录 ---------- */
.game-log {
  margin-top: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  font-size: 0.85rem;
}

.game-log summary {
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-latest {
  font-weight: 400;
  color: #7f8c8d;
}

.game-log ol {
  list-style: none;
  margin-top: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.game-log li {
  padding: 3px 0;
  border-bottom: 1px dashed #eef1f4;
}

.log-danger { color: var(--danger-color); }
.log-sink { color: #1f2d3d; font-weight: 600; }
.log-warn { color: #8a4b00; }
.log-system { color: var(--primary-color); }

/* ---------- 结束 ---------- */
.game-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.5);
}

.game-result {
  width: min(100%, 380px);
  background: #fff;
  border-radius: 14px;
  padding: 24px 20px;
  text-align: center;
}

.game-result h2 {
  font-size: 1.6rem;
  margin-bottom: 8px;
}

.result-reason,
.result-stats {
  color: #5d6d7e;
  margin-bottom: 6px;
}

.result-rematch {
  margin: 10px 0 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: #e8f8f0;
  color: #1e8449;
}

.result-actions,
.after-game-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 16px;
}

.after-game-bar {
  position: sticky;
  bottom: 0;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
}

.btn-secondary {
  background: #ecf0f1;
  color: var(--text-color);
}

.btn-secondary:hover {
  background: #dfe6e9;
}

@keyframes pulse {
  from { opacity: 0.5; }
  to { opacity: 1; }
}

/* ---------- 手机：一次只显示一个棋盘 ---------- */
@media (max-width: 760px) {
  .board-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 10px;
  }

  .board-tabs button {
    position: relative;
    padding: 9px 0;
    background: #fff;
    color: var(--text-color);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }

  .board-tabs button:hover {
    transform: none;
  }

  .board-tabs button.active {
    background: var(--primary-color);
    color: #fff;
  }

  .tab-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-left: 6px;
    border-radius: 50%;
    background: var(--secondary-color);
    vertical-align: middle;
  }

  .tab-badge {
    display: inline-block;
    min-width: 18px;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--danger-color);
    color: #fff;
    font-size: 0.75rem;
    line-height: 18px;
  }

  .boards {
    grid-template-columns: 1fr;
  }

  .board-panel {
    padding: 10px;
  }

  .tab-hidden {
    display: none;
  }

  .status-text {
    font-size: 1rem;
  }

  .status-sub {
    gap: 10px;
    font-size: 0.82rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cell-pending {
    animation: none;
  }
}
</style>
