import 'katex/dist/katex.min.css'

// 引擎组件走异步 chunk：SSR 构建时不会执行 libs-muya-vue2 模块体
// 符文 / 回响宿主显式全局注册：Markdown 里写 <RuneHost /> / <EchoHost /> 即可，
// 不依赖 docs/.vuepress/components 的自动注册（真实博客用 enhanceApp 安装，等价）。
import RuneHost from './rune/components/RuneHost.vue'
import EchoHost from './rune/components/EchoHost.vue'

export default ({ Vue }) => {
  // hel-micro 的 comps-vue2 产物按「宿主已有全局 Vue」编译（demo 里由 CDN 提供）。
  // VuePress 不暴露 window.Vue，这里显式补上；仅浏览器端执行。
  if (typeof window !== 'undefined') window.Vue = Vue
  Vue.component('RuneHost', RuneHost)
  Vue.component('EchoHost', EchoHost)
  Vue.component('MuyaLive', () => import('./components/MuyaLive.vue'))
}
