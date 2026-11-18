// ============================================================================
// echoRuntime —— EchoRuntime 类（registry 的运行时引擎）
//
// 职责：
//   1. compileDefinition(echo) —— 把 anno_source 字符串编译成 definition 对象（render + afterRender + props）
//   2. render(token, echo)     —— 给定 token + echo 定义，输出 { type, icon, color, title, description, prompt, props, html, afterRenderHook }
//   3. renderToHtml(token, echo)—— 输出注入 ABI 属性的最终 HTML
//   4. afterRender(container)  —— DOM paint 后对所有 [data-echo-inline] 调 definition.afterRender
//   5. disposeAll()            —— 清掉所有已注册的 cleanup
//
// === anno_source definition 新结构（v2026-07-28）===
//   definition = { type, field, title, version, props, render, afterRender }
//   - type      'echo' | 'echo-chant' | 'echo-tbd'        （顶层 type 直接承担分类语义，
//                                                            不再有独立的 kind 字段）
//   - field     '<id>'                                    （id 别名）
//   - title     '<name>'                                  （name 别名）
//   - props     {}                                       （echo 卡片声明的可配置参数默认值）
//   - render    (props = {}) => string                    （只返回 echo host HTML 字符串）
//   - afterRender (node, props = {}) => cleanup|undefined  （签名不变）
//
// 不变量：
//   - definition.render 签名 = (props) -> string  （注意：只接 props，不再接 node/ancestors）
//   - definition.afterRender 签名 = (node, props) -> cleanup|undefined
//     （node = echo host DOM element，props = 编译期算好的 context.props，含 resolved value）
//   - DOM ABI：data-echo-inline / data-echo-name / data-echo-id / data-echo-definition-id
//     / data-echo-value / data-echo-props / data-echo-props-json / data-echo-node-id
//
// === 渲染期数据流 ===
//   1. context.props  = { ...definition.props, ...mergedProps（含 inherit/value/id/...） }
//        即「echo 名片默认值」被子「实例运行时 props」覆盖。
//   2. definition.render(context.props) → HTML 字符串
//   3. 卡片元数据 icon/color/title/desc 完全由 EchoRuntime 拼装：
//        - icon  = props.icon || matchedEcho.icon || DEFAULT_ECHO_ICON
//        - color = props.color || matchedEcho.color || DEFAULT_ECHO_COLOR
//        - title = props.title || matchedEcho.name || context.name || '回响'
//        - desc  = props.desc || matchedEcho.desc || ''
// ============================================================================

import {
  DEFAULT_ECHO_COLOR,
  DEFAULT_ECHO_ICON
} from './echoBuiltinsShared.js'
import {
  decodeEchoPayload
} from './echoPayloadCodec.js'
import {
  isInheritFromPreviousEnabled
} from './echoInherit.js'
import {
  HANDLER_PRELUDE,
  safeEvalAnnoSource
} from './echoAnnoSource.js'

const safeQueryAll = (root, selector) => {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  try { return Array.from(root.querySelectorAll(selector)) }
  catch (error) { console.warn('[echoRuntime] safeQueryAll failed:', error); return [] }
}

// === 把 extraAttrs（形如 `data-x="y" data-z="w"`）注入到 html 的第一个起始标签内 ===
const injectAttrsIntoFirstTag = (html, extraAttrs = '', extraClass = '') => {
  const src = String(html || '')
  if (!src || (!extraAttrs && !extraClass)) return src
  const tagMatch = src.match(/^<([a-zA-Z][\w-]*)\b([^>]*)>/)
  if (!tagMatch) {
    return `<span ${extraClass ? `class="${extraClass}" ` : ''}${extraAttrs}>${src}</span>`
  }
  let tagInner = tagMatch[2]
  let insertTail = ''
  if (extraClass) {
    const classMatch = tagInner.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i)
    if (classMatch) {
      const quote = classMatch[1][0]
      const current = classMatch[2] !== undefined ? classMatch[2] : classMatch[3]
      const next = current ? `${current} ${extraClass}` : extraClass
      tagInner = tagInner.replace(classMatch[0], `class=${quote}${next}${quote}`)
    } else {
      insertTail = ` class="${extraClass}"`
    }
  }
  const attrInsertAt = tagMatch[0].length - 1
  return `${src.slice(0, attrInsertAt)}${insertTail}${extraAttrs ? ` ${extraAttrs}` : ''}${src.slice(attrInsertAt)}`
}

