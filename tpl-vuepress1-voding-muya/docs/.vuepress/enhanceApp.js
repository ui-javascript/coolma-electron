import 'katex/dist/katex.min.css'

// 引擎组件走异步 chunk：SSR 构建时不会执行 libs-muya 模块体
export default ({ Vue }) => {
  Vue.component('MuyaLive', () => import('./components/MuyaLive.vue'))
}
