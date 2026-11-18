/**
 * [Fuzzaldrin was used here for fuzzy search, replaced with native includes-based filter]
 * Original fuzzaldrin usages:
 *   import { filter } from 'fuzzaldrin'
 *   filter(arr, text, { key: 'label' }) → customFilterByKey(arr, text, 'label')
 * Dependencies removed: fuzzaldrin
 */
import { v4 as uuidv4 } from 'uuid'
import { patch, h } from '../../parser/render/snabbdom'
import { deepCopy, getUniqueId } from '../../utils'
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

const normalizeRuneIcon = (rune = {}) => {
  if (rune.icon && /^data:image\//.test(rune.icon)) {
    return rune.icon
  }

  const sourceText = String(rune.name || rune.text || rune.label || '').trim()
  const glyph = Array.from(sourceText)[0] || '符'
  const color = rune.color || '#7E57C2'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,PingFang SC,Microsoft YaHei,sans-serif" font-weight="700" fill="#fff">${glyph.toUpperCase()}</text></svg>`

  const encodedSvg = typeof window !== 'undefined' && typeof window.btoa === 'function'
    ? window.btoa(unescape(encodeURIComponent(svg)))
    : svg
  return `data:image/svg+xml;base64,${encodedSvg}`
}

const normalizeQuickInsertIcon = (item = {}) => {
  if (item?.meta?.type === 'rune') {
    return normalizeRuneIcon({
      ...item.meta,
      name: item.meta.runeName || item.name || item.label,
      color: item.color || item.meta.color,
      icon: item.icon
    })
  }
  return item.icon
}

const createRuneQuickInsertItem = (rune = {}) => {
  const id = rune.id || ''
  const name = (rune.name || '').trim() || 'Rune'
  const desc = (rune.desc || '').trim()
  const template = typeof rune.template === 'string' ? rune.template : ''
  const searchText = [name, desc, template].filter(Boolean).join(' ')

  return {
    title: () => name,
    subTitle: () => desc,
    label: `rune:${id || name}`,
    shortCut: '',
    icon: normalizeRuneIcon(rune),
    color: rune.color || '#7E57C2',
    searchText,
    meta: {
      type: 'rune',
      runeTemplateId: id,
      runeName: name,
      color: rune.color || '#7E57C2',
      insertContent: template
    }
  }
}

const escapeHtmlAttribute = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

