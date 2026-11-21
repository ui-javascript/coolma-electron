import { isTauri, invoke as invokeNative } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Menu } from '@tauri-apps/api/menu'
import axios from 'axios'

const subscriptions = new Map()
const request = axios.create({ baseURL: 'https://ac.wiz.cn', timeout: 50000 })
let stopResizeListener

function emit (channel, ...args) {
  for (const callback of subscriptions.get(channel) || []) callback(null, ...args)
}

function on (channel, callback) {
  if (!subscriptions.has(channel)) subscriptions.set(channel, new Set())
  subscriptions.get(channel).add(callback)
  if (channel === 'window-maximized' && isTauri() && !stopResizeListener) {
    const current = getCurrentWindow()
    stopResizeListener = current.onResized(() => {
      current.isMaximized().then(maximized => emit(channel, maximized)).catch(console.warn)
    }).catch(error => {
      stopResizeListener = null
      console.warn(error)
    })
  }
  return ipcRenderer
}

function removeListener (channel, callback) {
  subscriptions.get(channel)?.delete(callback)
  if (!subscriptions.get(channel)?.size) removeAllListeners(channel)
  return ipcRenderer
}

function removeAllListeners (channel) {
  subscriptions.delete(channel)
  if (channel === 'window-maximized' && stopResizeListener) {
    stopResizeListener.then(stop => stop && stop())
    stopResizeListener = null
  }
  return ipcRenderer
}

async function invoke (channel, ...args) {
  if (channel.startsWith('db:') || /^(rune-template|rune-pack|echo-pack):/.test(channel)) {
    const { invokeDatabase } = await import('./database')
    return invokeDatabase(channel, ...args)
  }
  const payload = args[0]
  switch (channel) {
    case 'window-is-maximized': return isTauri() && getCurrentWindow().isMaximized()
    case 'remote-request': return remoteRequest(payload)
    case 'export-markdown-file': return download(payload.title + '.md', payload.content, 'text/markdown')
    case 'export-png': return download(payload.title + '.png', await (await fetch(payload.content)).blob(), 'image/png')
    case 'export-file': return download(payload.fileName, payload.content, 'application/octet-stream')
    case 'pop-context-menu': return popupContextMenu(payload)
    case 'get-app-path': return isTauri() ? invokeNative('app_data_path') : ''
    case 'open-sqlite-file': return isTauri() ? invokeNative('open_database_folder') : undefined
    case 'check-update': return { supported: false }
    default:
      return { success: false, error: { code: 'TAURI_UNSUPPORTED', message: 'Tauri 版暂未支持此桌面功能：' + channel } }
  }
}

const roles = { cut: 'Cut', copy: 'Copy', paste: 'Paste' }

async function remoteRequest (config) {
  if (!isTauri() || !config.wiznote) return (await request(config)).data
  const { method, data, headers = {} } = config
  const token = Object.entries(headers).find(([name]) => name.toLowerCase() === 'x-wiz-token')?.[1]
  try {
    if (config.multipart && method === 'POST') {
      // Let WebView generate the boundary (and encode filenames) and send those bytes unchanged.
      const multipart = new Response(data)
      const contentType = multipart.headers.get('content-type')
      if (!contentType?.startsWith('multipart/form-data; boundary=')) throw new Error('为知笔记上传数据格式无效')
      if ([...data.values()].some(part => part instanceof Blob && part.size > 32 * 1024 * 1024)) {
        throw new Error('为知笔记上传文件超过 32 MB')
      }
      return await invokeNative('wiznote_upload', await multipart.arrayBuffer(), {
        headers: { 'x-coolma-url': request.getUri(config), 'x-coolma-content-type': contentType, ...(token && { 'x-wiz-token': token }) }
      })
    }
    return await invokeNative('wiznote_request', {
      request: { url: request.getUri(config), method, token, body: data }
    })
  } catch (error) {
    throw new Error(typeof error === 'string' ? error : (error?.message || '为知笔记网络请求失败'))
  }
}

async function popupContextMenu ({ x, y, menuItems, contextData }) {
  if (!isTauri()) return
  const adapt = item => {
    const text = item.label || ''
    const enabled = item.enabled !== false
    if (item.type === 'separator') return { item: 'Separator' }
    if (item.submenu) return { text, enabled, items: item.submenu.map(adapt) }
    if (roles[item.role]) return { text, item: roles[item.role] }
    return {
      text,
      enabled,
      action: () => {
        if (item.click?.eventName) {
          emit('pop-context-menu-event', { eventName: item.click.eventName, eventData: item.click.eventData ?? contextData ?? null })
        }
      }
    }
  }
  const menu = await Menu.new({ items: menuItems.map(adapt) })
  try {
    await menu.popup(new LogicalPosition(x, y))
  } finally {
    await menu.close()
  }
}

function download (name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { success: true }
}

function send (channel) {
  if (!isTauri()) return
  const window = getCurrentWindow()
  let action
  switch (channel) {
    case 'window-minimize': action = window.minimize(); break
    case 'window-maximize': action = window.toggleMaximize(); break
    case 'window-close':
    case 'window-quit': action = window.close(); break
    default: return
  }
  action.catch(console.error)
}

export const ipcRenderer = {
  invoke,
  send,
  on,
  removeListener,
  removeAllListeners,
  setMaxListeners () { return ipcRenderer }
}

export const shell = {
  showItemInFolder () {
    // Tauri exports use the WebView download dialog and do not expose an
    // arbitrary path to native commands.
  }
}
