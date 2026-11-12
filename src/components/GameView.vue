<template>
  <div class="game-view">
    <!-- 受击反馈：边缘泛红、击落横幅（只做提示，不挡操作） -->
    <div v-if="vignette" :key="'v' + vignette" class="fx-vignette" :class="{ strong: vignetteStrong }" aria-hidden="true"></div>
    <div v-if="banner" :key="'b' + banner.id" class="fx-banner" :class="banner.kind" role="status">
      {{ banner.text }}<small v-if="banner.sub">{{ banner.sub }}</small>
    </div>
    <!-- 状态栏：回合、倒计时、双方剩余飞机 -->
    <section class="card game-status" :class="{ 'is-my-turn': isYourTurn && !gameOver, over: gameOver }">
      <div class="status-text">{{ statusMessage }}</div>
      <div v-if="!gameOver && remainingSeconds !== null" class="timer" :class="{ urgent: remainingSeconds <= 10 }">
        <span class="timer-bar"><i :style="{ width: turnProgress + '%' }"></i></span>
        <span class="timer-text">{{ remainingSeconds }}s</span>
      </div>
      <div class="fleets">
        <span>对方 <b>{{ enemyAlive }}</b>/{{ planeCount }}
          <span class="dots"><i v-for="(p, i) in enemy.planes" :key="'e' + i" :class="{ down: p.sunk }"></i></span>
        </span>
        <span>我方 <b>{{ myAlive }}</b>/{{ planeCount }}
          <span class="dots"><i v-for="(p, i) in me.planes" :key="'m' + i" :class="{ down: p.sunk }"></i></span>
        </span>
      </div>
      <button type="button" class="btn btn-danger btn-sm" :disabled="leaving" @click="leaveGame">{{ leaving ? '退出中…' : '退出' }}</button>
      <p v-if="opponentOffline && !gameOver" class="status-note warn">{{ enemyName }} 掉线了，正在等待重连…</p>
      <p v-if="lastAutoMessage" class="status-note">{{ lastAutoMessage }}</p>
    </section>

    <!-- 手机端用标签切换两个棋盘 -->
    <div class="seg board-tabs" role="tablist">
      <button type="button" role="tab" :class="{ on: activeTab === 'enemy' }" :aria-selected="activeTab === 'enemy'" @click="activeTab = 'enemy'">
        对方棋盘<span v-if="isYourTurn && !gameOver" class="tab-dot"></span>
      </button>
      <button type="button" role="tab" :class="{ on: activeTab === 'mine', 'fx-tab-alert': tabAlert }" :aria-selected="activeTab === 'mine'" @click="activeTab = 'mine'">
        我的棋盘<span v-if="unseenHits > 0" class="tab-badge">{{ unseenHits }}</span>
      </button>
    </div>

    <div class="battle">
      <!-- 对方棋盘（攻击区） -->
      <section class="card panel enemy-panel" :class="{ 'tab-hidden': activeTab !== 'enemy' }">
        <div class="panel-head">
          <h3>对方棋盘</h3>
          <div class="seg mode-seg" role="group" aria-label="点击格子的作用">
            <button type="button" :class="{ on: clickMode === 'attack' }" @click="clickMode = 'attack'">攻击</button>
            <button type="button" :class="{ on: clickMode === 'mark' }" @click="clickMode = 'mark'">标记</button>
          </div>
        </div>
        <p class="muted hint">
          {{ clickMode === 'attack' ? (quickAttack ? '快速攻击已开启：点击格子立即攻击' : '先选择坐标，再确认攻击；击中机头可连击') : '虚线是你的猜测：排除 → 机身 → 机头 → 清除（电脑上也可右键标记）' }}
        </p>
        <div class="board">
          <div class="col-labels"><span v-for="col in columns" :key="col">{{ col }}</span></div>
          <div class="row-labels"><span v-for="row in 10" :key="row">{{ row }}</span></div>
          <div class="grid enemy" :class="{ attackable: canAttack && clickMode === 'attack' }">
            <template v-for="row in 10" :key="'er' + row">
              <button
                v-for="col in columns"
                :key="'e' + row + col"
                type="button"
                class="cell"
                :class="enemyCellClass(row, col)"
                :data-coord="`${col}${row}`"
                :aria-label="`${col}${row}`"
                :aria-pressed="selectedTarget?.row === row && selectedTarget?.col === col"
                :disabled="gameOver || !!myShots[keyFor(row, col)] || !!sunkCells[keyFor(row, col)]"
                @click="onEnemyCell(row, col)"
                @contextmenu.prevent="cycleMark(row, col)"
              >{{ enemyCellText(row, col) }}</button>
            </template>
          </div>
        </div>
        <div v-if="!gameOver && clickMode === 'attack'" class="attack-controls">
          <label class="quick-toggle"><input v-model="quickAttack" type="checkbox" />快速攻击</label>
          <button v-if="!quickAttack" type="button" class="btn btn-primary confirm-attack" :disabled="!canAttack || !selectedTarget" @click="attack(selectedTarget.row, selectedTarget.col)">
            {{ selectedTarget ? `攻击 ${selectedTarget.col}${selectedTarget.row}` : '请选择坐标' }}
          </button>
        </div>
        <div class="legend">
          <span><i class="lg cell cell-miss">{{ icons.miss }}</i>未命中</span>
          <span><i class="lg cell cell-hit">{{ icons.hit }}</i>命中机身</span>
          <span><i class="lg cell cell-sink">{{ icons.sink }}</i>击落</span>
          <span><i class="lg cell cell-mark">{{ icons.mark }}</i>我的标记</span>
        </div>
      </section>

      <!-- 我的棋盘（防守区） -->
      <section class="card panel mine-panel" :class="{ 'tab-hidden': activeTab !== 'mine' }">
        <div class="panel-head">
          <h3>我的棋盘</h3>
          <span class="muted">被命中 {{ hitsOnMe }} 次</span>
        </div>
        <div class="board">
          <div class="col-labels"><span v-for="col in columns" :key="col">{{ col }}</span></div>
          <div class="row-labels"><span v-for="row in 10" :key="row">{{ row }}</span></div>
          <div class="grid mine">
            <template v-for="row in 10" :key="'mr' + row">
              <div v-for="col in columns" :key="'m' + row + col" class="cell" :class="myCellClass(row, col)">{{ myCellText(row, col) }}</div>
            </template>
          </div>
        </div>
      </section>

      <!-- 对局记录 -->
      <section class="card panel log-panel">
        <div class="panel-head">
          <h3>对局记录</h3>
          <span class="muted">共 {{ shotTotal }} 手</span>
        </div>
        <p v-if="lastAttackText" class="last-attack" role="status">{{ lastAttackText }}</p>
        <ol class="log">
          <li v-for="item in logs" :key="item.id" :class="['log-' + item.type, item.who && 'who-' + item.who]">
            <span v-if="item.who" class="tag">{{ item.who === 'me' ? '我' : enemyName }}</span>
            <span>{{ item.text }}</span>
          </li>
        </ol>
      </section>
    </div>

    <!-- 结束弹窗 -->
    <div v-if="gameOver && showResult" class="game-overlay">
      <div class="game-result" :class="{ win: winner === myId }" role="dialog" aria-modal="true">
        <div class="result-hero">
          <div class="medal" aria-hidden="true">{{ winner === myId ? '🏆' : '💥' }}</div>
          <h2>{{ winner === myId ? '你赢了！' : '你输了' }}</h2>
          <p class="muted">{{ gameOverReason || (winner === myId ? '击落全部 3 架飞机' : `${enemyName} 先击落了你的飞机`) }}</p>
        </div>
        <div class="result-body">
          <div class="kpis">
            <div><b>{{ myShotCount }}</b><span>攻击次数</span></div>
            <div><b>{{ hitRateText }}</b><span>命中率</span></div>
            <div><b>{{ durationShort }}</b><span>用时</span></div>
          </div>
          <div class="minis">
            <div>
              <div class="mini-grid enemy">
                <i v-for="cell in miniCells" :key="'me' + cell.k" class="mini" :class="revealMiniClass(cell)"></i>
              </div>
              <span class="muted">对方布局</span>
            </div>
            <div>
              <div class="mini-grid mine">
                <i v-for="cell in miniCells" :key="'mm' + cell.k" class="mini" :class="myMiniClass(cell)"></i>
              </div>
              <span class="muted">我的布局</span>
            </div>
          </div>
          <p v-if="opponentWantsRematch" class="rematch">{{ enemyName }} 想再来一局</p>
          <div class="result-actions">
            <button type="button" class="btn btn-primary" @click="playAgain">再来一局</button>
            <button type="button" class="btn" @click="showResult = false">查看棋盘</button>
            <button type="button" class="btn btn-ghost" @click="backToLobby">返回大厅</button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="gameOver && !showResult" class="card after-game-bar">
      <span v-if="opponentWantsRematch" class="rematch">{{ enemyName }} 想再来一局</span>
      <button type="button" class="btn btn-primary" @click="playAgain">再来一局</button>
      <button type="button" class="btn" @click="showResult = true">查看结果</button>
      <button type="button" class="btn btn-ghost" @click="backToLobby">返回大厅</button>
    </div>
  </div>
