'use strict'

// core 版 webpack 配置 —— 通过 `yarn build:core` 调用，输出 index.core.min.js
// 与 webpack.config.js 共享 ./webpack.config.base.js 工厂

const { buildConfig } = require('./webpack.config.base.js')
module.exports = buildConfig('core')
