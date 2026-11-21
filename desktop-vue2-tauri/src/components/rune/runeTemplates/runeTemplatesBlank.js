// ============================================================================
// runeTemplatesBlank —— 空白模板：标准 Vue SFC 格式
//
// 这是新建 rune / 重置模板时的最简骨架：
//   - props: {}            （空 props，符合"空白"语义）
//   - data/computed/watch/methods 都空着
//   - 生命周期钩子都空着
// ============================================================================
export const runeTemplatesBlank = () => {
  return `<template>
  <div class="blank-page">
    <!-- HTML 结构区域 -->
    <p>Vue2 空白组件</p>
  </div>
</template>

<script>
export default {
  name: 'BlankDemo',
  // 接收父组件参数
  props: {},
  data() {
    return {
      // 响应式数据
    }
  },
  computed: {
    // 计算属性
  },
  watch: {
    // 数据监听
  },
  methods: {
    // 业务方法
  },
  // 生命周期钩子
  created() {},
  mounted() {},
  updated() {},
  destroyed() {}
}
<\/script>

<style lang="less" scoped>

</style>`
}

export default runeTemplatesBlank