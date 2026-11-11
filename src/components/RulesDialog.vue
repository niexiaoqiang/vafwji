<template>
  <div class="rules-backdrop" @click.self="$emit('close')">
    <div class="rules" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <h2 id="rules-title">游戏规则</h2>

      <h3>目标</h3>
      <p>先击落对方全部 3 架飞机的一方获胜。</p>

      <h3>飞机</h3>
      <div class="plane-demo" aria-hidden="true">
        <span></span><span></span><span class="head"></span><span></span><span></span>
        <span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span>
        <span></span><span></span><span class="on"></span><span></span><span></span>
        <span></span><span class="on"></span><span class="on"></span><span class="on"></span><span></span>
      </div>
      <p>每架飞机占 10 格：机头 1 格、机翼 5 格、机身 1 格、尾翼 3 格，可以朝上下左右四个方向。三架飞机都要完整放在 10×10 棋盘内，不能重叠。</p>

      <h3>攻击</h3>
      <ul>
        <li><b class="miss">·</b> 未命中：轮到对方。</li>
        <li><b class="hit">✕</b> 打中机身：轮到对方，但你知道附近有飞机。</li>
        <li><b class="sink">○</b> 打中机头：这架飞机被击落，并且<b>你可以继续攻击</b>。</li>
      </ul>
      <p>只有打中机头才算击落，打满机身不算。</p>
      <p>击落后会公开该架飞机的完整轮廓，残骸不能再次攻击。默认先选坐标再确认，也可开启「快速攻击」。</p>

      <h3>小技巧</h3>
      <ul>
        <li>切到「标记」模式可以在对方棋盘上做记号，推理机头位置。</li>
        <li>每回合限时，超时会由系统随机代打，连续超时 3 次判负。</li>
        <li>断线后 45 秒内重连可以继续对局。</li>
      </ul>

      <button type="button" class="btn btn-primary close" @click="$emit('close')">知道了</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RulesDialog',
  emits: ['close'],
  mounted() {
    this.onKey = (event) => {
      if (event.key === 'Escape') this.$emit('close');
    };
    document.addEventListener('keydown', this.onKey);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.onKey);
  },
};
</script>

<style scoped>
.rules-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--sk-overlay);
}

.rules {
  width: min(100%, 480px);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 22px;
  border: 1px solid var(--sk-line);
  border-radius: var(--sk-radius);
  background: var(--sk-surface);
  color: var(--sk-text);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}

h2 {
  font-size: 20px;
  margin-bottom: 8px;
  color: var(--sk-accent);
}

h3 {
  font-size: 15px;
  margin: 16px 0 6px;
}

p,
li {
  font-size: 14px;
  line-height: 1.7;
}

ul {
  padding-left: 1.2em;
}

.plane-demo {
  display: grid;
  grid-template-columns: repeat(5, 20px);
  gap: 2px;
  margin: 4px 0 8px;
}

.plane-demo span {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--sk-mine-cell);
  border: 1px solid var(--sk-mine-line);
}

.plane-demo .on {
  background: color-mix(in srgb, var(--sk-plane-1) 55%, var(--sk-mine-cell));
}

.plane-demo .head {
  display: grid;
  place-items: center;
  background: var(--sk-plane-1);
}

.plane-demo .head::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sk-head-dot);
}

.miss { color: var(--sk-miss); }
.hit { color: var(--sk-hit); }
.sink { color: var(--sk-sink); }

.close {
  width: 100%;
  margin-top: 18px;
}
</style>