const createFallbackRenderResult = (context = {}) => {
  const props = context.props || {}
  return {
    type: 'card',
    icon: props.icon || context.echo?.icon || DEFAULT_ECHO_ICON,
    color: props.color || context.echo?.color || DEFAULT_ECHO_COLOR,
    title: props.title || context.echo?.name || context.name || '回响',
    description: props.desc || context.echo?.desc || '',
    prompt: context.prompt || '',
    props,
    html: props.html || ''
  }
}

const readEchoPropsFromHost = (node) => {
  const card = node.querySelector('[data-echo-props]') || node
  if (!card) return {}
  try {
    const raw = card.getAttribute('data-echo-props')
    if (raw) return JSON.parse(raw)
  } catch (error) { /* ignore */ }
  try {
    const ownerHost = (typeof node.closest === 'function') ? node.closest('[data-echo-node-id]') : null
    const hostRaw = ownerHost && ownerHost.getAttribute('data-echo-props-json')
    if (hostRaw) return JSON.parse(hostRaw)
  } catch (error) { /* ignore */ }
  // === v2026-07-30 起：data-echo-props-json 兜底也拿不到时，从 host ABI 字段同步出
  // handler 常用的几个字段（echoId / name / definitionId）——让 handler 端
  // props.echoId / props.id / props.name / props.definitionId 都能拿到。
  const result = {}
  const attrSource = (typeof node.attributes !== 'undefined') ? node : card
  Array.from(attrSource.attributes || []).forEach(attr => {
    if (attr.name.startsWith('data-echo-prop-')) {
      const key = attr.name.replace(/^data-echo-prop-/, '')
      try { result[key] = JSON.parse(attr.value) } catch (error) { result[key] = attr.value }
    }
  })
  // ABI 字段兜底注入（仅当 result 里没相应字段时）
  if (card) {
    const abiEchoId = card.getAttribute('data-echo-id')
    const abiEchoName = card.getAttribute('data-echo-name')
    const abiDefinitionId = card.getAttribute('data-echo-definition-id')
    if (abiEchoId && !result.echoId && !result.id) {
      result.id = abiEchoId
      result.echoId = abiEchoId
    }
    if (abiEchoName && !result.name) result.name = abiEchoName
    if (abiDefinitionId && !result.definitionId) result.definitionId = abiDefinitionId
  }
  return result
}

export default class EchoRuntime {
  constructor ({ registry } = {}) {
    this.registry = registry
    this.definitionCache = new Map()
    this._installed = []
    this._afterRenderTimer = null
  }

  invalidate (echoId) {
    if (!echoId) { this.definitionCache.clear(); return }
    this.definitionCache.delete(String(echoId))
  }

  compileDefinition (echo = {}) {
    const cacheKey = String(echo.id || echo.name || '')
    const source = String(echo.anno_source || echo.template || '').trim()
    const cached = this.definitionCache.get(cacheKey)
    if (cached && cached.source === source) return cached.definition

    let definition = null
    try {
      if (source) definition = safeEvalAnnoSource(source, HANDLER_PRELUDE)()
    } catch (error) {
      console.error('[echoRuntime] compileDefinition failed:', error)
    }

    // definition 兜底：必须至少有 render(node, props) 函数；afterRender 可选。
    // 没有 render 时返回占位空 span，让上游 fallback 卡片样式兜底。
    if (!definition || typeof definition !== 'object') {
      definition = { type: 'echo', field: echo.id || '', title: echo.name || '回响', version: 1, props: {}, render: () => '' }
    } else {
      if (typeof definition.render !== 'function') definition.render = () => ''
    }

    this.definitionCache.set(cacheKey, { source, definition })
    return definition
  }