</template>

<script>
import { storage } from '../platform.js';
import { notify, confirmDialog } from '../ui/dialog.js';
import { recordResult } from '../stats.js';
import { skinState } from '../skins/index.js';

const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const MARK_CYCLE = { undefined: 'miss', miss: 'hit', hit: 'sink', sink: undefined };
const key = (row, col) => `${row},${col}`;
const MINI_CELLS = Array.from({ length: 100 }, (_, i) => {
  const row = Math.floor(i / 10) + 1;
  const col = COLUMNS[i % 10];
  return { row, col, k: key(row, col) };
});
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
      gameId: null,
      leaving: false,
      selectedTarget: null,
      // 默认快速攻击（点格子立即攻击）；玩家手动关闭后记住选择
      quickAttack: storage.getItem('quickAttack') !== 'false',
      lastAttack: null,
      lastAttackText: '',
      myId: null,
      players: [],
      currentTurn: null,
      turnDeadline: null,
      turnTotal: 0,
      fxEnemy: {},        // 对方棋盘格子的临时动效 class
      fxMine: {},         // 我的棋盘格子的临时动效 class
      banner: null,
      vignette: 0,
      vignetteStrong: false,
      tabAlert: false,
      miniCells: MINI_CELLS,
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
    icons() {
      return skinState.skin.icons;
    },
    turnProgress() {
      if (!this.turnDeadline || !this.turnTotal) return 0;
      return Math.max(0, Math.min(100, ((this.turnDeadline - this.now) / this.turnTotal) * 100));
    },
    hitsOnMe() {
      return Object.values(this.incoming).filter((r) => r === 'hit' || r === 'sink').length;
    },
    shotTotal() {
      return this.myShotCount + Object.keys(this.incoming).length;
    },
    durationShort() {
      if (!this.durationMs) return '—';
      const total = Math.round(this.durationMs / 1000);
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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
    quickAttack(value) {
      storage.setItem('quickAttack', String(value));
      this.selectedTarget = null;
    },
    clickMode() { this.selectedTarget = null; },
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
    clearTimeout(this.bannerTimer);
    clearTimeout(this.tabAlertTimer);
    clearInterval(this.ticker);
    clearTimeout(this.pendingTimer);
    for (const [event, handler] of Object.entries(this.listeners || {})) this.socket.off(event, handler);
  },
  methods: {
    addLog(text, type = 'info', who = '') {
      this.logs.unshift({ id: ++logSeq, text, type, who });
      if (this.logs.length > 60) this.logs.pop();
    },
    setDeadline(ms, total = ms) {
      this.now = Date.now();
      this.turnDeadline = typeof ms === 'number' ? Date.now() + ms : null;
      // 进度条以整回合时长为满格；重连校准时沿用已知的回合时长
      if (typeof total === 'number' && total > 0) this.turnTotal = Math.max(total, ms || 0);
    },

    // ---------- 服务器事件 ----------
    onGameStart(data) {
      this.gameId = data.gameId;
      this.players = (data.players || []).map((p) => ({ ...p, planes: (p.planes || []).map((plane) => ({ ...plane })) }));
      this.currentTurn = data.currentTurn || data.firstPlayer;
      this.setDeadline(data.turnMs);
      const first = this.players.find((p) => p.id === this.currentTurn);
      this.addLog(`对局开始：${this.me.username || '我'} vs ${this.enemyName}，${first?.id === this.myId ? '你' : first?.username || '对方'}先手`, 'system');
      this.opponentOffline = !!this.enemy.offline;
      // 刷新恢复时重放历史记录，不播放动效
      this.replaying = true;
      for (const event of data.history || []) this.onAttackResult(event);
      this.replaying = false;
      if (data.result) this.onGameOver(data.result);
    },
    onTurnChange(data) {
      this.selectedTarget = null;
      this.currentTurn = data.currentTurn;
      this.isAttacking = false;
      this.setDeadline(data.turnMs);
      if (data.continueTurn && data.currentTurn === this.myId) this.addLog('击落机头，继续攻击', 'sink');
    },
    onTurnSync(data) {
      this.currentTurn = data.currentTurn;
      this.setDeadline(data.remainingMs, this.turnTotal);
    },
    onAttackResult(data) {
      const { row, col } = data.position || {};
      const k = key(row, col);
      const label = `${col}${row}`;
      const resultText = { miss: '未命中', hit: '命中机身', sink: '击落一架飞机' }[data.result] || data.result;
      this.lastAttack = { ...data.position, attacker: data.attacker };
      this.lastAttackText = `${data.attacker === this.myId ? '你' : this.enemyName}攻击 ${label}：${resultText}${data.auto ? '（超时代打）' : ''}`;
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
        this.addLog(`${data.auto ? '（超时代打）' : ''}攻击 ${label}：${resultText}`, data.result, 'me');
      } else {
        this.incoming = { ...this.incoming, [k]: data.result };
        if (data.result === 'sink') markSunk(this.me, data.planeIndex);
        if (data.result !== 'miss' && this.activeTab !== 'mine') this.unseenHits += 1;
        this.lastAutoMessage = data.auto ? `${this.enemyName} 超时，系统代其攻击了 ${label}` : '';
        this.addLog(`${data.auto ? '（超时代打）' : ''}攻击 ${label}：${resultText}`, data.result === 'miss' ? 'info' : 'danger', 'op');
      }
      if (!this.replaying) this.playFx(data);
    },

    // ---------- 受击反馈 ----------
    playFx(data) {
      const k = key(data.position?.row, data.position?.col);
      const mine = data.attacker === this.myId;
      if (mine) {
        if (data.result === 'miss') return this.flashCells('fxEnemy', [k], 'fx-pop');
        this.flashCells('fxEnemy', [k], 'fx-pop fx-ring');
        if (data.result === 'sink') {
          const rest = (data.sunkPlane || []).map((c) => key(c.row, c.col)).filter((x) => x !== k);
          this.flashCells('fxEnemy', rest, 'fx-reveal');
          this.showBanner('击落！', '可以继续攻击', 'good');
          this.vibrate(40);
        } else {
          this.vibrate(20);
        }
        return;
      }
      if (data.result === 'miss') return this.flashCells('fxMine', [k], 'fx-pop');
      if (data.result === 'sink') {
        const plane = this.me.planes?.[data.planeIndex];
        const cells = (plane?.coordinates || []).map((c) => key(c.row, c.col));
        this.flashCells('fxMine', cells.length ? cells : [k], 'fx-flash');
        this.showBanner(`${['一', '二', '三'][data.planeIndex] || ''}号机被击落`, '', 'bad');
        this.showVignette(true);
        this.vibrate([60, 40, 60]);
      } else {
        this.flashCells('fxMine', [k], 'fx-flash fx-ring-bad');
        // 只有自己知道是哪架飞机被打中（服务端不会透露给攻击方）
        const index = this.myPlaneCells[k]?.planeIndex;
        const name = index === undefined ? '飞机' : `${['一', '二', '三'][index]}号机`;
        this.showBanner(`${name}中弹`, `${data.position.col}${data.position.row} 被命中`, 'hit');
        this.showVignette(false);
        this.vibrate(40);
      }
      if (this.activeTab !== 'mine') {
        this.tabAlert = false;
        this.$nextTick(() => { this.tabAlert = true; });
        clearTimeout(this.tabAlertTimer);
        this.tabAlertTimer = setTimeout(() => { this.tabAlert = false; }, 2000);
      }
    },
    flashCells(field, keys, cls) {
      if (!keys.length) return;
      const next = { ...this[field] };
      keys.forEach((k) => { next[k] = cls; });
      this[field] = next;
      setTimeout(() => {
        const after = { ...this[field] };
        keys.forEach((k) => { if (after[k] === cls) delete after[k]; });
        this[field] = after;
      }, 900);
    },
    showBanner(text, sub, kind) {
      this.banner = { id: Date.now(), text, sub, kind };
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => { this.banner = null; }, 1300);
    },
    showVignette(strong) {
      this.vignetteStrong = strong;
      this.vignette += 1;
      const id = this.vignette;
      setTimeout(() => { if (this.vignette === id) this.vignette = 0; }, 1000);
    },
    // 手机轻震：只在触屏设备上，浏览器或微应用不支持时静默跳过
    vibrate(pattern) {
      try {
        if (window.matchMedia?.('(pointer: coarse)').matches) navigator.vibrate?.(pattern);
      } catch {
        // 忽略
      }
    },
    onGameOver(data) {
      if (this.gameOver) return;
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
      this.resultWrite = recordResult({
        gameId: data.gameId || this.gameId,
        reason: data.reason,
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
      if (!this.canAttack || this.myShots[key(row, col)] || this.sunkCells[key(row, col)]) return;
      if (this.quickAttack) this.attack(row, col);
      else this.selectedTarget = { row, col };
    },
    attack(row, col) {
      if (this.gameOver) return;
      if (!this.isYourTurn) {
        notify('还没轮到你');
        return;
      }
      if (this.isAttacking) return;
      const k = key(row, col);
      if (this.sunkCells[k]) return;
      if (this.myShots[k]) {
        notify('这个格子已经攻击过了');
        return;
      }
      if (!this.socket.connected) {
        notify('连接中断，请稍候重试');
        return;
      }
      this.isAttacking = true;
      this.selectedTarget = null;
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
      if (this.myShots[k] || this.sunkCells[k] || this.gameOver) return;
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
      if (this.leaving) return;
      if (!this.socket.connected) {
        if (this.gameOver) this.$emit('endGame');
        else notify('连接中断，恢复连接后可退出并结算');
        return;
      }
      this.leaving = true;
      this.socket.emit('leaveRoom', {}, async (res) => {
        if (!res?.success) {
          this.leaving = false;
          notify(res?.message || '退出失败，请重试');
          return;
        }
        if (res.result && !this.gameOver) this.onGameOver(res.result);
        await this.resultWrite;
        this.$emit('endGame');
      });
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
    keyFor: key,
    enemyCellClass(row, col) {
      const k = key(row, col);
      const shot = this.myShots[k];
      const classes = [];
      if (this.fxEnemy[k]) classes.push(this.fxEnemy[k]);
      if (this.selectedTarget?.row === row && this.selectedTarget?.col === col) classes.push('cell-selected-target');
      if (this.lastAttack?.attacker === this.myId && this.lastAttack.row === row && this.lastAttack.col === col) classes.push('cell-latest');
      if (shot) classes.push(`cell-${shot}`);
      else if (this.sunkCells[k]) classes.push('cell-sunk-part');
      else if (this.revealed && this.revealedCells[k]) classes.push('cell-revealed');
      else if (this.marks[k]) classes.push(`cell-mark cell-mark-${this.marks[k]}`);
      if (this.sunkCells[k] && shot) classes.push('cell-in-sunk');
      if (!shot && !this.sunkCells[k] && this.canAttack && this.clickMode === 'attack') classes.push('cell-target');
      return classes;
    },
    enemyCellText(row, col) {
      const k = key(row, col);
      const shot = this.myShots[k];
      if (shot === 'miss') return this.icons.miss;
      if (shot === 'hit') return this.icons.hit;
      if (shot === 'sink') return this.icons.sink;
      // 猜测标记：排除 / 机身 / 机头，用虚线框和同样的符号表示
      if (!shot && !this.sunkCells[k] && this.marks[k]) return { miss: '·', hit: this.icons.hit, sink: this.icons.sink }[this.marks[k]];
      return '';
    },
    myCellClass(row, col) {
      const k = key(row, col);
      const cell = this.myPlaneCells[k];
      const classes = [];
      if (this.fxMine[k]) classes.push(this.fxMine[k]);
      if (this.lastAttack && this.lastAttack.attacker !== this.myId && this.lastAttack.row === row && this.lastAttack.col === col) classes.push('cell-latest');
      if (cell) {
        classes.push('cell-plane', `pi-${cell.planeIndex}`);
        if (cell.isHead) classes.push('cell-head');
        if (this.me.planes?.[cell.planeIndex]?.sunk) classes.push('cell-plane-sunk');
      }
      const hit = this.incoming[k];
      if (hit) classes.push(`cell-incoming-${hit}`);
      return classes;
    },
    myCellText(row, col) {
      const hit = this.incoming[key(row, col)];
      if (hit === 'miss') return this.icons.miss;
      if (hit === 'hit') return this.icons.hit;
      if (hit === 'sink') return this.icons.sink;
      return '';
    },
    // 结算页缩略图
    revealMiniClass(cell) {
      const plane = this.revealedCells[cell.k];
      const shot = this.myShots[cell.k];
      return [plane ? `plane pi-${plane.planeIndex}` : '', plane?.isHead ? 'head' : '', shot && shot !== 'miss' ? 'shot' : ''];
    },
    myMiniClass(cell) {
      const plane = this.myPlaneCells[cell.k];
      const hit = this.incoming[cell.k];
      return [plane ? `plane pi-${plane.planeIndex}` : '', plane?.isHead ? 'head' : '', hit && hit !== 'miss' ? 'shot' : ''];
    },
  },
};
</script>
<style scoped>
.game-view {
  display: grid;
  gap: 18px;
}

/* ---------- 状态栏 ---------- */
.game-status {
  position: sticky;
  top: 70px;
  z-index: 20;
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr) auto auto;
  align-items: center;
  gap: 22px;
  padding: 14px 20px;
}

