import { CURSOR_ANCHOR_DNA, CURSOR_FOCUS_DNA } from '../config'
import selection from '../selection'

/**
 * Markdown 选区快照控制器。
 *
 * 目的：AI 划词改写需要在“弹窗打开后”仍然准确替换原选区。
 * DOM Selection 会因为弹窗抢焦点而丢失，所以这里把完整 Markdown、选区起止
 * 字符偏移和选中文本一起快照下来；应用时只在 Markdown 未变化时整篇回填。
 */

function lineChToOffset (markdown, position) {
  if (!position) {
    return 0
  }
  const lines = markdown.split('\n')
  const line = Math.max(0, Math.min(Number(position.line) || 0, lines.length - 1))
  let offset = 0
  for (let i = 0; i < line; i += 1) {
    offset += lines[i].length + 1
  }
  const maxCh = lines[line] ? lines[line].length : 0
  const ch = Math.max(0, Math.min(Number(position.ch) || 0, maxCh))
  return offset + ch
}

function offsetToLineCh (markdown, offset) {
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, markdown.length))
  const before = markdown.slice(0, safeOffset).split('\n')
  return {
    line: before.length - 1,
    ch: before[before.length - 1].length
  }
}

function stripCursorMarkers (markedMarkdown) {
  return String(markedMarkdown || '')
    .split(CURSOR_ANCHOR_DNA).join('')
    .split(CURSOR_FOCUS_DNA).join('')
}

const selectionSnapshotCtrl = ContentState => {
  /**
   * 读取当前选区快照。没有有效选区时返回 null。
   * @returns {{markdown:string,start:number,end:number,text:string}|null}
   */
  ContentState.prototype.getSelectionInfo = function () {
    // 优先读真实 DOM 选区：Muya 拖选不一定会派发 selectionChange，引擎 this.cursor 可能滞后。
    let anchor
    let focus
    try {
      const domCursor = selection.getCursorRange()
      if (domCursor && domCursor.start && domCursor.end) {
        anchor = domCursor.start
        focus = domCursor.end
      }
    } catch {
      // 选区不在编辑器内时回退到引擎 cursor。
    }
    if (!anchor || !focus) {
      anchor = this.cursor && this.cursor.anchor
      focus = this.cursor && this.cursor.focus
    }
    if (!anchor || !focus || anchor.key === undefined || focus.key === undefined) {
      return null
    }
    // 临时给段落塞光标标记，导出带标记的 Markdown；getCodeMirrorCursor 内部会恢复 block.text。
    const cursorInfo = this.getCodeMirrorCursor(true, { anchor, focus })
    if (!cursorInfo || !cursorInfo.markdown) {
      return null
    }
    const markdown = stripCursorMarkers(cursorInfo.markdown)
    const anchorOffset = lineChToOffset(markdown, cursorInfo.cursor.anchor)
    const focusOffset = lineChToOffset(markdown, cursorInfo.cursor.focus)
    const start = Math.min(anchorOffset, focusOffset)
    const end = Math.max(anchorOffset, focusOffset)
    return {
      markdown,
      start,
      end,
      text: markdown.slice(start, end)
    }
  }

  /**
   * 按快照替换选区。快照生成后正文变了就拒绝，避免覆盖用户新输入。
   * @param {{markdown:string,start:number,end:number}} snapshot
   * @param {string} replacement
   * @returns {boolean}
   */
  ContentState.prototype.replaceSelectionSnapshot = function (snapshot, replacement) {
    if (!snapshot || typeof snapshot.markdown !== 'string' || !this.muya) {
      return false
    }
    if (this.muya.getMarkdown() !== snapshot.markdown) {
      return false
    }
    const text = String(replacement == null ? '' : replacement)
    const start = Math.max(0, Math.min(Number(snapshot.start) || 0, snapshot.markdown.length))
    const end = Math.max(start, Math.min(Number(snapshot.end) || 0, snapshot.markdown.length))
    const nextMarkdown = snapshot.markdown.slice(0, start) + text + snapshot.markdown.slice(end)
    const caret = offsetToLineCh(nextMarkdown, start + text.length)
    this.muya.setMarkdown(nextMarkdown, { anchor: caret, focus: caret }, true)
    return true
  }
}

export default selectionSnapshotCtrl
