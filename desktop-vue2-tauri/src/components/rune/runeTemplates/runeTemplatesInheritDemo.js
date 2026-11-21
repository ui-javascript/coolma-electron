// ============================================================================
// runeTemplatesInheritDemo —— inheritFromPrevious 演示模板
//
// 这是新建符文 / 重置模板时的默认 SFC。
//
//   父组件会注入的 props（仅系统级）：
//     - value                  当前实例的 data-rune-value
//     - runeId                 符文卡片 id（稳定）
//     - nodeId                 当前实例的 nodeId（同一卡片可以插入多次）
//     - rune                   符文卡片定义（含 inherit_from_previous 等卡片级配置）
//     - onValueChange          回写 value 的回调（一般不必直接用，$emit('input') 就够）
//
//   SFC 自定义的 prop（如 inheritFromPrevious）走"三优先级合并"通道：
//     1. host.dataset 已存在的 data-rune-prop-inherit-from-previous 最高
//     2. 否则用本 SFC props.inheritFromPrevious.default
//     3. 否则用 rune.inherit_from_previous（兜底）
//
//   mountRuneVueHosts 会按 Vue props 解析规则，把第 1/2/3 步算出来的"应当传入的值"
//   显式传进 SFC；SFC 拿到什么值就跟 Vue 自己处理 props 一样 —— prop 有传入用传入值，
//   没传入才用 props.default。这跟用户开发 Vue 组件的常规习惯一致。
//
//   $emit('update:inheritFromPrevious', next) 可以把开关变化冒泡给父组件；
//   父组件当前不主动写回卡片（保留扩展点）。
// ============================================================================
export const runeTemplatesInheritDemo = () => {
  return `<template>
  <div class="rune-inherit-demo">
    <textarea
      :value="text"
      :placeholder="placeholderText"
      @blur="handleBlur"
    />
  </div>
</template>

<script>
export default {
  name: 'RuneInheritDemo',
  props: {
    value: { type: [String, Number], default: '' },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: () => ({}) },
    // ★ 用户期望的"默认 false"语义在这里：
    // 父组件没显式传 inheritFromPrevious 时，SFC 自动拿到 false。
    // 如果父组件（host.dataset / muya 兜底）有显式值，会覆盖这里。
    inheritFromPrevious: { type: [Boolean, Number, String], default: false },
    onValueChange: { type: Function, default: null }
  },
  computed: {
    placeholderText () {
      return this._inheritFlagTrue
        ? '父组件显式传入 inheritFromPrevious=true —— value 由 quickInsert 灌入上一非空行'
        : 'SFC 自己用了 default: false —— value 不会自动继承上一行'
    },
    _inheritFlagTrue () {
      return this.inheritFromPrevious === true || this.inheritFromPrevious === 1 || this.inheritFromPrevious === '1'
    }
  },
  data() {
    return {
      text: this.value == null ? '' : String(this.value)
    }
  },
  created () {
    // ★ SFC 自行控制入口：当父组件没传、且 SFC 显式声明 default: false 时，
    // 把上一行继承来的 value 清掉，并 $emit('input', '') 同步回 Markdown。
    // 这是 Vue 自家 props 规则下"prop 没传就用 default"的延伸：
    // 如果 SFC 拿到的 inheritFromPrevious=false，主动否决卡片级继承语义。
    if (!this._inheritFlagTrue) {
      this.text = ''
      this.$emit('input', '')
    }
  },
  watch: {
    value(next) {
      const s = next == null ? '' : String(next)
      if (s !== this.text) this.text = s
    },
    inheritFromPrevious(next) {
      this._lastInheritFlag = next
    }
  },
  methods: {
    handleBlur(event) {
      const next = event && event.target ? String(event.target.value || '') : ''
      this.text = next
      this.$emit('input', next)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-inherit-demo textarea {
  width: 100%;
  min-height: 60px;
  resize: vertical;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(126, 87, 194, 0.35);
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.rune-inherit-demo textarea:focus {
  border-color: #7E57C2;
  box-shadow: 0 0 0 2px rgba(126, 87, 194, 0.2);
}
</style>`
}

export default runeTemplatesInheritDemo