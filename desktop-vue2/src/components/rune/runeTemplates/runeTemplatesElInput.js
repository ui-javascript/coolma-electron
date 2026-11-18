// ===== el-input 模板：基于 Element-UI <el-input>，blur 时触发 $emit('input') =====
export const runeTemplatesElInput = () => {
  return `<template>
  <div class="rune-el-input-demo">
    <el-input
      class="rune-el-input-demo__field"
      v-model="text"
      :placeholder="placeholder"
      clearable
      @blur="handleBlur"
    />
    <div class="rune-el-input-demo__meta">
      <span>v-model: <code>{{ text || '-' }}</code></span>
      <span>value: <code>{{ value == null ? '-' : value }}</code></span>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    value: {
      type: [String, Number],
      default: null
    },
    placeholder: {
      type: String,
      default: '输入内容，失焦后同步数据'
    }
  },
  data() {
    return {
      text: this.value == null ? '' : String(this.value)
    }
  },
  watch: {
    value(next) {
      const normalized = next == null ? '' : String(next)
      if (normalized !== this.text) {
        this.text = normalized
      }
    }
  },
  methods: {
    handleBlur() {
      const next = this.text == null ? '' : String(this.text)
      this.$emit('input', next)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-el-input-demo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
  font-family: inherit;
  color: inherit;
}
.rune-el-input-demo__field {
  width: 100%;
}
.rune-el-input-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
}
.rune-el-input-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(126, 87, 194, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  color: #6A1B9A;
}
</style>`
}

export default runeTemplatesElInput