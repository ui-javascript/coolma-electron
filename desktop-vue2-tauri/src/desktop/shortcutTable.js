/**
 * 快捷键表与匹配逻辑（纯数据，不依赖 bus / Vue，便于单元测试）。
 *
 * 表内容照抄 Electron 版 src-electron/main-process/keyboard/shortcut.js
 * 与 menu/templates/* 的 accelerator + click 参数。
 * channel 对应渲染层事件分组，arg 是原版传给渲染层的事件参数。
 */

export const SHORTCUTS = [
  // 系统级编辑：原版菜单用 Electron role（cut/copy/paste）交给 WebView 原生处理。
  // 这里只登记以保证与菜单表一致，passive 表示"不拦默认行为"。
  { acc: 'CmdOrCtrl+X', channel: 'native', event: 'cut', arg: 'cut', passive: true },
  { acc: 'CmdOrCtrl+C', channel: 'native', event: 'copy', arg: 'copy', passive: true },
  { acc: 'CmdOrCtrl+V', channel: 'native', event: 'paste', arg: 'paste', passive: true },

  // 编辑
  { acc: 'CmdOrCtrl+Z', channel: 'edit', event: 'undo', arg: 'undo' },
  { acc: 'CmdOrCtrl+Shift+Z', channel: 'edit', event: 'redo', arg: 'redo' },
  { acc: 'CmdOrCtrl+Shift+C', channel: 'edit', event: 'copyAsMarkdown', arg: 'copyAsMarkdown' },
  { acc: 'CmdOrCtrl+Shift+V', channel: 'edit', event: 'pasteAsPlainText', arg: 'pasteAsPlainText' },
  { acc: 'CmdOrCtrl+A', channel: 'edit', event: 'selectAll', arg: 'selectAll' },
  { acc: 'CmdOrCtrl+Alt+D', channel: 'edit', event: 'duplicate', arg: 'duplicate' },
  { acc: 'Shift+CmdOrCtrl+N', channel: 'edit', event: 'createParagraph', arg: 'createParagraph' },
  { acc: 'Shift+CmdOrCtrl+D', channel: 'edit', event: 'deleteParagraph', arg: 'deleteParagraph' },

  // 格式
  { acc: 'CmdOrCtrl+B', channel: 'format', arg: 'strong' },
  { acc: 'CmdOrCtrl+I', channel: 'format', arg: 'em' },
  { acc: 'CmdOrCtrl+U', channel: 'format', arg: 'u' },
  { acc: 'Shift+CmdOrCtrl+H', channel: 'format', arg: 'mark' },
  { acc: 'CmdOrCtrl+`', channel: 'format', arg: 'inline_code' },
  { acc: 'Shift+CmdOrCtrl+M', channel: 'format', arg: 'inline_math' },
  { acc: 'CmdOrCtrl+D', channel: 'format', arg: 'del' },
  { acc: 'CmdOrCtrl+L', channel: 'format', arg: 'link' },
  { acc: 'CmdOrCtrl+Shift+I', channel: 'format', arg: 'image' },
  { acc: 'Shift+CmdOrCtrl+K', channel: 'edit', event: 'formatDocumentByPangu' },
  { acc: 'Shift+CmdOrCtrl+R', channel: 'format', arg: 'clear' },

  // 段落
  { acc: 'CmdOrCtrl+1', channel: 'paragraph', arg: 'heading 1' },
  { acc: 'CmdOrCtrl+2', channel: 'paragraph', arg: 'heading 2' },
  { acc: 'CmdOrCtrl+3', channel: 'paragraph', arg: 'heading 3' },
  { acc: 'CmdOrCtrl+4', channel: 'paragraph', arg: 'heading 4' },
  { acc: 'CmdOrCtrl+5', channel: 'paragraph', arg: 'heading 5' },
  { acc: 'CmdOrCtrl+6', channel: 'paragraph', arg: 'heading 6' },
  { acc: 'CmdOrCtrl+=', channel: 'paragraph', arg: 'upgrade heading' },
  { acc: 'CmdOrCtrl+-', channel: 'paragraph', arg: 'degrade heading' },
  { acc: 'CmdOrCtrl+Shift+T', channel: 'paragraph', arg: 'table' },
  { acc: 'CmdOrCtrl+Alt+C', channel: 'paragraph', arg: 'pre' },
  { acc: 'CmdOrCtrl+Alt+Q', channel: 'paragraph', arg: 'blockquote' },
  { acc: 'CmdOrCtrl+Alt+M', channel: 'paragraph', arg: 'mathblock' },
  { acc: 'CmdOrCtrl+Alt+H', channel: 'paragraph', arg: 'html' },
  { acc: 'CmdOrCtrl+Alt+O', channel: 'paragraph', arg: 'ol-order' },
  { acc: 'CmdOrCtrl+Alt+U', channel: 'paragraph', arg: 'ul-bullet' },
  { acc: 'CmdOrCtrl+Alt+X', channel: 'paragraph', arg: 'ul-task' },
  { acc: 'CmdOrCtrl+Alt+L', channel: 'paragraph', arg: 'loose-list-item' },
  { acc: 'CmdOrCtrl+0', channel: 'paragraph', arg: 'paragraph' },
  { acc: 'CmdOrCtrl+Alt+-', channel: 'paragraph', arg: 'hr' },
  { acc: 'CmdOrCtrl+Alt+Y', channel: 'paragraph', arg: 'front-matter' },

  // 笔记
  { acc: 'CmdOrCtrl+S', channel: 'note', event: 'save', arg: true },
  { acc: 'CmdOrCtrl+Shift+F', channel: 'note', event: 'searchNote', arg: true },

  // 视图
  { acc: 'CmdOrCtrl+Shift+,', channel: 'view', event: 'switchView', arg: 'switchView' },
  { acc: 'CmdOrCtrl+Shift+.', channel: 'view', event: 'sourceMode', arg: 'sourceMode' },
  { acc: 'CmdOrCtrl+Shift+L', channel: 'view', event: 'lockMode', arg: 'lockMode' },
  // 原版 view.devtool = CmdOrCtrl+Shift+P，点开独立窗口的开发者工具
  { acc: 'CmdOrCtrl+Shift+P', channel: 'view', event: 'devtool', arg: 'devtool' }
]

