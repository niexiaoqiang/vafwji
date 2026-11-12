<template>
  <div class="tut-backdrop" @click.self="close">
    <div ref="dialog" class="tut" role="dialog" aria-modal="true" aria-labelledby="tut-title" tabindex="-1">
      <div class="tut-head">
        <span class="tut-step">第 {{ step + 1 }} / {{ total }} 步</span>
        <span class="dots" aria-hidden="true"><i v-for="n in total" :key="n" :class="{ on: n - 1 <= step }"></i></span>
        <button v-if="step < total - 1" type="button" class="skip" @click="step = total - 1">跳过教程</button>
        <button v-else type="button" class="skip" @click="close">关闭</button>
      </div>

      <div class="tut-body">
        <!-- ① 目标 -->
        <template v-if="step === 0">
          <h2 id="tut-title">目标：先击落对方 3 架飞机</h2>
          <p>你和对手各在 10×10 的棋盘上藏好 <b>3 架飞机</b>，然后轮流攻击对方棋盘的格子。<b>先击落对方全部 3 架的一方获胜。</b></p>
          <div class="illus">
            <figure>
              <div class="mini mine"><i v-for="(c, i) in goalMine" :key="i" class="m" :class="c"></i></div>
              <figcaption>我的棋盘：藏飞机</figcaption>
            </figure>
            <span class="vs">VS</span>
            <figure>
              <div class="mini enemy"><i v-for="(c, i) in goalEnemy" :key="i" class="m" :class="c">{{ glyph(c) }}</i></div>
              <figcaption>对方棋盘：找飞机</figcaption>
            </figure>
          </div>
        </template>

        <!-- ② 认识飞机 -->
        <template v-else-if="step === 1">
          <h2 id="tut-title">认识飞机</h2>
          <p>每架飞机 <b>10 格</b>，可以朝上下左右任意方向摆放；三架飞机要完整放在棋盘内，<b>不能重叠</b>。开局会自动帮你摆好，你也可以拖动、旋转。</p>
          <div class="illus">
            <div class="mini mine big"><i v-for="(c, i) in shapeCells" :key="i" class="m" :class="c"></i></div>
            <ul class="parts">
              <li><span class="sw head"></span>机头 1 格（带圆点）<b class="key">最关键</b></li>
              <li><span class="sw body"></span>机翼 5 格 · 机身 1 格 · 尾翼 3 格</li>
            </ul>
          </div>
        </template>

        <!-- ③ 练习 -->
        <template v-else-if="step === 2">
          <h2 id="tut-title">试一试：找到并击落这架飞机</h2>
          <ul class="results">
            <li><span class="chip-cell miss">{{ icons.miss }}</span><span>空心圈：没打中，换对方攻击</span></li>
            <li><span class="chip-cell hit">{{ icons.hit }}</span><span>打中机身：飞机就在附近，但还没击落</span></li>
            <li><span class="chip-cell sink">{{ icons.sink }}</span><span>打中机头：<b>击落！并且可以继续攻击</b></span></li>
          </ul>
          <div class="practice">
            <div class="pboard" role="grid" aria-label="练习棋盘">
              <button
                v-for="cell in practiceCells"
                :key="cell.k"
                type="button"
                class="pcell"
                :class="practiceClass(cell)"
                :disabled="practiceDone || !!shots[cell.k]"
                :aria-label="`第 ${cell.r + 1} 行第 ${cell.c + 1} 列`"
                @click="shoot(cell)"
              >{{ practiceGlyph(cell) }}</button>
            </div>
            <p class="coach" :class="coachKind" role="status">{{ coachText }}</p>
          </div>
        </template>

        <!-- ④ 技巧 -->
        <template v-else-if="step === 3">
          <h2 id="tut-title">三个小技巧</h2>
          <ul class="tips">
            <li><b aria-hidden="true">🎯</b><span>打中机身后，<b>顺着飞机的形状</b>去找机头：机头总在机翼中间、尾翼的另一端。</span></li>
            <li><b aria-hidden="true">✏️</b><span>切到「标记」模式，可以在对方棋盘上做记号，帮你推理（只有你自己看得到）。</span></li>
            <li><b aria-hidden="true">⏱</b><span>每回合有倒计时，超时系统会替你随机攻击；连续超时 3 次判负。</span></li>
          </ul>
        </template>

        <!-- ⑤ 完成 -->
        <template v-else>
          <div class="ready">
            <div class="ready-icon" aria-hidden="true">✈</div>
            <h2 id="tut-title">准备好了！</h2>
            <p>先和电脑练一局，熟悉之后再去和真人对战。</p>
            <div class="ready-actions">
              <button v-if="canStartAi" type="button" class="btn btn-primary btn-lg" @click="startAi">开始人机练习（简单）</button>
              <button type="button" class="btn btn-lg" @click="close">{{ canStartAi ? '回到大厅' : '继续游戏' }}</button>
            </div>
            <p class="muted ready-foot">
              随时可以点顶栏「教程」重看。
              <button type="button" class="link" @click="$emit('openRules')">查看完整规则</button>
            </p>
          </div>
        </template>
      </div>

      <div v-if="step < total - 1" class="tut-foot">
        <button v-if="step > 0" type="button" class="btn" @click="step -= 1">上一步</button>
        <button type="button" class="btn btn-primary next" :disabled="step === 2 && !practiceDone" @click="step += 1">
          {{ step === 2 && !practiceDone ? '先击落飞机' : '下一步' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { buildPlane, COLUMNS } from '../../shared/planes.js';
import { skinState } from '../skins/index.js';

const N = 7;
// 练习用的飞机：朝上，机翼中心在第 3 行第 C 列（7×7 棋盘内）
const PRACTICE_PLANE = buildPlane(3, 3, 0).coordinates.map((c) => ({
  r: c.row - 1,
  c: COLUMNS.indexOf(c.col),
  head: c.isHead,
}));

// 5×5 示意图：一架朝上的飞机
const SHAPE_5 = new Map([
  ['0,2', 'p h'], ['1,0', 'p'], ['1,1', 'p'], ['1,2', 'p'], ['1,3', 'p'], ['1,4', 'p'],
  ['2,2', 'p'], ['3,1', 'p'], ['3,2', 'p'], ['3,3', 'p'],
]);
const ENEMY_5 = new Map([['2,1', 'x'], ['0,4', 'o'], ['3,3', 'o'], ['2,2', 's']]);
const grid5 = (map) => Array.from({ length: 25 }, (_, i) => map.get(`${Math.floor(i / 5)},${i % 5}`) || '');

export default {
  name: 'TutorialDialog',
  props: {
    canStartAi: { type: Boolean, default: false },
  },
  emits: ['close', 'startAi', 'openRules'],
  data() {
    return {
      step: 0,
      total: 5,
      goalMine: grid5(SHAPE_5),
      goalEnemy: grid5(ENEMY_5),
      shapeCells: grid5(SHAPE_5),
      practiceCells: Array.from({ length: N * N }, (_, i) => ({ r: Math.floor(i / N), c: i % N, k: i })),
      shots: {}, // 格子序号 -> miss | hit | sink
      hints: {},
      practiceDone: false,
      coachText: '下面藏着一架飞机。点格子攻击，试着把它击落。',
      coachKind: '',
    };
  },
  computed: {
    icons() {
      return skinState.skin.icons;
    },
  },
  mounted() {
    this.onKey = (event) => {
      if (event.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.onKey);
    this.$refs.dialog?.focus();
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.onKey);
  },
  methods: {
    close() {
      this.$emit('close');
    },
    startAi() {
      this.$emit('startAi');
    },
    glyph(kind) {
      if (kind === 'x') return this.icons.hit;
      if (kind === 's') return this.icons.sink;
      return '';
    },
    partAt(cell) {
      return PRACTICE_PLANE.find((p) => p.r === cell.r && p.c === cell.c);
    },
    shoot(cell) {
      if (this.practiceDone || this.shots[cell.k]) return;
      const count = Object.keys(this.shots).length + 1;
      const part = this.partAt(cell);
      this.hints = {};
      if (!part) {
        this.shots = { ...this.shots, [cell.k]: 'miss' };
        this.coachKind = '';
        this.coachText = count >= 4 ? '提示：飞机很宽，试试棋盘中间一带。' : '没打中（空心圈）。实战中这时会换对手攻击，再试试别的格子。';
        // 多次没打中：高亮机翼中心，保证每个人都能完成
        if (count >= 6) this.hints = { [PRACTICE_PLANE[1].r * N + PRACTICE_PLANE[1].c]: true };
      } else if (!part.head) {
        this.shots = { ...this.shots, [cell.k]: 'hit' };
        this.coachKind = 'warn';
        this.coachText = '打中机身了！但只有机头才算击落。机头在机翼中间、尾翼的另一端，往那边找找。';
        const head = PRACTICE_PLANE.find((p) => p.head);
        if (count >= 5) this.hints = { [head.r * N + head.c]: true };
      } else {
        this.shots = { ...this.shots, [cell.k]: 'sink' };
        this.practiceDone = true;
        this.coachKind = 'good';
        this.coachText = `击落！用了 ${count} 次攻击。击落后整架飞机会显示出来，而且你可以继续攻击。`;
      }
    },
    practiceClass(cell) {
      const shot = this.shots[cell.k];
      const classes = [];
      if (shot) classes.push(shot, 'pop');
      else if (this.practiceDone && this.partAt(cell)) classes.push('wreck');
      if (this.hints[cell.k]) classes.push('hint');
      return classes;
    },
    practiceGlyph(cell) {
      const shot = this.shots[cell.k];
      if (shot === 'hit') return this.icons.hit;
      if (shot === 'sink') return this.icons.sink;
      if (shot === 'miss') return this.icons.miss;
      return '';
    },
  },
};
</script>

<style scoped>
.tut-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2050;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--sk-overlay);
}

