/**
 * 过滤 `wujie-vue2` 上游 prop 命名冲突导致的 Vue 2.7 噪音警告。
 *
 * 背景：
 *   - `wujie-vue2@1.0.29` 的 `WujieVue` 组件在自身的 `props` 里声明了 `style`
 *     字段（用来把外部传入的样式合并到 root <div>）。
 *   - Vue 2.7 在 `initProps` 阶段会校验每个 prop 名是否是 "reserved attribute"，
 *     命中后输出：`[Vue warn]: "style" is a reserved attribute and cannot be used as component prop.`
 *   - 这是 Vue 框架的硬性约束，与项目代码无关——但每个 WujieVue 实例化时都会刷一行。
 *     抽屉每次打开（microAppDrawer / AiDoubaoDrawer）就会刷一遍，对调试造成干扰。
 *   - WujieVue 的 `style` prop 实际行为 = 合并到 root 的 style 上，而 Vue 2 本身
 *     就会自动把 `:style` 透传到 root，所以删掉这个 prop 也不会破坏功能。
 *     但我们不在这里改第三方源码，只把这条噪音警告吞掉。
 *
 * 策略：只吞掉一条精确的警告文案，其它 Vue warning 一律原样打印（不要静默放行）。
 *
 * 触发条件（必须全部满足才吞）：
 *   1. msg 匹配 `"style" is a reserved attribute` 字面正则
 *   2. 触发该警告的 vm 是 `wujie-vue2` 注册出来的 `WujieVue` 组件实例
 *      （用 `$options.name === 'WujieVue'` 双重锁定，避免误吞将来别的
 *      上游包声明 `style` prop 时同样本应暴露给用户看的真实 bug）
 *
 * 一旦 `wujie-vue2` 升级到修复该 prop 命名的版本，本 boot 文件可以直接删除。
 */

// 精确匹配上游文案（含双引号包裹的 prop 名 + 完整句子，避免吞掉别的警告）
const STYLE_RESERVED_RE = /^"style" is a reserved attribute and cannot be used as component prop\.?$/

// 仅在 vm 上溯能找到 WujieVue 组件时才吞，防御性保险
function isWujieVueInstance (vm) {
  if (!vm) return false
  // $options.name 是组件声明里的 name 字段；wujie-vue2 里写的是 'WujieVue'
  return vm.$options && vm.$options.name === 'WujieVue'
}

export default ({ Vue }) => {
  const previous = Vue.config.warnHandler

  Vue.config.warnHandler = (msg, vm, trace) => {
    if (STYLE_RESERVED_RE.test(msg) && isWujieVueInstance(vm)) {
      // 完全静默吞掉——避免 dev 控制台被这条无意义的警告刷屏
      return
    }
    // 其它警告保持原有行为：优先复用上游 warnHandler（如果有），否则落到 console.error
    if (typeof previous === 'function') {
      previous.call(Vue.config, msg, vm, trace)
    } else if (typeof console !== 'undefined') {
      console.error(`[Vue warn]: ${msg}${trace ? `\n${trace}` : ''}`)
    }
  }
}