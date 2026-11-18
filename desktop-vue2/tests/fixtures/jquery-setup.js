// ============================================================================
// tests/fixtures/jquery-setup.js —— Jest 全局 setup
//
// 注入 jQuery 到 jsdom window，让 echo anno_source 的
//   const $ = window.jQuery
//   const __safeDollarRuntime = (typeof window !== 'undefined' && (window.jQuery || window.$))
// 在 Node 里也能拿到一个非 null 的 $。
//
// 注意：jsdom 默认没 jQuery。jquery 3.x 直接使用 require('jquery') 即可
// （旧写法 require('jquery')(window) 返回的是 module.exports 本身，但 fn 不挂）。
// ============================================================================
// 使用 jest-environment-jsdom 已创建的 window。
// 注入 jQuery（项目已声明 jquery@3）
const $ = require('jquery')
window.jQuery = $
window.$ = $
globalThis.jQuery = $
globalThis.$ = $