.tut {
  display: flex;
  flex-direction: column;
  width: min(100%, 620px);
  max-height: calc(100vh - 32px);
  overflow: hidden;
  border: 1px solid var(--sk-line);
  border-radius: calc(var(--sk-radius) + 4px);
  background: var(--sk-surface);
  color: var(--sk-text);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  outline: none;
}

.tut-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px 0;
}

.tut-step {
  color: var(--sk-text-dim);
  font-size: 12px;
  font-weight: 700;
}

.dots {
  display: flex;
  gap: 5px;
}

.dots i {
  width: 18px;
  height: 5px;
  border-radius: 3px;
  background: var(--sk-surface-2);
}

.dots i.on {
  background: var(--sk-accent);
}

.skip,
.link {
  border: 0;
  background: none;
  color: var(--sk-text-dim);
  font-size: 13px;
  cursor: pointer;
}

.skip {
  margin-left: auto;
}

.link {
  color: var(--sk-accent);
  text-decoration: underline;
}

.tut-body {
  padding: 14px 22px 6px;
  overflow-y: auto;
}

.tut-body h2 {
  margin-bottom: 6px;
  font-size: 22px;
  font-weight: 900;
}

.tut-body p {
  font-size: 14px;
  line-height: 1.7;
}

.tut-foot {
  display: flex;
  gap: 8px;
  padding: 14px 18px 18px;
}