.game-status.is-my-turn {
  border-color: color-mix(in srgb, var(--sk-accent) 60%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--sk-accent) 22%, var(--sk-surface)), var(--sk-surface));
}

.status-text {
  font-family: var(--sk-font-title);
  font-size: 18px;
  font-weight: 900;
  white-space: nowrap;
}

.timer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.timer-bar {
  flex: 1;
  height: 6px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--sk-surface-2);
}

.timer-bar i {
  display: block;
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--sk-accent), var(--sk-accent-2));
  transition: width 0.25s linear;
}

.timer-text {
  min-width: 36px;
  color: var(--sk-accent);
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.timer.urgent .timer-bar i {
  background: var(--sk-warning);
}

.timer.urgent .timer-text {
  color: var(--sk-warning);
  animation: blink 1s steps(2) infinite;
}

.fleets {
  display: flex;
  gap: 18px;
  color: var(--sk-text-dim);
  white-space: nowrap;
}

.fleets b {
  color: var(--sk-text);
}

.dots {
  display: inline-flex;
  gap: 4px;
  margin-left: 6px;
  vertical-align: middle;
}

.dots i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--sk-success);
}

.dots i.down {
  background: var(--sk-danger);
  opacity: 0.45;
}

.status-note {
  grid-column: 1 / -1;
  padding: 6px 12px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
  color: var(--sk-text-dim);
  font-size: 13px;
}

