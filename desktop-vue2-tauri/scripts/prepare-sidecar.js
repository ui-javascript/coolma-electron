/**
 * 打包前把 Node 与 sidecar 依赖放进资源目录，供发布版脱离系统环境使用。
 *
 *   node scripts/prepare-sidecar.js           # 复制 node + 安装依赖
 *   node scripts/prepare-sidecar.js --check   # 只检查，不写文件
 *   node scripts/prepare-sidecar.js --force   # 重新安装依赖
 *
 * 产物都在 src-tauri/sidecar 下（已被 tauri.conf.json 的 `sidecar/**` 资源规则收集）：
 *   sidecar/node/node.exe          当前构建机的 Node
 *   sidecar/node_modules/          fs-extra + ssh2
 * 两者都不入库：node.exe 体积大，node_modules 由 npm 生成。
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const SIDECAR = path.join(ROOT, 'src-tauri', 'sidecar')
const NODE_DIR = path.join(SIDECAR, 'node')
const MODULES = path.join(SIDECAR, 'node_modules')
const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const force = args.includes('--force')

const REQUIRED_DEPS = ['@vue/compiler-sfc', 'fs-extra', 'ssh2']

function log (message) {
  console.log('[prepare-sidecar] ' + message)
}

function fail (message) {
  console.error('[prepare-sidecar] ' + message)
  process.exitCode = 1
}

function nodeBinaryName () {
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

function ensureNode () {
  const destination = path.join(NODE_DIR, nodeBinaryName())
  const source = process.execPath
  if (fs.existsSync(destination)) {
    const sameSize = fs.statSync(destination).size === fs.statSync(source).size
    if (sameSize) return destination
  }
  if (checkOnly) {
    fail('缺少 ' + destination)
    return null
  }
  fs.mkdirSync(NODE_DIR, { recursive: true })
  fs.copyFileSync(source, destination)
  if (process.platform !== 'win32') fs.chmodSync(destination, 0o755)
  log('已复制 Node: ' + source + ' -> ' + destination)
  return destination
}

function depsReady () {
  return REQUIRED_DEPS.every(name => fs.existsSync(path.join(MODULES, name, 'package.json')))
}

function installDeps () {
  if (depsReady() && !force) return true
  if (checkOnly) {
    fail('sidecar 依赖缺失，先运行 node scripts/prepare-sidecar.js')
    return false
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  log('安装 sidecar 依赖（fs-extra / ssh2）…')
  const result = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], {
    cwd: SIDECAR,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (result.status !== 0) {
    fail('npm install 失败，退出码 ' + result.status)
    return false
  }
  return true
}

ensureNode()
const installed = installDeps()

if (checkOnly) {
  if (depsReady()) log('sidecar 依赖已就绪')
} else if (installed) {
  log('sidecar 运行时就绪: ' + SIDECAR)
}
