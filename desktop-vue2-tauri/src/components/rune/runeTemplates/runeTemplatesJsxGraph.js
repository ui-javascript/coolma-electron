// ===== JsxGraph：演示 this.$jxg 绑定 JSXGraph 初始化与点击坐标上报 =====
export const runeTemplatesJsxGraph = () => {
  return `<template>
  <div>
    <div ref="jxgBox" class="rune-jsxgraph-demo"/>
  </div>
<\/template>

<script>
// JsxGraph 符文：通过 this.$jxg 调用 JSXGraph 初始化坐标系，鼠标点击上报坐标
// JSXGraph 改为按需加载，boot 只挂 this.$jxgReady()，首次使用前 await 一次。
export default {
  props: {
    value: { type: [String, Number], default: null }
  },
  data() {
    return {
      board: null
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.initBoard()
    })
  },
  beforeDestroy() {
    if (this.board) {
      this.board.destroy && this.board.destroy()
      this.board = null
    }
  },
  methods: {
    async initBoard() {
      const container = this.$refs.jxgBox
      if (!container) return
      const JXG = this.$jxg || await this.$jxgReady()
      if (!JXG) return
      if (this.board) {
        this.board.destroy && this.board.destroy()
      }
      this.board = JXG.JSXGraph.initBoard(container, {
        boundingbox: [-6, 6, 6, -6],
        axis: true,
        grid: true,
        showNavigation: false
      })
      this.board.on('down', (e) => {
        const pos = this.board.getUsrCoordsOfMouse(e)
        this.$emit('input', JSON.stringify({ x: pos[0].toFixed(2), y: pos[1].toFixed(2) }))
      })
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-jsxgraph-demo {
  width: 100%;
  height: 320px;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.body--dark .rune-jsxgraph-demo {
  background: #2a2a2a;
}
</style>`
}

export default runeTemplatesJsxGraph