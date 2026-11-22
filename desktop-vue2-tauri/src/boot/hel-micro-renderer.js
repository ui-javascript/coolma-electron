/**
 * hel-micro boot file — mounts hel-micro as Vue.prototype.$hel
 * so any component can call this.$hel.preFetchLib('lib-name') or
 * this.$hel.preFetchLib('lib-name', '1.0.0') to dynamically load
 * remote modules without bundling them into the main app.
 *
 * hel-micro will first try to load from its CDN/retrieval service,
 * then fall back to locally bundled assets. Once loaded, the module
 * is cached in memory for subsequent calls.
 *
 * Example (in any .vue):
 *   const lib = await this.$hel.preFetchLib('hel-tpl-remote-lib')
 *   lib.num.random(22)
 *
 *   const lib2 = await this.$hel.preFetchLib('hel-tpl-remote-lib', '2.0.0')
 *   lib2.num.random(22)
 *
 * The lodash library is pre-fetched as a built-in demo module so it is
 * available immediately without a network round-trip.
 */
import helMicro, { bindVueRuntime } from 'hel-micro'

// const helMicro = HelMicro.init({
//   appName: 'memocast',
//   // getLocalEntirePath: (appName) => `/remote-modules/${appName}/index.json`,
//   onBeforeCaptureModule: (module, originPkg) => {
//     console.debug('[hel-micro] module loaded:', originPkg?.name, originPkg?.version)
//     return module
//   }
// })

// Pre-fetch lodash so this.$hel.preFetchLib('lodash') resolves instantly
// in rune expressions without a network request. The loaded module follows
// the same shape as a native import: { default: fn, debounce: fn, ... }.
// helMicro.preFetchLib('lodash').catch((err) => {
//   console.warn('[hel-micro] preFetchLib("lodash") failed:', err)
// })

export default async ({ Vue }) => {
  Vue.prototype.$hel = helMicro
  // 远端组件（hel 生态产物）用 externals 里的 Vue 实例渲染；不绑定的话
  // 它们会各自 new 一个 Vue，导致响应式 / 组件注册 / 事件总线全部串味。
  // 等价于 bindExternals({ Vue, LEAH_Vue: Vue })（hel-micro 内部实现）。
  try {
    bindVueRuntime({ Vue })
  } catch (error) {
    console.warn('[hel-micro] bindVueRuntime failed:', error)
  }
}
