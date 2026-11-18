# Rune �?Echo 架构深度解析（源码级�?

> 本文档是 `SKILL.md` �?*源码级补�?*：聚焦具体代码、具体行号、具体数据流。所有信息以当前 `src/` / `src-electron/` / `coolma-muya/lib/` 实际状态为准（截至 v2026-07-30）�?

---

## 1. anno_source 完整形态与生命周期

### 1.1 字符串模板（用户/builtin 都用这一份）

```javascript
// 形态：'export default { ... }' 字符�?
// 编译：safeEvalAnnoSource(source, HANDLER_PRELUDE) �?new Function(prelude + normalized)()
// 标准化：�?'export default' 替换�?'return'，再拼到工厂函数�?

const annoSource = `export default {
  // 顶层 metadata
  type: 'echo-chant',                  // 'echo' | 'echo-chant' | 'echo-tbd'
  field: 'growth',                     // = id 别名
  title: '生生不息',                    // = name 别名
  version: 1,

  // �?实例可配置参数顶层声�?
  props: {
    scope: 'siblings',
    trigger: 'auto',
    target: 'p, h1, h2, h3, h4, h5, h6, li, blockquote, table'
  },

  // render 只接 props，返�?echo host HTML 字符�?
  render (props = {}) {
    if (typeof props.render === 'function') {
      const out = props.render(props)
      if (out != null && String(out) !== '') return out
    }
    return '<span class="ag-echo-placeholder-marker ag-rune ag-rune--' +
      (props.id || props.definitionId || '回响') + '" data-echo-chant-id="' +
      (props.id || props.definitionId || '回响') + '">' +
      (props.title || '回响') + '</span>'
  },

  // afterRender �?echo 改附近元素的唯一入口
  afterRender (node, props = {}) {
    // handler body �?jQuery（HANDLER_PRELUDE 注入�?`const $ = window.jQuery`�?
    const $rune = $(node)
    const merged = Object.assign({ scope: 'siblings' }, props || {})
    $rune.addClass('ag-rune-growth-active')
    // ... 改附�?DOM
    return () => { /* cleanup，可�?*/ }
  }
}`
```

### 1.2 编译（`src/components/echo/echoAnnoSource.js`�?

```javascript
export const HANDLER_PRELUDE = "const $ = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null\n"

export const safeEvalAnnoSource = (source = '', prelude = '') => {
  const normalized = String(source || '').replace(/export\s+default/, 'return ')
  return new Function(String(prelude || '') + normalized)
}
```

调用 `safeEvalAnnoSource(annoSource, HANDLER_PRELUDE)` 返回**工厂函数**；调用工厂函�?`factory()` 返回 definition 对象 `{ type, field, title, version, props, render, afterRender }`�?

`EchoRuntime.compileDefinition(echo)` 内部�?`safeEvalAnnoSource(source, HANDLER_PRELUDE)` 并加 `definitionCache`（按 `echoId` 缓存）�?

### 1.3 render 阶段（`src/components/echo/echoRuntime.js`�?

```javascript
// === finalProps 合并顺序（renderer 期）===
const finalProps = Object.assign(
  {},
  // 1. metadata
  {
    type: definition?.type || matchedEcho.type || 'echo',
    field: definition?.field || matchedEcho.id || '',
    title: definition?.title || matchedEcho.name || context.name || '回响',
    version: typeof definition?.version === 'number' ? definition.version : 1,
    definitionId: matchedEcho.id || ''
  },
  // 2. definition.props（卡片声明的默认值）
  defaultProps,
  // 3. mergedProps（实例运行时 props：@离析{density:'tight'}�?
  mergedProps,
  // 4. 基础设施字段强制覆盖
  { value: resolvedValue, id: resolvedId }
)
context.props = finalProps

// === definition.render(finalProps) �?HTML 字符�?===
let html = ''
if (definition && typeof definition.render === 'function') {
  const renderedHtml = definition.render(finalProps)
  html = (typeof renderedHtml === 'string') ? renderedHtml : ''
}
```

### 1.4 renderToHtml（`src/components/echo/echoRuntime.js`�?

```javascript
renderToHtml (token = {}, echo = null) {
  const rendered = this.render(token, echo)
  const renderedHtml = String(rendered.html || '').trim()

  if (renderedHtml) {
    // 完全�?definition.render() 的返回值渲�?—�?不包 span、不注入 attrs、不�?class
    return renderedHtml
  }

  // 静�?fallback（render 没返�?html 时才走）
  const icon = escapeHtml(rendered.icon || DEFAULT_ECHO_ICON)
  const color = escapeHtml(rendered.color || DEFAULT_ECHO_COLOR)
  const title = escapeHtml(rendered.title || '回响')
  // ... 返回 ag-echo-inline 包裹�?HTML
  return `<span class="ag-echo-inline ag-echo-anno-token" ...>`
}
```

注意�?*只有 render 返回空字符串�?*才走 fallback �?`ag-echo-inline` 包裹。builtin echo 全部�?render 返回的字符串路径�?

