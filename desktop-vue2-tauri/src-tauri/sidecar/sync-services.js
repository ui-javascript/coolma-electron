/**
 * 把 desktop-vue2/src-electron/main-process/service 里的博客部署实现同步到
 * src-tauri/sidecar/services。
 *
 * 这些文件必须内联一份：打包后 sidecar 找不到仓库里的 desktop-vue2 目录。
 * 上游改动后用本脚本刷新，并在提交里一并带上。
 *
 *   node src-tauri/sidecar/sync-services.js          # 复制
 *   node src-tauri/sidecar/sync-services.js --check  # 只比对，有差异退出码 1
 */
'use strict'

const fs = require('fs')
const path = require('path')

const FILES = ['blog-deploy-handler.js', 'sftp-service.js', 'blog-config-writer.js', 'github-api.js']
const SOURCE = path.resolve(__dirname, '..', '..', '..', 'desktop-vue2', 'src-electron', 'main-process', 'service')
const TARGET = path.join(__dirname, 'services')
const checkOnly = process.argv.includes('--check')

let differences = 0
for (const name of FILES) {
  const from = path.join(SOURCE, name)
  const to = path.join(TARGET, name)
  if (!fs.existsSync(from)) {
    console.error('[sync-services] 源文件缺失:', from)
    process.exitCode = 1
    continue
  }
  const next = fs.readFileSync(from, 'utf-8')
  const current = fs.existsSync(to) ? fs.readFileSync(to, 'utf-8') : null
  if (current === next) continue
  differences++
  if (checkOnly) {
    console.error('[sync-services] 有差异:', name)
  } else {
    fs.writeFileSync(to, next, 'utf-8')
    console.log('[sync-services] 已更新:', name)
  }
}

if (checkOnly && differences > 0) process.exitCode = 1