/**
 * 标点键的 `KeyboardEvent.key` 随 Shift 变形（Shift+, 报 `<`、Shift+. 报 `>`），
 * 按 key 比对会让 `CmdOrCtrl+Shift+,` / `CmdOrCtrl+Shift+.` 永远命中不了。
 * 这些键改用 `KeyboardEvent.code`（物理键位，不受 Shift 影响）比对。
 */
const KEY_CODES = {
  ',': 'Comma',
  '.': 'Period',
  '=': 'Equal',
  '-': 'Minus',
  '`': 'Backquote',
  '/': 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash'
}

export function parseAccelerator (accelerator) {
  const parts = accelerator.split('+').map(part => part.trim())
  const key = parts.pop().toLowerCase()
  let mod = false
  let shift = false
  let alt = false
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (['cmdorctrl', 'ctrl', 'cmd', 'command'].includes(lower)) mod = true
    else if (lower === 'shift') shift = true
    else if (['alt', 'option'].includes(lower)) alt = true
  }
  return { key, mod, shift, alt, code: KEY_CODES[key] || null }
}

function matchesKey (binding, event) {
  const key = (event.key || '').toLowerCase()
  if (!binding.code) return binding.key === key
  // 真实事件一定带 code；没有 code 的合成事件退回 key 比对，避免测试/老调用失效。
  return event.code ? event.code === binding.code : binding.key === key
}

export function matches (binding, event) {
  if (!matchesKey(binding, event)) return false
  if (binding.shift !== event.shiftKey) return false
  if (binding.alt !== event.altKey) return false
  return binding.mod === (event.ctrlKey || event.metaKey)
}

const parsed = SHORTCUTS.map(item => ({ ...item, ...parseAccelerator(item.acc) }))

export function findShortcut (event) {
  return parsed.find(item => matches(item, event)) || null
}
