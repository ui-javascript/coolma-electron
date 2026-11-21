/**
 * fullscreenBridge —— 全屏 wujie 子应用通用 bus 桥
 * ==========================================================================
 *
 * 这个桥做两件事：
 *
 * 1) 子应用 → 主项目：
 *    监听下面这些事件，把子应用的状态透出到主项目：
 *      - 'microapp:fullscreen:ready'       子应用 mount 完成，上报 version / capabilities
 *      - 'microapp:fullscreen:click-at'    子应用把鼠标点击坐标透传回来（overlay 透传用）
 *      - 'microapp:fullscreen:choice'      子应用转发的对话泡选择
 *      - 'microapp:fullscreen:completed'   效果演出结束（含 outcome）
 *      - 'microapp:fullscreen:request'     子应用发起的能力请求（get-cursor-pos / get-screen-info）
 *
 * 2) 主项目 → 子应用：
 *    提供 imperative API 让 fullscreenOverlay.vue 直接调：
 *      - summonFullscreen({ target, mousePos })   触发效果对准目标
 *      - teardownFullscreen()                    主动销毁 overlay
 *      - onCompleted(handler)                    订阅效果结束事件
 *      - onReady(handler)                        订阅子应用 ready 事件
 *
 * 设计原则：
 *   - 通用 IPC（vue-sfc:parse / get-app-path 等）走 genericMicroAppIpcBridge.js
 *   - 全屏业务事件（召唤 / 完成 / 鼠标坐标透传）走这个文件
 *   - 桥的生命周期跟 fullscreenOverlay 绑定：overlay mount 时 install，
 *     beforeDestroy 时 uninstall；不在 App 启动时 install，避免无意义监听
 *
 * v2026-08-08 演进：
 *   - 从 deleteEffectBridge 改为 fullscreenBridge，事件命名空间从
 *     `microapp:delete-effect:*` 改为 `microapp:fullscreen:*`
 *   - **向下兼容**：保留 `microapp:delete-effect:*` 旧事件名作为 alias emit/listen，
 *     让 _plugins/echo-monster-deleter 旧版本子项目无改动也能继续通信
 *   - 未来若有其它全屏业务（彩蛋 / 启动动画 / 主题弹框等），都走这一套
 */

import WujieVue from 'wujie-vue2'
import debugLogger from 'src/utils/debugLogger'

// ===== 通用事件名（新代码用这些）=====
export const FULLSCREEN_READY_EVENT = 'microapp:fullscreen:ready'
export const FULLSCREEN_CLICK_EVENT = 'microapp:fullscreen:click-at'
export const FULLSCREEN_CHOICE_EVENT = 'microapp:fullscreen:choice'
export const FULLSCREEN_COMPLETED_EVENT = 'microapp:fullscreen:completed'
export const FULLSCREEN_REQUEST_EVENT = 'microapp:fullscreen:request'
export const FULLSCREEN_RESPONSE_EVENT = 'microapp:fullscreen:response'
export const FULLSCREEN_SUMMON_EVENT = 'microapp:fullscreen:summon'
export const FULLSCREEN_TEARDOWN_EVENT = 'microapp:fullscreen:teardown'

// ===== 向下兼容 alias（旧怪兽子项目用这些）=====
const DELETE_EFFECT_READY_EVENT = 'microapp:delete-effect:ready'
const DELETE_EFFECT_CLICK_EVENT = 'microapp:delete-effect:click-at'
const DELETE_EFFECT_CHOICE_EVENT = 'microapp:delete-effect:choice'
const DELETE_EFFECT_COMPLETED_EVENT = 'microapp:delete-effect:completed'
const DELETE_EFFECT_REQUEST_EVENT = 'microapp:delete-effect:request'
const DELETE_EFFECT_RESPONSE_EVENT = 'microapp:delete-effect:response'
const DELETE_EFFECT_SUMMON_EVENT = 'microapp:delete-effect:summon'
const DELETE_EFFECT_TEARDOWN_EVENT = 'microapp:delete-effect:teardown'

let installed = false
let uninstallRef = null

