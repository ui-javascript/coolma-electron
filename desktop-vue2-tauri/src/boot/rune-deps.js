/**
 * rune-deps boot file —— 把 jQuery 注册到 renderer 全局，让 EchoRuntime / 内置回响
 * 的 handler 函数体 / 用户自定义 rune 都能直接用 `$` / `jQuery` 语法。
 *
 * 改动动机：
 *   - EchoRuntime 通过 `new Function(prelude + annoSource)` 在容器里编译并运行每个
 *     echo-chant 的 handler，闭包内默认取不到模块作用域变量，只能拿到 window / globalThis。
 *   - 因此 jQuery 必须挂到 `window.jQuery` / `window.$`，这样 prelude 注入一行
 *     `const $ = window.jQuery` 后，handler 函数体里就能直接 `$('...')` / `.on(...)`。
 *   - 同时给 Vue.prototype.$jquery 暴露一份便于 Vue 组件使用。
 */
import Vue from 'vue'
import $ from 'jquery'
import draggable from 'vuedraggable'

// 挂载到 window，确保 layui / city-picker 等依赖能找到
if (typeof window !== 'undefined') {
  window.$ = window.jQuery = $
  console.log('[rune-deps] jQuery mounted to window:', $.fn.jquery)
}

Vue.component('draggable', draggable)

export default () => {}
