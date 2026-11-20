import loadRenderer from '../../renderers'
import { CLASS_OR_ID } from '../../config'
import { conflict, mixins, camelToSnake } from '../../utils'
import { patch, toVNode, toHTML, h } from './snabbdom'
import { beginRules } from '../rules'
import renderInlines from './renderInlines'
import renderBlock from './renderBlock'
import { tokenizer } from '../index'
import { i18n } from 'boot/i18n'

const RUNE_PLACEHOLDER_SELECTOR = '[data-rune-name][data-rune-id][data-rune-node-id]'
// Support both named (@name{...}(...)) and anonymous (@{...}(...)) echo annotations
const ECHO_PLACEHOLDER_SELECTOR = '[data-echo-node-id]'
const RUNE_HOST_CLASS = 'ag-rune-placeholder-host'
const RUNE_CARD_CLASS = 'ag-rune-placeholder-card'
const ECHO_HOST_CLASS = 'ag-echo-placeholder-host'
const ECHO_CARD_CLASS = 'ag-echo-placeholder-card'

const normalizeRuneDimension = value => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

const applyRuneHostSize = (host, dataset = {}) => {
  if (!host || !host.style) return
  const width = normalizeRuneDimension(dataset.runeWidth)
  const height = normalizeRuneDimension(dataset.runeHeight)
  host.style.boxSizing = 'border-box'
  host.style.width = width ? `${width}px` : ''
  host.style.height = height ? `${height}px` : ''
}

// 解析 SFC 字符串里的 props 块，返回 [{ name, default }] 数组。
// 这里只关心 prop 名和 default：default 是 SFC 开发者写的"无 prop 传入时的兜底值"。
// 解析方式：从 <script> 块里用正则匹配 props: { ... } 的键值对（够用、避免引入 vue-template-compiler）。
const parseSfcPropsDef = (template = '') => {
  if (typeof template !== 'string' || !template) return []
  // 取 <script> ... </script> 块（包含属性，如 lang="ts"）
  const scriptMatch = template.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  if (!scriptMatch) return []
  const body = scriptMatch[1]
  // 匹配 export default { ... } 整体
  const exportMatch = body.match(/export\s+default\s+([\s\S]*?)\n\}\s*(?:;|$)/m)
  if (!exportMatch) return []
  const exportBody = exportMatch[1]
  // 找到 props: { ... } 块。允许嵌套最外层 { } 对齐。
  const propsIdx = exportBody.indexOf('props')
  if (propsIdx < 0) return []
  const start = exportBody.indexOf('{', propsIdx)
  if (start < 0) return []
  // 从 start 开始按括号深度匹配
  let depth = 0
  let end = -1
  for (let i = start; i < exportBody.length; i++) {
    const ch = exportBody[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end <= start) return []
  const propsBody = exportBody.slice(start + 1, end)

  const result = []
  // 把 propsBody 按顶层逗号切分（顶层 = 括号/方括号深度为 0）
  let seg = ''
  let d = 0
  const segs = []
  for (let i = 0; i < propsBody.length; i++) {
    const ch = propsBody[i]
    if (ch === '{' || ch === '[' || ch === '(') d++
    else if (ch === '}' || ch === ']' || ch === ')') d--
    if (ch === ',' && d === 0) { segs.push(seg); seg = ''; continue }
    seg += ch
  }
  if (seg.trim()) segs.push(seg)

  for (const raw of segs) {
    const m = raw.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(\{[\s\S]*\}|null)\s*$/)
    if (!m) continue
    const name = m[1]
    const defBlock = m[2]
    // 在 defBlock 里找 default: ... 字段
    const defMatch = defBlock.match(/\bdefault\s*:\s*([\s\S]*?)(?=,\s*(?:type|required|validator|default)\s*:|$)/)
    if (!defMatch) continue
    let defRaw = defMatch[1].trim()
    // 去掉尾部逗号
    if (defRaw.endsWith(',')) defRaw = defRaw.slice(0, -1).trim()
    // 解析 default 的字面值
    let parsed
    try {
      // 用 Function 跑一下字符串字面量表达式
      // eslint-disable-next-line no-new-func
      parsed = new Function(`return (${defRaw});`)()
    } catch (_e) {
      parsed = undefined
    }
    result.push({ name, default: parsed })
  }
  return result
}

// 把 prop 名转成 data-attr 形式：inheritFromPrevious → data-rune-prop-inherit-from-previous
const toRunePropAttr = (name) => `runeProp${name.charAt(0).toUpperCase()}${name.slice(1)}`

// 把 camelCase 转成 kebab-case（专给 dataset / attribute 用）
const camelToKebab = (s) => String(s)
  .replace(/([A-Z])/g, '-$1')
  .toLowerCase()

