/**
 * [Fuzzaldrin was used here for fuzzy search, replaced with native includes-based filter]
 * Original fuzzaldrin usages:
 *   import { filter } from 'fuzzaldrin'
 *   filter(arr, text, { key: 'label' }) → customFilterByKey(arr, text, 'label')
 * Dependencies removed: fuzzaldrin
 */
import { patch, h } from '../../parser/render/snabbdom'
import { deepCopy } from '../../utils'
import BaseScrollFloat from '../baseScrollFloat'
import { quickInsertObj } from './config'
import './index.css'

const DEFAULT_GRID_COLUMNS = 6
const MIN_GRID_COLUMNS = 4
const MAX_GRID_COLUMNS = 8
/**
 * Simple substring-includes filter, replacing fuzzaldrin's fuzzy match for label search.
 * @param {Array} candidates - Array of objects to filter
 * @param {string} text - Search text
 * @param {string} key - Object key to match against
 * @returns {Array} Filtered array (sorted by match position)
 */
const customFilterByKey = (candidates, text, key) => {
  if (!candidates || !text) return candidates || []
  const lower = text.toLowerCase()
  return candidates
    .filter(c => String(c[key]).toLowerCase().includes(lower))
    .sort((a, b) => String(a[key]).toLowerCase().indexOf(lower) - String(b[key]).toLowerCase().indexOf(lower))
}

const mergeRenderObjects = (baseObj, extensionObj = {}) => {
  const result = deepCopy(baseObj)
  Object.keys(extensionObj).forEach(sectionName => {
    const sectionItems = Array.isArray(extensionObj[sectionName]) ? extensionObj[sectionName] : []
    if (!result[sectionName]) {
      result[sectionName] = []
    }
    result[sectionName].push(...sectionItems)
  })
  return result
}

const reorderRenderObj = (obj = {}, preferredSections = []) => {
  const ordered = {}
  const remaining = { ...obj }

  preferredSections.forEach(sectionName => {
    if (sectionName && Array.isArray(remaining[sectionName])) {
      ordered[sectionName] = remaining[sectionName]
      delete remaining[sectionName]
    }
  })

  Object.keys(remaining).forEach(sectionName => {
    ordered[sectionName] = remaining[sectionName]
  })

  return ordered
}

class QuickInsert extends BaseScrollFloat {
  static pluginName = 'quickInsert'

  constructor(muya) {
    console.log('[QuickInsert] constructor loaded')
    const name = 'ag-quick-insert'
    super(muya, name)
    this.reference = null
    this.oldVnode = null
    this._renderObj = null
    this.renderArray = null
    this.activeItem = null
    this.block = null
    this.cursorOffset = null // Track cursor position for inline @ support
    this.columnsCount = this.getColumnsCount()
    this.sectionOffsets = [] // 记录每个分区的起始索引
    this.shouldHideOnScroll = false // Prevent scroll from hiding the panel during keyboard navigation
    this.runeSectionName = ''
    this.echoSectionName = typeof this.muya?.options?.echoSectionName === 'string'
      ? this.muya.options.echoSectionName
      : ''
    this.renderObj = this.getRenderObj()
    this.render()
    this.listen()
  }

  getDynamicRenderObj () {
    const provider = this.muya.options.quickInsertProvider
    if (typeof provider !== 'function') return {}

    const provided = provider({
      muya: this.muya,
      block: this.block,
      sectionName: this.runeSectionName,
      createRuneItem: createRuneQuickInsertItem
    })

    if (provided && typeof provided === 'object') {
      if (provided.sectionName && typeof provided.sectionName === 'string') {
        this.runeSectionName = provided.sectionName
      }
      if (provided.echoSectionName && typeof provided.echoSectionName === 'string') {
        this.echoSectionName = provided.echoSectionName
      }
      if (provided.items && typeof provided.items === 'object') {
        return provided.items
      }
      return provided
    }

    return {}
  }

