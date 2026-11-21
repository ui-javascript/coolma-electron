/**
 * 外链统一出口：对齐原版 Electron 主进程的 `new-window` 行为。
 *
 * 原版逻辑（electron-main.js createWindow 内）：
 *   webContents.on('new-window') → preventDefault → 对 localhost/file 直接 return
 *   → 其余弹 dialog（message=openLinkHint，detail=url）→ 点确认后 shell.openExternal。
 *
 * Tauri 这边没有 new-window 事件可挂，改成两处入口统一收口：
 *   1. window.open(...)：全应用打开外链都走这里（Muya / MarkMap / 设置页等）
 *   2. 捕获阶段的 click：<a href="http..."> 即使没有 target=_blank 也会被拦
 * 内部地址（localhost / tauri.localhost / 同源）不拦，空地址（预览打印窗口用的
 * window.open('', '_blank')）也不拦，原样透传。
 */
import { isTauri } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { openExternal } from 'src/desktop/nativeFs'
import { i18n } from 'src/boot/i18n'
import { resolveExternalUrl } from 'src/utils/externalLink'

let promptInFlight = null

function promptAndOpen (href) {
  if (promptInFlight) return promptInFlight

  promptInFlight = ask(href, {
    title: i18n.t('components.openLinkHint'),
    kind: 'info',
    okLabel: i18n.t('components.confirm'),
    cancelLabel: i18n.t('components.cancel')
  })
    .then(confirmed => {
      if (confirmed) return openExternal(href)
      return undefined
    })
    .catch(error => {
      console.warn('[external-links] 打开外链失败', error)
    })
    .then(() => {
      promptInFlight = null
    })

  return promptInFlight
}

function onClickCapture (event) {
  if (event.defaultPrevented) return
  if (typeof event.button === 'number' && event.button !== 0) return
  const target = event.target
  const anchor = target && typeof target.closest === 'function' ? target.closest('a[href]') : null
  if (!anchor) return
  const external = resolveExternalUrl(anchor.getAttribute('href'), window.location.href)
  if (!external) return
  event.preventDefault()
  event.stopPropagation()
  promptAndOpen(external)
}

function installExternalLinks () {
  if (window.__coolmaExternalLinksBound) return

  const nativeOpen = window.open ? window.open.bind(window) : null
  window.open = function (url, target, features) {
    const external = resolveExternalUrl(url, window.location.href)
    if (external) {
      promptAndOpen(external)
      return null
    }
    return nativeOpen ? nativeOpen(url, target, features) : null
  }

  document.addEventListener('click', onClickCapture, true)
  window.__coolmaExternalLinksBound = true
}

export default () => {
  if (!isTauri()) return
  installExternalLinks()
}
