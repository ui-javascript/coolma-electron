// Stub for `coolma-muya/lib/assets/libs/snap.svg-min.js`
// demo 不渲染 mermaid / flowchart / sequence-diagram，所以序列图相关依赖都返回空实现。
// 原文件是 UMD，里面 `require('eve')` 在 vite esbuild prebundle 时会撞到 eve 解析问题。
// 这里用空 stub 替代，让相关代码路径不再被加载到 prebundle。
const Stub = new Proxy(function () {}, {
  get () { return Stub },
  apply () { return Stub }
})
export default Stub