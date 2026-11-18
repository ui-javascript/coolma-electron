// vue-jest .vue 文件里 <script> 的 babel transformer
// 显式指向 babel.config.test.js，避免 vue2-jest 默认 babel-jest 找不到 babel config
const babelJest = require('babel-jest').default
const path = require('path')

module.exports = babelJest.createTransformer({
  configFile: path.resolve(__dirname, '../../babel.config.test.js')
})