### 1.5 afterRender 派发（`src/components/echo/echoRuntime.js`�?

```javascript
afterRender (container, options = {}) {
  if (!container || typeof container.querySelectorAll !== 'function') return []
  // 250ms debounce，避免高频渲染期重复派发
  if (this._afterRenderTimer) {
    clearTimeout(this._afterRenderTimer)
    this._afterRenderTimer = null
  }
  this._afterRenderTimer = setTimeout(() => this._doAfterRender(container, options), 250)
}

_doAfterRender (container, options = {}) {
  if (options.cleanupFirst) this.disposeAll(container)

  const installed = []
  // �?host（renderEchoPlaceholders 已打�?data-echo-host="true"�?
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
    try {
      const node = host.firstElementChild || host  // �?host �?firstElementChild = render 输出�?DOM
      const props = readEchoPropsFromHost(host)
      cleanup = definition.afterRender(node, props) || null
    } catch (error) {
      console.error('[echoRuntime] afterRender hook failed:', echoName, error)
    }
    installed.push({ node, id: `__afterRender_${echoName}_${echoId}`, cleanup })
  })

  // 记录所�?cleanup，disposeAll 时一起执�?
  // ...
}
```

`node` 参数 = host 本身（ag-echo-anno-token 那层 outer span），不是 host �?`firstElementChild`�?

v2026-07-29 起锁定：`$(node).prev()` 拿到 host �?line / block 里的前一�?sibling（nice / twinbloom / peek 这类需要操�?prev 文本节点�?handler 才能真正工作）；`$(node).addClass('...')` 是给 host �?ag-rune-* 类（CSS hook 触发点）�?

旧实现（v2026-07-29 之前）`node = host.firstElementChild || host`，那�?`render` 输出�?`ag-rune ag-rune--xxx` span，host 内部 children 就是这一个；�?baseRender �?render 输出嵌套 marker 之后，host.firstElementChild 变成 marker outer，handler 拿它 .prev() 永远空——所以同步把 node 改成 host 本身�?

---

## 2. Rune 路径详解（Vue SFC�?

### 2.1 占位符生成（quickInsert 阶段�?

笔记中实际存储的格式�?

```html
<div data-rune-name="我的符文"
     data-rune-id="uuid-instance-id"
     data-rune-node-id="rune-uuid-node-id"
     data-rune-value="初始�?>
  显示文本
</div>
```

Muya 把这�?div �?inline block 节点（不是自定义 token）�?

### 2.2 SFC 解析（`src/components/muya/Muya.vue` �?`normalizeRuneSfc`�?

```javascript
const normalizeRuneSfc = (template = '') => {
  const source = String(template || '').trim()
  if (!source) {
    return {
      template: EMPTY_RUNE_TEMPLATE,
      script: 'export default {}',
      styles: [],
      hasTemplate: false
    }
  }
  if (!vueSfcCompiler) {
    return {
      template: source,
      script: '',
      styles: [],
      hasTemplate: true
    }
  }
  const parsed = vueSfcCompiler.parseComponent(source)
  // parsed = { template: { content }, script: { content }, styles: [{ content, ...}] }
  // ...
}
```

### 2.3 脚本 eval（`evalRuneScript`�?

```javascript
const evalRuneScript = (scriptContent = '') => {
  // �?'export default {...}' 转成 'return {...}'，new Function 调用
  const normalized = String(scriptContent || '').replace(/export\s+default/, 'return ')
  const factory = new Function(normalized)
  return factory()
}
```

### 2.4 模板编译（`compileTemplateToFunctions` + `injectScopedAttribute`�?

```javascript
const injectScopedAttribute = (template = '', scopeId = '') => {
  // 给所有顶层标签加 data-rune-scope-${runeId}（scope 隔离�?
  if (!scopeId || !template) return template
  return template.replace(/<([a-zA-Z][^\s/>]*)(\s[^<>]*?)?(\/?\s*)>/g, (match, tagName, attrs = '', tail = '') => {
    if (/^(template|slot)$/i.test(tagName) || attrs.includes(scopeId)) {
      return match
    }
    return `<${tagName}${attrs} ${scopeId}${tail}>`
  })
}

// compileTemplateToFunctions = vueSfcCompiler.compileToFunctions.bind(vueSfcCompiler)
const compiled = compileTemplateToFunctions(injectScopedAttribute(template, scopeId))
// compiled = { render, staticRenderFns }
```

### 2.5 CSS 注入（`ensureRuneStyle`�?

```javascript
const ensureRuneStyle = (styleId, cssText) => {
  let styleEl = document.getElementById(styleId)
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = styleId
    document.head.appendChild(styleEl)
  }
  if (styleEl.textContent !== cssText) {
    styleEl.textContent = cssText
  }
}

// 用法
ensureRuneStyle(`rune-style-${rune.id || 'default'}`, styles.map(style => style.content || '').join('\n'))
```

