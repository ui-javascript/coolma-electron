// ----- 4. 自由文本（TextContent） -----
export const runeTemplatesResumeText = () => {
  return `<template>
  <div class="rune-rtx">
    <div class="rune-rtx__text" v-if="value && value.text">{{ value.text }}</div>
    <div class="rune-rtx__placeholder" v-else>自由文本组件，点击编辑...</div>
  </div>
</template>

<script>
export default {
  name: 'RuneResumeTextContent',
  props: {
    value: { type: Object, default: () => ({}) }
  }
}
<\/script>

<style lang="less" scoped>
.rune-rtx { padding: 4px 0; }
.rune-rtx__text { font-size: 13px; color: rgba(0, 0, 0, 0.8); line-height: 1.7; white-space: pre-wrap; }
.rune-rtx__placeholder { font-size: 12px; color: rgba(0, 0, 0, 0.35); font-style: italic; }
</style>`
}

export default runeTemplatesResumeText