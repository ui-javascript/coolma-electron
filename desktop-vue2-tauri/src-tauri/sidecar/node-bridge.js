/**
 * 博客构建 / SFTP 的 Node sidecar（JSON-RPC over stdio）。
 *
 * stdin：一行一个请求 `{ id, method, params }`
 * stdout：一行一个消息
 *   - 结果 `{ type:'result', id, ok, data }` / `{ type:'result', id, ok:false, error }`
 *   - 事件 `{ type:'event', channel, data }`，由前端转成同名 bus 事件
 *
 * 业务实现直接复用 desktop-vue2/src-electron/main-process/service 下的原版文件，
 * 这里只把 require('electron') 重定向到本站的占位实现，避免两份逻辑各自漂移。
 */
'use strict'

const path = require('path')
const fs = require('fs')
const Module = require('module')
const readline = require('readline')

const SHIM_PATH = path.join(__dirname, 'electron-shim.js')

// 原版 service 大量用 console.log 打日志，stdout 是协议通道，必须改道 stderr。
for (const level of ['log', 'info', 'debug', 'warn']) {
  console[level] = (...args) => console.error(...args)
}

const SERVICE_CANDIDATES = [
  process.env.COOLMA_SERVICE_DIR,
  path.join(__dirname, 'services'),
  path.resolve(__dirname, '..', '..', '..', 'desktop-vue2', 'src-electron', 'main-process', 'service')
].filter(Boolean)

function resolveServiceDir () {
  for (const dir of SERVICE_CANDIDATES) {
    if (fs.existsSync(path.join(dir, 'blog-deploy-handler.js'))) return dir
  }
  throw new Error('找不到博客部署服务目录：' + SERVICE_CANDIDATES.join(' | '))
}

function send (message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function emitEvent (channel, data) {
  send({ type: 'event', channel, data })
}

// —— Electron 运行时占位 ——
const webContents = { send: (channel, data) => emitEvent(channel, data) }
const fakeWindow = { webContents, setProgressBar () {}, isDestroyed: () => false }
global.__coolmaElectronShim = {
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
    isPackaged: false
  },
  BrowserWindow: {
    fromWebContents: () => fakeWindow,
    getAllWindows: () => [fakeWindow]
  },
  ipcMain: { handle () {}, on () {}, once () {} },
  shell: { openExternal () {} }
}

const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === 'electron') return SHIM_PATH
  return originalResolve.call(this, request, ...args)
}

let services = null
function loadServices () {
  if (services) return services
  const dir = resolveServiceDir()
  services = {
    dir,
    deploy: require(path.join(dir, 'blog-deploy-handler.js')),
    sftp: require(path.join(dir, 'sftp-service.js'))
  }
  return services
}

const METHODS = {
  ping () {
    return {
      pong: true,
      node: process.version,
      serviceDir: resolveServiceDir(),
      cwd: process.cwd()
    }
  },

  status () {
    return {
      node: process.version,
      serviceDir: resolveServiceDir(),
      platform: process.platform
    }
  },

  'blog.start' (params = {}) {
    const { deploy } = loadServices()
    return deploy.execBlogBuild(
      params.blogDir,
      params.githubConfig,
      { sender: webContents },
      params.theme,
      params.sftpConfig,
      params.customBuildCommand,
      params.base,
      params.packageManager,
      params.cdnDeps
    )
  },

  'blog.cancel' () {
    const { deploy } = loadServices()
    const cancel = deploy.cancelBlogBuild || deploy.cancelBlogDeploy
    if (typeof cancel === 'function') cancel()
    return { success: true }
  },

  'sftp.test' (params = {}) {
    const { sftp } = loadServices()
    return sftp.testConnection(params.config || params)
  },

  'sftp.upload' (params = {}) {
    const { sftp } = loadServices()
    return sftp.uploadDirectory(params.config, params.localDir, (filename, uploaded, total) => {
      emitEvent('sftp-upload-progress', { filename, uploaded, total })
    })
  },

  'sftp.cancel' () {
    const { sftp } = loadServices()
    if (typeof sftp.cancelUpload === 'function') sftp.cancelUpload()
    return { success: true }
  }
}

let pending = 0
let closed = false

async function handle (request) {
  const { id, method, params } = request || {}
  pending++
  try {
    const handler = METHODS[method]
    if (!handler) throw new Error('未知的 sidecar 方法：' + method)
    const data = await handler(params)
    send({ type: 'result', id, ok: true, data })
  } catch (error) {
    send({
      type: 'result',
      id,
      ok: false,
      error: { code: error?.code, message: error?.message || String(error) }
    })
  } finally {
    pending--
    if (closed && pending === 0) process.exit(0)
  }
}

process.on('uncaughtException', error => {
  console.error('[sidecar] uncaughtException:', error)
  send({ type: 'event', channel: 'sidecar-fatal', data: { message: error?.message || String(error) } })
})
process.on('unhandledRejection', error => {
  console.error('[sidecar] unhandledRejection:', error)
  send({ type: 'event', channel: 'sidecar-fatal', data: { message: error?.message || String(error) } })
})

const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on('line', line => {
  const trimmed = line.trim()
  if (!trimmed) return
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    send({ type: 'result', id: null, ok: false, error: { message: '请求不是合法 JSON' } })
    return
  }
  handle(parsed)
})
rl.on('close', () => {
  closed = true
  if (pending === 0) process.exit(0)
})

console.error('[sidecar] ready ' + JSON.stringify({ node: process.version }))
