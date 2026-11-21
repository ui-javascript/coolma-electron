// require('electron') 的占位实现：拿到 node-bridge.js 预先放到 global 上的对象。
// 原版 desktop-vue2 的 service 文件因此可以在纯 Node 下运行。
module.exports = global.__coolmaElectronShim || {}