// 解析 SFC 字符串里的 props 块，只关心 inheritFromPrevious 这一项的 default。
// 用来给 quickInsert 判断"插入瞬间这条符文是否默认开启继承"。
// 不读 meta.inheritFromPrevious / runeCards.inherit_from_previous ——
// 卡片级开关不再决定行为，行为完全交给 SFC props.default。
const quickInheritDefaultFromTemplate = (template = '') => {
  if (typeof template !== 'string' || !template) return undefined
  const scriptMatch = template.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  if (!scriptMatch) return undefined
  const body = scriptMatch[1]
  const exportMatch = body.match(/export\s+default\s+([\s\S]*?)\n\}\s*(?:;|$)/m)
  if (!exportMatch) return undefined
  const exportBody = exportMatch[1]
  const propsIdx = exportBody.indexOf('props')
  if (propsIdx < 0) return undefined
  const propsStart = exportBody.indexOf('{', propsIdx)
  if (propsStart < 0) return undefined
  // 大括号配对，拿到整个 props 对象字面量
  let depth = 0
  let propsEnd = -1
  for (let i = propsStart; i < exportBody.length; i++) {
    const ch = exportBody[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { propsEnd = i; break }
    }
  }
  if (propsEnd <= propsStart) return undefined
  const propsBody = exportBody.slice(propsStart + 1, propsEnd)

  // 在 propsBody 里找 inheritFromPrevious 这一项对应的字面量 { ... }，
  // 用大括号配对精确切出"它的 default 值"。
  // 例: '... inheritFromPrevious: { type: ..., default: false }, ...'
  const nameIdx = propsBody.search(/inheritFromPrevious/)
  if (nameIdx < 0) return undefined
  const colonIdx = propsBody.indexOf(':', nameIdx)
  if (colonIdx < 0) return undefined
  const braceStart = propsBody.indexOf('{', colonIdx)
  if (braceStart < 0) return undefined
  let d = 1
  let i = braceStart + 1
  for (; i < propsBody.length; i++) {
    const ch = propsBody[i]
    if (ch === '{') d++
    else if (ch === '}') {
      d--
      if (d === 0) break
    }
  }
  if (d !== 0) return undefined
  const propBlock = propsBody.slice(braceStart + 1, i) // '{ type:..., default: false }' → ' type:..., default: false '
  const defMatch = propBlock.match(/\bdefault\s*:\s*([^,}]+)/)
  if (!defMatch) return undefined
  let defRaw = defMatch[1].trim()
  // 去除尾随逗号或空白
  defRaw = defRaw.replace(/[,\s]+$/, '')
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${defRaw});`)()
  } catch (_e) {
    return undefined
  }
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

const createRunePlaceholderHtml = (item = {}, displayText = '', runeValue = '') => {
  const runeName = item?.meta?.runeName || 'Rune'
  const text = displayText || runeName
  const normalizedRuneValue = String(runeValue || '').trim()
  const runeId = uuidv4()
  const nodeId = `rune-${getUniqueId()}`

  // ★ 占位符 div 只携带 4 个 data-rune-* 系统级属性（name/id/node-id/value）。
  // SFC props 的处理全部交给 mountRuneVueHosts：
  //   - 用户手写在 Markdown 里的 data-rune-prop-*（最高优先级）
  //   - rune 卡片级字段按 snake→camel 命中 SFC prop 名（卡片级默认值）
  //   - SFC props.default（兜底）
  // 这样保持 Markdown 体积不膨胀，且三优先级合并逻辑只在渲染时跑一次。
  return `<div data-rune-name="${escapeHtmlAttribute(runeName)}" data-rune-id="${escapeHtmlAttribute(runeId)}" data-rune-node-id="${escapeHtmlAttribute(nodeId)}" data-rune-value="${escapeHtmlAttribute(normalizedRuneValue)}">${escapeHtmlAttribute(text)}</div>`
}

const escapeEchoAttrValue = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\r/g, '\\r')
  .replace(/\n/g, '\\n')
  .replace(/\t/g, '\\t')

const createEchoPlaceholderMarkup = (item = {}, prompt = '') => {
  const echoName = item?.meta?.echoName || item?.title?.() || '回响'
  const normalizedPrompt = String(prompt || '')
  // === v2026-07-30 起：快捷面板插入时自动生成 echoId（uuidv4）===
  //   - 与 rune 端 `data-rune-id` 角色一致——每个回响实例都有稳定的"实例 id"
  //   - handler 端通过 `props.echoId` 拿到
  //   - 字段名固定 `echoId`（与 parser / runtime 优先级链对齐）
  //   - definitionId 也一并写入（若 item 上有），让 runtime 解析 definition 名片时直接命中
  //     （不必 fallback 到 name）；quickInsert 当前 echo item 没传 id，先不写也没问题——
  //     runtime 端 _doAfterRender 会按 data-echo-name 兜底找 echo。
  const echoId = uuidv4()
  // item?.meta?.runeId 是 rune item 的 templateId；echo item 这里没有「定义 id」字段
  // （echoCards 端走 echo.id 作为 definitionId 已是 echoRuntime 的解析路径之一），
  // 所以 echo 路径这里 definitionId 暂留空，让 runtime 端按 echoName 兜底。
  const parts = [`echoId: '${escapeEchoAttrValue(echoId)}'`]
  parts.push(`value: '${escapeEchoAttrValue(normalizedPrompt)}'`)
  return `@${echoName}{${parts.join(', ')}}()`
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
          const icon = normalizeQuickInsertIcon(item)
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

  getRuneDisplayText (item) {
    const runeName = item?.meta?.runeName || 'Rune'
    const rawText = String(this.block?.text || '')
      .replace(/^@+/, '')
      .trim()

    if (!rawText) return runeName

    const compactText = rawText.replace(/\s+/g, ' ').trim()
    if (!compactText) return runeName

    const withoutRuneName = compactText.replace(runeName, '').trim()
    return withoutRuneName || runeName
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

  getRuneInheritFromPreviousEnabled (item = {}) {
    // 唯一真理来源：SFC 自身的 props.inheritFromPrevious.default
    //   - true  → 插入瞬间去读上一行，灌进 data-rune-value
    //   - false/undefined → 不读，runeValue 留空
    // 卡片级开关（meta.inheritFromPrevious / runeCards[*].inherit_from_previous）
    // 已弃用 —— 行为完全交给 SFC。
    const template = String(item?.meta?.insertContent || '')
    const def = quickInheritDefaultFromTemplate(template)
    return def === true
  }

  insertRuneTemplate(item) {
    const { contentState } = this.muya
    const displayText = this.getRuneDisplayText(item)
    const rawCurrentText = String(this.block?.text || '')
    const hasExistingRunePlaceholder = /data-rune-name\s*=|data-rune-id\s*=|data-rune-node-id\s*=/.test(rawCurrentText)
    const isFirstInsertionFromQuickInsert = /^@/.test(rawCurrentText) && !hasExistingRunePlaceholder
    const currentBlock = this.block && typeof contentState.getBlock === 'function'
      ? contentState.getBlock(this.block.key)
      : null
    const parentBlock = currentBlock && typeof contentState.getParent === 'function'
      ? contentState.getParent(currentBlock)
      : null
    const grandParentBlock = parentBlock && typeof contentState.getParent === 'function'
      ? contentState.getParent(parentBlock)
      : null

    // Handle inline @ insertion
    const atPosition = this.getAtTriggerPosition()
    const isInlineAt = atPosition !== null && atPosition > 1

    // 默认不读取上一行；只有当符文自身声明 inheritFromPrevious: true 时才读取。
    const inheritEnabled = this.getRuneInheritFromPreviousEnabled(item)
    let previousLine = null
    let runeValue = ''

    let insertContent, finalText

    if (isInlineAt) {
      // For inline @, get value from previous line and preserve text before @
      if (inheritEnabled) {
        previousLine = this.getPreviousNonEmptyLine()
        runeValue = previousLine?.isPlainText ? previousLine.text : ''
      }
      insertContent = typeof createRunePlaceholderHtml === 'function'
        ? createRunePlaceholderHtml(item, displayText, runeValue)
        : `<div data-rune-name="${escapeHtmlAttribute(item?.meta?.runeName || 'Rune')}" data-rune-id="${uuidv4()}" data-rune-node-id="rune-${getUniqueId()}" data-rune-value="${escapeHtmlAttribute(String(runeValue).trim())}">${escapeHtmlAttribute(displayText)}</div>`
      const textBeforeAt = rawCurrentText.substring(0, atPosition - 1) // -1 to exclude the @
      finalText = textBeforeAt + insertContent
    } else {
      // Original behavior for line-start @
      if (inheritEnabled && isFirstInsertionFromQuickInsert) {
        previousLine = this.getPreviousNonEmptyLine()
        runeValue = previousLine?.isPlainText ? previousLine.text : ''
      }
      insertContent = typeof createRunePlaceholderHtml === 'function'
        ? createRunePlaceholderHtml(item, displayText, runeValue)
        : `<div data-rune-name="${escapeHtmlAttribute(item?.meta?.runeName || 'Rune')}" data-rune-id="${uuidv4()}" data-rune-node-id="rune-${getUniqueId()}" data-rune-value="${escapeHtmlAttribute(String(runeValue).trim())}">${escapeHtmlAttribute(displayText)}</div>`
      finalText = insertContent
    }

    console.log('[QuickInsert.insertRuneTemplate]', {
      currentBlockKey: this.block?.key,
      currentBlockText: this.block?.text,
      hasExistingRunePlaceholder,
      isFirstInsertionFromQuickInsert,
      isInlineAt,
      inheritEnabled,
      currentBlock,
      parentBlock,
      grandParentBlock,
      previousSiblingOfCurrent: currentBlock && typeof contentState.getPreSibling === 'function'
        ? contentState.getPreSibling(currentBlock)
        : null,
      previousSiblingOfParent: parentBlock && typeof contentState.getPreSibling === 'function'
        ? contentState.getPreSibling(parentBlock)
        : null,
      previousLine,
      runeValue,
      insertContentPreview: insertContent.slice(0, 160)
    })

    if (isFirstInsertionFromQuickInsert && !isInlineAt && inheritEnabled && previousLine?.isPlainText && previousLine.removeTarget && this.block) {
      contentState.removeBlock(previousLine.removeTarget)
    }

    const activeBlock = this.block && contentState.getBlock(this.block.key)
    if (!activeBlock) return

    const { key } = activeBlock
    activeBlock.text = finalText
    const offset = insertContent.length
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
    contentState.updateParagraph('html', true)
  }

  insertEchoTemplate (item) {
    const { contentState } = this.muya
    const rawCurrentText = String(this.block?.text || '')
    const isFirstInsertionFromQuickInsert = /^@/.test(rawCurrentText)
    const activeBlock = this.block && contentState.getBlock(this.block.key)
    if (!activeBlock) return false

    // Handle inline @ insertion - replace from @ to cursor with echo template
    const atPosition = this.getAtTriggerPosition()
    const isInlineAt = atPosition !== null && atPosition > 1

    let finalText
    if (isInlineAt) {
      // Replace the @ and typed text with echo template
      const textBeforeAt = rawCurrentText.substring(0, atPosition - 1) // -1 to exclude the @ itself
      const previousLine = this.getPreviousNonEmptyLine()
      const echoValue = previousLine?.isPlainText ? previousLine.text : ''
      const insertContent = createEchoPlaceholderMarkup(item, echoValue)
      finalText = textBeforeAt + insertContent
    } else {
      // Original behavior for line-start @
      const previousLine = isFirstInsertionFromQuickInsert ? this.getPreviousNonEmptyLine() : null
      const echoValue = previousLine?.isPlainText ? previousLine.text : ''
      const insertContent = createEchoPlaceholderMarkup(item, echoValue)
      finalText = insertContent
    }

    const { key } = activeBlock
    activeBlock.text = finalText
    // Position cursor at the end of the block text.
    const offset = activeBlock.text.length
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset }
    }

    contentState.partialRender()
    this.muya.dispatchSelectionChange()
    this.muya.dispatchChange()

    // If no value was provided, focus the editable value marker so user can type.
    if (!isInlineAt) {
      this.muya.eventCenter.subscribeOnce('muya-selection-change', () => {
        const valueMarker = this.scrollElement.querySelector('.ag-echo-placeholder-value-marker')
        if (valueMarker) {
          const range = document.createRange()
          const sel = window.getSelection()
          range.selectNodeContents(valueMarker)
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
          valueMarker.focus()
        }
      })
    }

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
      switch (item?.meta?.type) {
        case 'rune':
          this.insertRuneTemplate(item)
          break
        case 'echo': {
          shouldDelayHide = false
          this.hide()
          const inserted = this.insertEchoTemplate(item)
          if (inserted) {
            return
          }
          break
        }
        default:
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