### 2.6 构�?Vue 组件（`createRuneRendererCtor`�?

```javascript
const createRuneRendererCtor = (rune = {}) => {
  const { template, script, styles, hasTemplate } = normalizeRuneSfc(rune.template)
  if (!hasTemplate) return null

  const scopeId = `data-rune-scope-${rune.id || 'default'}`
  const styleText = styles.map(style => style.content || '').join('\n')
  const componentOptions = evalRuneScript(script)
  const baseData = typeof componentOptions.data === 'function' ? componentOptions.data : () => ({})
  // 收集 SFC 里声明的 props（数组或对象形式都支持）
  const declaredPropNames = Array.isArray(componentOptions.props)
    ? componentOptions.props.map(propName => String(propName || '').trim()).filter(Boolean)
    : (componentOptions.props && typeof componentOptions.props === 'object'
      ? Object.keys(componentOptions.props)
      : [])

  if (!compileTemplateToFunctions) return null
  const compiled = compileTemplateToFunctions(injectScopedAttribute(template, scopeId))
  ensureRuneStyle(`rune-style-${rune.id || 'default'}`, styleText)

  return Vue.extend({
    ...componentOptions,
    name: componentOptions.name || 'RunePreviewRenderer',
    // 合并 props：SFC 已声明的 + 外层强制注入的（runeId / nodeId / rune / value�?
    props: {
      ...(Array.isArray(componentOptions.props)
        ? declaredPropNames.reduce((props, propName) => { props[propName] = null; return props }, {})
        : (componentOptions.props && typeof componentOptions.props === 'object'
          ? componentOptions.props
          : {})),
      runeId: { type: String, default: '' },
      nodeId: { type: String, default: '' },
      rune:   { type: Object, default: null },
      value:  { type: String, default: '' }
    },
    data () { return { ...baseData.call(this) } },
    render (h) {
      const vnode = compiled.render.call(this, h)
      if (vnode && typeof vnode === 'object') {
        const existingChildren = Array.isArray(vnode.children) ? vnode.children : []
        if (!existingChildren.length) {
          vnode.children = [String(this.value == null ? '' : this.value)]
        }
      }
      return vnode
    },
    staticRenderFns: compiled.staticRenderFns,
    _scopeId: scopeId
  })
}
```

### 2.7 外层包裹 `RunePreviewRenderer`

```javascript
const RunePreviewRenderer = Vue.extend({
  name: 'RunePreviewRenderer',
  props: {
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune:   { type: Object, default: null },
    value:  { type: String, default: '' },
    onValueChange: { type: Function, default: null }
  },
  computed: {
    rendererCtor () { return createRuneRendererCtor(this.rune || {}) }
  },
  render (h) {
    if (!this.rendererCtor) return h('div')
    const self = this
    return h(this.rendererCtor, {
      props: { runeId: this.runeId, nodeId: this.nodeId, rune: this.rune, value: this.value },
      on: {
        input: function (...args) {
          if (typeof self.onValueChange !== 'function') return
          self.onValueChange({
            runeId: self.runeId,
            nodeId: self.nodeId,
            value: args[0] == null ? '' : String(args[0])
          })
        }
      }
    })
  }
})
```

### 2.8 数据回写 `updateRunePlaceholderValue`

```javascript
updateRunePlaceholderValue ({ runeId = '', nodeId = '', value = '' } = {}) {
  if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return false
  const markdown = this.contentEditor.getMarkdown()
  if (!markdown) return false
  const targetNodeId = String(nodeId || '').trim() || this.findRunePlaceholderNodeIdByRuneInstance(markdown, runeId)
  if (!targetNodeId) return false
  const nextMarkdown = rewriteRunePlaceholderByNodeId(markdown, targetNodeId, value)
  if (nextMarkdown === markdown) return false
  const cursor = this.contentEditor.getCursor()
  this.contentEditor.setMarkdown(nextMarkdown, cursor, false)
  // ...
  return true
}
```

`rewriteRunePlaceholderByNodeId` �?nodeId 精准替换 `<div data-rune-node-id="..." data-rune-value="...">innerText</div>`�?

### 2.9 完整渲染流程

```
Muya 解析 <div data-rune-name="...">
  �?
Muya 替换�?<RunePreviewRenderer>（外层包裹）
  �?
RunePreviewRenderer �?createRuneRendererCtor(rune)
  �?
Vue.extend 构造器 �?h(this.rendererCtor, { props, on }) �?$mount
  �?
内层 SFC 渲染�?DOM
  �?
内层 SFC �?mounted 钩子执行
  �?
用户交互 �?内层 $emit('input', value)
  �?
RunePreviewRenderer.onValueChange({runeId, nodeId, value})
  �?
Muya.vue.updateRunePlaceholderValue({runeId, nodeId, value})
  �?
rewriteRunePlaceholderByNodeId �?contentEditor.setMarkdown(...)
  �?
Muya 重渲染整个文�?
```

---