  render (token = {}, echo = null) {
    const matchedEcho = echo || this.registry?.getByName?.(token.echoName)
    const payload = decodeEchoPayload(token.payloadRaw || token.payload || '')
    const tokenProps = (token.propsParsed && typeof token.propsParsed === 'object') ? token.propsParsed : {}

    let mergedProps = { ...(payload.props || {}), ...tokenProps }
    if (token && isInheritFromPreviousEnabled(mergedProps) && !String(mergedProps.value || '').trim()) {
      const inheritedValue = String(token.prevValue || '')
      if (inheritedValue) mergedProps.value = inheritedValue
    }

    const payloadValue = typeof payload?.props?.value === 'string' ? payload.props.value : ''
    const tokenPrompt = typeof token.prompt === 'string' ? token.prompt : ''
    const payloadPrompt = typeof payload.prompt === 'string' ? payload.prompt : payloadValue
    const mergedValue = typeof mergedProps.value === 'string' ? mergedProps.value : ''
    const resolvedValue = mergedValue || payloadValue || tokenPrompt || payloadPrompt || ''
    const resolvedPrompt = tokenPrompt || payloadPrompt || resolvedValue || ''
    const resolvedId = String(token.echoId || tokenProps.echoId || tokenProps.id || payload?.props?.echoId || payload?.props?.id || '').trim()

    // definition 没拿到前，临时 props = mergedProps；下面 compileDefinition 后会再覆盖
    const context = {
      name: token.echoName || matchedEcho?.name || '',
      id: resolvedId,
      props: { ...mergedProps, value: resolvedValue, id: resolvedId },
      propsRaw: token.propsRaw || '',
      prompt: resolvedPrompt,
      value: resolvedValue,
      raw: token.raw || '',
      echo: matchedEcho || null,
      token,
      payload
    }

    if (!matchedEcho) {
      return { ...createFallbackRenderResult(context), missing: true, title: context.name || '未注册回响' }
    }

    const definition = this.compileDefinition(matchedEcho)

    // === 新结构：finalProps = metadata (type/field/title/version/definitionId)
    //                   ∪ definition.props (卡片声明默认)
    //                   ∪ mergedProps (实例运行时)
    //                   ∪ { value: resolvedValue, id: resolvedId } (基础设施字段强制覆盖)
    //
    // metadata 注入是为了让 handler 体里能直接 `props.title` / `props.field` / `props.type`
    // 读到 echo 名片元数据，与 `props.value` / `props.id` 风格一致；
    // 不破坏已有的 defaults / instance props 合并顺序。
    const defaultProps = (definition && typeof definition.props === 'object' && definition.props) || {}
    const finalProps = Object.assign(
      {},
      {
        type: definition?.type || matchedEcho.type || 'echo',
        field: definition?.field || matchedEcho.id || '',
        title: definition?.title || matchedEcho.name || context.name || '回响',
        version: typeof definition?.version === 'number' ? definition.version : 1,
        definitionId: matchedEcho.id || '',
        // === echoId 注入（v2026-07-30 起固定） ===
        // 等价于 rune 端的 data-rune-id：为每个回响实例注入一个稳定 id。
        // 用途：handler 内 props.echoId 拿到，做 localStorage 键 / 跨重渲染锚点等。
        // 优先级：resolvedId > mergedProps.echoId > mergedProps.id（向后兼容）。
        echoId: resolvedId || String(mergedProps.echoId || mergedProps.id || '').trim()
      },
      defaultProps,
      mergedProps,
      { value: resolvedValue, id: resolvedId }
    )
    context.props = finalProps

    // === 新结构：definition.render(finalProps) → HTML 字符串 ===
    let html = ''
    let afterRenderHook = null
    try {
      if (definition && typeof definition.render === 'function') {
        const renderedHtml = definition.render(finalProps)
        html = (typeof renderedHtml === 'string') ? renderedHtml : ''
      }
      if (definition && typeof definition.afterRender === 'function') {
        const def = definition
        afterRenderHook = (domElement) => {
          try { def.afterRender(domElement, finalProps) }
          catch (error) { console.error('[echoRuntime] afterRender hook failed:', error) }
        }
      }
    } catch (error) {
      console.error('[echoRuntime] render failed:', error)
    }

    // 卡片元数据完全由 EchoRuntime 拼（不再依赖 definition.render 返回值里的 type/icon/...）
    const normalized = createFallbackRenderResult(context)
    normalized.html = html || normalized.html
    if (afterRenderHook) normalized.afterRenderHook = afterRenderHook
    normalized.type = definition?.type || matchedEcho.type || 'echo'
    normalized.field = definition?.field || matchedEcho.id || ''
    normalized.title = definition?.title || matchedEcho.name || context.name || '回响'
    normalized.props = finalProps
    normalized.echo = matchedEcho

    return normalized
  }

