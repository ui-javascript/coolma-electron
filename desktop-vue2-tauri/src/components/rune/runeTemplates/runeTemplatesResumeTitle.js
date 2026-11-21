// ----- 2. 标题段落（TitleSection） -----
export const runeTemplatesResumeTitle = () => {
  return `<template>
  <div :class="['rune-rt', 'rune-rt--' + level]">
    <span class="rune-rt__bar" />
    <span class="rune-rt__text">{{ (value && value.text) || '标题' }}</span>
  </div>
</template>

<script>
export default {
  name: 'RuneResumeTitleSection',
  props: {
    value: { type: Object, default: () => ({}) }
  },
  computed: {
    level () {
      const lv = Number((this.value && value.level) || 2)
      if (lv === 1) return 'h1'
      if (lv === 3) return 'h3'
      return 'h2'
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-rt { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.rune-rt__bar { display: inline-block; width: 4px; height: 16px; background: #7E57C2; border-radius: 2px; }
.rune-rt__text { color: #333; font-weight: 700; }
.rune-rt--h1 .rune-rt__text { font-size: 22px; }
.rune-rt--h1 .rune-rt__bar { height: 20px; }
.rune-rt--h2 .rune-rt__text { font-size: 16px; }
.rune-rt--h3 .rune-rt__text { font-size: 13px; color: #555; }
.rune-rt--h3 .rune-rt__bar { height: 12px; background: #B39DDB; }
</style>`
}

export default runeTemplatesResumeTitle