/**
 * 安装全屏子应用专属桥（幂等）。
 * @param {Object} [opts]
 * @param {(click:{x:number,y:number,targetGuid?:string})=>void} [opts.onClickAt]
 * @param {(choice:{label:string,targetGuid?:string})=>void} [opts.onChoice]
 * @param {(payload:{outcome:string,targetGuid?:string,targetName?:string,ts?:number})=>void} [opts.onCompleted]
 * @param {(payload:{version:string,capabilities:string[],ts:number})=>void} [opts.onReady]
 * @param {(req:{requestId:string,kind:string,payload:any})=>any|Promise<any>} [opts.resolveRequest]
 *        子应用发起的能力请求由这个回调处理；不传则走默认 fallback
 *        （支持 get-cursor-pos / get-screen-info）。
 * @returns {() => void} uninstall 句柄
 */
export function installFullscreenBridge (opts = {}) {
  if (installed && uninstallRef) {
    debugLogger.Info('[fullscreenBridge] 已安装，跳过重复注册')
    return uninstallRef
  }
  if (!WujieVue || !WujieVue.bus) {
    debugLogger.Info('[fullscreenBridge] WujieVue.bus 不可用，跳过注册')
    return () => {}
  }

  const bus = WujieVue.bus
  const onReady = typeof opts.onReady === 'function' ? opts.onReady : null
  const onClickAt = typeof opts.onClickAt === 'function' ? opts.onClickAt : null
  const onChoice = typeof opts.onChoice === 'function' ? opts.onChoice : null
  const onCompleted = typeof opts.onCompleted === 'function' ? opts.onCompleted : null
  const resolveRequest = typeof opts.resolveRequest === 'function'
    ? opts.resolveRequest
    : defaultResolveRequest

  // --- 子 → 主：同时监听新事件名 + 旧事件名（兼容旧子项目） ---
  const readyHandler = (payload) => { safeCall(onReady, payload) }
  const clickHandler = (payload) => { safeCall(onClickAt, payload) }
  const choiceHandler = (payload) => { safeCall(onChoice, payload) }
  const completedHandler = (payload) => { safeCall(onCompleted, payload) }
  const requestHandler = async (envelope = {}) => {
    const { requestId, kind, payload } = envelope
    if (!requestId) return
    try {
      const result = await resolveRequest({ requestId, kind, payload: payload || {} })
      // 主项目侧默认回包走新事件名；同时 alias emit 旧事件名供旧子项目收
      bus.$emit(FULLSCREEN_RESPONSE_EVENT, {
        requestId,
        ok: true,
        result: result === undefined ? null : result
      })
      bus.$emit(DELETE_EFFECT_RESPONSE_EVENT, {
        requestId,
        ok: true,
        result: result === undefined ? null : result
      })
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      const code = err && err.code ? err.code : 'FULLSCREEN_REQUEST_FAILED'
      bus.$emit(FULLSCREEN_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code, message }
      })
      bus.$emit(DELETE_EFFECT_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code, message }
      })
    }
  }

  bus.$on(FULLSCREEN_READY_EVENT, readyHandler)
  bus.$on(DELETE_EFFECT_READY_EVENT, readyHandler)
  bus.$on(FULLSCREEN_CLICK_EVENT, clickHandler)
  bus.$on(DELETE_EFFECT_CLICK_EVENT, clickHandler)
  bus.$on(FULLSCREEN_CHOICE_EVENT, choiceHandler)
  bus.$on(DELETE_EFFECT_CHOICE_EVENT, choiceHandler)
  bus.$on(FULLSCREEN_COMPLETED_EVENT, completedHandler)
  bus.$on(DELETE_EFFECT_COMPLETED_EVENT, completedHandler)
  bus.$on(FULLSCREEN_REQUEST_EVENT, requestHandler)
  bus.$on(DELETE_EFFECT_REQUEST_EVENT, requestHandler)

  installed = true
  uninstallRef = function uninstall () {
    if (!installed) return
    try {
      bus.$off(FULLSCREEN_READY_EVENT, readyHandler)
      bus.$off(DELETE_EFFECT_READY_EVENT, readyHandler)
      bus.$off(FULLSCREEN_CLICK_EVENT, clickHandler)
      bus.$off(DELETE_EFFECT_CLICK_EVENT, clickHandler)
      bus.$off(FULLSCREEN_CHOICE_EVENT, choiceHandler)
      bus.$off(DELETE_EFFECT_CHOICE_EVENT, choiceHandler)
      bus.$off(FULLSCREEN_COMPLETED_EVENT, completedHandler)
      bus.$off(DELETE_EFFECT_COMPLETED_EVENT, completedHandler)
      bus.$off(FULLSCREEN_REQUEST_EVENT, requestHandler)
      bus.$off(DELETE_EFFECT_REQUEST_EVENT, requestHandler)
    } catch (_) { /* noop */ }
    installed = false
    uninstallRef = null
    debugLogger.Info('[fullscreenBridge] 已注销')
  }
  debugLogger.Info('[fullscreenBridge] 已注册')

  return uninstallRef
}

