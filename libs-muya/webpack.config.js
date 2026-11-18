'use strict'

// full 版 webpack 配置 —— 通过 webpack --config=webpack.config.js 调用
// 工厂定义见 ./webpack.config.base.js

const { buildConfig } = require('./webpack.config.base.js')
module.exports = buildConfig('full')
