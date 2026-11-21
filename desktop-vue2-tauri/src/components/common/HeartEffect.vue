<template>
  <transition name="heart-fade">
    <div v-if="visible" class="heart-overlay">
      <canvas ref="heartCanvas" class="heart-canvas"></canvas>
    </div>
  </transition>
</template>

<script>
export default {
  name: 'heartEffect',
  props: {
    duration: {
      type: Number,
      default: 4000
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
      heart: null,
      shards: []
    }
  },
  methods: {
    start () {
      this.visible = true
      this.$nextTick(() => {
        this.initCanvas()
        this.initHeart()
        this.startTime = Date.now()
        this.shards = []
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
      this.canvas = this.$refs.heartCanvas
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

    initHeart () {
      this.heart = {
        x: this.width * 0.3,
        y: this.height * 0.3,
        vx: 8,
        vy: 6,
        size: Math.min(this.width, this.height) * 0.25,
        rotation: 0,
        rotationSpeed: 0.02,
        scale: 1,
        alpha: 1,
        hue: 340,
        squash: 1,
        stretch: 1,
        breaking: false,
        breakProgress: 0
      }
    },

    createShards () {
      const shardCount = 20
      for (let i = 0; i < shardCount; i++) {
        const angle = (i / shardCount) * Math.PI * 2
        const speed = 3 + Math.random() * 5
        this.shards.push({
          x: this.heart.x,
          y: this.heart.y,
          vx: Math.cos(angle) * speed + this.heart.vx * 0.5,
          vy: Math.sin(angle) * speed + this.heart.vy * 0.5,
          size: this.heart.size * (0.1 + Math.random() * 0.15),
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          alpha: 1,
          gravity: 0.15,
          hue: this.heart.hue + (Math.random() - 0.5) * 30,
          type: i % 3
        })
      }
    },

    drawHeartShape (ctx, x, y, size, rotation, scaleX, scaleY) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)
      ctx.scale(scaleX * scaleY, scaleY)

      const s = size * 0.5
      ctx.moveTo(0, s * 0.3)
      ctx.bezierCurveTo(-s * 1.5, -s * 0.5, -s * 2.2, s * 0.8, 0, s * 1.8)
      ctx.bezierCurveTo(s * 2.2, s * 0.8, s * 1.5, -s * 0.5, 0, s * 0.3)

      ctx.restore()
    },

    drawHeart (heart) {
      const ctx = this.ctx

      // 发光效果
      const glowSize = heart.size * 1.5
      const glow = ctx.createRadialGradient(heart.x, heart.y, 0, heart.x, heart.y, glowSize)
      glow.addColorStop(0, `hsla(${heart.hue}, 100%, 65%, ${heart.alpha * 0.3})`)
      glow.addColorStop(0.5, `hsla(${heart.hue}, 90%, 55%, ${heart.alpha * 0.1})`)
      glow.addColorStop(1, `hsla(${heart.hue}, 80%, 50%, 0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(heart.x, heart.y, glowSize, 0, Math.PI * 2)
      ctx.fill()

      // 爱心本体
      ctx.save()
      ctx.translate(heart.x, heart.y)
      ctx.rotate(heart.rotation)
      ctx.scale(heart.squash, heart.stretch)

      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, heart.size * 0.6)
      gradient.addColorStop(0, `hsla(${heart.hue}, 100%, 75%, ${heart.alpha})`)
      gradient.addColorStop(0.5, `hsla(${heart.hue}, 95%, 60%, ${heart.alpha})`)
      gradient.addColorStop(0.8, `hsla(${heart.hue}, 90%, 50%, ${heart.alpha})`)
      gradient.addColorStop(1, `hsla(${heart.hue}, 85%, 45%, ${heart.alpha * 0.8})`)

      ctx.fillStyle = gradient
      ctx.beginPath()
      const s = heart.size * 0.5
      ctx.moveTo(0, s * 0.3)
      ctx.bezierCurveTo(-s * 1.5, -s * 0.5, -s * 2.2, s * 0.8, 0, s * 1.8)
      ctx.bezierCurveTo(s * 2.2, s * 0.8, s * 1.5, -s * 0.5, 0, s * 0.3)
      ctx.fill()

      // 高光
      ctx.fillStyle = `hsla(0, 0%, 100%, ${heart.alpha * 0.4})`
      ctx.beginPath()
      ctx.ellipse(-heart.size * 0.25, -heart.size * 0.15, heart.size * 0.15, heart.size * 0.1, -0.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
    },

    drawShards () {
      const ctx = this.ctx

      for (const shard of this.shards) {
        ctx.save()
        ctx.translate(shard.x, shard.y)
        ctx.rotate(shard.rotation)
        ctx.globalAlpha = shard.alpha

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shard.size)
        gradient.addColorStop(0, `hsla(${shard.hue}, 100%, 70%, 1)`)
        gradient.addColorStop(1, `hsla(${shard.hue}, 80%, 50%, 0.5)`)
        ctx.fillStyle = gradient

        if (shard.type === 0) {
          // 三角形碎片
          ctx.beginPath()
          ctx.moveTo(0, -shard.size)
          ctx.lineTo(shard.size * 0.866, shard.size * 0.5)
          ctx.lineTo(-shard.size * 0.866, shard.size * 0.5)
          ctx.closePath()
        } else if (shard.type === 1) {
          // 菱形碎片
          ctx.beginPath()
          ctx.moveTo(0, -shard.size)
          ctx.lineTo(shard.size, 0)
          ctx.lineTo(0, shard.size)
          ctx.lineTo(-shard.size, 0)
          ctx.closePath()
        } else {
          // 不规则碎片
          ctx.beginPath()
          ctx.moveTo(0, -shard.size)
          ctx.lineTo(shard.size * 0.7, -shard.size * 0.3)
          ctx.lineTo(shard.size, shard.size * 0.5)
          ctx.lineTo(0, shard.size)
          ctx.lineTo(-shard.size * 0.5, shard.size * 0.3)
          ctx.lineTo(-shard.size * 0.8, 0)
          ctx.closePath()
        }
        ctx.fill()

        ctx.restore()
      }
    },

    animate () {
      const elapsed = Date.now() - this.startTime
      const progress = Math.min(elapsed / this.duration, 1)

      this.ctx.clearRect(0, 0, this.width, this.height)

      if (this.heart && !this.heart.breaking) {
        // 更新爱心位置
        this.heart.x += this.heart.vx
        this.heart.y += this.heart.vy
        this.heart.rotation += this.heart.rotationSpeed
        this.heart.hue = 340 + Math.sin(elapsed * 0.001) * 20

        // 碰壁检测和反弹
        const margin = this.heart.size * 0.3
        const bounce = 0.85

        if (this.heart.x - margin < 0) {
          this.heart.x = margin
          this.heart.vx = -this.heart.vx * bounce
          this.heart.squash = 0.7
          this.heart.stretch = 1.3
        } else if (this.heart.x + margin > this.width) {
          this.heart.x = this.width - margin
          this.heart.vx = -this.heart.vx * bounce
          this.heart.squash = 0.7
          this.heart.stretch = 1.3
        }

        if (this.heart.y - margin < 0) {
          this.heart.y = margin
          this.heart.vy = -this.heart.vy * bounce
          this.heart.squash = 1.3
          this.heart.stretch = 0.7
        } else if (this.heart.y + margin > this.height) {
          this.heart.y = this.height - margin
          this.heart.vy = -this.heart.vy * bounce
          this.heart.squash = 1.3
          this.heart.stretch = 0.7
        }

        // 恢复形状
        this.heart.squash += (1 - this.heart.squash) * 0.15
        this.heart.stretch += (1 - this.heart.stretch) * 0.15

        // 最后阶段开始裂开
        if (progress > 0.85) {
          this.heart.breaking = true
          this.heart.breakProgress = (progress - 0.85) / 0.15
          this.heart.alpha = 1 - this.heart.breakProgress * 0.5
          this.heart.squash = 1 + Math.sin(elapsed * 0.05) * 0.2 * this.heart.breakProgress
          this.heart.stretch = 1 + Math.cos(elapsed * 0.05) * 0.2 * this.heart.breakProgress

          if (this.heart.breakProgress > 0.3 && this.shards.length === 0) {
            this.createShards()
          }
        }

        this.drawHeart(this.heart)
      }

      // 更新和绘制碎片
      for (let i = this.shards.length - 1; i >= 0; i--) {
        const shard = this.shards[i]
        shard.x += shard.vx
        shard.y += shard.vy
        shard.vy += shard.gravity
        shard.rotation += shard.rotationSpeed
        shard.alpha -= 0.015

        if (shard.alpha <= 0 || shard.y > this.height + 50) {
          this.shards.splice(i, 1)
        }
      }
      this.drawShards()

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
.heart-overlay {
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

.heart-canvas {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.heart-fade-enter-active {
  animation: heart-in 0.3s ease-out;
}

.heart-fade-leave-active {
  animation: heart-out 0.5s ease-in forwards;
}

@keyframes heart-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes heart-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