// 归一化 prop 值到字符串，便于写 data-attr
const normalizePropValue = (v) => {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// 归一化 boolean 形 prop 的传入值：'1'/true/1 → true，其它 → false
const coerceBooleanLikeProp = (raw) => {
  if (raw === true || raw === 1) return true
  if (raw === '1') return true
  return false
}

// 把字符串安全地写进 HTML 属性值（双引号围栏 + 防注入）
const escapeAttrString = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

// 从 host.dataset 按 prop 名收集"用户显式写过"的 prop 值（按 Vue props 解析规则）：
//   - 有 dataset → 当作显式 prop 传入 SFC
//   - 没 dataset → 不传，SFC 自己用 props.default
// 这样：
//   - 用户手写在 Markdown 里的 data-rune-prop-* 是最高优先级
//   - SFC 自己的 props.default 由 Vue 兜底
//   - 占位符 div 上不会自动出现 data-rune-prop-*，Markdown 体积不会膨胀
const collectRunePropsFromHost = (host, propDefs) => {
  const dataset = host && host.dataset ? host.dataset : {}
  const out = {}
  for (const def of propDefs) {
    const attr = toRunePropAttr(def.name)
    let raw
    if (Object.prototype.hasOwnProperty.call(dataset, attr)) {
      raw = dataset[attr]
    } else if (Object.prototype.hasOwnProperty.call(dataset, attr.toLowerCase())) {
      raw = dataset[attr.toLowerCase()]
    }
    if (raw === undefined || raw === null) continue
    // 把字符串归一化回 JS 值
    if (raw === '1') out[def.name] = true
    else if (raw === '0') out[def.name] = false
    else if (raw === 'true') out[def.name] = true
    else if (raw === 'false') out[def.name] = false
    else out[def.name] = raw
  }
  return out
}

class StateRender {
  constructor (muya) {
    this.muya = muya
    this.eventCenter = muya.eventCenter
    this.codeCache = new Map()
    this.loadImageMap = new Map()
    this.loadMathMap = new Map()
    this.mermaidCache = new Map()
    this.diagramCache = new Map()
    this.tokenCache = new Map()
    this.labels = new Map()
    this.urlMap = new Map()
    this.renderingTable = null
    this.renderingRowContainer = null
    this.container = null
    this.runePlaceholderCache = new Map()
    this.echoPlaceholderCache = new Map()
    this.runeVmMap = new Map()
    this.echoVmMap = new Map()
  }

  setContainer (container) {
    this.container = container
  }

  // collect link reference definition
  collectLabels (blocks) {
    this.labels.clear()

    const travel = block => {
      const { text, children } = block
      if (children && children.length) {
        children.forEach(c => travel(c))
      } else if (text) {
        const tokens = beginRules.reference_definition.exec(text)
        if (tokens) {
          const key = (tokens[2] + tokens[3]).toLowerCase()
          if (!this.labels.has(key)) {
            this.labels.set(key, {
              href: tokens[6],
              title: tokens[10] || ''
            })
          }
        }
      }
    }

    blocks.forEach(b => travel(b))
  }

  checkConflicted (block, token, cursor) {
    const { start, end } = cursor
    const key = block.key
    const { start: tokenStart, end: tokenEnd } = token.range

    if (key !== start.key && key !== end.key) {
      return false
    } else if (key === start.key && key !== end.key) {
      return conflict([tokenStart, tokenEnd], [start.offset, start.offset])
    } else if (key !== start.key && key === end.key) {
      return conflict([tokenStart, tokenEnd], [end.offset, end.offset])
    } else {
      return conflict([tokenStart, tokenEnd], [start.offset, start.offset]) ||
        conflict([tokenStart, tokenEnd], [end.offset, end.offset])
    }
  }

  getClassName (outerClass, block, token, cursor) {
    return outerClass || (this.checkConflicted(block, token, cursor) ? CLASS_OR_ID.AG_GRAY : CLASS_OR_ID.AG_HIDE)
  }

  getHighlightClassName (active) {
    return active ? CLASS_OR_ID.AG_HIGHLIGHT : CLASS_OR_ID.AG_SELECTION
  }

  getSelector (block, activeBlocks) {
    const { cursor, selectedBlock } = this.muya.contentState
    const type = block.type === 'hr' ? 'p' : block.type
    const isActive = activeBlocks.some(b => b.key === block.key) || block.key === cursor.start.key

    let selector = `${type}#${block.key}.${CLASS_OR_ID.AG_PARAGRAPH}`
    if (isActive) {
      selector += `.${CLASS_OR_ID.AG_ACTIVE}`
    }
    if (type === 'span') {
      selector += `.ag-${camelToSnake(block.functionType)}`
    }
    if (!block.parent && selectedBlock && block.key === selectedBlock.key) {
      selector += `.${CLASS_OR_ID.AG_SELECTED}`
    }
    return selector
  }

  getRuneMap () {
    const runeCards = this.muya?.options?.runeCards || []
    return (Array.isArray(runeCards) ? runeCards : []).reduce((acc, rune) => {
      const runeName = String((rune?.name || '').trim())
      if (runeName) {
        acc.set(runeName, rune)
      }
      return acc
    }, new Map())
  }

  getEchoMap () {
    const echoRegistry = this.muya?.options?.echoRegistry
    const echoCards = echoRegistry?.getAll?.() || this.muya?.options?.echoCards || []
    return (Array.isArray(echoCards) ? echoCards : []).reduce((acc, echo) => {
      const echoName = String((echo?.name || '').trim())
      const echoId = String((echo?.id || '').trim())
      const normalizedEcho = echoName ? { ...echo, name: echoName, id: echoId } : echo
      if (echoName) {
        acc.set(echoName, normalizedEcho)
      }
      if (echoId) {
        acc.set(`id:${echoId}`, normalizedEcho)
      }
      return acc
    }, new Map())
  }

  createRunePlaceholderMarkup (rune, dataset = {}) {
    const runeName = rune?.name || dataset.runeName || 'Rune'
    return `
      <div class="${RUNE_CARD_CLASS}" data-rune-mounted="true">
        <div class="ag-rune-placeholder-body">
          <div class="ag-rune-placeholder-title">${runeName}</div>
        </div>
      </div>
    `
  }

  createEchoPlaceholderMarkup (echo, dataset = {}) {
    const echoName = echo?.name || dataset.echoName || '回响'
    const echoValue = String(dataset.echoValue || '').replace(/\s+/g, ' ')
    const echoDescription = echoValue || echo?.desc || ''
    const color = echo?.color || '#26A69A'
    const icon = echo?.icon || 'play_arrow'
    const hasExplicitWidth = dataset.hasExplicitWidth === true
    const hasExplicitHeight = dataset.hasExplicitHeight === true
    const width = dataset.width || ''
    const height = dataset.height || ''

    const baseStyle = `--echo-accent:${color};display:inline-flex;box-sizing:border-box;overflow:hidden;align-items:center;`
    const widthStyle = hasExplicitWidth ? `width:${width};min-width:${width};` : 'width:auto;min-width:0;'
    const heightStyle = hasExplicitHeight ? `height:${height};min-height:${height};` : 'height:auto;min-height:0;'

    return `
      <span class="${ECHO_CARD_CLASS}" data-echo-mounted="true" style="${baseStyle}${widthStyle}${heightStyle}">
        <span class="ag-echo-placeholder-body">
          <span class="ag-echo-placeholder-icon material-icons">${icon}</span>
          <span class="ag-echo-placeholder-copy">
            <span class="ag-echo-placeholder-title">${echoName}</span>
            ${echoDescription
              ? `<span class="ag-echo-placeholder-desc">${echoDescription}</span>`
              : `<span class="ag-echo-placeholder-value-marker" data-echo-value-marker="true" contenteditable="true" spellcheck="false"> </span>`
            }
          </span>
        </span>
      </span>
    `
  }

  renderRunePlaceholderNodes () {
    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const runeMap = this.getRuneMap()
    const hosts = root.querySelectorAll(RUNE_PLACEHOLDER_SELECTOR)
    console.log('[Muya.StateRender.renderRunePlaceholderNodes] scanning placeholders', {
      selector: RUNE_PLACEHOLDER_SELECTOR,
      hostCount: hosts.length,
      runeMapSize: runeMap.size
    })

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const runeName = String(dataset.runeName || '').trim()
      const instanceId = String(dataset.runeId || '')
      const nodeId = String(dataset.runeNodeId || '')
      const rune = runeMap.get(runeName) || null
      host.classList.add(RUNE_HOST_CLASS)
      host.setAttribute('contenteditable', 'false')
      applyRuneHostSize(host, dataset)
      const cacheKey = JSON.stringify({
        runeName,
        instanceId,
        nodeId,
        innerText: host.textContent || '',
        template: rune?.template || ''
      })

      if (this.runePlaceholderCache.get(host) === cacheKey) {
        return
      }

      host.innerHTML = this.createRunePlaceholderMarkup(rune, dataset)
      host.dataset.runeRenderKey = cacheKey
      this.runePlaceholderCache.set(host, cacheKey)
    })
  }

  // ===================== 独立的 Echo 渲染方法 =====================

  /**
   * 渲染 Echo 占位符（jQuery 模式）
   * - 查找 [data-echo-node-id] 节点
   * - 生成卡片 HTML 或调用 echoRuntime 输出特效
   * - 调用 echoRuntime.afterRender() 处理 echo-chant 特效
   */
  renderEchoPlaceholders () {
    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const echoMap = this.getEchoMap()
    const echoRuntime = this.muya?.options?.echoRuntime || null
    const hosts = root.querySelectorAll(ECHO_PLACEHOLDER_SELECTOR)

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const echoName = String(dataset.echoName || '').trim() || '回响'
      const echoId = String(dataset.echoId || '').trim()
      const definitionId = String(dataset.echoDefinitionId || '').trim()
      const nodeId = String(dataset.echoNodeId || '').trim()
      const value = String(dataset.echoValue || '').trim()
      const hasExplicitWidth = dataset.echoWidth !== undefined
      const hasExplicitHeight = dataset.echoHeight !== undefined
      const width = String(dataset.echoWidth || '').trim()
      const height = String(dataset.echoHeight || '').trim()

      const lookupKey = echoId ? `id:${echoId}` : echoName
      const echo = echoMap.get(lookupKey) || (echoId ? echoMap.get(echoName) : null) || null

      // 只要 echo 在 registry 里找到就走 renderToHtml；目前只有 echo 一种类型，
      // 旧版的 echo-chant / echo-tbd 分类已合并（v2026-07-29 起）。
      const hasEcho = !!echo

      const cacheKey = JSON.stringify({
        echoName,
        echoId,
        definitionId,
        nodeId,
        value,
        desc: echo?.desc || '',
        color: echo?.color || '',
        icon: echo?.icon || '',
        annoSource: echo?.anno_source || echo?.template || '',
        hasExplicitWidth,
        hasExplicitHeight,
        width,
        height
      })

      if (this.echoPlaceholderCache.get(host) === cacheKey) {
        return
      }

      host.classList.add(ECHO_HOST_CLASS)
      host.setAttribute('contenteditable', 'false')

      let innerHtml = ''
      if (hasEcho && echoRuntime && typeof echoRuntime.renderToHtml === 'function') {
        try {
          const simAttrs = { id: echoId, definitionId, value }
          const token = {
            echoName,
            echoId,
            propsParsed: simAttrs,
            propsRaw: '',
            prompt: value,
            value,
            raw: '',
            payload: '',
            payloadRaw: ''
          }
          const matchedEcho = echo || null
          innerHtml = echoRuntime.renderToHtml(token, matchedEcho) || ''
        } catch (error) {
          console.warn('[StateRender.renderEchoPlaceholders] echoRuntime.renderToHtml failed:', error)
          innerHtml = ''
        }
      }

      // 兜底语义（v2026-07-29 起固定）：
      //   - render() 返回了非空字符串 → 覆盖 host.innerHTML；
      //   - render() 没写 / 抛错 / 返回空 → 不覆盖 host.innerHTML，
      //     保留 echoAnno.js 渲染的 @xxx 圆形胶囊（ag-echo-placeholder-marker）。
      // 这样同一个 token 在常态行 / 当前行之间切换时，视觉表现完全一致：
      // 要么是 render 自定义内容，要么是 @xxx 胶囊，不会"突变"。
      if (innerHtml) {
        host.innerHTML = innerHtml
      }
      // 在 host 自身打 attr（不污染 innerHTML 里的 render 输出），让 afterRender 能找到 host。
      if (echoName) host.setAttribute('data-echo-name', echoName)
      if (echoId) host.setAttribute('data-echo-id', echoId)
      if (definitionId) host.setAttribute('data-echo-definition-id', definitionId)
      host.setAttribute('data-echo-host', 'true')
      host.dataset.echoRenderKey = cacheKey
      this.echoPlaceholderCache.set(host, cacheKey)
    })

    // === Echo-chant 特效：让回响真正影响附近节点的排版/动画/边距 ===
    if (echoRuntime && typeof echoRuntime.afterRender === 'function' && root) {
      try {
        echoRuntime.afterRender(root, { cleanupFirst: true })
      } catch (error) {
        console.warn('[StateRender.renderEchoPlaceholders] echoRuntime.afterRender failed:', error)
      }
    }
  }

  cleanupDetachedEchoPlaceholders () {
    for (const host of Array.from(this.echoPlaceholderCache.keys())) {
      if (!host.isConnected) {
        this.echoPlaceholderCache.delete(host)
      }
    }
  }

  // ===================== 独立的 Rune 渲染方法 =====================

  /**
   * 渲染 Rune 占位符（jQuery 模式）
   * - 查找 [data-rune-name][data-rune-id][data-rune-node-id] 节点
   * - 生成简单占位符 HTML
   * - 如果启用 Vue 渲染模式，则挂载 Vue 组件
   */
  renderRunePlaceholders () {
    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const runeMap = this.getRuneMap()
    const hosts = root.querySelectorAll(RUNE_PLACEHOLDER_SELECTOR)

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const runeName = String(dataset.runeName || '').trim()
      const runeId = String(dataset.runeId || '')
      const nodeId = String(dataset.runeNodeId || '')
      const rune = runeMap.get(runeName) || null
      host.classList.add(RUNE_HOST_CLASS)
      host.setAttribute('contenteditable', 'false')
      applyRuneHostSize(host, dataset)
      const cacheKey = JSON.stringify({
        runeName,
        runeId,
        nodeId,
        innerText: host.textContent || '',
        template: rune?.template || ''
      })

      if (this.runePlaceholderCache.get(host) === cacheKey) {
        return
      }

      host.innerHTML = this.createRunePlaceholderMarkup(rune, dataset)
      host.dataset.runeRenderKey = cacheKey
      this.runePlaceholderCache.set(host, cacheKey)
    })
  }

  cleanupDetachedRunePlaceholders () {
    for (const host of Array.from(this.runePlaceholderCache.keys())) {
      if (!host.isConnected) {
        this.runePlaceholderCache.delete(host)
      }
    }
  }

  /**
   * 清理已卸载的 Echo Vue 实例
   */
  cleanupDetachedEchoVms (force = false) {
    for (const [nodeId, vm] of this.echoVmMap.entries()) {
      if (force || !vm || !vm.$el || !vm.$el.isConnected) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.echoVmMap.delete(nodeId)
      }
    }
  }

  /**
   * 清理已卸载的 Rune Vue 实例
   */
  cleanupDetachedRuneVms (force = false) {
    for (const [nodeId, vm] of this.runeVmMap.entries()) {
      if (force || !vm || !vm.$el || !vm.$el.isConnected) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.runeVmMap.delete(nodeId)
      }
    }
  }

  /**
   * 挂载 Echo Vue 组件（Vue.extend 模式）
   */
  mountEchoVueHosts () {
    const EchoRenderer = this.muya?.options?.echoRendererCtor
    const echoRegistry = this.muya?.options?.echoRegistry
    if (!EchoRenderer || !echoRegistry) return

    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const echoMap = this.getEchoMap()
    const hosts = root.querySelectorAll(ECHO_PLACEHOLDER_SELECTOR)
    const aliveNodeIds = new Set()

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const echoName = String(dataset.echoName || '').trim()
      const echoId = String(dataset.echoId || '')
      const definitionId = String(dataset.echoDefinitionId || '')
      const nodeId = String(dataset.echoNodeId || '')
      const value = String(dataset.echoValue || '')
      if (!echoName || !echoId || !nodeId) {
        return
      }

      aliveNodeIds.add(nodeId)
      const echo = echoMap.get(`id:${definitionId}`) || echoMap.get(echoName) || {
        id: definitionId,
        name: echoName
      }
      const renderKey = host.dataset.echoRenderKey || ''
      const mountedVm = this.echoVmMap.get(nodeId)

      if (mountedVm && mountedVm.$el && mountedVm.$el.parentNode === host && mountedVm.__echoRenderKey === renderKey) {
        mountedVm.echoId = echoId
        mountedVm.nodeId = nodeId
        mountedVm.echo = echo
        mountedVm.value = value
        return
      }

      if (mountedVm && typeof mountedVm.$destroy === 'function') {
        mountedVm.$destroy()
      }

      while (host.firstChild) {
        host.removeChild(host.firstChild)
      }
      const vm = new EchoRenderer({
        propsData: {
          echoId,
          nodeId,
          echo,
          value,
          onCommit: this.muya?.options?.onEchoPlaceholderCommit || null
        }
      })
      vm.echoRegistry = echoRegistry
      vm.$root = { echoRegistry }
      vm.__echoRenderKey = renderKey
      vm.$mount()
      host.appendChild(vm.$el)
      this.echoVmMap.set(nodeId, vm)
    })

    for (const [savedNodeId, vm] of this.echoVmMap.entries()) {
      if (!aliveNodeIds.has(savedNodeId)) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.echoVmMap.delete(savedNodeId)
      }
    }
  }

  /**
   * 挂载 Rune Vue 组件（Vue.extend 模式）
   */
  mountRuneVueHosts () {
    const RuneRenderer = this.muya?.options?.runeRendererCtor
    if (!RuneRenderer) return

    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const runeMap = this.getRuneMap()
    const hosts = root.querySelectorAll(RUNE_PLACEHOLDER_SELECTOR)
    const aliveNodeIds = new Set()

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const runeName = String(dataset.runeName || '').trim()
      const runeId = String(dataset.runeId || '')
      const nodeId = String(dataset.runeNodeId || '')
      if (!runeName || !runeId || !nodeId) {
        return
      }

      aliveNodeIds.add(nodeId)
      const matchedRune = runeMap.get(runeName) || null
      const rune = matchedRune || {
        id: '',
        name: runeName,
        template: ''
      }
      const runeValue = String(dataset.runeValue || '').trim()
      const renderKey = host.dataset.runeRenderKey || ''
      const mountedVm = this.runeVmMap.get(nodeId)

      const muyaInstance = this.muya?.options?.memocastMuya || null
      const onValueChange = (payload) => {
        if (!muyaInstance || typeof muyaInstance.updateRunePlaceholderValue !== 'function') return
        muyaInstance.updateRunePlaceholderValue({
          runeId: payload?.runeId || runeId,
          nodeId: payload?.nodeId || nodeId,
          value: payload?.value
        })
      }

      // 占位符 div 上只携带 4 个系统级 data-rune-* 属性（name/id/node-id/value）。
      // SFC 的 props 由 Vue 自己按 props.default 处理；用户在 Markdown 里手写的
      // data-rune-prop-* 仍然以"显式 prop"形式传入 SFC（最高优先级）。
      const propDefs = parseSfcPropsDef(rune?.template || '')
      // 收集 host.dataset 上"用户显式写过"的 prop 值，按 Vue props 规则传给 SFC。
      // 没写的 prop → SFC 走 props.default
      const sfcProps = collectRunePropsFromHost(host, propDefs)

      if (mountedVm && mountedVm.$el && mountedVm.$el.parentNode === host && mountedVm.__runeRenderKey === renderKey) {
        mountedVm.runeId = runeId
        mountedVm.nodeId = nodeId
        mountedVm.rune = rune
        mountedVm.value = runeValue
        mountedVm.onValueChange = onValueChange
        // 把变化后的 prop 集合同步到 SFC
        Object.keys(mountedVm.$options.props || {}).forEach((propName) => {
          if (Object.prototype.hasOwnProperty.call(sfcProps, propName)) {
            mountedVm[propName] = sfcProps[propName]
          }
        })
        return
      }

      if (mountedVm && typeof mountedVm.$destroy === 'function') {
        mountedVm.$destroy()
      }

      host.innerHTML = ''
      const vm = new RuneRenderer({
        propsData: {
          runeId,
          nodeId,
          rune,
          ...sfcProps,
          value: runeValue,
          onValueChange
        }
      })
      vm.__runeRenderKey = renderKey
      vm.$mount()
      host.appendChild(vm.$el)
      this.runeVmMap.set(nodeId, vm)
    })

    for (const [savedNodeId, vm] of this.runeVmMap.entries()) {
      if (!aliveNodeIds.has(savedNodeId)) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.runeVmMap.delete(savedNodeId)
      }
    }
  }

  /**
   * 挂载 Echo Vue 实例（供外部调用）
   */
  mountEchoVueInstances () {
    this.mountEchoVueHosts()
    this.cleanupDetachedEchoVms()
  }

  /**
   * 挂载 Rune Vue 实例（供外部调用）
   */
  mountRuneVueInstances () {
    this.mountRuneVueHosts()
    this.cleanupDetachedRuneVms()
  }

  // ===================== 统一入口 =====================

  /**
   * Echo 占位符后处理入口
   * 在 render() / partialRender() / singleRender() 之后调用
   */
  postRenderEchoPlaceholders () {
    this.renderEchoPlaceholders()
    this.cleanupDetachedEchoPlaceholders()
    if (this.muya?.options?.enableEchoVueRenderer) {
      this.mountEchoVueInstances()
    } else {
      this.cleanupDetachedEchoVms(true)
    }
  }

  /**
   * Rune 占位符后处理入口
   * 在 render() / partialRender() / singleRender() 之后调用
   */
  postRenderRunePlaceholders () {
    this.renderRunePlaceholders()
    this.cleanupDetachedRunePlaceholders()
    if (this.muya?.options?.enableRuneVueRenderer) {
      this.mountRuneVueInstances()
    } else {
      this.cleanupDetachedRuneVms(true)
    }
  }

  /**
   * 兼容旧方法名 - renderRunes()
   * 依次调用 Echo 和 Rune 的后处理
   */
  renderRunes () {
    // Echo 独立渲染通道
    this.postRenderEchoPlaceholders()
    // Rune 独立渲染通道
    this.postRenderRunePlaceholders()
  }

  cleanupDetachedRuneVms (force = false) {
    for (const [nodeId, vm] of this.runeVmMap.entries()) {
      if (force || !vm || !vm.$el || !vm.$el.isConnected) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.runeVmMap.delete(nodeId)
      }
    }
  }

  cleanupDetachedEchoVms (force = false) {
    for (const [nodeId, vm] of this.echoVmMap.entries()) {
      if (force || !vm || !vm.$el || !vm.$el.isConnected) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.echoVmMap.delete(nodeId)
      }
    }
  }

  mountRuneVueHosts () {
    const RuneRenderer = this.muya?.options?.runeRendererCtor
    console.log('[Muya.StateRender.mountRuneVueHosts] called', {
      hasRuneRenderer: !!RuneRenderer,
      enableRuneVueRenderer: !!this.muya?.options?.enableRuneVueRenderer
    })
    if (!RuneRenderer) return

    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const runeMap = this.getRuneMap()
    const hosts = root.querySelectorAll(RUNE_PLACEHOLDER_SELECTOR)
    console.log('[Muya.StateRender.mountRuneVueHosts] scanning hosts', {
      hostCount: hosts.length,
      runeMapSize: runeMap.size,
      runeKeys: Array.from(runeMap.keys())
    })
    const aliveNodeIds = new Set()

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const runeName = String(dataset.runeName || '').trim()
      const runeId = String(dataset.runeId || '')
      const nodeId = String(dataset.runeNodeId || '')
      if (!runeName || !runeId || !nodeId) {
        console.log('[Muya.StateRender.mountRuneVueHosts] skip host due to missing dataset', {
          runeName,
          runeId,
          nodeId,
          dataset
        })
        return
      }

      aliveNodeIds.add(nodeId)
      const matchedRune = runeMap.get(runeName) || null
      console.log('[Muya.StateRender.mountRuneVueHosts] resolved rune by name', {
        runeName,
        runeId,
        nodeId,
        matched: !!matchedRune,
        matchedRuneId: matchedRune?.id || '',
        matchedTemplateLen: (matchedRune?.template || '').length,
        matchedTemplatePreview: String(matchedRune?.template || '').substring(0, 120)
      })
      const rune = matchedRune || {
        id: '',
        name: runeName,
        template: ''
      }
      const runeValue = String(dataset.runeValue || '').trim()
      const renderKey = host.dataset.runeRenderKey || ''
      const mountedVm = this.runeVmMap.get(nodeId)
      // Memocast 扩展：把 Muya 实例的回写方法作为 onValueChange 注入，
      // 这样内层 SFC emit('input', value) 时就能写回 Markdown 的 data-rune-value。
      const muyaInstance = this.muya?.options?.memoMuya || null
      const onValueChange = (payload) => {
        if (!muyaInstance || typeof muyaInstance.updateRunePlaceholderValue !== 'function') return
        muyaInstance.updateRunePlaceholderValue({
          runeId: payload?.runeId || runeId,
          nodeId: payload?.nodeId || nodeId,
          value: payload?.value
        })
      }

      // 占位符 div 上只携带 4 个系统级 data-rune-* 属性（name/id/node-id/value）。
      // SFC 的 props 由 Vue 自己按 props.default 处理；用户在 Markdown 里手写的
      // data-rune-prop-* 仍然以"显式 prop"形式传入 SFC（最高优先级）。
      const propDefs = parseSfcPropsDef(rune?.template || '')
      const sfcProps = collectRunePropsFromHost(host, propDefs)

      if (mountedVm && mountedVm.$el && mountedVm.$el.parentNode === host && mountedVm.__runeRenderKey === renderKey) {
        mountedVm.runeId = runeId
        mountedVm.nodeId = nodeId
        mountedVm.rune = rune
        mountedVm.value = runeValue
        mountedVm.onValueChange = onValueChange
        Object.keys(mountedVm.$options.props || {}).forEach((propName) => {
          if (Object.prototype.hasOwnProperty.call(sfcProps, propName)) {
            mountedVm[propName] = sfcProps[propName]
          }
        })
        console.log('[Muya.StateRender.mountRuneVueHosts] reuse vm', {
          nodeId,
          runeId,
          runeName,
          templateLen: (rune?.template || '').length
        })
        return
      }

      if (mountedVm && typeof mountedVm.$destroy === 'function') {
        console.log('[Muya.StateRender.mountRuneVueHosts] destroy stale vm', { nodeId, runeId, runeName })
        mountedVm.$destroy()
      }

      host.innerHTML = ''
      const vm = new RuneRenderer({
        propsData: {
          runeId,
          nodeId,
          rune,
          ...sfcProps,
          value: runeValue,
          onValueChange
        }
      })
      vm.__runeRenderKey = renderKey
      vm.$mount()
      host.appendChild(vm.$el)
      this.runeVmMap.set(nodeId, vm)
      console.log('[Muya.StateRender.mountRuneVueHosts] mounted vm', {
        nodeId,
        runeId,
        runeName,
        templateLen: (rune?.template || '').length,
        renderKey
      })
    })

    for (const [savedNodeId, vm] of this.runeVmMap.entries()) {
      if (!aliveNodeIds.has(savedNodeId)) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.runeVmMap.delete(savedNodeId)
      }
    }
  }

  mountEchoVueHosts () {
    const EchoRenderer = this.muya?.options?.echoRendererCtor
    const echoRegistry = this.muya?.options?.echoRegistry
    if (!EchoRenderer || !echoRegistry) return
    // enableEchoVueRenderer === false 时，renderEchoPlaceholders 已通过 renderToHtml 设置 innerHTML，
    // 不再走 Vue 组件 mount，避免组件覆盖掉已渲染的 HTML（如 nice222 被 ag-echo-inline-preview 覆盖的问题）。
    if (!this.muya?.options?.enableEchoVueRenderer) {
      console.log('[Muya.StateRender.mountEchoVueHosts] skipped — enableEchoVueRenderer is false, renderToHtml handles rendering')
      return
    }

    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const echoMap = this.getEchoMap()
    const hosts = root.querySelectorAll(ECHO_PLACEHOLDER_SELECTOR)
    const aliveNodeIds = new Set()
    console.log('[Muya.StateRender.mountEchoVueHosts] scanning hosts', {
      hostCount: hosts.length,
      echoMapSize: echoMap.size,
      existingVmCount: this.echoVmMap.size
    })

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const echoName = String(dataset.echoName || '').trim()
      const echoId = String(dataset.echoId || '')
      const definitionId = String(dataset.echoDefinitionId || '')
      const nodeId = String(dataset.echoNodeId || '')
      const value = String(dataset.echoValue || '')
      if (!echoName || !echoId || !nodeId) {
        console.log('[Muya.StateRender.mountEchoVueHosts] skip host due to missing dataset', {
          echoName,
          echoId,
          nodeId,
          dataset
        })
        return
      }

      aliveNodeIds.add(nodeId)
      const echo = echoMap.get(`id:${definitionId}`) || echoMap.get(echoName) || {
        id: definitionId,
        name: echoName
      }
      const renderKey = host.dataset.echoRenderKey || ''
      const mountedVm = this.echoVmMap.get(nodeId)

      if (mountedVm && mountedVm.$el && mountedVm.$el.parentNode === host && mountedVm.__echoRenderKey === renderKey) {
        mountedVm.echoId = echoId
        mountedVm.nodeId = nodeId
        mountedVm.echo = echo
        mountedVm.value = value
        console.log('[Muya.StateRender.mountEchoVueHosts] reuse vm', {
          nodeId,
          echoId,
          echoName,
          renderKey,
          hostConnected: host.isConnected,
          vmConnected: !!mountedVm.$el?.isConnected
        })
        return
      }

      if (mountedVm && typeof mountedVm.$destroy === 'function') {
        console.log('[Muya.StateRender.mountEchoVueHosts] destroy stale vm', {
          nodeId,
          echoId,
          echoName,
          renderKey,
          hasEl: !!mountedVm.$el,
          vmConnected: !!mountedVm.$el?.isConnected
        })
        mountedVm.$destroy()
      }

      while (host.firstChild) {
        host.removeChild(host.firstChild)
      }
      const vm = new EchoRenderer({
        propsData: {
          echoId,
          nodeId,
          echo,
          value,
          onCommit: this.muya?.options?.onEchoPlaceholderCommit || null
        }
      })
      vm.echoRegistry = echoRegistry
      vm.$root = { echoRegistry }
      vm.__echoRenderKey = renderKey
      vm.$mount()
      host.appendChild(vm.$el)
      this.echoVmMap.set(nodeId, vm)
      console.log('[Muya.StateRender.mountEchoVueHosts] mounted vm', {
        nodeId,
        echoId,
        echoName,
        renderKey,
        hostConnected: host.isConnected,
        vmConnected: !!vm.$el?.isConnected,
        hostChildCount: host.childNodes.length,
        outerHtmlPreview: String(vm.$el?.outerHTML || '').substring(0, 200)
      })
    })

    for (const [savedNodeId, vm] of this.echoVmMap.entries()) {
      if (!aliveNodeIds.has(savedNodeId)) {
        console.log('[Muya.StateRender.mountEchoVueHosts] cleanup detached vm', {
          savedNodeId,
          hasEl: !!vm?.$el,
          vmConnected: !!vm?.$el?.isConnected
        })
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.echoVmMap.delete(savedNodeId)
      }
    }
  }

  renderRunesWithVue () {
    this.mountRuneVueHosts()
    this.mountEchoVueHosts()
    this.cleanupDetachedRuneVms()
    this.cleanupDetachedEchoVms()
  }

  renderRunes () {
    this.renderRunePlaceholderNodes()
    this.renderEchoPlaceholders()
    this.cleanupDetachedRunePlaceholders()
    this.cleanupDetachedEchoPlaceholders()
    if (this.muya?.options?.enableRuneVueRenderer) {
      this.renderRunesWithVue()
    } else {
      this.cleanupDetachedRuneVms(true)
      this.cleanupDetachedEchoVms(true)
    }
    // === 让 echo-chant 类回响真正影响附近节点的排版/动画/边距 ===
    // 上面 renderEchoPlaceholders 已经把包含 data-echo-chant-id 的 span 写进了 host.innerHTML，
    // 这里再让 EchoRuntime 派发对应 handler（growth / shatter / skywalk / twinbloom /
    // mindsteal / lucky / disperse / tbd）。
    const runtime = this.muya?.options?.__echoRuntime
    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (runtime && typeof runtime.afterRender === 'function' && root) {
      try {
        runtime.afterRender(root, { cleanupFirst: true })
      } catch (error) {
        console.warn('[StateRender] runtime.afterRender failed:', error)
      }
    }
  }

  async renderMermaid () {
    if (this.mermaidCache.size) {
      const mermaid = await loadRenderer('mermaid')
      mermaid.initialize({
        theme: this.muya.options.mermaidTheme
      })
      for (const [key, value] of this.mermaidCache.entries()) {
        const { code } = value
        const target = document.querySelector(key)
        if (!target) {
          continue
        }
        try {
          mermaid.parse(code)
          target.innerHTML = code
          mermaid.init(undefined, target)
        } catch (err) {
          target.innerHTML = i18n.t('invalidMermaid')
          target.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
        }
      }

      this.mermaidCache.clear()
    }
  }

  async renderDiagram () {
    const cache = this.diagramCache
    if (cache.size) {
      const RENDER_MAP = {
        flowchart: await loadRenderer('flowchart'),
        // sequence: await loadRenderer('sequence'),
        'vega-lite': await loadRenderer('vega-lite')
      }

      for (const [key, value] of cache.entries()) {
        const target = document.querySelector(key)
        if (!target) {
          continue
        }
        const { code, functionType } = value
        const render = RENDER_MAP[functionType]
        const options = {}
        if (functionType === 'sequence') {
          Object.assign(options, { theme: this.muya.options.sequenceTheme })
        } else if (functionType === 'vega-lite') {
          Object.assign(options, {
            actions: false,
            tooltip: false,
            renderer: 'svg',
            theme: this.muya.options.vegaTheme
          })
        }
        try {
          if (functionType === 'flowchart' || functionType === 'sequence') {
            const diagram = render.parse(code)
            target.innerHTML = ''
            diagram.drawSVG(target, options)
          } else if (functionType === 'vega-lite') {
            await render(key, JSON.parse(code), options)
          }
        } catch (err) {
          if(functionType === 'flowchart'){
            target.innerHTML = i18n.t('invalidFlowChart')
          }else if(functionType === 'sequence'){
            target.innerHTML = i18n.t('invalidSequence')
          }else{
            target.innerHTML = i18n.t('invalidVega')
          }
          // target.innerHTML = `< Invalid ${functionType === 'flowchart' ? 'Flow Chart' : 'Sequence'} Codes >`
          target.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
        }
      }
      this.diagramCache.clear()
    }
  }

  hasEchoInlineToken (block) {
    if (!block || !/span/.test(block.type) || !/atxLine|paragraphContent|cellContent/.test(block.functionType || '')) {
      return false
    }
    const text = String(block.text || '')
    if (!text || text.indexOf('@') === -1) {
      return false
    }
    const tokens = tokenizer(text, {
      hasBeginRules: false,
      options: this.muya.options
    })
    return tokens.some(token => token.type === 'echo_anno')
  }

  hasEchoInlineTokenInBlocks (blocks = []) {
    return (Array.isArray(blocks) ? blocks : []).some(block => {
      if (!block) return false
      if (this.hasEchoInlineToken(block)) return true
      return Array.isArray(block.children) && this.hasEchoInlineTokenInBlocks(block.children)
    })
  }

  render (blocks, activeBlocks, matches) {
    const selector = `div#${CLASS_OR_ID.AG_EDITOR_ID}`
    const children = blocks.map(block => {
      return this.renderBlock(null, block, activeBlocks, matches, true)
    })

    const newVdom = h(selector, children)
    const rootDom = document.querySelector(selector) || this.container
    const oldVdom = toVNode(rootDom)

    patch(oldVdom, newVdom)
    this.renderMermaid()
    this.renderDiagram()
    this.renderRunes()
    this.codeCache.clear()
  }

  // Only render the blocks which you updated
  partialRender (blocks, activeBlocks, matches, startKey, endKey) {
    const cursorOutMostBlock = activeBlocks[activeBlocks.length - 1]
    // If cursor is not in render blocks, need to render cursor block independently
    const needRenderCursorBlock = blocks.indexOf(cursorOutMostBlock) === -1
    const newVnode = h('section', blocks.map(block => this.renderBlock(null, block, activeBlocks, matches, false)))
    const html = toHTML(newVnode).replace(/^<section>([\s\S]+?)<\/section>$/, '$1')

    const needToRemoved = []
    const firstOldDom = startKey
      ? document.querySelector(`#${startKey}`)
      : document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`).firstElementChild
    if (!firstOldDom) {
      // TODO@Jocs Just for fix #541, Because I'll rewrite block and render method, it will nolonger have this issue.
      return
    }
    needToRemoved.push(firstOldDom)
    let nextSibling = firstOldDom.nextElementSibling
    while (nextSibling && nextSibling.id !== endKey) {
      needToRemoved.push(nextSibling)
      nextSibling = nextSibling.nextElementSibling
    }
    nextSibling && needToRemoved.push(nextSibling)

    firstOldDom.insertAdjacentHTML('beforebegin', html)

    Array.from(needToRemoved).forEach(dom => {
      if (dom && dom.parentNode) {
        dom.parentNode.removeChild(dom)
      }
    })

    // Render cursor block independently
    if (needRenderCursorBlock) {
      const { key } = cursorOutMostBlock
      const cursorDom = document.querySelector(`#${key}`)
      if (cursorDom) {
        const oldCursorVnode = toVNode(cursorDom)
        const newCursorVnode = this.renderBlock(null, cursorOutMostBlock, activeBlocks, matches, true)
        patch(oldCursorVnode, newCursorVnode)
      }
    }

    this.renderMermaid()
    this.renderDiagram()
    this.renderRunes()
    this.codeCache.clear()
  }

  /**
   * Only render one block.
   *
   * @param {object} block
   * @param {array} activeBlocks
   * @param {array} matches
   */
  singleRender (block, activeBlocks, matches) {
    const selector = `#${block.key}`
    const newVdom = this.renderBlock(null, block, activeBlocks, matches, true)
    const rootDom = document.querySelector(selector)
    const oldVdom = toVNode(rootDom)
    patch(oldVdom, newVdom)
    this.renderMermaid()
    this.renderDiagram()
    this.renderRunes()
    this.codeCache.clear()
  }
}

mixins(StateRender, renderInlines, renderBlock)

export default StateRender
