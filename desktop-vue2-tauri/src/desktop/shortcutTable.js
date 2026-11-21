/**
 * 快捷键表与匹配逻辑（纯数据，不依赖 bus / Vue，便于单元测试）。
 *
 * 表内容照抄 Electron 版 src-electron/main-process/keyboard/shortcut.js
 * 与 menu/templates/* 的 accelerator + click 参数。
 * channel 对应渲染层事件分组，arg 是原版传给渲染层的事件参数。
 */

export const SHORTCUTS = [
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
  { acc: 'CmdOrCtrl+Shift+L', channel: 'view', event: 'lockMode', arg: 'lockMode' }
]

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
  return { key, mod, shift, alt }
}

export function matches (binding, event) {
  const key = (event.key || '').toLowerCase()
  if (binding.key !== key) return false
  if (binding.shift !== event.shiftKey) return false
  if (binding.alt !== event.altKey) return false
  return binding.mod === (event.ctrlKey || event.metaKey)
}

const parsed = SHORTCUTS.map(item => ({ ...item, ...parseAccelerator(item.acc) }))

export function findShortcut (event) {
  return parsed.find(item => matches(item, event)) || null
}
