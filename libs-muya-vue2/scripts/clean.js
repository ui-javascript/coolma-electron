/**
 * muya clean 脚本 —— 清理 dist/ 目录
 */
'use strict'

const fs = require('fs')
const path = require('path')

const distDir = path.join(__dirname, '..', 'dist')

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true })
  console.log('[muya-clean] cleaned dist/')
} else {
  console.log('[muya-clean] dist/ does not exist')
}
