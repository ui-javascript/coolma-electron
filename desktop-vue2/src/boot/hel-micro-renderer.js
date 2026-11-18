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
import helMicro from 'hel-micro'

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
}
