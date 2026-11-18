// ===== el-date-picker 模板：基于 Element-UI <el-date-picker type="date">，
// 默认 date 模式（年/月/日），change 时触发 $emit('input')。
// 入参与 emit 都走 toPickedFormat() 归一化，保证传给 picker 的永远是合法日期，
// 任何非法值都会回退到 null（不传 ''，避免 Element-UI 报 Invalid Date）。 =====
export const runeTemplatesElDatePicker = () => {
  return `<template>
  <div class="rune-el-date-demo">
    <el-date-picker
      class="rune-el-date-demo__field"
      v-model="picked"
      :type="type"
      :placeholder="placeholder"
      :format="format"
      :value-format="valueFormat"
      clearable
      @change="handleChange"
    />
    <div class="rune-el-date-demo__meta">
      <span>v-model: <code>{{ picked || '-' }}</code></span>
      <span>value: <code>{{ value == null ? '-' : value }}</code></span>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    value: {
      type: [String, Number, Date],
      default: null
    },
    placeholder: {
      type: String,
      default: '选择日期，变化时同步数据'
    },
    type: {
      type: String,
      default: 'date'
    },
    format: {
      type: String,
      default: 'yyyy-MM-dd'
    },
    valueFormat: {
      type: String,
      default: 'yyyy-MM-dd'
    }
  },
  data() {
    return {
      picked: this.toPickedFormat(this.value)
    }
  },
  watch: {
    value(next) {
      const normalized = this.toPickedFormat(next)
      if (normalized !== this.picked) {
        this.picked = normalized
      }
    }
  },
  methods: {
    // 统一入口：把任意入参（字符串 / 数字时间戳 / Date 对象 / null）归一化为
    // picker 能接受的形态。返回 null 而不是 '' —— el-date-picker 内部对
    // 空字符串解析时会打印 "Invalid Date" 警告，使用 null 才是清空态。
    toPickedFormat(raw) {
      if (raw == null || raw === '') return null
      let d
      if (raw instanceof Date) {
        d = raw
      } else if (typeof raw === 'number') {
        d = new Date(raw)
      } else {
        const s = String(raw).trim()
        if (!s) return null
        // yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss 等常见形态直接按本地时区解析，
        // 避免 new Date('2026-07-04') 被当 UTC 解析而少一天
        const m = s.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})(.*)$/)
        if (m) {
          d = new Date(
            parseInt(m[1], 10),
            parseInt(m[2], 10) - 1,
            parseInt(m[3], 10)
          )
        } else {
          d = new Date(s)
        }
      }
      if (!(d instanceof Date) || isNaN(d.getTime())) return null
      // 用 valueFormat 把日期格式化回字符串，picker 真正能识别的形态。
      // 简易支持 yyyy-MM-dd / yyyy-MM-dd HH:mm:ss 两种最常见的格式。
      const pad = (n) => (n < 10 ? '0' + n : '' + n)
      const yyyy = d.getFullYear()
      const MM = pad(d.getMonth() + 1)
      const dd = pad(d.getDate())
      if (/HH:mm:ss/.test(this.valueFormat || '')) {
        const HH = pad(d.getHours())
        const mm = pad(d.getMinutes())
        const ss = pad(d.getSeconds())
        return (yyyy + '-' + MM + '-' + dd + ' ' + HH + ':' + mm + ':' + ss)
      }
      return yyyy + '-' + MM + '-' + dd
    },
    handleChange(val) {
      // picker 清空按钮触发时 val 为 null —— 与 data.picked 初始化逻辑保持一致
      const next = val == null ? null : this.toPickedFormat(val)
      this.picked = next
      // emit 时把 null 还原为空字符串，与上层 el-input/el-select 模板的
      // "value 为空时给 ''" 的对外约定保持一致；非空时给 yyyy-MM-dd 字符串
      this.$emit('input', next == null ? '' : next)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-el-date-demo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
  font-family: inherit;
  color: inherit;
}
.rune-el-date-demo__field {
  width: 100%;
}
.rune-el-date-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
}
.rune-el-date-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(126, 87, 194, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  color: #6A1B9A;
}
</style>`
}

export default runeTemplatesElDatePicker