.status-note.warn {
  background: color-mix(in srgb, var(--sk-warning) 16%, transparent);
  color: var(--sk-warning);
}

/* ---------- 三栏战场 ---------- */
.board-tabs {
  display: none;
}

.battle {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: start;
}

.panel {
  min-width: 0;
  padding: 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.panel-head h3 {
  font-size: 16px;
  font-weight: 800;
}

.mode-seg button {
  min-height: 30px;
  padding: 2px 14px;
}

.mode-seg button.on {
  background: var(--sk-accent);
  color: var(--sk-accent-ink);
}

.hint {
  margin-bottom: 10px;
  min-height: 1.5em;
}

/* 棋盘：坐标 + 10×10，正方形，随栏宽缩放 */
.board {
  display: grid;
  grid-template-columns: 18px 1fr;
  grid-template-rows: 18px auto;
}

.col-labels,
.row-labels {
  display: grid;
  color: var(--sk-text-dim);
  font-size: 10px;
  text-align: center;
}

.col-labels {
  grid-column: 2;
  grid-template-columns: repeat(10, 1fr);
  align-items: center;
}

.row-labels {
  grid-row: 2;
  grid-template-rows: repeat(10, 1fr);
  align-items: center;
}

.grid {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-template-rows: repeat(10, 1fr);
  aspect-ratio: 1;
  gap: var(--sk-grid-gap);
  padding: var(--sk-grid-gap);
  border-radius: calc(var(--sk-cell-radius) + 6px);
  touch-action: manipulation;
}

.grid.enemy {
  background: var(--sk-enemy-line);
  --cell-bg: var(--sk-enemy-cell);
}

.grid.mine {
  background: var(--sk-mine-line);
  --cell-bg: var(--sk-mine-cell);
}

/* 雷达特效：对方棋盘中心光晕 */
html[data-fx-radar] .grid.enemy {
  background-image: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--sk-accent) 22%, transparent), transparent 70%);
}

