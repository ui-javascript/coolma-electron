// ----- 5. 技能标签（SkillBar） -----
export const runeTemplatesResumeSkill = () => {
  return `<template>
  <div class="rune-rs">
    <div v-for="(s, i) in items" :key="i" class="rune-rs__row">
      <div class="rune-rs__name">{{ s.name }}</div>
      <el-progress
        class="rune-rs__bar"
        :percentage="clamp(s.level)"
        :show-text="false"
        :stroke-width="8"
        color="#7E57C2"
      />
      <div class="rune-rs__val">{{ clamp(s.level) }}%</div>
    </div>
    <div v-if="!items.length" class="rune-rs__empty">暂无技能</div>
  </div>
</template>

<script>
export default {
  name: 'RuneResumeSkillBar',
  props: {
    value: { type: Object, default: () => ({ items: [] }) }
  },
  computed: {
    items () {
      return Array.isArray(this.value && this.value.items) ? this.value.items : []
    }
  },
  methods: {
    clamp (v) {
      const n = Number(v)
      if (!isFinite(n)) return 0
      return Math.max(0, Math.min(100, Math.round(n)))
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-rs { display: flex; flex-direction: column; gap: 8px; }
.rune-rs__row { display: flex; align-items: center; gap: 10px; }
.rune-rs__name { flex: 0 0 100px; font-size: 12px; color: #333; font-weight: 500; }
.rune-rs__bar { flex: 1 1 auto; min-width: 0; height: 8px; background: rgba(126, 87, 194, 0.12); border-radius: 4px; overflow: hidden; }
.rune-rs__bar-inner { height: 100%; background: #7E57C2; transition: width 0.25s; }
.rune-rs__val { flex: 0 0 40px; text-align: right; font-size: 11px; color: #6A1B9A; font-family: Consolas, Monaco, monospace; }
.rune-rs__empty { font-size: 12px; color: rgba(0, 0, 0, 0.35); font-style: italic; }
</style>`
}

export default runeTemplatesResumeSkill