import ContentState from './contentState'
import EventCenter from './eventHandler/event'
import MouseEvent from './eventHandler/mouseEvent'
import Clipboard from './eventHandler/clipboard'
import Keyboard from './eventHandler/keyboard'
import DragDrop from './eventHandler/dragDrop'
import Resize from './eventHandler/resize'
import ClickEvent from './eventHandler/clickEvent'
import { CLASS_OR_ID, MUYA_DEFAULT_OPTION } from './config'
import ExportMarkdown from './utils/exportMarkdown'
import ExportHtml from './utils/exportHtml'
import ToolTip from './ui/tooltip'
import * as utils from './utils'
import TablePicker from './ui/tablePicker'
import QuickInsert from './ui/quickInsert'
import CodePicker from './ui/codePicker'
import EmojiPicker from './ui/emojiPicker'
import ImagePathPicker from './ui/imagePicker'
import ImageSelector from './ui/imageSelector'
import FormatPicker from './ui/formatPicker'
import FrontMenu from './ui/frontMenu'
import ImageToolbar from './ui/imageToolbar'
import LinkTools from './ui/linkTools'
import TableBarTools from './ui/tableTools'
import Transformer from './ui/transformer'
import './assets/styles/index.css'

class Muya {
  static plugins = []

  static use (plugin, options = {}) {
    this.plugins.push({
      plugin,
      options
    })
  }

  constructor (container, options) {
    this.options = Object.assign({}, MUYA_DEFAULT_OPTION, options)
    const { markdown } = this.options
    this.markdown = markdown
    this.container = getContainer(container, this.options)
    this.eventCenter = new EventCenter()
    this.tooltip = new ToolTip(this)
    // UI plugins
    if (Muya.plugins.length) {
      for (const { plugin: Plugin, options: opts } of Muya.plugins) {
        this[Plugin.pluginName] = new Plugin(this, opts)
      }
    }

    this.contentState = new ContentState(this, this.options)
    this.clipboard = new Clipboard(this)
    this.clickEvent = new ClickEvent(this)
    this.keyboard = new Keyboard(this)
    this.dragdrop = new DragDrop(this)
    this.resize = new Resize(this)
    this.mouseEvent = new MouseEvent(this)
    this.init()
  }

  init () {
    const { container, contentState, eventCenter } = this
    contentState.stateRender.setContainer(container.children[0])
    eventCenter.subscribe('stateChange', this.dispatchChange)
    const { markdown } = this
    const { focusMode } = this.options
    this.setMarkdown(markdown)
    this.setFocusMode(focusMode)
    this.mutationObserver()
    eventCenter.attachDOMEvent(container, 'focus', () => {
      eventCenter.dispatch('focus')
    })
    eventCenter.attachDOMEvent(container, 'blur', () => {
      eventCenter.dispatch('blur')
    })
  }

  refreshRuneCards (runeCards = []) {
    this.options.runeCards = Array.isArray(runeCards) ? runeCards : []
    const quickInsert = this.ui && this.ui.quickInsert
    if (quickInsert) {
      quickInsert.renderObj = quickInsert.getRenderObj()
      if (quickInsert.oldVnode) {
        quickInsert.render()
      }
    }
    this.contentState.render(false, true)
    if (this.contentState?.stateRender?.renderRunes) {
      this.contentState.stateRender.renderRunes()
    }
  }