html[data-fx-dashed-grid] .grid {
  border: 2px solid var(--sk-enemy-line);
}

html[data-fx-dashed-grid] .grid.mine {
  border-color: var(--sk-mine-line);
}

.cell {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: var(--sk-cell-radius);
  background: var(--cell-bg);
  color: var(--sk-text);
  font-size: clamp(11px, 1.4vw, 17px);
  font-weight: 800;
  line-height: 1;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

html[data-fx-dashed-grid] .cell {
  border: 0.5px dashed var(--sk-enemy-line);
}

html[data-fx-dashed-grid] .grid.mine .cell {
  border-color: var(--sk-mine-line);
}

button.cell {
  cursor: default;
}

button.cell:disabled {
  opacity: 1;
}

.grid.attackable .cell-target {
  cursor: crosshair;
}

/* 电脑端悬停预选：显示坐标 */
@media (hover: hover) {
  .grid.attackable .cell-target:hover {
    outline: 2px solid var(--sk-accent);
    outline-offset: -2px;
  }

  .grid.attackable .cell-target:hover:empty::after {
    content: attr(data-coord);
    color: var(--sk-accent);
    font-size: 10px;
  }
}

.cell-selected-target {
  outline: 3px solid var(--sk-accent) !important;
  outline-offset: -3px;
  background: color-mix(in srgb, var(--sk-accent) 22%, var(--cell-bg));
}

.cell-selected-target:empty::after {
  content: attr(data-coord);
  color: var(--sk-accent);
  font-size: 10px;
}

/* 攻击结果 */
.cell-pending {
  background: color-mix(in srgb, var(--sk-warning) 25%, var(--cell-bg));
  animation: pending 0.8s infinite alternate;
}

.cell-miss,
.cell-incoming-miss {
  color: var(--sk-miss);
}

.cell-miss:empty::after,
.cell-incoming-miss:empty::after {
  content: '';
  width: 32%;
  height: 32%;
  border-radius: 50%;
  border: 2px solid var(--sk-miss);
}

.cell-hit {
  background: var(--sk-hit-bg);
  color: var(--sk-hit);
}

.cell-incoming-hit {
  color: var(--sk-hit);
}

.cell-sink,
.cell-incoming-sink {
  background: var(--sk-sink) !important;
  color: var(--sk-sink-ink);
}

html[data-fx-glow] .cell-hit,
html[data-fx-glow] .cell-incoming-hit {
  text-shadow: 0 0 8px color-mix(in srgb, var(--sk-hit) 80%, transparent);
}

html[data-fx-glow] .cell-sink,
html[data-fx-glow] .cell-incoming-sink {
  box-shadow: 0 0 12px color-mix(in srgb, var(--sk-sink) 80%, transparent);
}

.cell-sunk-part {
  background: var(--sk-wreck);
}

.cell-hit.cell-in-sunk {
  background: color-mix(in srgb, var(--sk-wreck) 60%, var(--sk-hit-bg));
}

.cell-revealed {
  background: color-mix(in srgb, var(--sk-danger) 20%, var(--cell-bg));
  outline: 1px dashed var(--sk-danger);
  outline-offset: -3px;
}

.cell-mark {
  color: var(--sk-mark);
  font-size: 0.8em;
  outline: 1.5px dashed var(--sk-mark);
  outline-offset: -4px;
}

/* 最近一次攻击：描边 + 闪动圆圈 */
.cell-latest {
  box-shadow: inset 0 0 0 2px var(--sk-latest);
}

html[data-fx-pulse] .cell-latest::before {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: calc(var(--sk-cell-radius) + 3px);
  border: 2px solid var(--sk-latest);
  animation: ping 1.4s ease-out infinite;
  pointer-events: none;
}

/* 我的飞机：三种颜色，机头原色 + 圆点 */
.cell.pi-0 { --plane: var(--sk-plane-1); }
.cell.pi-1 { --plane: var(--sk-plane-2); }
.cell.pi-2 { --plane: var(--sk-plane-3); }

.cell-plane {
  background: color-mix(in srgb, var(--plane) 58%, var(--sk-mine-cell));
}

.cell-plane.cell-head {
  background: var(--plane);
}

.cell-plane.cell-head:empty::before {
  content: '';
  width: 32%;
  height: 32%;
  border-radius: 50%;
  background: var(--sk-head-dot);
}

.cell-plane-sunk {
  filter: grayscale(0.85);
  opacity: 0.6;
}

.attack-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.quick-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sk-text-dim);
  font-size: 13px;
  cursor: pointer;
}

