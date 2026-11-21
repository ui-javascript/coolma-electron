/**
 * JSXGraph 按需加载。
 *
 * 原实现把 925 KB 的 jsxgraph 静态 import 进 boot，首屏必须解析它，
 * 但真正用到 $jxg 的只有符文模板 runeTemplatesJsxGraph（用户手动插入才触发）。
 * 这里改成动态 import：boot 只挂一个加载函数，模板用之前 await 一次。
 */
import Vue from 'vue'

let loading = null

export function loadJxg () {
  if (!loading) {
    loading = import(/* webpackChunkName: 'jsxgraph' */ 'jsxgraph')
      .then(module => {
        const JXG = module.default || module
        Vue.prototype.$jxg = JXG
        return JXG
      })
      .catch(error => {
        console.warn('[jxgraph] 加载失败', error)
        return null
      })
  }
  return loading
}

export default () => {
  // 模板里写 `const JXG = this.$jxg || await this.$jxgReady()`，加载失败返回 null。
  Vue.prototype.$jxgReady = loadJxg
}
