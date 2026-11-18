/**
 * 通用微应用 ↔ 主应用 IPC 桥（wujie bus 通道）
 *
 * 解决的问题：
 *   - wujie 子应用是隔离的 iframe，没法直接拿 ipcRenderer
 *   - 主应用通过 window.$wujie.bus.$emit('microapp:ipc:request', {requestId, channel, args})
 *     让主应用帮忙跑 ipcRenderer.invoke(channel, args)，再把结果
 *     bus.$emit('microapp:ipc:response', {requestId, ok, result | error}) 发回去
 *   - 子应用拿到 {requestId} 后按 id 配对，resolve/reject 自己内部的 promise
 *
 * 这个桥是"通用"的：
 *   - 任何子应用只要往 bus 发 'microapp:ipc:request'，主应用都会帮忙 invoke
 *   - 鉴权白名单（ALLOWED_CHANNELS）由主项目侧控制，避免子应用滥用 IPC
 *   - 单独的桥实例按 channel 维度做幂等注册；同一个 channel 多次 install 只会保留一份
 *
 * 为什么不直接复用 microAppIpcBridge.js（vue-sfc:parse）：
 *   - 那是个特例桥：只支持 vue-sfc:parse 一个 channel，业务专用
 *   - 这个通用桥覆盖所有白名单内的 IPC channel，给未来其他子应用共用
 *   - 删除效果专属的"召唤 / 监听 completed / 注入目标"等业务事件放在 fullscreenBridge.js
 */

import { ipcRenderer } from 'electron'
import WujieVue from 'wujie-vue2'
import debugLogger from 'src/utils/debugLogger'

export const IPC_REQUEST_EVENT = 'microapp:ipc:request'
export const IPC_RESPONSE_EVENT = 'microapp:ipc:response'

/**
 * 默认允许子应用通过 IPC 桥调用的 channel 白名单。
 * 新增白名单 channel 时务必同步更新这里，并 review 主进程对应 handler 是否允许跨进程调用。
 *
 * 命名规则：channel 名要与 src-electron/main-process/preload.js 里
 * `ipcRendererChannels` 一致（或者与主进程 `ipcMain.handle(...)` 注册时一致）。
 */
export const DEFAULT_ALLOWED_CHANNELS = Object.freeze([
  'get-app-path',
  'get-current-note',
  'get-current-category',
  'list-notes-in-category',
  'get-clipboard-text',
  'set-clipboard-text',
  'show-notification',
  'play-sound'
])

let installed = false
let uninstallRef = null

/**
 * 安装通用 IPC 桥（幂等）。fullscreenOverlay 的 mounted 调用，
 * beforeDestroy 调用返回的 uninstall 句柄。
 *
 * @param {Object} [opts]
 * @param {string[]} [opts.allowedChannels] 白名单 channel；缺省 = DEFAULT_ALLOWED_CHANNELS
 * @param {(envelope:Object)=>void} [opts.onRequest] 每次收到请求都回调一次（用于埋点 / 日志）
 * @returns {() => void} uninstall 句柄
 */
export function installGenericMicroAppIpcBridge (opts = {}) {
  if (installed && uninstallRef) {
    debugLogger.Info('[genericMicroAppIpcBridge] 已安装，跳过重复注册')
    return uninstallRef
  }
  if (!WujieVue || !WujieVue.bus) {
    debugLogger.Info('[genericMicroAppIpcBridge] WujieVue.bus 不可用，跳过注册')
    return () => {}
  }
  const allowed = new Set((opts.allowedChannels || DEFAULT_ALLOWED_CHANNELS))
  const onRequest = typeof opts.onRequest === 'function' ? opts.onRequest : null

  const bus = WujieVue.bus

  const handler = async (envelope = {}) => {
    const { requestId, channel, args } = envelope
    if (!requestId) {
      debugLogger.Info('[genericMicroAppIpcBridge] 缺 requestId 的请求，已忽略', envelope)
      return
    }
    if (!channel || typeof channel !== 'string') {
      bus.$emit(IPC_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code: 'INVALID_CHANNEL', message: 'channel must be a non-empty string' }
      })
      return
    }
    if (!allowed.has(channel)) {
      debugLogger.Info('[genericMicroAppIpcBridge] channel 不在白名单：', channel)
      bus.$emit(IPC_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code: 'CHANNEL_NOT_ALLOWED', message: `channel '${channel}' is not in allowed list` }
      })
      return
    }
    try {
      if (onRequest) {
        try { onRequest(envelope) } catch (_) { /* swallow logging error */ }
      }
      const result = await ipcRenderer.invoke(channel, args)
      bus.$emit(IPC_RESPONSE_EVENT, {
        requestId,
        ok: true,
        result
      })
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      const code = err && err.code ? err.code : 'IPC_BRIDGE_FAILED'
      debugLogger.Info('[genericMicroAppIpcBridge] invoke 失败：', channel, message)
      bus.$emit(IPC_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code, message }
      })
    }
  }

  bus.$on(IPC_REQUEST_EVENT, handler)
  installed = true
  uninstallRef = function uninstall () {
    if (!installed) return
    try { bus.$off(IPC_REQUEST_EVENT, handler) } catch (_) { /* noop */ }
    installed = false
    uninstallRef = null
    debugLogger.Info('[genericMicroAppIpcBridge] 已注销')
  }
  debugLogger.Info('[genericMicroAppIpcBridge] 已注册（channel 白名单数：', allowed.size, '）')

  return uninstallRef
}

/**
 * 调试 / 测试用。
 */
export function isGenericMicroAppIpcBridgeInstalled () {
  return installed
}
