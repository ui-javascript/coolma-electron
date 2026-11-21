<template>
  <transition name="fire-fade">
    <div v-if="visible" class="fire-overlay" ref="fireOverlay">
      <canvas ref="fireCanvas" class="fire-canvas"></canvas>
      <div class="fire-glow"></div>
    </div>
  </transition>
</template>

<script>
export default {
  name: 'fireEffect',
  props: {
    duration: {
      type: Number,
      default: 3000
    }
  },
  data () {
    return {
      visible: false,
      animationId: null,
      particles: [],
      canvas: null,
      ctx: null,
      width: 0,
      height: 0
    }
  },
  methods: {
    async start () {
      this.visible = true
      await this.$nextTick()
      this.initCanvas()
      this.createParticles()
      this.animate()
      setTimeout(() => {
        this.stop()
      }, this.duration)
    },

    stop () {
      this.visible = false
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
        this.animationId = null
      }
      this.particles = []
    },

    initCanvas () {
      this.canvas = this.$refs.fireCanvas
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

    createParticles () {
      this.particles = []
      const particleCount = Math.floor((this.width * this.height) / 3000)

      for (let i = 0; i < particleCount; i++) {
        this.particles.push(this.createParticle())
      }
    },

    createParticle () {
      return {
        x: Math.random() * this.width,
        y: this.height + Math.random() * 100,
        vx: (Math.random() - 0.5) * 3,
        vy: -(Math.random() * 8 + 6),
        size: Math.random() * 15 + 5,
        life: 1,
        decay: Math.random() * 0.008 + 0.004,
        hue: Math.random() * 40 + 10,
        saturation: Math.random() * 30 + 70,
        lightness: Math.random() * 30 + 50
      }
    },

    animate () {
      // 透明背景，每次绘制只覆盖一小部分，逐渐淡出
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
      this.ctx.fillRect(0, 0, this.width, this.height)

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i]

        p.x += p.vx
        p.y += p.vy
        p.vy += 0.05
        p.life -= p.decay
        p.size *= 0.99

        if (p.life <= 0 || p.y < -p.size * 2) {
          this.particles[i] = this.createParticle()
          continue
        }

        const gradient = this.ctx.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, p.size
        )
        const alpha = p.life * 0.8
        gradient.addColorStop(0, `hsla(${p.hue}, 100%, 80%, ${alpha})`)
        gradient.addColorStop(0.3, `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${alpha * 0.8})`)
        gradient.addColorStop(0.6, `hsla(${p.hue - 10}, ${p.saturation - 20}%, ${p.lightness - 20}%, ${alpha * 0.5})`)
        gradient.addColorStop(1, `hsla(${p.hue - 20}, ${p.saturation - 40}%, ${p.lightness - 40}%, 0)`)

        this.ctx.beginPath()
        this.ctx.fillStyle = gradient
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        this.ctx.fill()

        this.ctx.beginPath()
        this.ctx.fillStyle = `rgba(255, 200, 100, ${alpha * 0.3})`
        this.ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3, 0, Math.PI * 2)
        this.ctx.fill()
      }

      this.animationId = requestAnimationFrame(() => this.animate())
    }
  },
  beforeDestroy () {
    this.stop()
  }
}
</script>

<style scoped>
.fire-overlay {
  position: fixed;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  z-index: 99999;
  pointer-events: none;
  overflow: hidden;
}

.fire-canvas {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.fire-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at 50% 100%, rgba(255, 100, 0, 0.3) 0%, transparent 70%);
  animation: glow-pulse 0.5s ease-in-out infinite alternate;
}

@keyframes glow-pulse {
  from {
    opacity: 0.5;
  }
  to {
    opacity: 0.8;
  }
}

.fire-fade-enter-active {
  animation: fire-in 0.3s ease-out;
}

.fire-fade-leave-active {
  animation: fire-out 0.5s ease-in forwards;
}

@keyframes fire-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fire-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
