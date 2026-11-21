<template>
  <transition name="butterfly-fade">
    <div v-if="visible" class="butterfly-overlay">
      <canvas ref="canvas" class="butterfly-canvas"></canvas>
    </div>
  </transition>
</template>

<script>
export default {
  name: 'butterflyEffect',
  props: {
    duration: {
      type: Number,
      default: 5000
    }
  },
  data () {
    return {
      visible: false,
      animationId: null,
      canvas: null,
      ctx: null,
      width: 0,
      height: 0,
      startTime: 0,
      butterflies: []
    }
  },
  methods: {
    start () {
      this.visible = true
      this.$nextTick(() => {
        this.initCanvas()
        this.createButterflies()
        this.startTime = Date.now()
        this.animate()
        setTimeout(() => {
          this.stop()
        }, this.duration)
      })
    },

    stop () {
      this.visible = false
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
        this.animationId = null
      }
    },

    initCanvas () {
      this.canvas = this.$refs.canvas
      this.ctx = this.canvas.getContext('2d')
      const dpr = window.devicePixelRatio || 1
      this.width = window.innerWidth
      this.height = window.innerHeight
      this.canvas.width = this.width * dpr
      this.canvas.height = this.height * dpr
      this.canvas.style.width = this.width + 'px'
      this.canvas.style.height = this.height + 'px'
      this.ctx.scale(dpr, dpr)
    },

    createButterflies () {
      this.butterflies = []
      const count = 12
      for (let i = 0; i < count; i++) {
        this.butterflies.push(this.createButterfly())
      }
    },

    createButterfly () {
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: 15 + Math.random() * 25,
        wingAngle: 0,
        wingSpeed: 0.15 + Math.random() * 0.1,
        hue: 200 + Math.random() * 60,
        saturation: 60 + Math.random() * 30,
        lightness: 50 + Math.random() * 20,
        alpha: 0.7 + Math.random() * 0.3,
        flutter: 0,
        flutterSpeed: 0.03 + Math.random() * 0.02,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.01,
        phase: Math.random() * Math.PI * 2
      }
    },

    drawButterfly (bf) {
      const ctx = this.ctx
      const wingFlap = Math.sin(bf.wingAngle) * 0.8 + 0.2

      ctx.save()
      ctx.translate(bf.x, bf.y)
      ctx.globalAlpha = bf.alpha

      // 翅膀阴影
      ctx.shadowColor = `hsla(${bf.hue}, 80%, 60%, 0.5)`
      ctx.shadowBlur = 20

      // 左翅
      ctx.save()
      ctx.scale(wingFlap, 1)
      ctx.fillStyle = `hsla(${bf.hue}, ${bf.saturation}%, ${bf.lightness}%, 0.9)`
      ctx.beginPath()
      ctx.ellipse(-bf.size * 0.4, -bf.size * 0.1, bf.size * 0.6, bf.size * 0.8, -0.3, 0, Math.PI * 2)
      ctx.fill()

      // 左翅纹理
      ctx.fillStyle = `hsla(${bf.hue + 30}, ${bf.saturation - 10}%, ${bf.lightness + 20}%, 0.6)`
      ctx.beginPath()
      ctx.ellipse(-bf.size * 0.5, -bf.size * 0.2, bf.size * 0.25, bf.size * 0.35, -0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // 右翅
      ctx.save()
      ctx.scale(wingFlap, 1)
      ctx.fillStyle = `hsla(${bf.hue}, ${bf.saturation}%, ${bf.lightness}%, 0.9)`
      ctx.beginPath()
      ctx.ellipse(bf.size * 0.4, -bf.size * 0.1, bf.size * 0.6, bf.size * 0.8, 0.3, 0, Math.PI * 2)
      ctx.fill()

      // 右翅纹理
      ctx.fillStyle = `hsla(${bf.hue + 30}, ${bf.saturation - 10}%, ${bf.lightness + 20}%, 0.6)`
      ctx.beginPath()
      ctx.ellipse(bf.size * 0.5, -bf.size * 0.2, bf.size * 0.25, bf.size * 0.35, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // 下翅
      ctx.fillStyle = `hsla(${bf.hue - 20}, ${bf.saturation - 10}%, ${bf.lightness + 10}%, 0.85)`
      ctx.beginPath()
      ctx.ellipse(-bf.size * 0.3, bf.size * 0.5, bf.size * 0.4, bf.size * 0.6, -0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(bf.size * 0.3, bf.size * 0.5, bf.size * 0.4, bf.size * 0.6, 0.2, 0, Math.PI * 2)
      ctx.fill()

      ctx.shadowBlur = 0

      // 身体
      ctx.fillStyle = `hsla(${bf.hue}, 30%, 25%, 1)`
      ctx.beginPath()
      ctx.ellipse(0, 0, bf.size * 0.08, bf.size * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()

      // 触角
      ctx.strokeStyle = `hsla(${bf.hue}, 40%, 30%, 1)`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-bf.size * 0.05, -bf.size * 0.5)
      ctx.quadraticCurveTo(-bf.size * 0.3, -bf.size * 0.9, -bf.size * 0.2, -bf.size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(bf.size * 0.05, -bf.size * 0.5)
      ctx.quadraticCurveTo(bf.size * 0.3, -bf.size * 0.9, bf.size * 0.2, -bf.size)
      ctx.stroke()

      // 触角末端
      ctx.fillStyle = `hsla(${bf.hue}, 50%, 40%, 1)`
      ctx.beginPath()
      ctx.arc(-bf.size * 0.2, -bf.size, 2, 0, Math.PI * 2)
      ctx.arc(bf.size * 0.2, -bf.size, 2, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
    },

    animate () {
      const elapsed = Date.now() - this.startTime
      const progress = Math.min(elapsed / this.duration, 1)

      this.ctx.clearRect(0, 0, this.width, this.height)

      // 绘制渐变背景光
      const gradient = this.ctx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7
      )
      gradient.addColorStop(0, `hsla(220, 40%, 20%, ${0.15 * (1 - progress)})`)
      gradient.addColorStop(0.5, `hsla(260, 50%, 15%, ${0.1 * (1 - progress)})`)
      gradient.addColorStop(1, `hsla(280, 30%, 10%, 0)`)
      this.ctx.fillStyle = gradient
      this.ctx.fillRect(0, 0, this.width, this.height)

      for (const bf of this.butterflies) {
        // 更新位置
        bf.wingAngle += bf.wingSpeed
        bf.flutter += bf.flutterSpeed
        bf.wobble += bf.wobbleSpeed
        bf.phase += 0.02

        // 飘动轨迹
        bf.x += bf.vx + Math.sin(bf.wobble) * 0.5
        bf.y += bf.vy + Math.cos(bf.phase) * 0.3

        // 碰壁反弹
        const margin = bf.size
        if (bf.x < margin || bf.x > this.width - margin) {
          bf.vx = -bf.vx
          bf.x = Math.max(margin, Math.min(this.width - margin, bf.x))
        }
        if (bf.y < margin || bf.y > this.height - margin) {
          bf.vy = -bf.vy
          bf.y = Math.max(margin, Math.min(this.height - margin, bf.y))
        }

        // 逐渐消失
        if (progress > 0.7) {
          bf.alpha = Math.max(0, (1 - progress) / 0.3 * 0.8)
        }

        this.drawButterfly(bf)
      }

      if (progress < 1) {
        this.animationId = requestAnimationFrame(() => this.animate())
      }
    }
  },
  beforeDestroy () {
    this.stop()
  }
}
</script>

<style scoped>
.butterfly-overlay {
  position: fixed;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  z-index: 99998;
  pointer-events: none;
  overflow: hidden;
}

.butterfly-canvas {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.butterfly-fade-enter-active {
  animation: butterfly-in 0.5s ease-out;
}

.butterfly-fade-leave-active {
  animation: butterfly-out 1s ease-in forwards;
}

@keyframes butterfly-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes butterfly-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
