import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import { isTauri } from './nativeFs'
import { findShortcut } from './shortcutTable'

/**
 * Electron 版把编辑、格式、段落、笔记、视图快捷键注册在原生菜单上，
 * 由主进程转发成 editor-* 事件。Tauri 没有原生菜单，这里在渲染层
 * 复刻同一组 accelerator，发出完全相同的事件与参数。
 *
 * 只 preventDefault，不阻断冒泡：Monaco 的 Ctrl+S、Muya 的按键兜底
 * 在源模式下互为补充，阻断冒泡会让源码模式无法保存。
 */
const CHANNELS = {
  edit: events.EDIT_SHORTCUT_CALL,
  format: events.FORMAT_SHORTCUT_CALL,
  paragraph: events.PARAGRAPH_SHORTCUT_CALL,
  note: events.NOTE_SHORTCUT_CALL,
  view: events.VIEW_SHORTCUT_CALL
}

function handleKeydown (event) {
  // 输入法组合中、已被处理的按键不重复触发。
  if (event.defaultPrevented || event.isComposing) return
  const shortcut = findShortcut(event)
  if (!shortcut) return
  const group = CHANNELS[shortcut.channel]
  const eventName = shortcut.channel === 'paragraph'
    ? group
    : (shortcut.event ? group[shortcut.event] : null)
  if (!eventName) return
  event.preventDefault()
  bus.$emit(eventName, shortcut.arg)
}

let installed = false

export function installKeyboardShortcuts () {
  if (!isTauri() || installed) return
  installed = true
  document.addEventListener('keydown', handleKeydown, true)
}

export function uninstallKeyboardShortcuts () {
  if (!installed) return
  installed = false
  document.removeEventListener('keydown', handleKeydown, true)
}
