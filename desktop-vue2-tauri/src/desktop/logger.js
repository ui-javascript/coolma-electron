/**
 * 文件日志：对齐原版 Electron 的 electron-log。
 *
 * 原版把主进程 console 落盘到 userData/logs/<年>/<月>/main.log。
 * Tauri 版没有主进程 console，渲染层通过 append_log 命令写同一份文件；
 * 时间戳由 Rust 侧生成，格式与 electron-log 一致（2026-11-21 15:04:05.123 [info] ...）。
 *
 * 只写异常与关键节点：日志不该成为新的启动开销，也不该被高频 UI 事件刷屏。
 */
import { invoke, isTauri } from '@tauri-apps/api/core'

let enabled = false
let windowStart = 0
let windowCount = 0
const recent = new Set()

// 一分钟最多 30 条，同一句话 1 秒内只记一次（错误循环时防刷屏）。
const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 30
const DEDUPE_MS = 1000

function allow (message) {
  const now = Date.now()
  if (now - windowStart > WINDOW_MS) {
    windowStart = now
    windowCount = 0
    recent.clear()
  }
  if (windowCount >= MAX_PER_WINDOW) return false
  if (recent.has(message)) return false
  recent.add(message)
  setTimeout(() => recent.delete(message), DEDUPE_MS)
  windowCount += 1
  return true
}

export function writeLog (level, message) {
  if (!enabled || !isTauri()) return
  const text = String(message === undefined || message === null ? '' : message).slice(0, 4000)
  if (!text || !allow(text)) return
  invoke('append_log', { level, message: text }).catch(() => {})
}

export const logInfo = message => writeLog('info', message)
export const logWarn = message => writeLog('warn', message)
export const logError = message => writeLog('error', message)

export function installLogging () {
  if (enabled || !isTauri()) return
  enabled = true

  window.addEventListener('error', event => {
    const error = event.error
    logError('渲染层异常：' + (error?.stack || error?.message || event.message))
  })
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason
    logError('未处理的 Promise：' + (reason?.stack || reason?.message || reason))
  })

  // 首屏就绪耗时写进日志，用于对比启动优化前后的真实数值。
  logInfo('[启动] 渲染层就绪，用时 ' + Math.round(performance.now()) + ' ms')
}
