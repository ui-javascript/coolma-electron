import { isTauri } from './nativeFs'

/**
 * Electron 版用 `src/boot/electron-clipboard.js` 把主进程 clipboard 暴露到
 * `window.__electronClipboard`，Monaco 与笔记页都按同步 API 调用它。
 * Tauri 渲染层只有异步的 navigator.clipboard，这里做一层同步外壳：
 * - 写：优先 navigator.clipboard，失败降级 execCommand 复制，两者都是同步可完成的；
 * - 读：异步读取无法同步返回，改为在窗口获得焦点 / 重新可见时预热缓存，
 *   读取时返回最近一次缓存，语义上等价于「用户复制完回到本窗口后读取」。
 */

const hasAsyncClipboard = () =>
  typeof navigator !== 'undefined' &&
  navigator.clipboard &&
  typeof navigator.clipboard.readText === 'function'

let cachedText = ''

function refreshCache () {
  if (!hasAsyncClipboard()) return
  navigator.clipboard.readText()
    .then(text => { cachedText = text || '' })
    .catch(() => {})
}

function legacyWriteText (text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch (_) {
    copied = false
  }
  document.body.removeChild(area)
  return copied
}

export function writeText (text) {
  const value = String(text ?? '')
  cachedText = value
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).catch(() => { legacyWriteText(value) })
    return true
  }
  return legacyWriteText(value)
}

export function writeHTML (html, text) {
  const plain = typeof text === 'string' ? text : String(html || '').replace(/<[^>]*>/g, '')
  const items = typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write
  if (items) {
    const payload = new ClipboardItem({
      'text/html': new Blob([String(html ?? '')], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' })
    })
    navigator.clipboard.write([payload]).catch(() => { writeText(plain) })
    cachedText = plain
    return true
  }
  return writeText(plain)
}

export function readText () {
  return cachedText
}

export function clear () {
  cachedText = ''
  writeText('')
}

export function installClipboardBridge () {
  if (!isTauri() || window.__electronClipboard) return
  window.__electronClipboard = { readText, writeText, writeHTML, clear }
  window.addEventListener('focus', refreshCache)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshCache()
  })
  refreshCache()
}
