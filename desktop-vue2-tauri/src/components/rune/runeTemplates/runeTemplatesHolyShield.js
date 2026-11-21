// ===== hel-micro：演示 this.$hel.preFetchLib 远程加载 =====
export const runeTemplatesHolyShield = () => {
  return `<template>
  <div class="hel-micro">
    <input
      class="hel-micro__input"
      v-model="rawInput"
      placeholder="输入数字，失焦后显示结果"
      @blur="onInput"
    />
    <div class="hel-micro__result" v-if="result !== null">
      <span>num.random 结果：</span>
      <code>{{ result }}</code>
    </div>
  </div>
<\/template>

<script>
// hel-micro 远程加载：this.$hel 在 src/boot/hel-micro-renderer.js 中挂载
export default {
  props: {
    value: { type: [String, Number], default: null },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null }
  },
  data() {
    return {
      rawInput: '',
      result: null,
      _debounceTimer: null
    }
  },
  watch: {
    value(next) {
      const s = next == null ? '' : String(next)
      if (s !== this.rawInput) this.rawInput = s
    }
  },
  methods: {
    async onInput() {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = setTimeout(async () => {
        try {
          const lib = await this.$hel.preFetchLib('hel-tpl-remote-lib', '2.0.1')
          console.log('lib', lib)
          const n = parseFloat(this.rawInput)
          this.result = lib.num.random(n)
          this.$emit('input', String(this.result))
        } catch (e) {
          console.error('[hel-micro] load failed:', e)
          this.result = 'load failed'
        }
      }, 300)
    }
  },
  beforeDestroy() {
    clearTimeout(this._debounceTimer)
  }
}
<\/script>

<style lang="less" scoped>
.hel-micro {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 193, 7, 0.06);
  border: 1px dashed rgba(255, 193, 7, 0.4);
  font-family: inherit;
  color: inherit;
}
.hel-micro__input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 193, 7, 0.5);
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.hel-micro__input:focus {
  border-color: #FFB300;
  box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.2);
}
.hel-micro__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.7);
  background: rgba(255, 193, 7, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
}
.hel-micro__result code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 160, 0, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  color: #E65100;
  font-weight: 600;
}
</style>`
}

export default runeTemplatesHolyShield