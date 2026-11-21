// ============================================================================
// babel.config.test.js —— 仅给 Jest 用的 babel 配置
//
// 与主项目 babel.config.js 隔离，避免拉入 @quasar/babel-preset-app 的 webpack 依赖链。
//
//   preset-env 会按 targets.node 把 ES2015+ 语法转回 Jest 能跑的 CJS。
//   不开 preset-env 的 modules:false，否则 import/export 不会被转。
//   plugins 列表和主项目一致：nullish coalescing / optional chaining 等新语法。
// ============================================================================
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }]
  ],
  plugins: [
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-nullish-coalescing-operator',
    '@babel/plugin-syntax-import-meta'
  ]
}