.quick-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--sk-accent);
}

.confirm-attack {
  min-width: 140px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 14px;
  margin-top: 12px;
  color: var(--sk-text-dim);
  font-size: 12px;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.lg {
  --cell-bg: var(--sk-enemy-cell);
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-style: normal;
}

/* ---------- 对局记录 ---------- */
.log-panel {
  position: sticky;
  top: 160px;
}

.last-attack {
  margin-bottom: 10px;
  padding: 9px 12px;
  border: 1px solid var(--sk-latest);
  border-radius: var(--sk-radius-sm);
  background: color-mix(in srgb, var(--sk-latest) 12%, transparent);
  font-size: 13px;
  font-weight: 600;
}

.log {
  list-style: none;
  display: grid;
  gap: 6px;
  max-height: 460px;
  overflow-y: auto;
}

.log li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
  font-size: 12px;
}

.tag {
  flex-shrink: 0;
  max-width: 5em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}

.who-me .tag {
  background: color-mix(in srgb, var(--sk-accent) 20%, transparent);
  color: var(--sk-accent);
}

.who-op .tag {
  background: color-mix(in srgb, var(--sk-hit) 18%, transparent);
  color: var(--sk-hit);
}

.log-sink,
.log-success {
  color: var(--sk-success);
  font-weight: 700;
}

