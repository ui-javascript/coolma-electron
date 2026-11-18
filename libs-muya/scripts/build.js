/**
 * muya 构建脚本 —— 被 package.json scripts 调用
 * 职责：清理 dist/ 后执行 webpack 构建
 *
 * 用法：
 *   node scripts/build.js               # full 版（index.min.js）
 *   node scripts/build.js --core        # core 版（index.core.min.js，katex/mermaid/flowchart/vega-embed 外置）
 *   node scripts/build.js --dev         # development mode + watch
 *   node scripts/build.js --core --dev
 *
 * 注意：`pnpm build:all` 会先跑 full 再跑 core，所以本脚本不会主动清理已有 dist/。
 *       直接跑 `pnpm build` / `pnpm build:core` 时如果想强制清空 dist/，可加 --clean。
 */
'use strict'

const fs = require('fs')
const path = require('path')
const webpack = require('webpack')

const rootDir = path.join(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

// 解析参数
const isCore = process.argv.includes('--core')
const forceClean = process.argv.includes('--clean')
const mode = process.argv.includes('--dev') ? 'development' : 'production'
const isWatch = process.argv.includes('--watch')
process.env.NODE_ENV = mode

// 清理 dist/（仅当 --clean 显式传入，或 dist/ 完全不存在时清理空目录）
if (forceClean) {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true })
    console.log('[muya-build] cleaned dist/ (forced)')
  }
} else if (fs.existsSync(distDir) && fs.readdirSync(distDir).length > 0) {
  console.log('[muya-build] dist/ already populated, skipping clean (use --clean to force)')
}

// 从当前包加载 Webpack 5，避免 CLI 在 workspace 里误选桌面应用的 Webpack。
const config = require(isCore ? '../webpack.core.config' : '../webpack.config')
const compiler = webpack(config)

function report (error, stats) {
  if (error) {
    console.error(error)
  } else {
    console.log(stats.toString())
  }
  if (!isWatch && (error || stats.hasErrors())) process.exitCode = 1
}

if (isWatch) {
  compiler.watch({}, report)
} else {
  compiler.run((error, stats) => {
    compiler.close(closeError => report(error || closeError, stats))
  })
}