  renderToHtml (token = {}, echo = null) {
    const rendered = this.render(token, echo)
    const renderedHtml = String(rendered.html || '').trim()

    // 一致性原则（v2026-07-29 起）：
    //   - render() 返回了非空字符串 → 完全采纳，渲染层用这段 HTML 覆盖 host；
    //   - render() 没写 / 抛错 / 返回空 → 返回空字符串，让 renderEchoPlaceholders 跳过 host.innerHTML 赋值，
    //     保留 echoAnno.js 输出的 @xxx 圆形胶囊（ag-echo-placeholder-marker）作为兜底。
    // 不要在这里再拼一个 ag-echo-inline 大卡片，否则同一个 token 在聚焦/失焦切换时会因为
    // render 成功/失败状态切换而在大卡片和 render 自定义内容之间抖动。
    return renderedHtml
  }

  afterRender (container, options = {}) {
    if (!container || typeof container.querySelectorAll !== 'function') return []

    if (this._afterRenderTimer) {
      clearTimeout(this._afterRenderTimer)
      this._afterRenderTimer = null
    }
    this._afterRenderTimer = setTimeout(() => this._doAfterRender(container, options), 250)
  }

  _doAfterRender (container, options = {}) {
    if (options.cleanupFirst) this.disposeAll(container)

    const installed = []
    // 遍历 host（由 renderEchoPlaceholders 打过 data-echo-host="true"），
    // host 的 innerHTML 是 definition.render() 的原样输出，不注入额外 attr。
    safeQueryAll(container, '[data-echo-host="true"]').forEach(host => {
      const echoName = host.getAttribute('data-echo-name') || ''
      const echoId = host.getAttribute('data-echo-id') || ''
      const definitionId = host.getAttribute('data-echo-definition-id') || ''
      const matchedEcho = (definitionId && this.registry?.getById?.(definitionId))
        || (echoName && this.registry?.getByName?.(echoName))
        || null
      if (!matchedEcho) return
      const definition = this.compileDefinition(matchedEcho)
      if (!definition || typeof definition.afterRender !== 'function') return

      let cleanup = null
      let node = null
      try {
        // props 从 dataset（host 上有 echoValue / echoDefinitionId 等）读取
        // === node 的语义（v2026-07-29 起锁定）===
        // node 必须等于 host 本身（ag-echo-anno-token 那层 outer span），
        // 这样 handler 拿到的就是「echo rune 实体所在的 DOM 节点」：
        //   - $(node).prev()            → host 在 line / block 里的前一个 sibling
        //                                （nice / twinbloom / peek 等需要操作 prev 文本节点）
        //   - $(node).addClass('...')   → 给 host 加 ag-rune-* 类（CSS hook 的触发点）
        //   - $(node).closest(...)      → 找 block / document 容器（skywalk / growth）
        //   - $(node).parent()          → 在 parent 里 find 其它 host（mindsteal / calamity）
        //
        // 旧实现 `node = host.firstElementChild || host` 是 v2026-07-29 之前的语义——
        // 那时 render 输出是裸 `ag-rune ag-rune--xxx` span，host 内部 children 就是这一个；
        // node = firstElementChild 拿到那个裸 span。
        // v2026-07-29 起 render 输出改为「与 echoAnno 一致的 marker 包裹」嵌套结构
        // （marker > at-span + name-span），host.firstElementChild 现在是 marker outer，
        // handler 拿它去 .prev() 永远拿不到 line 里的前一个文本节点，所有
        // 「操作 prev sibling」的 handler（nice / twinbloom / peek / growth / ...）都失效。
        // 把 node 改成 host 本身后这些 handler 才能真正跑起来。
        node = host
        const props = readEchoPropsFromHost(host)
        cleanup = definition.afterRender(node, props) || null
      } catch (error) {
        console.error('[echoRuntime] afterRender hook failed:', echoName, error)
      }
      if (typeof cleanup === 'function' && node) {
        installed.push({ node, id: `__afterRender_${echoName}_${echoId}`, cleanup })
        node.__agEchoCleanup = cleanup
      }
    })

    this._installed = installed
    return installed
  }

  disposeAll (_container) {
    if (this._afterRenderTimer) {
      clearTimeout(this._afterRenderTimer)
      this._afterRenderTimer = null
    }
    if (!Array.isArray(this._installed)) return
    while (this._installed.length) {
      const item = this._installed.pop()
      try { item.cleanup(item.node) }
      catch (error) { console.warn('[echoRuntime] dispose cleanup failed:', item.id, error) }
      if (item.node) delete item.node.__agEchoCleanup
    }
  }
}