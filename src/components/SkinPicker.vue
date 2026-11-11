<template>
  <div class="picker-backdrop" @click.self="$emit('close')">
    <div class="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <div class="picker-head">
        <div>
          <h2 id="picker-title">选择皮肤</h2>
          <p class="muted">只改变颜色、字体和图标，操作方式不变。选择会自动保存。</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" @click="$emit('close')">关闭</button>
      </div>

      <button
        type="button"
        class="system-option"
        :class="{ on: state.choice === systemId }"
        @click="choose(systemId)"
      >
        <span class="radio" aria-hidden="true"></span>
        <span>
          <b>跟随系统</b>
          <span class="muted">系统深色时用「{{ darkName }}」，浅色时用「{{ lightName }}」</span>
        </span>
      </button>

      <div class="skin-grid">
        <button
          v-for="skin in skins"
          :key="skin.id"
          type="button"
          class="skin-card"
          :class="{ on: state.choice === skin.id }"
          :style="vars(skin)"
          :aria-pressed="state.choice === skin.id"
          @click="choose(skin.id)"
        >
          <span class="preview" :class="{ paper: skin.effects.paper, dashed: skin.effects.dashedGrid }">
            <span class="mini-grid">
              <span v-for="(cell, i) in sample" :key="i" class="mini-cell" :class="cell">{{ glyph(skin, cell) }}</span>
            </span>
            <span class="mini-btn">开始</span>
          </span>
          <span class="skin-meta">
            <span class="skin-name">
              {{ skin.name }}
              <span v-if="state.choice === skin.id" class="chip chip-accent">使用中</span>
            </span>
            <span class="muted">{{ skin.description }}</span>
            <span class="muted author">作者：{{ skin.author }} · {{ skin.mode === 'dark' ? '深色' : '浅色' }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { SKINS, skinState, setSkin, SYSTEM_SKIN } from '../skins/index.js';
import { TOKENS } from '../skins/schema.js';

// 5×5 的示意棋盘：一架飞机 + 几次攻击结果
const SAMPLE = [
  '', 'p1', 'p1 head', 'p1', '',
  'miss', '', 'p1', '', 'hit',
  '', 'p2', 'p1', 'p2', '',
  'sink', '', '', 'p2 head', 'miss',
  '', 'mark', 'p3', 'p3', 'p3 head',
];

export default {
  name: 'SkinPicker',
  emits: ['close'],
  data() {
    return { skins: SKINS, state: skinState, systemId: SYSTEM_SKIN, sample: SAMPLE };
  },
  computed: {
    darkName() {
      return SKINS.find((s) => s.mode === 'dark')?.name || SKINS[0]?.name;
    },
    lightName() {
      return SKINS.find((s) => s.mode === 'light')?.name || SKINS[0]?.name;
    },
  },
  mounted() {
    this.onKey = (event) => {
      if (event.key === 'Escape') this.$emit('close');
    };
    document.addEventListener('keydown', this.onKey);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.onKey);
  },
  methods: {
    choose(id) {
      setSkin(id);
    },
    // 卡片内局部套用该皮肤的变量，缩略图即真实效果
    vars(skin) {
      return Object.fromEntries(TOKENS.map((t) => [`--sk-${t.name}`, skin.tokens[t.name]]));
    },
    glyph(skin, cell) {
      if (cell === 'hit') return skin.icons.hit;
      if (cell === 'sink') return skin.icons.sink;
      if (cell === 'mark') return skin.icons.mark;
      if (cell === 'miss') return skin.icons.miss;
      return '';
    },
  },
};
</script>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--sk-overlay);
}

.picker {
  width: min(100%, 860px);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 22px;
  border: 1px solid var(--sk-line);
  border-radius: var(--sk-radius);
  background: var(--sk-surface);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}

.picker-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.picker-head h2 {
  font-size: 20px;
  margin-bottom: 2px;
}

.system-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid var(--sk-line);
  border-radius: var(--sk-radius-sm);
  background: var(--sk-surface-2);
  text-align: left;
  cursor: pointer;
}

.system-option > span:last-child {
  display: grid;
}

.radio {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--sk-text-dim);
}

.system-option.on {
  border-color: var(--sk-accent);
}

.system-option.on .radio {
  border-color: var(--sk-accent);
  box-shadow: inset 0 0 0 4px var(--sk-surface-2), inset 0 0 0 9px var(--sk-accent);
}

.skin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 14px;
}

/* 每张卡片使用自己皮肤的变量 */
.skin-card {
  display: grid;
  overflow: hidden;
  padding: 0;
  border: 2px solid var(--sk-line);
  border-radius: var(--sk-radius);
  background: var(--sk-surface);
  color: var(--sk-text);
  font-family: var(--sk-font);
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.skin-card.on {
  border-color: var(--sk-accent);
  box-shadow: var(--sk-glow);
}

@media (hover: hover) {
  .skin-card:hover {
    transform: translateY(-2px);
  }
}

.preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  background: var(--sk-bg);
}

.preview.paper {
  background-image: linear-gradient(rgba(150, 125, 80, 0.12) 1px, transparent 1px);
  background-size: 100% 12px;
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(5, 22px);
  gap: var(--sk-grid-gap);
  padding: var(--sk-grid-gap);
  border-radius: 6px;
  background: var(--sk-mine-line);
}

.mini-cell {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--sk-cell-radius);
  background: var(--sk-mine-cell);
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.preview.dashed .mini-grid {
  border: 1.5px solid var(--sk-mine-line);
}

.preview.dashed .mini-cell {
  border: 0.5px dashed var(--sk-mine-line);
}

.mini-cell.p1 { background: color-mix(in srgb, var(--sk-plane-1) 55%, var(--sk-mine-cell)); }
.mini-cell.p2 { background: color-mix(in srgb, var(--sk-plane-2) 55%, var(--sk-mine-cell)); }
.mini-cell.p3 { background: color-mix(in srgb, var(--sk-plane-3) 55%, var(--sk-mine-cell)); }
.mini-cell.p1.head { background: var(--sk-plane-1); }
.mini-cell.p2.head { background: var(--sk-plane-2); }
.mini-cell.p3.head { background: var(--sk-plane-3); }

.mini-cell.head::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sk-head-dot);
}

.mini-cell.miss:empty::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--sk-miss);
}

.mini-cell.miss { color: var(--sk-miss); }
.mini-cell.hit { background: var(--sk-hit-bg); color: var(--sk-hit); }
.mini-cell.sink { background: var(--sk-sink); color: var(--sk-sink-ink); }
.mini-cell.mark { color: var(--sk-mark); outline: 1px dashed var(--sk-mark); outline-offset: -3px; }

.mini-btn {
  padding: 8px 14px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-accent);
  color: var(--sk-accent-ink);
  box-shadow: var(--sk-glow);
  font-size: 12px;
  font-weight: 800;
}

.skin-meta {
  display: grid;
  gap: 2px;
  padding: 12px 14px 14px;
}

.skin-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--sk-font-title);
  font-size: 16px;
  font-weight: 800;
}

.author {
  margin-top: 4px;
  font-size: 11px;
}
</style>