/**
 * 调试 / 测试用。
 */
export function isFullscreenBridgeInstalled () {
  return installed
}

/**
 * 主项目侧的 imperative API：主动触发全屏效果。
 * 同时 alias emit 旧事件名供旧子项目收。
 * @param {Object} payload
 * @param {Object} payload.target    { guid, name, icon?, size?, corrupt? }
 * @param {Object} [payload.mousePos] { x, y }
 */
export function summonFullscreen (payload = {}) {
  const bus = WujieVue && WujieVue.bus
  if (!bus) {
    debugLogger.Info('[fullscreenBridge] summonFullscreen: bus 不可用')
    return false
  }
  const envelope = {
    target: payload.target || null,
    mousePos: payload.mousePos || null,
    ts: Date.now()
  }
  bus.$emit(FULLSCREEN_SUMMON_EVENT, envelope)
  bus.$emit(DELETE_EFFECT_SUMMON_EVENT, envelope)
  return true
}

/**
 * 主项目侧的 imperative API：主动销毁 overlay。
 * 同时 alias emit 旧事件名。
 */
export function teardownFullscreen () {
  const bus = WujieVue && WujieVue.bus
  if (!bus) return false
  const envelope = { ts: Date.now() }
  bus.$emit(FULLSCREEN_TEARDOWN_EVENT, envelope)
  bus.$emit(DELETE_EFFECT_TEARDOWN_EVENT, envelope)
  return true
}

// ===== 向后兼容 alias（怪兽子项目还可能在调用 installDeleteEffectBridge） =====
// 这些 alias 不带 uninstall 句柄，只为让 main 侧其它路径上的旧 import 不报错。
export const installDeleteEffectBridge = installFullscreenBridge
export const isDeleteEffectBridgeInstalled = isFullscreenBridgeInstalled
export const summonDeleteEffect = summonFullscreen
export const teardownDeleteEffect = teardownFullscreen

// ===== internal =====
function safeCall (fn, arg) {
  if (!fn) return
  try { fn(arg) } catch (e) {
    debugLogger.Info('[fullscreenBridge] handler threw:', e)
  }
}

/**
 * 默认的 request resolver：支持 get-cursor-pos / get-screen-info 两个 kind。
 * 子项目没拿到主项目侧的定制 resolver 时，至少这两个基础能力可用。
 */
export function defaultResolveRequest (envelope) {
  const { kind, payload } = envelope
  if (kind === 'get-cursor-pos') {
    return getCachedCursorPos(payload)
  }
  if (kind === 'get-screen-info') {
    return getScreenInfo()
  }
  throw Object.assign(new Error(`unknown kind '${kind}'`), { code: 'UNKNOWN_KIND' })
}

// 鼠标坐标缓存：模块级 Map，按 webContentsId 区分
const cursorPosCache = new Map() // webContentsId -> { x, y, updatedAt }

export function updateCursorPosCache (webContentsId, x, y) {
  cursorPosCache.set(webContentsId || 0, { x, y, updatedAt: Date.now() })
}

function getCachedCursorPos (payload = {}) {
  const targetId = payload.webContentsId || 0
  const cached = cursorPosCache.get(targetId)
  if (cached) return cached
  return {
    x: (typeof window !== 'undefined' ? window.innerWidth : 0) / 2,
    y: (typeof window !== 'undefined' ? window.innerHeight : 0) / 2,
    fallback: true,
    updatedAt: Date.now()
  }
}

function getScreenInfo () {
  if (typeof window === 'undefined') return {}
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX || 0,
    scrollY: window.scrollY || 0
  }
}