  mutationObserver () {
    // Select the node that will be observed for mutations
    const { container, eventCenter } = this

    // Options for the observer (which mutations to observe)
    const config = { childList: true, subtree: true }

    // Callback function to execute when mutations are observed
    const callback = (mutationsList, observer) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          const { removedNodes, target } = mutation
          // If the code executes any of the following `if` statements, the editor has gone wrong.
          // need to report bugs.
          if (removedNodes && removedNodes.length) {
            const hasTable = Array.from(removedNodes).some(node => node.nodeType === 1 && node.closest('table.ag-paragraph'))
            if (hasTable) {
              eventCenter.dispatch('crashed')
              console.warn('There was a problem with the table deletion.')
            }
          }

          if (target.getAttribute('id') === 'ag-editor-id' && target.childElementCount === 0) {
            // TODO: the editor can not be input any more. report bugs and recovery...
            eventCenter.dispatch('crashed')
            console.warn('editor crashed, and can not be input any more.')
          }
        }
      }
    }

    // Create an observer instance linked to the callback function
    const observer = new MutationObserver(callback)

    // Start observing the target node for configured mutations
    observer.observe(container, config)
  }

  dispatchChange = () => {
    const { eventCenter } = this
    const markdown = this.markdown = this.getMarkdown()
    const wordCount = this.getWordCount(markdown)
    const cursor = this.getCursor()
    const history = this.getHistory()
    const toc = this.getTOC()

    eventCenter.dispatch('change', { markdown, wordCount, cursor, history, toc })
  }

  dispatchSelectionChange = () => {
    const selectionChanges = this.contentState.selectionChange()
    // Skip dispatch if selectionChanges is null (cursor is invalid)
    if (selectionChanges === null) {
      return
    }
    this.eventCenter.dispatch('selectionChange', selectionChanges)
  }

  dispatchSelectionFormats = () => {
    const { formats } = this.contentState.selectionFormats()

    this.eventCenter.dispatch('selectionFormats', formats)
  }

  getMarkdown () {
    const blocks = this.contentState.getBlocks()
    const listIndentation = this.contentState.listIndentation
    return new ExportMarkdown(blocks, listIndentation).generate()
  }

  /**
   * We only lint plain text markdown blocks
   */
  lintMarkdown (lintCallBack) {
    const blocks = this.contentState.getBlocks()
    const travel = blocks => {
      for (const block of blocks) {
        if (/h\d/.test(block.type) || /span/.test(block.type)) {
          block.text = lintCallBack(block.text)
        }
        if (/pre/.test(block.type)) continue
        const { children } = block
        if (children.length) {
          travel(children)
        }
      }
    }
    travel(blocks)
    const listIndentation = this.contentState.listIndentation
    return new ExportMarkdown(blocks, listIndentation).generate()
  }

  getHistory () {
    return this.contentState.getHistory()
  }

  getTOC () {
    return this.contentState.getTOC()
  }

  setHistory (history) {
    return this.contentState.setHistory(history)
  }

  clearHistory () {
    return this.contentState.history.clearHistory()
  }

  exportStyledHTML (options) {
    const { markdown } = this
    return new ExportHtml(markdown, this).generate(options)
  }

  exportHtml () {
    const { markdown } = this
    return new ExportHtml(markdown, this).renderHtml()
  }

  getWordCount (markdown) {
    return utils.wordCount(markdown)
  }

  getCursor () {
    return this.contentState.getCodeMirrorCursor()
  }

  setMarkdown (markdown, cursor, isRenderCursor = true) {
    let newMarkdown = markdown
    let isValid = false
    if (cursor && cursor.anchor && cursor.focus) {
      const cursorInfo = this.contentState.addCursorToMarkdown(markdown, cursor)
      newMarkdown = cursorInfo.markdown
      isValid = cursorInfo.isValid
    }
    this.contentState.importMarkdown(newMarkdown)
    this.contentState.importCursor(cursor && isValid)
    this.contentState.render(isRenderCursor)
    setTimeout(() => {
      this.dispatchChange()
    }, 0)
  }

  setCursor (cursor) {
    const markdown = this.getMarkdown()
    const isRenderCursor = true

    return this.setMarkdown(markdown, cursor, isRenderCursor)
  }

  createTable (tableChecker) {
    return this.contentState.createTable(tableChecker)
  }

  getSelection () {
    return this.contentState.selectionChange()
  }

  setFocusMode (bool) {
    const { container } = this
    const { focusMode } = this.options
    if (bool && !focusMode) {
      container.classList.add(CLASS_OR_ID.AG_FOCUS_MODE)
    } else {
      container.classList.remove(CLASS_OR_ID.AG_FOCUS_MODE)
    }
    this.options.focusMode = bool
  }

  setFont ({ fontSize, lineHeight }) {
    if (fontSize) {
      this.options.fontSize = parseInt(fontSize, 10)
    }
    if (lineHeight) {
      this.options.lineHeight = lineHeight
    }
    this.contentState.render(false)
  }

  setTabSize (tabSize) {
    if (!tabSize || typeof tabSize !== 'number') {
      tabSize = 4
    } else if (tabSize < 1) {
      tabSize = 1
    } else if (tabSize > 4) {
      tabSize = 4
    }
    this.contentState.tabSize = tabSize
  }

  setListIndentation (listIndentation) {
    if (typeof listIndentation === 'number') {
      if (listIndentation < 1 || listIndentation > 4) {
        listIndentation = 1
      }
    } else if (listIndentation !== 'dfm') {
      listIndentation = 1
    }
    this.contentState.listIndentation = listIndentation
  }

  updateParagraph (type) {
    this.contentState.updateParagraph(type)
  }

  duplicate () {
    this.contentState.duplicate()
  }

  deleteParagraph () {
    this.contentState.deleteParagraph()
  }

  insertParagraph (location/* before or after */, text = '', outMost = false) {
    this.contentState.insertParagraph(location, text, outMost)
  }

  editTable (data) {
    this.contentState.editTable(data)
  }

  hasFocus () {
    return document.activeElement === this.container
  }

  focus () {
    this.contentState.setCursor()
    this.container.focus()
  }

  blur (isRemoveAllRange = false, unSelect = false) {
    if (isRemoveAllRange) {
      const selection = document.getSelection()
      selection.removeAllRanges()
    }

    if (unSelect) {
      this.contentState.selectedImage = null
      this.contentState.selectedTableCells = null
    }

    this.hideAllFloatTools()
    this.container.blur()
  }

  format (type) {
    this.contentState.format(type)
  }

  insertImage (imageInfo) {
    this.contentState.insertImage(imageInfo)
  }

  search (value, opt) {
    const { selectHighlight } = opt
    this.contentState.search(value, opt)
    this.contentState.render(!!selectHighlight)
    return this.contentState.searchMatches
  }

  replace (value, opt) {
    this.contentState.replace(value, opt)
    this.contentState.render(false)
    return this.contentState.searchMatches
  }

  find (action/* pre or next */) {
    this.contentState.find(action)
    this.contentState.render(false)
    return this.contentState.searchMatches
  }

  on (event, listener) {
    this.eventCenter.subscribe(event, listener)
  }

  off (event, listener) {
    this.eventCenter.unsubscribe(event, listener)
  }

  once (event, listener) {
    this.eventCenter.subscribeOnce(event, listener)
  }

  undo () {
    this.contentState.history.undo()

    this.dispatchSelectionChange()
    this.dispatchSelectionFormats()
    this.dispatchChange()
  }

  redo () {
    this.contentState.history.redo()

    this.dispatchSelectionChange()
    this.dispatchSelectionFormats()
    this.dispatchChange()
  }

  selectAll () {
    if (!this.hasFocus() && !this.contentState.selectedTableCells) {
      return
    }
    this.contentState.selectAll()
  }

  /**
   * Get all images' src from the given markdown.
   * @param {string} markdown you want to extract images from this markdown.
   */
  extractImages (markdown = this.markdown) {
    return this.contentState.extractImages(markdown)
  }

  copyAsMarkdown () {
    this.clipboard.copyAsMarkdown()
  }

  copyAsHtml () {
    this.clipboard.copyAsHtml()
  }

  pasteAsPlainText () {
    this.clipboard.pasteAsPlainText()
  }

  /**
   * Copy the anchor block contains the block with `info`. like copy as markdown.
   * @param {string|object} key the block key or block
   */
  copy (info) {
    return this.clipboard.copy('copyBlock', info)
  }

  setOptions (options, needRender = false) {
    // FIXME: Just to be sure, disabled due to #1648.
    if (options.codeBlockLineNumbers) {
      options.codeBlockLineNumbers = false
    }

    Object.assign(this.options, options)
    if (needRender) {
      this.contentState.render(false, true)
    }

    // Set quick insert hint visibility
    const hideQuickInsertHint = options.hideQuickInsertHint
    if (typeof hideQuickInsertHint !== 'undefined') {
      const hasClass = this.container.classList.contains('ag-show-quick-insert-hint')
      if (hideQuickInsertHint && hasClass) {
        this.container.classList.remove('ag-show-quick-insert-hint')
      } else if (!hideQuickInsertHint && !hasClass) {
        this.container.classList.add('ag-show-quick-insert-hint')
      }
    }

    // Set spellcheck container attribute
    const spellcheckEnabled = options.spellcheckEnabled
    if (typeof spellcheckEnabled !== 'undefined') {
      this.container.setAttribute('spellcheck', !!spellcheckEnabled)
    }

    if (options.bulletListMarker) {
      this.contentState.turndownConfig.bulletListMarker = options.bulletListMarker
    }
  }

  hideAllFloatTools () {
    return this.keyboard.hideAllFloatTools()
  }

  /**
   * Replace the word range with the given replacement.
   *
   * @param {*} line A line block reference of the line that contains the word to
   *                 replace - must be a valid reference!
   * @param {*} wordCursor The range of the word to replace (line: "abc >foo< abc"
   *                       whereas `>`/`<` is start and end of `wordCursor`). This
   *                       range is replaced by `replacement`.
   * @param {string} replacement The replacement.
   * @param {boolean} setCursor Shoud we update the editor cursor?
   */
  replaceWordInline (line, wordCursor, replacement, setCursor = false) {
    this.contentState.replaceWordInline(line, wordCursor, replacement, setCursor)
  }

  getPositionReference () {
    return this.contentState.getPositionReference()
  }

  getNextBlockKey (key) {
    const currentBlock = this.contentState.getBlock(key)
    if (!currentBlock) return null

    const nextBlock = this.contentState.getNextSibling(currentBlock)
    if (!nextBlock) return null

    return nextBlock.key
  }

  destroy () {
    this.contentState.clear()
    this.quickInsert.destroy()
    this.codePicker.destroy()
    this.tablePicker.destroy()
    this.emojiPicker.destroy()
    this.imagePathPicker.destroy()
    this.eventCenter.detachAllDomEvents()
    this.contentState.stateRender.cleanupDetachedRuneVms(true)
  }
}

