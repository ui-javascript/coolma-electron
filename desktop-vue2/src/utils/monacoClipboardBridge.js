/**
 * Monaco Editor Clipboard Bridge
 *
 * 在 Electron 渲染进程中，Monaco 内置的剪贴板 API 可能在沙箱环境下不可靠。
 * 这里通过 `window.__electronClipboard`（由 src/boot/electron-clipboard.js 注入）
 * 把 Ctrl/Cmd + C / X / V 三个快捷键统一转发到 Electron 的 clipboard 模块，
 * 同时仍然触发 Monaco 自带的 clipboardAction，保证选区清理 / 多光标等默认行为正常。
 *
 * 用法：
 *   import { setupMonacoClipboard } from 'src/utils/monacoClipboardBridge'
 *   setupMonacoClipboard(monacoEditor, monaco)
 *
 *   或带回调的版本（先写剪贴板，然后调用 onCopy/onCut/onPaste）：
 *   setupMonacoClipboard(monacoEditor, monaco, { onCopy, onCut, onPaste })
 */

import * as monacoApi from 'monaco-editor'

const getClipboard = () => (typeof window !== 'undefined' ? window.__electronClipboard : null)

const triggerClipboardWrite = (editor, selectedText) => {
  const clip = getClipboard()
  if (!clip || !selectedText) return
  try {
    clip.writeText(selectedText)
  } catch (err) {
    // 剪贴板桥接失败时降级为使用浏览器 API
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(selectedText).catch(() => {})
    }
  }
}

const triggerClipboardRead = () => {
  const clip = getClipboard()
  if (clip && typeof clip.readText === 'function') {
    try {
      return clip.readText() || ''
    } catch (err) {
      // ignore
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    return '' // 浏览器 API 是异步的，无法直接返回值；只能 fallthrough 到 Monaco 默认行为
  }
  return ''
}

const handleCopy = (editor, monaco, onCopy) => {
  if (!editor) return
  const selection = editor.getSelection()
  if (!selection) return
  const model = editor.getModel()
  const selectedText = model ? model.getValueInRange(selection) : ''
  if (selectedText) {
    triggerClipboardWrite(editor, selectedText)
    if (typeof onCopy === 'function') {
      try { onCopy(selectedText) } catch (_) { /* noop */ }
    }
  }
  editor.trigger('keyboard', 'editor.action.clipboardCopyAction', null)
}

const handleCut = (editor, monaco, onCut) => {
  if (!editor) return
  const selection = editor.getSelection()
  if (!selection) return
  const model = editor.getModel()
  const selectedText = model ? model.getValueInRange(selection) : ''
  if (selectedText) {
    triggerClipboardWrite(editor, selectedText)
    if (typeof onCut === 'function') {
      try { onCut(selectedText) } catch (_) { /* noop */ }
    }
  }
  editor.trigger('keyboard', 'editor.action.clipboardCutAction', null)
}

const handlePaste = (editor, monaco, onPaste) => {
  if (!editor) return
  const text = triggerClipboardRead()
  if (!text) {
    // 没有可读的纯文本（例如只有 HTML），让 Monaco 走默认粘贴逻辑
    editor.trigger('keyboard', 'editor.action.clipboardPasteAction', null)
    return
  }
  const selection = editor.getSelection()
  if (!selection) {
    if (typeof onPaste === 'function') {
      try { onPaste(text) } catch (_) { /* noop */ }
    }
    return
  }
  editor.executeEdits('paste', [{
    range: selection,
    text,
    forceMoveMarkers: true
  }])
  if (typeof onPaste === 'function') {
    try { onPaste(text) } catch (_) { /* noop */ }
  }
}

/**
 * 为指定的 Monaco editor 实例绑定 Ctrl/Cmd + C / X / V 三个快捷键。
 *
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor | import('monaco-editor').editor.IDiffEditor} editor
 * @param {typeof import('monaco-editor')} [monaco]
 * @param {{ onCopy?: Function, onCut?: Function, onPaste?: Function }} [callbacks]
 * @returns {{ dispose: Function }} 返回 dispose 函数用于解绑快捷键
 */
export const setupMonacoClipboard = (editor, monaco = monacoApi, callbacks = {}) => {
  if (!editor || !monaco || !monaco.editor || !monaco.KeyMod || !monaco.KeyCode) {
    return { dispose: () => {} }
  }

  const copyDisposable = editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
    handleCopy(editor, monaco, callbacks.onCopy)
  })
  const pasteDisposable = editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
    handlePaste(editor, monaco, callbacks.onPaste)
  })
  const cutDisposable = editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
    handleCut(editor, monaco, callbacks.onCut)
  })

  return {
    dispose: () => {
      try { copyDisposable && copyDisposable.dispose && copyDisposable.dispose() } catch (_) { /* noop */ }
      try { pasteDisposable && pasteDisposable.dispose && pasteDisposable.dispose() } catch (_) { /* noop */ }
      try { cutDisposable && cutDisposable.dispose && cutDisposable.dispose() } catch (_) { /* noop */ }
    }
  }
}

export default setupMonacoClipboard