.tut-foot .next {
  flex: 1;
  min-height: 44px;
}

/* 插图 */
.illus {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin: 14px 0;
}

figure {
  display: grid;
  justify-items: center;
  gap: 6px;
}

figcaption {
  color: var(--sk-text-dim);
  font-size: 12px;
}

.mini {
  display: grid;
  grid-template-columns: repeat(5, 22px);
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
}

.mini.big {
  grid-template-columns: repeat(5, 26px);
}

.mini.mine { background: var(--sk-mine-line); --cell: var(--sk-mine-cell); }
.mini.enemy { background: var(--sk-enemy-line); --cell: var(--sk-enemy-cell); }

.m {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  border-radius: var(--sk-cell-radius);
  background: var(--cell);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.m.p { background: color-mix(in srgb, var(--sk-plane-1) 58%, var(--sk-mine-cell)); }
.m.h { background: var(--sk-plane-1); }
.m.h::before { content: ''; width: 34%; height: 34%; border-radius: 50%; background: var(--sk-head-dot); }
.m.x { background: var(--sk-hit-bg); color: var(--sk-hit); }
.m.s { background: var(--sk-sink); color: var(--sk-sink-ink); }
.m.o::after { content: ''; width: 34%; height: 34%; border-radius: 50%; border: 2px solid var(--sk-miss); }

.vs {
  color: var(--sk-text-dim);
  font-size: 28px;
  font-weight: 900;
}

.parts {
  list-style: none;
  display: grid;
  gap: 8px;
  font-size: 13px;
}

.parts li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sw {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.sw.head { background: var(--sk-plane-1); }
.sw.body { background: color-mix(in srgb, var(--sk-plane-1) 58%, var(--sk-mine-cell)); }
.key { color: var(--sk-danger); }

/* 三种结果 */
.results {
  list-style: none;
  display: grid;
  gap: 8px;
  margin: 10px 0 12px;
}

.results li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
  font-size: 14px;
}

.chip-cell {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  font-weight: 900;
}

.chip-cell.miss { background: var(--sk-enemy-cell); border: 1px solid var(--sk-line); }
.chip-cell.miss:empty::after { content: ''; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--sk-miss); }
.chip-cell.hit { background: var(--sk-hit-bg); color: var(--sk-hit); }
.chip-cell.sink { background: var(--sk-sink); color: var(--sk-sink-ink); }