## 3. Echo 路径详解（`@xxx{}()` + `render` + `afterRender`�?

### 3.1 Muya 解析 `echo_anno` token

```javascript
// coolma-muya/lib/parser/rules.js
echo_anno: /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)$/
```

匹配结果�?
```javascript
{
  type: 'echo_anno',
  echoName: '生生不息',
  propsParsed: { density: 'very-loose' },
  prompt: '春风吹又�?,
  raw: '@生生不息{scope: "siblings"}(春风吹又�?'
}
```

`propsParsed` �?`echoPropsParser.parseEchoProps()` 解析 `{...}` 段�?

### 3.2 行内渲染器（`coolma-muya/lib/parser/render/renderInlines/echoAnno.js`�?

```javascript
export default function echoAnno (h, cursor, block, token, outerClass) {
  // 收集 token 的字�?
  const echoName = String(token.echoName || '').trim() || '回响'
  const instProps = (token && token.propsParsed && typeof token.propsParsed === 'object')
    ? token.propsParsed : {}
  const value = String(typeof instProps.value === 'string' ? instProps.value : token.prompt || '')
  const echoId = String(token.echoId || instProps.id || (token.echoName ? echoName : '')).trim()
  const definitionId = String(token.definitionId || instProps.definitionId || '').trim()
  // ...width / height 处理（@离析{width: '300px'}�?

  const echoNodeId = createEchoNodeId(token, echoId, definitionId, echoName)
  const dataset = {
    start: token.range.start,
    end: token.range.end,
    raw: token.raw,
    echoName,
    echoId: echoId || '',
    echoDefinitionId: definitionId,
    echoNodeId,
    echoValue: value,
    echoInline: 'true'  // 永远�?inline placeholder
  }
  if (hasExplicitWidth) dataset.echoWidth = width
  if (hasExplicitHeight) dataset.echoHeight = height
  // �?propsParsed 原样写到 dataset（让 _readEchoProps �?afterRender 能取到）
  const merged = { ...instProps, value, echoName, echoId, definitionId }
  const echoPropsJson = JSON.stringify(merged)
  dataset.echoPropsJson = echoPropsJson

  // 返回 vnode
  return [
    h(`span.${className}.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`, {
      dataset,
      attrs: Object.assign({
        spellcheck: 'false', title, contenteditable: 'false'
      }, echoPropsJson ? { 'data-echo-props-json': echoPropsJson } : {}),
      style: hostStyle
    }, /* ...内层 vnode 节点... */)
  ]
}
```

### 3.3 StateRender 的渲染流程（`coolma-muya/lib/parser/render/index.js`�?

#### 3.3.1 `renderRunePlaceholderNodes()`

```javascript
renderRunePlaceholderNodes () {
  const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
  if (!root) return
  const runeMap = this.getRuneMap()
  const hosts = root.querySelectorAll(RUNE_PLACEHOLDER_SELECTOR)  // [data-rune-name][data-rune-id][data-rune-node-id]

  hosts.forEach(host => {
    const dataset = host.dataset || {}
    const runeName = String(dataset.runeName || '').trim()
    const instanceId = String(dataset.runeId || '')
    const nodeId = String(dataset.runeNodeId || '')
    const rune = runeMap.get(runeName) || null
    // cacheKey：runeName + instanceId + nodeId + innerText + template
    const cacheKey = JSON.stringify({ runeName, instanceId, nodeId, innerText: host.textContent || '', template: rune?.template || '' })

    if (this.runePlaceholderCache.get(host) === cacheKey) return  // 幂等

    host.classList.add(RUNE_HOST_CLASS)
    host.setAttribute('contenteditable', 'false')
    host.innerHTML = this.createRunePlaceholderMarkup(rune, dataset)
    host.dataset.runeRenderKey = cacheKey
    this.runePlaceholderCache.set(host, cacheKey)
  })
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
```

#### 3.3.2 `renderEchoPlaceholders()`

