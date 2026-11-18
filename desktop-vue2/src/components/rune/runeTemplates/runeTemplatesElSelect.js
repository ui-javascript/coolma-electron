// ===== el-select 模板：基于 Element-UI <el-select>，change 时触发 $emit('input') =====
export const runeTemplatesElSelect = () => {
  return `<template>
  <div class="rune-el-select-demo">
    <el-select
      class="rune-el-select-demo__field"
      v-model="selected"
      :placeholder="placeholder"
      clearable
      @change="handleChange"
    >
      <el-option
        v-for="opt in options"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
    <div class="rune-el-select-demo__meta">
      <span>v-model: <code>{{ selected || '-' }}</code></span>
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
      default: '选择一项后同步数据'
    }
  },
  data() {
    return {
      selected: this.value == null ? '' : String(this.value),
      options: [
        { value: 'purple', label: '紫水晶' },
        { value: 'blue',   label: '海蓝宝' },
        { value: 'green',  label: '翡翠' },
        { value: 'amber',  label: '琥珀' },
        { value: 'crimson', label: '红玛瑙' }
      ]
    }
  },
  watch: {
    value(next) {
      const normalized = next == null ? '' : String(next)
      if (normalized !== this.selected) {
        this.selected = normalized
      }
    }
  },
  methods: {
    handleChange(val) {
      const next = val == null ? '' : String(val)
      this.$emit('input', next)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-el-select-demo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
  font-family: inherit;
  color: inherit;
}
.rune-el-select-demo__field {
  width: 100%;
}
.rune-el-select-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
}
.rune-el-select-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(126, 87, 194, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  color: #6A1B9A;
}
</style>`
}

export default runeTemplatesElSelect