/* 练习棋盘 */
.practice {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 18px;
  align-items: center;
  margin: 6px 0;
}

.pboard {
  display: grid;
  grid-template-columns: repeat(7, 34px);
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--sk-enemy-line);
}

.pcell {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--sk-cell-radius);
  background: var(--sk-enemy-cell);
  color: var(--sk-text);
  font-size: 15px;
  font-weight: 900;
  cursor: crosshair;
}

.pcell:disabled { cursor: default; }

@media (hover: hover) {
  .pcell:hover:not(:disabled) {
    outline: 2px solid var(--sk-accent);
    outline-offset: -2px;
  }
}

.pcell.miss:empty::after { content: ''; width: 32%; height: 32%; border-radius: 50%; border: 2px solid var(--sk-miss); }
.pcell.miss { color: var(--sk-miss); }
.pcell.hit { background: var(--sk-hit-bg); color: var(--sk-hit); }
.pcell.sink { background: var(--sk-sink); color: var(--sk-sink-ink); }
.pcell.wreck { background: var(--sk-wreck); }
.pcell.hint { box-shadow: inset 0 0 0 2px var(--sk-warning); }
.pcell.pop { animation: tut-pop 0.35s ease-out; }

@keyframes tut-pop {
  0% { transform: scale(0.6); }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.coach {
  min-height: 66px;
  padding: 10px 12px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
  font-size: 14px;
  line-height: 1.6;
}

.coach.warn {
  background: color-mix(in srgb, var(--sk-hit) 12%, transparent);
  color: var(--sk-hit);
  font-weight: 600;
}

.coach.good {
  background: color-mix(in srgb, var(--sk-success) 14%, transparent);
  color: var(--sk-success);
  font-weight: 700;
}

/* 技巧 */
.tips {
  list-style: none;
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.tips li {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
  font-size: 14px;
  line-height: 1.55;
}

.tips li > b {
  font-size: 18px;
}

/* 完成 */
.ready {
  padding: 8px 0 14px;
  text-align: center;
}

.ready-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 10px;
  border-radius: 18px;
  background: var(--sk-accent);
  color: var(--sk-accent-ink);
  font-size: 34px;
  box-shadow: var(--sk-glow);
}

.ready-actions {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.ready-foot {
  margin-top: 12px;
}

/* 手机：从底部弹出的面板 */
@media (max-width: 760px) {
  .tut-backdrop {
    place-items: end stretch;
    padding: 0;
  }

  .tut {
    width: 100%;
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
  }

  .tut-body {
    padding: 12px 16px 4px;
  }

  .tut-body h2 {
    font-size: 19px;
  }

  .practice {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 10px;
  }

  .pboard {
    grid-template-columns: repeat(7, 38px);
  }

  .pcell {
    width: 38px;
    height: 38px;
  }

  .tut-foot {
    padding: 12px 16px max(16px, env(safe-area-inset-bottom));
  }
}
</style>