```javascript
renderEchoPlaceholders () {
  const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
  if (!root) return
  const echoMap = this.getEchoMap()
  const echoRuntime = this.muya?.options?.echoRuntime || null
  const hosts = root.querySelectorAll(ECHO_PLACEHOLDER_SELECTOR)  // [data-echo-node-id]

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

    const echo = definitionId ? echoMap.get(definitionId) : echoMap.get(echoName)
    const hasEcho = !!echo

    // cacheKey 决定是否重新渲染
    const cacheKey = JSON.stringify({
      echoName, echoId, definitionId, nodeId, value,
      desc: echo?.desc || '', color: echo?.color || '', icon: echo?.icon || '',
      annoSource: echo?.anno_source || echo?.template || '',
      hasExplicitWidth, hasExplicitHeight, width, height
    })
    if (this.echoPlaceholderCache.get(host) === cacheKey) return

    host.classList.add(ECHO_HOST_CLASS)
    host.setAttribute('contenteditable', 'false')

    let innerHtml = ''
    if (hasEcho && echoRuntime && typeof echoRuntime.renderToHtml === 'function') {
      try {
        const simAttrs = { id: echoId, definitionId, value }
        const token = {
          echoName, echoId,
          propsParsed: simAttrs, propsRaw: '',
          prompt: value, value,
          raw: '', payload: '', payloadRaw: ''
        }
        innerHtml = echoRuntime.renderToHtml(token, echo)
      } catch (error) {
        console.warn('[StateRender.renderEchoPlaceholders] echoRuntime.renderToHtml failed:', error)
        innerHtml = ''
      }
    }
    if (!innerHtml) {
      innerHtml = this.createEchoPlaceholderMarkup(echo, { ...dataset, hasExplicitWidth, hasExplicitHeight, width, height })
    }
    host.innerHTML = innerHtml

    // �?host 上打 attr（不污染 render 输出），�?afterRender 能找�?host
    if (echoName) host.setAttribute('data-echo-name', echoName)
    if (echoId) host.setAttribute('data-echo-id', echoId)
    if (definitionId) host.setAttribute('data-echo-definition-id', definitionId)
    host.setAttribute('data-echo-host', 'true')
    host.dataset.echoRenderKey = cacheKey
    this.echoPlaceholderCache.set(host, cacheKey)
  })

  // �?handler 派发（在所�?host 都更新完之后�?
  if (echoRuntime && typeof echoRuntime.afterRender === 'function' && root) {
    try {
      echoRuntime.afterRender(root, { cleanupFirst: true })
    } catch (error) {
      console.warn('[StateRender.renderEchoPlaceholders] echoRuntime.afterRender failed:', error)
    }
  }
}
```

#### 3.3.3 `mountRuneVueHosts()`（`enableRuneVueRenderer === true` 时执行）

```javascript
mountRuneVueHosts () {
  const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
  if (!root) return
  // �?[data-rune-mounted="true"] host
  const hosts = root.querySelectorAll('[data-rune-mounted="true"]')
  hosts.forEach(host => {
    const dataset = host.dataset || {}
    const runeName = String(dataset.runeName || '').trim()
    const instanceId = String(dataset.runeId || '')
    const nodeId = String(dataset.runeNodeId || '')
    // �?rune 定义
    const rune = runeMap.get(runeName) || null
    if (!rune) return

    // props 合并优先�?
    const finalProps = {
      runeId: instanceId,
      nodeId,
      rune,
      value: dataset.runeValue || host.textContent || ''
    }

    // 复用 vm（按 nodeId�?
    const existing = this.runeVmMap.get(nodeId)
    if (existing && !existing._destroyed) {
      // 重渲只更�?props
      existing.rune = rune
      existing.value = finalProps.value
      return
    }

    // 销毁陈�?vm
    if (existing && existing._destroyed) {
      this.runeVmMap.delete(nodeId)
    }

    // 新建 vm
    const rendererCtor = createRuneRendererCtor(rune)
    if (!rendererCtor) return
    const vm = new RunePreviewRenderer({
      propsData: finalProps,
      onValueChange: ({ runeId, nodeId, value }) => {
        // 转发�?Muya.vue.updateRunePlaceholderValue
        // （实际绑定在 muya 实例上，见下�?
      }
    })
    vm.$mount()
    host.appendChild(vm.$el)
    this.runeVmMap.set(nodeId, vm)
  })
}
```

> `onValueChange` �?`StateRender` 调用 mountRuneVueHosts 时绑定到 muya 实例�?`updateRunePlaceholderValue`（具体由 Muya.vue 在初始化时注入）�?

#### 3.3.4 `mountEchoVueHosts()`（默�?*�?*执行�?

```javascript
mountEchoVueHosts () {
  if (!this.muya?.options?.enableEchoVueRenderer) {
    // 默认 disable，renderToHtml 已写�?innerHTML，不需�?Vue 包裹
    return
  }
  // ... 逻辑类似 mountRuneVueHosts，但�?EchoPreviewRenderer
}
```

> 默认 `enableEchoVueRenderer: false`。Echo 是纯 HTML + handler 派发，不需�?Vue 组件层级�?

### 3.4 afterRender 完整流程

```
StateRender.renderRunes() 在以下时机被调用�?
  - render() 全量渲染
  - partialRender() 局部渲�?
  - singleRender() 单块渲染
  - 单个用户动作（如输入框修改）
       �?
renderRunes() 调用链：
  1. renderRunePlaceholderNodes()       �?jQuery 模式，rune 占位卡片
  2. renderEchoPlaceholders()           �?jQuery 模式，echo 渲染 + 立即派发 afterRender
  3. cleanupDetachedRunePlaceholders()  �?�?host.dataset.runeRenderKey 已不�?DOM �?
  4. cleanupDetachedEchoPlaceholders()
  5. enableRuneVueRenderer
       ? renderRunesWithVue() �?mountRuneVueHosts() + mountEchoVueHosts() + cleanup
       : cleanupDetachedRuneVms(true) + cleanupDetachedEchoVms(true)
  6. echoRuntime.afterRender(root, { cleanupFirst: true })  �?handler 派发
     └─ 内部：setTimeout(..., 250ms) debounce �?_doAfterRender
        └─ �?[data-echo-host="true"] �?definition.afterRender(node, props)
```

