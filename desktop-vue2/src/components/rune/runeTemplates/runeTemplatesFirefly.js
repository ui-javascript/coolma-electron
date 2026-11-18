// ===== 萤火虫：基于 CSS3 多只随机飞行 + 发光脉冲（参考博客园《使用 CSS3 实现萤火虫发光动画效果》） =====
export const runeTemplatesFirefly = () => {
  return `<template>
  <div class="rune-firefly-demo">
    <div class="rune-firefly-demo__sky">
      <div
        v-for="(fly, idx) in fireflies"
        :key="fly.id"
        class="rune-firefly-demo__firefly"
        :style="fly.style"
        :class="{ 'is-active': activeId === fly.id }"
        @click="onPickFly(fly, idx)"
      />
    </div>

    <div class="rune-firefly-demo__panel">
      <div class="rune-firefly-demo__title">
        <q-icon name="auto_awesome" color="amber" size="1.2em" class="q-mr-xs" />
        萤火虫之夜
      </div>
      <div class="rune-firefly-demo__desc">基于 CSS3 发光动画 + 多点随机飞行，参考博客园文章思路</div>
      <div class="rune-firefly-demo__meta">
        <span>数量: <code>{{ fireflies.length }}</code></span>
        <span>当前: <code>{{ activeId || '-' }}</code></span>
        <span>坐标: <code>{{ lastPicked || '-' }}</code></span>
      </div>
    </div>
  </div>
</template>

<script>
// 萤火虫符文：多只萤火虫在夜空随机飞行 + 脉冲发光
// 思路来自 https://www.cnblogs.com/ai888/p/18622910
export default {
  props: {
    value: { type: String, default: '' },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null }
  },
  data() {
    return {
      activeId: '',
      lastPicked: '',
      fireflies: this._buildFireflies(8)
    }
  },
  mounted() {
    this._timer && clearInterval(this._timer)
    this._timer = setInterval(() => {
      this.fireflies = this.fireflies.map(f => ({
        ...f,
        style: this._randomStyle()
      }))
    }, 2200)
  },
  beforeDestroy() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },
  methods: {
    _buildFireflies(n) {
      const list = []
      for (let i = 0; i < n; i++) {
        list.push({
          id: 'firefly-' + (i + 1),
          style: this._randomStyle()
        })
      }
      return list
    },
    _randomStyle() {
      const x = Math.random() * 95
      const y = Math.random() * 90
      const delay = (Math.random() * 2).toFixed(2)
      const dur = (1.2 + Math.random() * 1.6).toFixed(2)
      const size = 10 + Math.round(Math.random() * 10)
      const hue = Math.random() > 0.5 ? 'ff0' : 'ffe066'
      return {
        left: x + '%',
        top: y + '%',
        width: size + 'px',
        height: size + 'px',
        animationDelay: delay + 's',
        animationDuration: dur + 's',
        '--firefly-color': '#' + hue
      }
    },
    onPickFly(fly, idx) {
      this.activeId = fly.id
      this.lastPicked = fly.id + ' (' + fly.style.left + ', ' + fly.style.top + ')'
      this.$emit('input', this.lastPicked)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-firefly-demo {
  position: relative;
  width: 100%;
  height: 320px;
  border-radius: 12px;
  overflow: hidden;
  background: radial-gradient(ellipse at top, #0f2027 0%, #203a43 45%, #2c5364 100%);
  border: 1px solid rgba(255, 235, 130, 0.25);
  font-family: inherit;
  color: #fff8d6;
}
.rune-firefly-demo__sky {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.rune-firefly-demo__firefly {
  position: absolute;
  border-radius: 50%;
  background: #333;
  cursor: pointer;
  animation-name: firefly-glow, firefly-float;
  animation-iteration-count: infinite, infinite;
  animation-direction: alternate, alternate;
  animation-timing-function: ease-in-out, ease-in-out;
  transform: translate(-50%, -50%);
  transition: filter 0.2s;
}
.rune-firefly-demo__firefly::before,
.rune-firefly-demo__firefly::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.rune-firefly-demo__firefly::before {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, #fff, transparent);
  opacity: 0.3;
  animation: firefly-glow 1s infinite alternate;
}
.rune-firefly-demo__firefly::after {
  width: 80%;
  height: 80%;
  top: 10%;
  left: 10%;
  background: radial-gradient(circle, #f00, transparent);
  opacity: 0.6;
  animation: firefly-pulse 1s infinite alternate;
}
.rune-firefly-demo__firefly.is-active {
  filter: brightness(1.6) drop-shadow(0 0 6px #fff7a8);
}
@keyframes firefly-glow {
  0%   { box-shadow: 0 0 5px #333, 0 0 10px #333, 0 0 15px #333, 0 0 20px var(--firefly-color, #ff0); }
  100% { box-shadow: 0 0 10px #333, 0 0 20px var(--firefly-color, #ff0), 0 0 30px var(--firefly-color, #ff0), 0 0 40px var(--firefly-color, #ff0); }
}
@keyframes firefly-pulse {
  0%   { transform: scale(1); }
  100% { transform: scale(1.15); }
}
@keyframes firefly-float {
  0%   { margin-left: 0;    margin-top: 0; }
  25%  { margin-left: 12px; margin-top: -8px; }
  50%  { margin-left: -10px; margin-top: 6px; }
  75%  { margin-left: 6px;  margin-top: -4px; }
  100% { margin-left: 0;    margin-top: 0; }
}
.rune-firefly-demo__panel {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  z-index: 2;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  color: #fff8d6;
  font-size: 12px;
}
.rune-firefly-demo__title {
  display: flex;
  align-items: center;
  font-weight: 700;
  letter-spacing: 0.5px;
  font-size: 13px;
}
.rune-firefly-demo__desc {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.8;
}
.rune-firefly-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.9;
}
.rune-firefly-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 235, 130, 0.15);
  padding: 1px 5px;
  border-radius: 4px;
  color: #ffe066;
}
</style>`
}

export default runeTemplatesFirefly