/**
  * [ensureContainerDiv ensure container element is div]
  */
function getContainer (originContainer, options) {
  const { hideQuickInsertHint, spellcheckEnabled } = options
  const container = document.createElement('div')
  const rootDom = document.createElement('div')
  const attrs = originContainer.attributes
  // copy attrs from origin container to new div element
  Array.from(attrs).forEach(attr => {
    container.setAttribute(attr.name, attr.value)
  })

  if (!hideQuickInsertHint) {
    container.classList.add('ag-show-quick-insert-hint')
  }

  container.setAttribute('contenteditable', true)
  container.setAttribute('autocorrect', false)
  container.setAttribute('autocomplete', 'off')
  // NOTE: The browser is not able to correct misspelled words words without
  // a custom implementation like in Mark Text.
  container.setAttribute('spellcheck', !!spellcheckEnabled)
  container.appendChild(rootDom)
  originContainer.replaceWith(container)
  return container
}

export default Muya

// UI 组件（供 Muya.use(...) 使用）
export {
  TablePicker,
  QuickInsert,
  CodePicker,
  EmojiPicker,
  ImagePathPicker,
  ImageSelector,
  FormatPicker,
  FrontMenu,
  ImageToolbar,
  LinkTools,
  TableBarTools,
  Transformer
}

// 工具函数命名空间（向后兼容）
export { utils }

// 工具函数直接导出（供 Memocast 直接引用）
export * from './utils'

// v2026-07-31 新增：暴露 echo / rune 相关的运行时 hook，
// 供 Memocast 主项目（src/components/muya/Muya.vue）按需使用：
//   - createEchoAnnoRule    根据 echoRequireParens 构造 inlineRules.echo_anno RegExp
//   - inlineRules           parser 共享的 inlineRules 引用，可运行时 mutate echo_anno
//   - setEchoAnnoRule       运行时改写 inlineRules.echo_anno 的便捷 helper
export {
  createEchoAnnoRule,
  inlineRules,
  setEchoAnnoRule
} from './parser'

// 配置常量
export { CLASS_OR_ID, MUYA_DEFAULT_OPTION }
