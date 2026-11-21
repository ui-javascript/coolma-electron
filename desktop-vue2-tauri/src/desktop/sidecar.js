import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/**
 * Node sidecar 客户端。Rust 端把 sidecar 的每一行 stdout 转发成 `sidecar-line`
 * 事件，这里按 id 把结果配回 Promise，把 `{type:'event'}` 交给订阅者。
 */

const pending = new Map()
const eventHandlers = new Map()
let seq = 0
let listening = null

function settle (message) {
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.ok) entry.resolve(message.data)
  else entry.reject(Object.assign(new Error(message.error?.message || 'sidecar 调用失败'), { code: message.error?.code }))
}

function dispatch (message) {
  if (!message || typeof message !== 'object') return
  if (message.type === 'result') {
    settle(message)
    return
  }
  if (message.type === 'event') {
    for (const handler of eventHandlers.get(message.channel) || []) handler(message.data)
  }
}

function failAll (reason) {
  for (const [id, entry] of pending) {
    pending.delete(id)
    entry.reject(new Error(reason))
  }
}

async function ensureListening () {
  if (listening) return listening
  listening = Promise.all([
    listen('sidecar-line', event => {
      const payload = event?.payload
      if (typeof payload !== 'string') return
      try {
        dispatch(JSON.parse(payload))
      } catch (error) {
        console.warn('[sidecar] 无法解析输出', payload, error)
      }
    }),
    listen('sidecar-exit', () => failAll('sidecar 进程已退出'))
  ])
  return listening
}

export async function request (method, params) {
  await ensureListening()
  const id = ++seq
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
  })
  await invoke('sidecar_send', { line: JSON.stringify({ id, method, params }) })
  return promise
}

export function onSidecarEvent (channel, handler) {
  if (!eventHandlers.has(channel)) eventHandlers.set(channel, new Set())
  eventHandlers.get(channel).add(handler)
  return () => eventHandlers.get(channel)?.delete(handler)
}

export function stopSidecar () {
  return invoke('sidecar_stop').catch(error => console.warn('[sidecar] 停止失败', error))
}

export function sidecarStatus () {
  return invoke('sidecar_status')
}