> �?2 步和�?6 步都会调 `echoRuntime.afterRender`，但都走 250ms debounce，所以实际只会执行最后一次�?

---

## 4. 16 张内�?echo 工厂详解

### 4.1 工厂入口（`src/components/echo/echoBuiltins/echoBuiltinsBase.js`�?

```javascript
// baseRender 工厂：产�?render(props) 函数字符�?
const baseRender = (meta = {}) => `render (props = {}) {
    const metaName = '${meta.name}'
    // 优先�?1: props.render 是函数且返回非空 �?无条件采�?
    if (props && typeof props.render === 'function') {
      let out
      try { out = props.render(props) }
      catch (e) { console.error('[echoBaseRender]', metaName, 'props.render threw:', e); out = undefined }
      if (out != null && String(out) !== '') return out
    }
    // 优先�?2/3 兜底: props.title > metaName
    const displayTitle = (props && props.title) || metaName
    const idTag = (props && (props.id || props.definitionId)) || metaName
    return '<span class="ag-echo-placeholder-marker ag-rune ag-rune--' + idTag + '" data-echo-chant-id="' + idTag + '">' + displayTitle + '</span>'
  }`

// baseAfterRender 工厂：handlerDoc + handler body
const baseAfterRender = (handlerBody = '', meta = {}) => `${handlerDoc([\`【handler�?{meta.handlerDesc || ''}\`])}
    ${handlerBody}
  }`

// createAnnoSource：拼成完�?anno_source 字符�?
const createAnnoSource = ({ meta, renderBody, handlerBody }) => `export default {
  ${banner(meta.banner || [])},
  type: '${meta.type}',
  field: '${meta.id}',
  title: '${meta.name}',
  version: 1,
  props: ${JSON.stringify(meta.propsDefaults || {})},
  ${renderBody},
  ${baseAfterRender(handlerBody, meta)}
}`

// buildEchoCard：meta + factory �?一张完�?echo �?
const buildEchoCard = (meta) => {
  const renderBody = baseRender(meta)
  const anno_source = createAnnoSource({ meta, renderBody, handlerBody: meta.handlerBody || '' })
  return Object.freeze({
    id: \`__builtin_${meta.id}__\`,
    metaId: meta.id,
    name: meta.name,
    desc: meta.desc,
    icon: meta.icon,
    color: meta.color,
    category: meta.category,
    anno_source,
    isBuiltin: true
  })
}
```

### 4.2 单张卡片模板（`src/components/echo/echoBuiltins/echoBuiltinsGrowth.js`�?

```javascript
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'growth', name: '生生不息', icon: 'park', color: '#43A047', category: 'showy', type: 'echo-chant',
  desc: '为附近符合条件的元素加上生长的动画特�?,
  banner: ['【生生不�?/ growth�?—�?...'],
  handlerDesc: '自动给目标元素加生长动画；trigger=auto 时按 index 设置 stagger delay',
  propsDefaults: { scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' },
  handlerBody: `
    const mergedProps = Object.assign({ scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' }, props || {})
    const targetSelector = mergedProps.target
    const $container = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').parent()
    if (!$container.length) return () => {}
    const container = $container.get(0)
    const $targets = $(container).find(targetSelector)
    $targets.each((i, el) => {
      $(el).addClass('ag-rune-growth-target')
      if (mergedProps.trigger === 'auto') $(el).css('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')
    })
    $(node).addClass('ag-rune-growth-active')
    return () => {
      $targets.removeClass('ag-rune-growth-target').css('--ag-rune-growth-delay', '')
      $(node).removeClass('ag-rune-growth-active')
    }`
}

export default buildEchoCard(META)
```

### 4.3 聚合入口（`src/components/echo/echoBuiltins/echoBuiltins.js`�?

```javascript
import nice from './echoBuiltinsNice.js'
import growth from './echoBuiltinsGrowth.js'
// ... 16 �?import

const BUILTIN_ECHO_CARDS = Object.freeze([
  nice, growth, shatter, skywalk, twinbloom, mindsteal, lucky, scapegoat, calamity, disperse,
  peek, ignore, ad, diff, ref, todo
])

const BUILTIN_ECHO_CHANT_IDS = Object.freeze(BUILTIN_ECHO_CARDS.map(card => card.metaId))
const isBuiltinEchoChantId = (id = '') => BUILTIN_ECHO_CHANT_IDS.includes(String(id || '').trim())

export { BUILTIN_ECHO_CARDS, BUILTIN_ECHO_CHANT_IDS, isBuiltinEchoChantId }
export default BUILTIN_ECHO_CARDS
```

> **v2026-07-29 �?*：main �?*不再维护** `src-electron/main-process/service/builtin-echoes.js` 镜像，`scripts/transform-main-builtin-echoes.js` 也已删除。真相源单一�?renderer �?`echoBuiltins/`；DB 落库完全�?renderer 通过 IPC payload（`db:clearEchoes` / `db:saveEcho` / `db:saveEchoes`）推送内�?echo 列表，避免双源漂移�?
>
> main �?IPC handler 的新契约�?
> - `db:clearEchoes`：`payload.builtins` 必传（renderer �?`BUILTIN_ECHO_CARDS`），不再�?main 镜像兜底"分支�?
> - `db:saveEcho` / `db:saveEchoes`：内�?echo（id 前缀 `__builtin_`）的 category 直接�?`payload.echo.category`（renderer 真相源）；主进程不再查内�?meta 表强制覆盖�?
> - 启动�?内置 echo showy/marker 类纠�?迁移已删除——历史脏数据�?renderer �?`loadEchoes` 通过 `{ ...template, ...override }` 自然覆盖（DB 行的 category 永远是代码版默认值）�?

---

## 5. 14 个内�?rune 模板详解

> **v2026-07-29 �?*：main �?*不再维护** `src-electron/main-process/service/builtin-rune-templates.js` 镜像（已 `git rm`）�?*历史上镜像已经出现真实漂�?*：renderer �?14 张（�?`InheritDemo`）vs main �?13 张（�?`InheritDemo`），新装机用户永远看不到 InheritDemo。改成跟 echo 同方�?full-push"：真相源�?renderer �?`runeTemplates.js` �?`BUILTIN_RUNE_TEMPLATE_META` 导出�?4 项元数据 + 14 �?factory 引用），DB 落库�?renderer 推送�?
>
> main �?IPC handler 的新契约�?
> - `db:clearRuneTemplates`：`payload.builtins` 必传（renderer �?`BUILTIN_RUNE_TEMPLATE_META` 拼装行数组），不再有"main 镜像兜底"分支�?
> - `db:saveRuneTemplate` / `db:saveRuneTemplates`：renderer �?`RuneTemplateService.seedBuiltin()` �?`ensureLoaded()` 缓存 miss �?DB 为空（或 0 张内置行）时懒灌种子；并发去�?+ `saveOne` �?upsert 语义保证幂等�?
> - 启动�?首次 seed"代码段已删除——renderer 端懒灌替代�?

### 5.1 工厂入口（`src/components/rune/runeTemplates/runeTemplates.js`�?

```javascript
import runeTemplatesBlank from './runeTemplatesBlank.js'
// ... 14 �?import

const createBlankTemplate = runeTemplatesBlank
const createInheritDemoTemplate = runeTemplatesInheritDemo
// ...

export {
  createBlankTemplate,
  createInheritDemoTemplate,
  createInputTemplate,
  createHolyShieldTemplate,
  createFireflyTemplate,
  createJsxGraphTemplate,
  createElInputTemplate,
  createElSelectTemplate,
  createElDatePickerTemplate,
  createResumeBasicInfoTemplate,
  createResumeTitleTemplate,
  createResumeExperienceTemplate,
  createResumeTextTemplate,
  createResumeSkillTemplate
}
```

### 5.2 单张模板（`src/components/rune/runeTemplates/runeTemplatesBlank.js`�?

```javascript
export const runeTemplatesBlank = () => {
  return `<template>
  <div class="blank-page">
    <!-- HTML 结构区域 -->
    <p>Vue2 空白组件</p>
  </div>
</template>

<script>
export default {
  name: 'BlankDemo',
  // 接收父组件参�?
  props: {},
  data() {
    return {
      // 响应式数�?
    }
  },
  computed: {
    // 计算属�?
  },
  watch: {},
  methods: {},
  // 生命周期钩子
  created() {},
  mounted() {},
  updated() {},
  destroyed() {}
}
<\/script>   <!-- �?注意�?\/script> 是字面字符串，不�?HTML 闭合 -->

<style lang="less" scoped>

</style>`
}

export default runeTemplatesBlank
```

**关键�?*：`</script>` 必须写成 `<\/script>`——这是因为模板字符串本身在外�?JS 字符串里会被当作 HTML / ES module 字面量解析，原始 `</script>` 会让外层解析器认为这里是结束标签，截断模板�?

---

## 6. Muya.vue 关键路径行号索引

> 行号截至 v2026-07-29，可能有 ±10 行浮动，详见具体文件�?

| 路径 | 大致位置 |
|---|---|
| `normalizeRuneSfc` | ~132-230 |
| `evalRuneScript` | ~231-237 |
| `ensureRuneStyle` | ~238-249 |
| `createRuneRendererCtor` | ~251-347 |
| `RunePreviewRenderer` | ~349-415 |
| `EchoPreviewRenderer` | ~418-525 |
| `EchoPlaceholderHost`（EchoPreviewRenderer 别名�?| ~529 |
| `refreshEchoDefinitions` | ~682-706 |
| `updateRunePlaceholderValue` | ~712-730 |
| `findRunePlaceholderNodeIdByRuneInstance` | ~735-749 |
| muya options 设置（enableRuneVueRenderer / enableEchoVueRenderer�?| ~1000-1004 |

---

## 7. render/index.js 关键路径行号索引

| 路径 | 大致位置 |
|---|---|
| `RUNE_PLACEHOLDER_SELECTOR` / `ECHO_PLACEHOLDER_SELECTOR` 常量 | ~11-13 |
| `RUNE_HOST_CLASS` / `ECHO_HOST_CLASS` �?CSS class 常量 | ~14-17 |
| `createRunePlaceholderMarkup` | ~270-279 |
| `createEchoPlaceholderMarkup` | ~281-309 |
| `renderRunePlaceholderNodes` | ~312-348 |
| `renderEchoPlaceholders` | ~358-467 |
| `cleanupDetachedEchoPlaceholders` | ~469 |
| `renderRunePlaceholders`（与 mountRuneVueHosts 一致路径） | ~485 |
| `cleanupDetachedRunePlaceholders` | ~518 |
| `cleanupDetachedEchoVms` | ~529 |
| `cleanupDetachedRuneVms` | ~543 |
| `mountEchoVueHosts`（默�?disable�?| ~557 |
| `mountRuneVueHosts`（默�?enable�?| ~633 |
| `postRenderEchoPlaceholders` | ~750 |
| `postRenderRunePlaceholders` | ~764 |
| `renderRunesWithVue` | ~1059-1064 |
| `renderRunes` | ~1066-1090 |

---

## 8. 性能优化（源码级�?

1. **definitionCache**（`echoRuntime.js`）：`compileDefinition` 内部 Map �?echoId 缓存编译结果，新�?删除 echo �?`invalidate()` 清掉�?
2. **runePlaceholderCache / echoPlaceholderCache**（`render/index.js`）：�?host DOM 节点缓存 renderKey，未变则跳过 `host.innerHTML = ...` 赋值�?
3. **scopeId 隔离**：`injectScopedAttribute` 给所有顶层标签加 `data-rune-scope-${runeId}`，SFC �?`<style scoped>` 编译后只作用于自身�?
4. **cleanupFirst**：`renderRunes` �?`echoRuntime.afterRender(root, { cleanupFirst: true })` 时先清旧 cleanup 再派发新 handler，避免属性累积�?
5. **250ms debounce**：`afterRender` 内部 setTimeout 250ms，确保高频渲染期只派发最后一次�?

## 9. 已知边界情况

1. **twinbloom 幂等**：克隆块�?`data-twinbloom-of` 标记，若已存在则跳过
2. **disperse 累积**：`data-disperse-density` 属性可能覆盖而非累积
3. **mindsteal 冲突**：多�?mindsteal 节点对同一目标操作时，后者覆盖前�?
4. **scapegoat 错误捕获**：依�?`window.error` �?`ag:rune:error` 自定义事�?
5. **echo NPE 兜底**：handler body �?Node �?`$` �?null，但 `EchoRuntime._doAfterRender` �?try-catch
6. **renderRunes 重复派发**：renderEchoPlaceholders �?renderRunes 都会触发 echoRuntime.afterRender，但都走 250ms debounce

## 10. 调试技�?

```javascript
// 打开 echo trace
window.__ECHO_TRACE__ = true  // renderEchoPlaceholders 内部�?console.log

// 列出所�?echoRegistry 卡片
window.__memocastEchoRegistry?.getAll()

// 强制失效所有编译缓�?
window.__memocastEchoRegistry?.runtime?.invalidate()

// 强制重渲
this.contentEditor.contentState.stateRender.renderRunes()
```

## 11. 测试契约（护城河�?

详见 `.agents/rules/rune-echo-test-moat.mdc`。每条契约对应一�?Jest suite�?

| 契约 | 测试用例 |
|---|---|
| `definition.render(props)` / `definition.afterRender(node, props)` 签名 | `tests/unit/echo/runtime-props.test.js` |
| 16 张内�?anno_source 顶层结构（`type` / `field` / `title` / `version` / `props`�?| `tests/unit/echo/jquery-echo-compile.test.js` |
| 16 �?handlerBody �?jQuery 化（无原�?fallback�?| `tests/unit/echo/jquery-afterrender.test.js` |
| main �?CJS 镜像�?renderer 端类型契约一�?| `tests/unit/echo/main-builtin-echoes.test.js` |
| echo propsSchema 贴合 form-create rule | `tests/unit/echo/schema-formcreate-align.test.js` |
| 14 �?rune 模板源文件转�?+ `props.value` + `$emit('input')` | `tests/unit/rune/templates.test.js` |
| inherit helper + payload codec round-trip | `tests/unit/echo/inherit-from-previous.test.js` |

任何对这些契约的改动，必须先更新对应 Jest 用例，再 `yarn verify` 全量验证�?