  getRenderObj () {
    const { contentState } = this.muya
    const canInsertFrontMatter = this.block ? contentState.canInsertFrontMatter(this.block) : true
    const dynamicObj = this.getDynamicRenderObj()
    const obj = mergeRenderObjects(quickInsertObj, dynamicObj)
    const preferredSections = []

    if (this.runeSectionName && Array.isArray(obj[this.runeSectionName])) {
      preferredSections.push(this.runeSectionName)
    }
    if (this.echoSectionName && Array.isArray(obj[this.echoSectionName])) {
      preferredSections.push(this.echoSectionName)
    }
    if (Array.isArray(obj.diagram)) {
      preferredSections.push('diagram')
    }
    if (Array.isArray(obj['advanced block'])) {
      preferredSections.push('advanced block')
    }

    const orderedObj = reorderRenderObj(obj, preferredSections)

    if (!canInsertFrontMatter) {
      orderedObj['basic block'].splice(2, 1)
    }
    return orderedObj
  }

  getColumnsCount () {
    if (typeof document === 'undefined') return DEFAULT_GRID_COLUMNS
    const value = Number(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--quick-insert-columns')
        .trim()
    )
    if (!Number.isFinite(value)) return DEFAULT_GRID_COLUMNS
    return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, value))
  }

  set renderObj(obj) {
    this._renderObj = obj
    const renderArray = []
    const sectionOffsets = []
    Object.keys(obj).forEach(key => {
      sectionOffsets.push(renderArray.length)
      renderArray.push(...obj[key])
    })
    this.sectionOffsets = sectionOffsets
    this.renderArray = renderArray
    if (this.renderArray.length > 0) {
      this.activeItem = this.renderArray[0]
      const activeEle = this.getItemElement(this.activeItem)
      this.activeEleScrollIntoView(activeEle)
    }
  }

  render () {
    const {
      scrollElement,
      activeItem,
      _renderObj
    } = this
    this.columnsCount = this.getColumnsCount()
    let children = Object.keys(_renderObj).filter(key => {
      return _renderObj[key].length !== 0
    })
      .map(key => {
        const titleVnode = h('div.title', key.toUpperCase())
        const items = []
        for (const item of _renderObj[key]) {
          const {
            title,
            subTitle,
            label
          } = item
          const icon = item.icon
          const iconVnode = h('div.icon-container', h('i.icon', {
            style: {
              background: `url(${icon}) 0% 0% / 100% no-repeat`,
              'background-size': '100%'
            }
          }))

          const descriptionChildren = [
            h('div.big-title', title())
          ]
          if (typeof subTitle === 'function' && subTitle()) {
            descriptionChildren.push(h('div.sub-title', subTitle()))
          }
          const description = h('div.description', descriptionChildren)
          const selector =
            activeItem.label === label ? 'div.item.active' : 'div.item'
          items.push(
            h(
              selector,
              {
                dataset: { label },
                on: {
                  click: () => {
                    this.selectItem(item)
                  }
                }
              },
              [iconVnode, description]
            )
          )
        }

        return h('section', [titleVnode, h('div.items-grid', {
          style: {
            'grid-template-columns': `repeat(${this.columnsCount}, minmax(0, 1fr))`
          }
        }, items)])
      })

    if (children.length === 0) {
      children = h('div.no-result', 'No result')
    }
    const vnode = h('div', children)

    if (this.oldVnode) {
      patch(this.oldVnode, vnode)
    } else {
      patch(scrollElement, vnode)
    }
    this.oldVnode = vnode
  }

  listen () {
    super.listen()
    const { eventCenter } = this.muya
    eventCenter.subscribe('muya-quick-insert', (reference, block, status, searchText = '', cursorOffset = null) => {
      if (status) {
        this.block = block
        // Calculate cursor offset from the @ trigger position
        const textBeforeCursor = block.text.substring(0, cursorOffset !== null ? cursorOffset : block.text.length)
        const atIndex = textBeforeCursor.lastIndexOf('@')
        this.cursorOffset = atIndex >= 0 ? atIndex + 1 : textBeforeCursor.length
        this.show(reference)
        // Use searchText from event if available, otherwise extract from block text
        const keyword = searchText !== undefined ? searchText : block.text.substring(1)
        this.search(keyword)
      } else {
        this.cursorOffset = null
        this.hide()
      }
    })
  }

  // Get the position right after the @ trigger in current block text
  getAtTriggerPosition() {
    if (this.cursorOffset === null || !this.block) {
      return null
    }
    return this.cursorOffset
  }

  search(text) {
    const obj = this.getRenderObj()
    let result = obj
    if (text !== '') {
      result = {}
      Object.keys(obj).forEach(key => {
        // [Fuzzaldrin] filter(arr, text, { key: 'label' }) → customFilterByKey(arr, text, 'label')
        result[key] = customFilterByKey(obj[key], text, 'searchText')
      })
    }
    this.renderObj = result
    this.render()
  }

  getPreviousNonEmptyLine () {
    const { contentState } = this.muya
    if (!contentState || !this.block) return null

    const isPlainTextSpan = block => Boolean(
      block &&
      block.type === 'span' &&
      /paragraphContent|atxLine|cellContent/.test(block.functionType || '')
    )

    const getNormalizedText = block => String(block?.text || '').replace(/\s+/g, ' ').trim()

    const getPlainTextFromBlock = block => {
      if (!block) return null

      if (isPlainTextSpan(block)) {
        const text = getNormalizedText(block)
        return text
          ? { block, text, removeTarget: block, isPlainText: true }
          : null
      }

      if (block.type === 'p' && Array.isArray(block.children)) {
        const plainTextChild = block.children.find(child => isPlainTextSpan(child) && getNormalizedText(child))
        if (plainTextChild) {
          return {
            block,
            text: getNormalizedText(plainTextChild),
            removeTarget: block,
            isPlainText: true
          }
        }
      }

      return null
    }

    const activeBlock = typeof contentState.getBlock === 'function'
      ? contentState.getBlock(this.block.key)
      : this.block

    if (!activeBlock) return null

    const topLevelBlock = typeof contentState.findOutMostBlock === 'function'
      ? contentState.findOutMostBlock(activeBlock)
      : activeBlock

    let candidate = typeof contentState.getPreSibling === 'function'
      ? contentState.getPreSibling(topLevelBlock)
      : null

    while (candidate) {
      const resolved = getPlainTextFromBlock(candidate)

      console.log('[QuickInsert.getPreviousNonEmptyLine]', {
        currentBlockKey: this.block?.key,
        activeBlockKey: activeBlock?.key,
        topLevelBlockKey: topLevelBlock?.key,
        candidateKey: candidate?.key,
        candidateType: candidate?.type,
        candidateFunctionType: candidate?.functionType,
        candidateText: getNormalizedText(candidate),
        resolved
      })

      if (resolved) {
        return resolved
      }

      candidate = typeof contentState.getPreSibling === 'function'
        ? contentState.getPreSibling(candidate)
        : null
    }

    return null
  }

  /**
   * 类型处理器注册表。
   *
   * 引擎不知道「符文」「回响」「笔记引用」是什么，它只知道：面板选中某项后，
   * 按 item.meta.type 找一个处理器来干「把 @query 换成真正内容」这件事。
   * 所有领域语义都由调用方通过 `options.quickInsertTypes` 注入；
   * 引擎没有任何内置类型处理器，未注册的类型统一走下面的段落语义兜底。
   */
  getTypeHandler (type) {
    if (!type) return null
    const custom = this.muya?.options?.quickInsertTypes
    if (custom && typeof custom[type] === 'function') {
      return custom[type]
    }
    return null
  }

  getTypeHandlerContext () {
    return {
      quickInsert: this,
      muya: this.muya,
      contentState: this.muya.contentState,
      block: this.block,
      // 引擎承诺的插入原语（只做「替换 @query / 定位光标 / 取上一行」，不含任何领域语义）：
      //   replaceAtTrigger     → 纯文本，光标落末尾
      //   insertHtmlAtTrigger  → 富内容（html），光标落末尾
      replaceAtTrigger: (text) => this.insertTextAtTrigger(text),
      insertHtmlAtTrigger: (html) => this.insertHtmlAtTrigger(html),
      // 行内 @ 时返回 @ 之前的文字（行首 @ 返回空串）
      getTextBeforeTrigger: () => this.getTextBeforeTrigger(),
      getBlockText: () => String(this.block?.text || ''),
      isInlineTrigger: () => {
        const pos = this.getAtTriggerPosition()
        return pos !== null && pos > 1
      },
      // 上一行（跳过空行）：{ text, isPlainText, removeTarget }
      getPreviousLine: () => this.getPreviousNonEmptyLine(),
      // 删除一行（领域语义想「继承并吞掉上一行」时自己决定要不要调）
      removeLine: (target) => {
        if (!target) return false
        this.muya.contentState.removeBlock(target)
        return true
      }
    }
  }

  /**
   * 把「@ + 已输入查询」替换成给定文本，光标落在文本末尾。
   * 行内 @ 会保留 @ 之前的文字；行首 @ 则整行替换。
   */
  insertTextAtTrigger (text) {
    const { contentState } = this.muya
    const rawCurrentText = String(this.block?.text || '')
    const activeBlock = this.block && contentState.getBlock(this.block.key)
    if (!activeBlock) return false

    const atPosition = this.getAtTriggerPosition()
    const isInlineAt = atPosition !== null && atPosition > 1
    const textBeforeAt = isInlineAt ? rawCurrentText.substring(0, atPosition - 1) : ''
    const finalText = `${textBeforeAt}${text}`

    activeBlock.text = finalText
    contentState.cursor = {
      start: { key: activeBlock.key, offset: finalText.length },
      end: { key: activeBlock.key, offset: finalText.length }
    }
    contentState.partialRender()
    this.muya.dispatchSelectionChange()
    this.muya.dispatchChange()
    return true
  }

  /** 行内 @ 时返回 @ 之前的文字；行首 @ 返回空串。 */
  getTextBeforeTrigger () {
    const rawCurrentText = String(this.block?.text || '')
    const atPosition = this.getAtTriggerPosition()
    const isInlineAt = atPosition !== null && atPosition > 1
    return isInlineAt ? rawCurrentText.substring(0, atPosition - 1) : ''
  }

  /**
   * 把「@ + 已输入查询」替换成一段 html（富内容），光标落在末尾。
   * 与 insertTextAtTrigger 的区别只有一处：写回段落时声明为 html，
   * 这样 `<div data-rune-...>` 这类占位才会被解析成富节点而不是转义文本。
   */
  insertHtmlAtTrigger (html) {
    const { contentState } = this.muya
    const activeBlock = this.block && contentState.getBlock(this.block.key)
    if (!activeBlock) return false

    const finalText = `${this.getTextBeforeTrigger()}${html}`
    activeBlock.text = finalText
    contentState.cursor = {
      start: { key: activeBlock.key, offset: finalText.length },
      end: { key: activeBlock.key, offset: finalText.length }
    }
    contentState.updateParagraph('html', true)
    this.muya.dispatchSelectionChange()
    this.muya.dispatchChange()
    return true
  }

  selectItem(item) {
    console.log('[QuickInsert.selectItem]', {
      label: item?.label,
      metaType: item?.meta?.type,
      runeName: item?.meta?.runeName,
      currentBlockKey: this.block?.key,
      currentBlockText: this.block?.text
    })
    const { contentState } = this.muya
    let shouldDelayHide = true
    try {
      // Guard against null block
      if (!this.block) {
        this.hide()
        return
      }
      const { key } = this.block
      // Guard against invalid key (block may have been removed from editor)
      if (!key || !contentState.getBlock(key)) {
        this.hide()
        return
      }
      const type = item?.meta?.type
      const handler = this.getTypeHandler(type)

      if (handler) {
        // echo 语义上是「立即替换并关面板」，rune 与自定义类型交给 finally 延迟收起。
        if (type === 'echo') {
          shouldDelayHide = false
          this.hide()
          handler(item, this.getTypeHandlerContext())
          return
        }
        handler(item, this.getTypeHandlerContext())
        return
      }

      // 没有处理器的项（标题、代码块、图表等）沿用引擎内置的段落类型语义。
      this.block.text = ''
      const offset = 0
      contentState.cursor = {
        start: {
          key,
          offset
        },
        end: {
          key,
          offset
        }
      }
      switch (item.label) {
        case 'paragraph':
          contentState.partialRender()
          break
        case 'image':
          contentState.format(item.label, true)
          break
        default:
          contentState.updateParagraph(item.label, true)
          break
      }
    } catch (err) {
      console.error('QuickInsert selectItem error:', err)
    } finally {
      if (shouldDelayHide) {
        setTimeout(this.hide.bind(this))
      }
    }
  }

  // step() 方法继承自 BaseScrollFloat，无需重写

  getItemElement(item) {
    const { label } = item
    return this.scrollElement.querySelector(`[data-label="${label}"]`)
  }
  filter (candidates, target, { key }) {
    for (const candidate of candidates) {
      if (typeof candidate[key] === 'string' && candidate[key].includes(target)) {
        return candidate
      } else if (typeof candidate[key] === 'function' && candidate[key]().includes(target)) {
        return candidate
      }
    }
  }
}

export default QuickInsert