.log-danger {
  color: var(--sk-danger);
}

.log-warn {
  color: var(--sk-warning);
}

.log-system {
  color: var(--sk-text-dim);
}

/* ---------- 结算 ---------- */
.game-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--sk-overlay);
  backdrop-filter: blur(3px);
}

.game-result {
  display: grid;
  grid-template-columns: 210px 1fr;
  gap: 28px;
  align-items: center;
  width: min(100%, 680px);
  padding: 28px 32px;
  border: 1px solid var(--sk-line);
  border-radius: calc(var(--sk-radius) + 6px);
  background: var(--sk-surface);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
}

.result-hero {
  text-align: center;
}

.medal {
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  margin: 0 auto 12px;
  border-radius: 50%;
  font-size: 50px;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--sk-danger) 25%, #fff), var(--sk-danger) 70%);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--sk-danger) 18%, transparent);
}

.game-result.win .medal {
  background: radial-gradient(circle at 35% 30%, #fff5cf, #ffc94a 55%, #d9901a);
  box-shadow: 0 0 0 8px rgba(255, 201, 74, 0.2), 0 12px 34px rgba(255, 181, 71, 0.45);
}

.result-hero h2 {
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 4px;
  color: var(--sk-danger);
}

.game-result.win .result-hero h2 {
  color: #f5b82e;
}

html[data-fx-glow] .game-result.win .result-hero h2 {
  text-shadow: 0 0 20px rgba(255, 201, 74, 0.55);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.kpis div {
  display: grid;
  padding: 12px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
  text-align: center;
}

.kpis b {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}

.kpis span {
  color: var(--sk-text-dim);
  font-size: 11px;
}

.minis {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
}

.minis > div {
  display: grid;
  gap: 4px;
  justify-items: center;
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 1px;
  width: 128px;
  aspect-ratio: 1;
  padding: 1px;
  border-radius: 6px;
}

.mini-grid.enemy {
  background: var(--sk-enemy-line);
  --cell-bg: var(--sk-enemy-cell);
}

.mini-grid.mine {
  background: var(--sk-mine-line);
  --cell-bg: var(--sk-mine-cell);
}

.mini {
  border-radius: 2px;
  background: var(--cell-bg);
}

.mini.pi-0 { --plane: var(--sk-plane-1); }
.mini.pi-1 { --plane: var(--sk-plane-2); }
.mini.pi-2 { --plane: var(--sk-plane-3); }

.mini.plane {
  background: color-mix(in srgb, var(--plane) 58%, var(--cell-bg));
}

.mini.plane.head {
  background: var(--plane);
}

.mini.shot {
  box-shadow: inset 0 0 0 1.5px var(--sk-hit);
}

.rematch {
  margin-bottom: 10px;
  color: var(--sk-success);
  font-weight: 700;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.result-actions .btn-primary {
  flex: 1;
}

.after-game-bar {
  position: sticky;
  bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
}

/* ---------- 受击反馈（克制版） ---------- */
.fx-pop {
  z-index: 2;
  animation: fx-pop 0.35s ease-out;
}

/* 冲击环用 box-shadow 扩散，不占用格子的伪元素 */
.fx-ring {
  animation: fx-pop 0.35s ease-out, fx-ring 0.6s ease-out;
}

.fx-ring-bad {
  animation: fx-flash 0.8s ease-out, fx-ring-bad 0.6s ease-out;
}

.fx-reveal {
  animation: fx-reveal 0.6s ease-out;
}

.fx-flash {
  z-index: 2;
  animation: fx-flash 0.8s ease-out;
}

.fx-vignette {
  position: fixed;
  inset: 0;
  z-index: 900;
  pointer-events: none;
  animation: fx-vignette 0.7s ease-out forwards;
}

.fx-vignette.strong {
  animation: fx-vignette-strong 1s ease-out forwards;
}

.fx-banner {
  position: fixed;
  left: 50%;
  top: 22%;
  z-index: 950;
  display: grid;
  justify-items: center;
  padding: 10px 22px;
  border-radius: 999px;
  font-family: var(--sk-font-title);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 2px;
  pointer-events: none;
  transform: translateX(-50%);
  animation: fx-banner 1.3s ease forwards;
}

.fx-banner small {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  opacity: 0.85;
}

.fx-banner.good {
  background: var(--sk-accent);
  color: var(--sk-accent-ink);
  box-shadow: var(--sk-glow);
}

.fx-banner.bad {
  background: var(--sk-danger);
  color: #fff;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--sk-danger) 40%, transparent);
}

.fx-banner.hit {
  padding: 8px 18px;
  border: 1.5px solid var(--sk-danger);
  background: var(--sk-surface);
  color: var(--sk-danger);
  font-size: 17px;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--sk-danger) 25%, transparent);
}

.fx-tab-alert {
  animation: fx-tab 0.9s ease-in-out 2;
}

@keyframes fx-pop {
  0% { transform: scale(0.6); }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

@keyframes fx-ring {
  from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--sk-hit) 70%, transparent); }
  to { box-shadow: 0 0 0 10px transparent; }
}

