/**
 * 微应用 ↔ 主应用 IPC 桥（wujie bus 通道）
 *
 * 设计：
 *  - 子应用（vue2-sfc-playground 等）在 wujie iframe 里调 window.$wujie.bus.$emit('microapp:parse:request', { requestId, payload })
 *  - 主应用渲染进程挂这个 bridge 后，监听上面事件 → 调 ipcRenderer.invoke('vue-sfc:parse') →
 *    调 window.$wujie.bus.$emit('microapp:parse:response', { requestId, result }) 发回子应用
 *  - 子应用端 parseClient.ts 按 requestId 配对，把结果 resolve/reject 给 axios.post 的 promise
 *
 * 为什么走 bus 而不是 postMessage / contextBridge：
 *  - bus 是 wujie 内置事件总线，主 / 子应用都用同样 api（bus.$on/$emit），不需要管理 listener 跨 iframe
 *  - 渲染进程内中转，IPC 调用直接复用现有的 ApiInvoker.parseVueSfc，不改主进程
 *  - 不需要新增 preload / contextBridge 注入，保持最小改动
 *
 * 事件名（必须与子应用 parseClient.ts 保持同步）：
 *   PARSE_REQUEST_EVENT   = 'microapp:parse:request'
 *   PARSE_RESPONSE_EVENT  = 'microapp:parse:response'
 */

import WujieVue from 'wujie-vue2'
import { parseVueSfc } from 'src/ApiInvoker'
import debugLogger from 'src/utils/debugLogger'

export const PARSE_REQUEST_EVENT = 'microapp:parse:request'
export const PARSE_RESPONSE_EVENT = 'microapp:parse:response'

let installed = false
let uninstallRef = null

/**
 * 注册 / 注销 wujie bus 上的 /parse 桥（幂等）。
 * 在 microAppHost 的 mounted / beforeDestroy 调用。
 *
 * @returns {() => void} uninstall 句柄；调用即取消订阅（幂等）
 */
export function installMicroAppParseBridge () {
  if (installed && uninstallRef) return uninstallRef
  if (!WujieVue || !WujieVue.bus) {
    debugLogger.Info('[microAppIpcBridge] WujieVue.bus 不可用，跳过注册')
    return () => {}
  }

  const { bus } = WujieVue

  const handler = async (envelope = {}) => {
    const { requestId, payload } = envelope
    if (!requestId) {
      debugLogger.Info('[microAppIpcBridge] 收到缺 requestId 的请求，已忽略', envelope)
      return
    }

    try {
      const source = typeof payload === 'string' ? payload : (payload && payload.source)
      const options = (payload && typeof payload === 'object') ? (payload.options || {}) : {}
      const filename = (payload && typeof payload === 'object' && payload.filename) || 'inline.vue'
      const sourceMap = (payload && typeof payload === 'object' && payload.sourceMap) || false

      const result = await parseVueSfc(source, { ...options, filename, sourceMap })
      bus.$emit(PARSE_RESPONSE_EVENT, {
        requestId,
        ok: true,
        result
      })
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      const code = err && err.code ? err.code : 'VUE_SFC_PARSE_BRIDGE_FAILED'
      bus.$emit(PARSE_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { message, code }
      })
    }
  }

  bus.$on(PARSE_REQUEST_EVENT, handler)

  installed = true
  uninstallRef = function uninstall () {
    if (!installed) return
    try { bus.$off(PARSE_REQUEST_EVENT, handler) } catch (_) { /* noop */ }
    installed = false
    uninstallRef = null
    debugLogger.Info('[microAppIpcBridge] 已注销 vue-sfc:parse 桥')
  }
  debugLogger.Info('[microAppIpcBridge] 已注册 vue-sfc:parse 桥（事件：', PARSE_REQUEST_EVENT, '→', PARSE_RESPONSE_EVENT, '）')

  return uninstallRef
}

/**
 * 调试 / 测试用：是否已注册。
 */
export function isMicroAppParseBridgeInstalled () {
  return installed
}