@keyframes fx-ring-bad {
  from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--sk-danger) 70%, transparent); }
  to { box-shadow: 0 0 0 10px transparent; }
}

@keyframes fx-reveal {
  0% { background: var(--sk-sink); }
  100% { background: var(--sk-wreck); }
}

@keyframes fx-flash {
  0%, 25% { background: color-mix(in srgb, var(--sk-danger) 75%, var(--cell-bg)); }
  100% { }
}

@keyframes fx-vignette {
  from { box-shadow: inset 0 0 60px 10px color-mix(in srgb, var(--sk-danger) 35%, transparent); }
  to { box-shadow: inset 0 0 0 0 transparent; }
}

@keyframes fx-vignette-strong {
  from { box-shadow: inset 0 0 90px 20px color-mix(in srgb, var(--sk-danger) 50%, transparent); }
  to { box-shadow: inset 0 0 0 0 transparent; }
}

@keyframes fx-banner {
  0% { opacity: 0; transform: translate(-50%, 8px) scale(0.92); }
  15% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -6px); }
}

@keyframes fx-tab {
  50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--sk-danger) 55%, transparent); }
}

@keyframes ping {
  from { transform: scale(0.85); opacity: 0.9; }
  to { transform: scale(1.45); opacity: 0; }
}

@keyframes pending {
  from { opacity: 0.55; }
  to { opacity: 1; }
}

@keyframes blink {
  50% { opacity: 0.5; }
}

/* ---------- 中等宽度：记录栏移到下方 ---------- */
@media (max-width: 1180px) {
  .battle {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  }

  .log-panel {
    position: static;
    grid-column: 1 / -1;
  }

  .log {
    max-height: 220px;
  }
}

/* ---------- 手机：一次只显示一个棋盘 ---------- */
@media (max-width: 760px) {
  .game-view {
    gap: 10px;
  }

  .game-status {
    top: 54px;
    grid-template-columns: 1fr auto;
    gap: 8px 12px;
    padding: 10px 12px;
  }

  .status-text {
    font-size: 15px;
    white-space: normal;
  }

  .timer {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .fleets {
    grid-column: 1 / -1;
    grid-row: 3;
    gap: 14px;
    font-size: 12px;
  }

  .game-status > .btn {
    grid-column: 2;
    grid-row: 1;
  }

  .board-tabs {
    display: grid;
  }

  .board-tabs button {
    position: relative;
    min-height: 38px;
    font-weight: 700;
  }

  .tab-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-left: 6px;
    border-radius: 50%;
    background: var(--sk-success);
    vertical-align: middle;
  }

  .tab-badge {
    display: inline-block;
    min-width: 18px;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--sk-danger);
    color: #fff;
    font-size: 11px;
    line-height: 18px;
  }

  .battle {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .panel {
    padding: 10px;
  }

  .tab-hidden {
    display: none;
  }

  .board {
    grid-template-columns: 14px 1fr;
    grid-template-rows: 14px auto;
  }

  .cell {
    font-size: clamp(11px, 3.6vw, 15px);
  }

  .log {
    max-height: 180px;
  }

  .game-result {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 20px 18px;
  }

  .medal {
    width: 80px;
    height: 80px;
    font-size: 36px;
  }

  .result-hero h2 {
    font-size: 26px;
  }

  .minis {
    justify-content: center;
  }

  .mini-grid {
    width: 118px;
  }
}
</style>
