---
name: rune-echo-design
description: >-
  Memocast Muya 编辑器中 rune（符文）与 echo（回响）的核心区别。rune = Vue SFC + Vue.extend，是用户自定义的卡片，**不影响其他元素**；echo = @xxx{props}(prompt) 占位符，**main 功能是改变附近元素的属性和排版**。遇到 rune、echo、Vue SFC、afterRender、data-rune-name、data-echo-host、@xxx{}(prompt)、type: echo-chant、createRuneRendererCtor、echoBuiltins、runeTemplates 等关键词时使用。
---

# Rune 与 Echo 设计（最新方案）

> 本文档只描述当前实现里的最新设计。**项目尚未对外发版，没有历史包袱**——所有老 `kind` / `apply` / 兼容分支都已删除。改命名 / 改结构时直接照做，不要保留老字段。

## 1. 一句话核心

| 名称 | 实现机制 | 主要功能 |
|------|---------|---------|
| **rune（符文）** | Vue SFC + `Vue.extend` | 自身就是一个完整卡片，**不影响其他元素** |
| **echo（回响）** | anno_source + `render(props)` + `afterRender(node, props)` | **main 功能是改变附近元素的属性和排版** |

两条管线**完全独立**，不要混用。

## 2. 命名澄清（历史已统一，别再走老路）

- 顶层分类字段叫 **`type`**，不是 `kind`。三个取值：`'echo'` / `'echo-chant'` / `'echo-tbd'`。
- handler 逻辑就放在 **`afterRender(node, props)`** 里，没有独立的 `handler.apply()` 函数。
- anno_source 顶层字段：`type` / `field`（= id 别名）/ `title`（= name 别名）/ `version` / `props` / `render` / `afterRender`。**没有 `kind` 字段**。
- 「咏唱派发」类 echo 的内部集合就叫 `BUILTIN_ECHO_CHANT_IDS`、`isBuiltinEchoChantId`——不要再去用 `RUNE_*` 字样命名。

> 旧的 `data-rune-id` / `data-rune-kind` / `apply` / `kind: 'rune'` 等命名在 v2026-07-28 之后**全部废除**。渲染层 DOM 上**仍然会**写到 `data-rune-id` / `data-echo-chant-id` 这类历史字面量（因为这些是 Markdown 源 ABI 写到笔记里了不能改），但语义上**对应的逻辑实体是 echo-chant，不是 rune**。

## 3. anno_source 完整形态

```javascript
// 字符串模板，被 safeEvalAnnoSource(source, HANDLER_PRELUDE) 编译为 definition 对象
const annoSource = `export default {
  type: 'echo-chant',        // 'echo' | 'echo-chant' | 'echo-tbd'
  field: 'growth',           // = id 别名（顶层）
  title: '生生不息',          // = name 别名（顶层）
  version: 1,

  // ★ 实例可配置参数顶层声明（schema-driven 表单用这个）
  props: {
    scope: 'siblings',
    trigger: 'auto',
    target: 'p, h1, li'
  },

  // render 只接 props，返回 echo host HTML 字符串（不要再返回 wrapper span）
  //   优先级：props.render(props) > props.title > field 兜底
  render (props = {}) {
    if (typeof props.render === 'function') {
      const out = props.render(props)
      if (out != null && String(out) !== '') return out
    }
    return '<span class="ag-echo-placeholder-marker ag-rune ag-rune--' +
      (props.id || props.definitionId || '回响') +
      '" data-echo-chant-id="' +
      (props.id || props.definitionId || '回响') +
      '">' + (props.title || '回响') + '</span>'
  },

  // afterRender 是 echo 改附近元素的唯一入口
  //   node = echo host 的 firstElementChild（即上面 render 返回的 DOM 元素）
  //   props = { ...definition.props, ...mergedProps, value, id, type, field, title, version, definitionId }
  afterRender (node, props = {}) {
    // handler body 统一用 jQuery（HANDLER_PRELUDE 注入了 `const $ = window.jQuery`）
    const $rune = $(node)
    $rune.addClass('ag-rune-growth-active')
    // ...
    return () => { /* cleanup 函数，可选 */ }
  }
}`
```

`HANDLER_PRELUDE` 注入的常量（`src/components/echo/echoAnnoSource.js`）：

```javascript
"const $ = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null\n"
```

Node 端 / 测试环境 `$` 退化为 `null`——`render(props)` 不依赖 `$`，可以正常返回 HTML；只有真正访问 `$(node)` 的 `afterRender` 会 NPE，但 `EchoRuntime._doAfterRender` 已经 try-catch 兜住（graceful skip，参考 `.agents/rules/rune-echo-cloudfn-experimental.mdc` §3.5）。

## 4. finalProps 合并顺序（renderer 期）

```javascript
const finalProps = Object.assign(
  {},
  // 1. 顶层 metadata（type / field / title / version / definitionId）
  {
    type: definition?.type || matchedEcho.type || 'echo',
    field: definition?.field || matchedEcho.id || '',
    title: definition?.title || matchedEcho.name || context.name || '回响',
    version: typeof definition?.version === 'number' ? definition.version : 1,
    definitionId: matchedEcho.id || ''
  },
  // 2. definition.props（卡片声明的默认值）
  defaultProps,
  // 3. mergedProps（实例运行时 props：@离析{density:'tight'}）
  mergedProps,
  // 4. 基础设施字段强制覆盖
  { value: resolvedValue, id: resolvedId }
)
```

后写的覆盖先写的。`definition.render(finalProps)` 拿到的就是这份对象。

## 5. 16 个内置 echo（按 category 拆 + 各自 handler body）

所有 16 个内置 echo 顶层 `type` 都是 `'echo-chant'`（都带 afterRender，会改附近元素）。分类在 `EchoCategoryEnum`：

| Enum 取值 | 用途 | 内置卡片 |
|---|---|---|
| `builtin` | 通用基础类 | nice、peek、ignore、ad、diff、ref、todo |
| `showy` | 表演 / 视觉 / 排版特效 | growth、shatter、skywalk、twinbloom、mindsteal、lucky、scapegoat、calamity、disperse |

完整列表（每张卡的 `id` / `name` / `main 功能` / `handler 关键操作`）：

| id（metaId） | 名称 | category | 改什么 |
|---|---|---|---|
| `nice` | nice | builtin | block 内前一个兄弟节点用 `<mark>` 包裹 |
| `peek` | peek | builtin | 切换附近元素的 visibility / 可视性提示 |
| `ignore` | ignore | builtin | 给附近元素加 ignore 标记，编辑器跳过 |
| `ad` | ad | builtin | 标记广告片段，渲染层剥离 |
| `diff` | diff | builtin | 高亮当前行与上一行的差异 |
| `ref` | ref | builtin | 把所在节点转成可被其它 echo 引用的 ref |
| `todo` | todo | builtin | 给所在行加 checkbox / 待办语义 |
| `growth` | 生生不息 | showy | 给附近元素加 `ag-rune-growth-target` class + `--ag-rune-growth-delay` 错峰延迟 |
| `shatter` | 破万法 | showy | 给附近 echo 节点加 `data-shatter-disabled`，使其失效 |
| `skywalk` | 天行健 | showy | 改 document 根容器的 `data-skywalk-theme` / `data-skywalk-layout` |
| `twinbloom` | 双生花 | showy | 克隆 prev/next block 插入副本（`data-twinbloom-of` 幂等） |
| `mindsteal` | 夺心魄 | showy | 篡改附近 rune 的 mode/animation（`mode=disable` 停掉动画） |
| `lucky` | 强运 | showy | 给节点加 `role=button` + click/keydown 事件触发 AI 校对 |
| `scapegoat` | 替罪 | showy | 监听 `error` / `ag:rune:error`，标 standby/injured |
| `calamity` | 招灾 | showy | 随机给附近文字片段染哥特彩 `ag-rune-calamity-gothic` |
| `disperse` | 离析 | showy | 改 block 的 `data-disperse-density`（tight / normal / loose） |

> 全部 handler body 都用 jQuery（由 `HANDLER_PRELUDE` 注入 `$`）。**禁止在 handler body 里偷加原生兜底**（`document.querySelector` / `.classList.add` / `.previousElementSibling` / `.style.x =`），这会让 Node 测试跑不通——`tests/unit/echo/jquery-afterrender.test.js` 是这条契约的护城河。

## 6. 14 个内置 rune 模板

`src/components/rune/runeTemplates/runeTemplates.js` 聚合 14 个 `create*Template()`，每个返回一段 Vue SFC 字符串：

| createXxxTemplate | 类型 | 主要内容 |
|---|---|---|
| `createBlankTemplate` | 通用 | 空骨架（Vue2 Options API 占位） |
| `createInheritDemoTemplate` | 通用 | 演示 `inheritFromPrevious`（从上一个 echo 取值） |
| `createInputTemplate` | 通用 | 基础 `<input>` + `$emit('input', value)` |
| `createHolyShieldTemplate` | 通用 | 通过 hel-micro 远程加载的"护盾"组件 |
| `createFireflyTemplate` | 通用 | canvas 萤火虫动画 |
| `createJsxGraphTemplate` | 通用 | JSXGraph 坐标板 |
| `createElInputTemplate` | Element-UI 包装 | `el-input` + value 回写 |
| `createElSelectTemplate` | Element-UI 包装 | `el-select` + options |
| `createElDatePickerTemplate` | Element-UI 包装 | `el-date-picker` |
| `createResumeBasicInfoTemplate` | 简历 | 基本信息块（姓名/电话/邮箱） |
| `createResumeTitleTemplate` | 简历 | 简历标题 |
| `createResumeExperienceTemplate` | 简历 | 工作经历 |
| `createResumeTextTemplate` | 简历 | 自由文本段 |
| `createResumeSkillTemplate` | 简历 | 技能条 |

每张模板的硬约定（`tests/unit/rune/templates.test.js` 已锁）：

1. **必须声明 `props.value`**（`mountRuneVueHosts` 把 `value` 写到 host.dataset，再以 prop 形式传给 SFC）
2. **非纯展示型 rune 必须 `$emit('input', value)` 回写通道**——`RunePreviewRenderer` 转发到 `updateRunePlaceholderValue({runeId, nodeId, value})`，回写 Markdown 源
3. **`.vue` 文件源里写 `</script>` 必须转义为 `<\/script>`**——否则外层把模板字符串当 HTML 解析时会被截断

## 7. 两条管线对比（维度表）

| 维度 | rune（符文） | echo（回响） |
|---|---|---|
| **用户写法** | quickInsert 插入 `<div data-rune-name="...">` 占位 | `@echoName{props}(prompt)` 行内 |
| **解析层** | Muya 把 `<div data-rune-*>` 当 inline block 节点 | Muya 自定义 `echo_anno` token（`coolma-muya/lib/parser/rules.js:40`） |
| **核心技术** | `vue-template-compiler.parseComponent()` + `compileToFunctions()` + `Vue.extend()` | `safeEvalAnnoSource(source, HANDLER_PRELUDE)` 编译 anno_source |
| **渲染产物** | `RunePreviewRenderer`（外层 Vue.extend）→ 内层 SFC 的 `vm.$el` 插入 host | `definition.render(props)` 直接输出 HTML 字符串，赋给 `host.innerHTML` |
| **副作用机制** | Vue 生命周期（mounted / beforeDestroy）+ SFC 内 `$emit('input')` | `definition.afterRender(node, props)` 返回 cleanup；cleanup 在下次渲染时由 `disposeAll` 统一执行 |
| **作用域隔离** | 每个 rune 用独立 `data-rune-scope-${runeId}` 注入到顶层标签 | jQuery 全局选择器（handler body 自己确定 scope） |
| **数据回写** | `updateRunePlaceholderValue({runeId, nodeId, value})` 改 Markdown 源的 `data-rune-value` + innerText | 直接编辑 Markdown 源的 `@xxx{props}(prompt)` |
| **典型功能** | 表单输入、图表、复杂交互（el-input / jsxgraph / 萤火虫动画） | 改附近元素：动画、布局、克隆、事件响应 |
| **典型示例** | 用户通过 `runeFormDialog` 自定义 | 16 个内置 `type: echo-chant`、用户通过 `echoFormDialog` 自定义 |

## 8. Muya 集成路径（v2026-07-28 后的最终形态）

### 8.1 Echo 渲染管线（`coolma-muya/lib/parser/render/index.js`）

```
tokenizer 解析 @xxx{...}(prompt)
       ↓
renderInlines/echoAnno.js 生成 host:
  <span class="ag-echo-anno-token"
        data-echo-name="..."
        data-echo-id="..."
        data-echo-definition-id="..."
        data-echo-value="..."
        data-echo-props-json='{...}'
        data-echo-inline="true">
       ↓ (snabbdom patch)
真实 DOM host
       ↓
StateRender.renderRunes() 调用链：
  1. renderRunePlaceholderNodes()        ← jQuery 模式，渲染 rune 占位卡片
  2. renderEchoPlaceholders()            ← jQuery 模式，渲染 echo：
     - hasEcho && echoRuntime → host.innerHTML = echoRuntime.renderToHtml(token, echo)
     - 否则 → createEchoPlaceholderMarkup 静态 fallback
     - 同时 host.dataset.echoRenderKey = cacheKey（重复渲染跳过）
     - 注入 host.setAttribute('data-echo-host', 'true')（给 afterRender 找 host）
  3. cleanupDetachedRunePlaceholders()
  4. cleanupDetachedEchoPlaceholders()
  5. enableRuneVueRenderer === true
       ? renderRunesWithVue() → mountRuneVueHosts() + mountEchoVueHosts() + 双 cleanup
       : cleanupDetachedRuneVms(true) + cleanupDetachedEchoVms(true)
  6. echoRuntime.afterRender(root, { cleanupFirst: true })   ← ★ handler 派发
```

`renderToHtml` 内部（`src/components/echo/echoRuntime.js`）：

```javascript
renderToHtml (token = {}, echo = null) {
  const rendered = this.render(token, echo)
  const renderedHtml = String(rendered.html || '').trim()

  if (renderedHtml) {
    // 完全按 definition.render() 的返回值渲染 —— 不包 span、不注入 attrs、不补 class
    return renderedHtml
  }

  // 静态 fallback（render 没返回 html 时才走）
  const icon = escapeHtml(rendered.icon || DEFAULT_ECHO_ICON)
  const color = escapeHtml(rendered.color || DEFAULT_ECHO_COLOR)
  // ...返回 ag-echo-inline 包裹的 HTML
  return `<span class="ag-echo-inline ag-echo-anno-token" ...>`
}
```

### 8.2 Rune 渲染管线

```
quickInsert 插入 <div data-rune-name="..."
                       data-rune-id="instance-uuid"
                       data-rune-node-id="rune-node-uuid"
                       data-rune-value="...">
       ↓ (Muya 把 div 当 inline block 节点)
真实 DOM host
       ↓
StateRender.renderRunePlaceholderNodes()：
  - host.innerHTML = createRunePlaceholderMarkup(rune, dataset)
  - host.dataset.runeRenderKey = cacheKey（幂等）
       ↓
enableRuneVueRenderer === true（默认 true）→ mountRuneVueHosts()：
  - host = [data-rune-name][data-rune-id][data-rune-node-id]
  - 找 rune 定义（runeMap.get(runeName)）
  - createRuneRendererCtor(rune) →
      normalizeRuneSfc → evalRuneScript → compileTemplateToFunctions → ensureRuneStyle → Vue.extend
  - new RunePreviewRenderer({ propsData: { runeId, nodeId, rune, value } }).$mount()
  - runeVmMap.set(nodeId, vm)
  - 后续 $emit('input') → RunePreviewRenderer.onValueChange → updateRunePlaceholderValue
```

## 9. 关键常量与 API

```javascript
// src/components/echo/echoBuiltinsShared.js
const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_ECHO_ICON = 'graphic_eq'
const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)/g

// src/components/echo/echoBuiltins/echoBuiltins.js 入口
BUILTIN_ECHO_CARDS         // 16 张冻结卡片数组
BUILTIN_ECHO_CHANT_IDS     // 16 个 metaId 数组
isBuiltinEchoChantId(id)   // 判断是否是内置

// src/components/echo/echoCore.js barrel
parseEchoProps             // parseEchoProps(propsRaw) → object
encodeEchoPayload          // encodeEchoPayload(payload) → string
decodeEchoPayload          // decodeEchoPayload(raw) → payload
createEchoPlaceholderPayload // 生成 echo 占位 payload
ECHO_PLACEHOLDER_RE
isInheritFromPreviousEnabled
echoInheritFromPrevious
extractPrevEchoTokenValue
createDefaultEchoAnnoSource // 生成最朴素 echo 的 anno_source 模板
safeEvalAnnoSource          // compile anno_source
HANDLER_PRELUDE             // 'const $ = ...'
BUILTIN_ECHO_PROPS_SCHEMA   // 表单 schema
resolvePropsSchema
buildFormCreateRule
EchoRuntime                 // class
EchoRegistry                // class

// coolma-muya/lib/parser/render/index.js
RUNE_PLACEHOLDER_SELECTOR = '[data-rune-name][data-rune-id][data-rune-node-id]'
ECHO_PLACEHOLDER_SELECTOR = '[data-echo-node-id]'
RUNE_HOST_CLASS = 'ag-rune-placeholder-host'
RUNE_CARD_CLASS = 'ag-rune-placeholder-card'
ECHO_HOST_CLASS = 'ag-echo-placeholder-host'
ECHO_CARD_CLASS = 'ag-echo-placeholder-card'

// muya options
enableRuneVueRenderer: true   // 默认
enableEchoVueRenderer: false  // 默认；打开后会用 Vue.extend 包裹 echo host（一般不开）
echoRuntime: EchoRuntime      // 必传，handler 派发入口
```

## 10. 数据回写对比

| | rune | echo |
|---|---|---|
| **回写入口** | `updateRunePlaceholderValue({runeId, nodeId, value})` | 直接编辑 Markdown 源 |
| **修改位置** | host 的 `data-rune-value` attr + innerText | `@xxx{props}(prompt)` 整段 |
| **触发条件** | SFC 内 `$emit('input', value)` | 用户在编辑器里改 |
| **存储同步** | `contentEditor.setMarkdown(...)` → Muya 全量重渲 | 同上，但 echo 是静态卡片，重渲不丢 |

## 11. 表单对话框对比

| | `runeFormDialog.vue` | `echoFormDialog.vue` |
|---|---|---|
| **编辑字段** | `template`（Vue SFC 字符串） | `anno_source`（JS 对象字面量字符串） |
| **Monaco language** | `html` | `javascript` |
| **模板辅助** | 14 个 `create*Template()`（来自 `runeTemplates.js`） | `createDefaultEchoAnnoSource()` + 16 个 builtin 模板的 anno_source |
| **特有功能** | 分类选择 + 远端导入（`runeRemoteImportDialog.vue`） | 注解语法帮助提示 + propsSchema 表单 |

## 12. 决策树（用 rune 还是 echo）

```
想让卡片影响其他元素吗？
├── 是 → 用 echo
│         ├── 选 builtin echo / 创建新 echo
│         └── 在 anno_source 的 afterRender(node, props) 里改附近 DOM
└── 否 → 用 rune
          ├── Vue SFC 卡片，自身完整
          └── 通过 $emit('input') 回写到自己的占位符
```

**常见误判**：

- 想做"影响附近元素"却用 rune → 错。rune 不动兄弟节点。
- 想做"自包含 Vue 卡片"却用 echo → 错。echo 只能 `render(props)` 输出字符串 + `afterRender(node, props)` 改外部，不能挂载 Vue SFC。

## 13. 相关文件索引

### Rune 路径（Vue SFC）—— 真正的 rune 在这里

| 文件 | 职责 |
|---|---|
| `src/components/muya/Muya.vue` | `createRuneRendererCtor` / `RunePreviewRenderer` / `updateRunePlaceholderValue` |
| `coolma-muya/lib/parser/render/index.js` | `renderRunePlaceholderNodes` / `mountRuneVueHosts` / `cleanupDetachedRuneVms` / `createRunePlaceholderMarkup` |
| `src/components/rune/runeTemplates/runeTemplates.js` | 14 个 `create*Template()` 入口 |
| `src/components/rune/runeTemplates/runeTemplates*.js` | 14 个内置 rune SFC 模板（一文件一个） |
| `src/components/rune/runeFormDialog.vue` | rune 创建 / 编辑表单 |
| `src/components/rune/runeFormEditor.vue` | rune 编辑器主体（Monaco + 模板辅助） |
| `src/components/rune/runeFormFields.vue` | rune 表单字段 |
| `src/components/rune/runeCard.vue` | rune 卡片 UI |
| `src/components/rune/runeRemoteImportDialog.vue` | 远端导入弹框 |
| `src/boot/rune-deps.js` | jQuery 全局挂载（rune SFC 内部用） |

### Echo 路径（`@xxx{}()`）

| 文件 | 职责 |
|---|---|
| `coolma-muya/lib/parser/rules.js` | `echo_anno` 规则：`/^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)$/` |
| `coolma-muya/lib/parser/render/renderInlines/echoAnno.js` | Muya 行内渲染器（生成 host + dataset） |
| `coolma-muya/lib/parser/render/index.js` | `renderEchoPlaceholders` / `mountEchoVueHosts` / `cleanupDetachedEchoVms` / `createEchoPlaceholderMarkup` |
| `src/components/echo/echoRegistry.js` | echo 名片仓库（id / name 索引 + 渲染派发） |
| `src/components/echo/echoRuntime.js` | `EchoRuntime` 类（compile + render + renderToHtml + afterRender） |
| `src/components/echo/echoAnnoSource.js` | `HANDLER_PRELUDE` / `safeEvalAnnoSource` / `createDefaultEchoAnnoSource` |
| `src/components/echo/echoBuiltinsShared.js` | 共享常量 + `handlerDoc` / `banner` 工具 |
| `src/components/echo/echoBuiltins/echoBuiltins.js` | 16 张内置 echo 聚合入口 |
| `src/components/echo/echoBuiltins/echoBuiltinsBase.js` | `baseRender` / `baseAfterRender` / `createAnnoSource` / `buildEchoCard` 工厂 |
| `src/components/echo/echoBuiltins/echoBuiltins*.js` | 16 张卡片（一文件一张）：`META + export default buildEchoCard(META)` |
| `src/components/echo/echoPropsParser.js` | `parseEchoProps` |
| `src/components/echo/echoPayloadCodec.js` | `encodeEchoPayload` / `decodeEchoPayload` / `createEchoPlaceholderPayload` / `ECHO_PLACEHOLDER_RE` |
| `src/components/echo/echoInherit.js` | inheritFromPrevious helper |
| `src/components/echo/echoPropsSchema.js` | `BUILTIN_ECHO_PROPS_SCHEMA` / `resolvePropsSchema` / `buildFormCreateRule` |
| `src/components/echo/echoCore.js` | echo 系统 barrel（统一导出） |
| `src/components/echo/echoFormDialog.vue` | echo 创建 / 编辑表单 |
| `src/components/echo/echoFormEditor.vue` | echo 编辑器主体 |
| `src/components/echo/echoFormFields.vue` | echo 表单字段 |
| `src/components/echo/echoInstanceDialog.vue` | echo 实例化弹框 |
| `src/utils/enum/runeEchoCategoriesEnum.js` | `RuneCategoryEnum` / `EchoCategoryEnum`（enum-plus） |

## 14. 易混淆点（再次强调）

1. **`type: 'echo-chant'` 不是 rune 类型**——它是 echo 体系内的子分类（"咏唱派发 / 需要 afterRender 改附近元素"）。所有 16 张内置 echo 卡的 `type` 都是 `echo-chant`。
2. **真正的 rune 只有用户自定义的**——通过 `runeFormDialog` 创建，存 `template`（Vue SFC 字符串）。内置的 14 个 `create*Template` 也是 rune。
3. **afterRender 是 echo 改附近元素的唯一入口**——Vue SFC 的 rune 走 Vue 生命周期（mounted / beforeDestroy），不走 afterRender。
4. **`data-echo-host="true"` 标记 echo 渲染入口**——`renderEchoPlaceholders` 把 `host.innerHTML = echoRuntime.renderToHtml(token, echo)` 之后在 host 上打这个属性，让 `afterRender` 能扫到 host（用 `[data-echo-host="true"]` 选择器）。
5. **`data-echo-chant-id` 是 echo 的逻辑 id 锚点**——写在 echo `render()` 输出里；其他 echo（mindsteal、shatter）的 afterRender 用它来锁定目标。
6. **`ag-rune-*` CSS class 名不重构**——CSS 锚点刻意保留，避免视觉回归。class 名是 rune 字样，运行时是 echo-chant 体系，**视觉与逻辑实体不绑定**，理解清楚即可。

## 15. 性能优化

1. **definitionCache**：`EchoRuntime` 缓存编译过的 anno_source（按 echoId）
2. **runePlaceholderCache / echoPlaceholderCache**：`StateRender` 缓存 render key（renderToHtml 重复渲染跳过）
3. **scopeId 隔离**：每个 rune 用独立 `data-rune-scope-${runeId}` 避免 CSS 污染
4. **cleanupFirst**：`renderRunes` → `echoRuntime.afterRender(root, { cleanupFirst: true })` 时先清旧 cleanup 再派发新 handler，避免属性累积
5. **tokenCache**：Muya 的 tokenizer 缓存（无高亮时复用）

## 16. 已知边界情况

1. **twinbloom 幂等**：克隆块用 `data-twinbloom-of` 标记，若已存在则跳过
2. **disperse 累积**：`data-disperse-density` 属性可能覆盖而非累积
3. **mindsteal 冲突**：多个 mindsteal 节点对同一目标操作时，后者覆盖前者
4. **scapegoat 错误捕获**：依赖 `window.error` 和 `ag:rune:error` 自定义事件
5. **echo NPE 兜底**：handler body 在 Node 端 `$` 为 null，但 `EchoRuntime._doAfterRender` 已 try-catch

## 17. 测试护城河

详见 `.agents/rules/rune-echo-test-moat.mdc`。**改动 rune / echo 代码前必须跑：**

```bash
yarn verify:echo   # 6 个 echo suite
yarn verify:rune   # 1 个 rune suite
yarn verify        # 全量（含 boot / smoke）
```

任何 FAIL 都按 §4.3 处理（代码 bug 修代码，测试过期改测试，**不允许删测试用例放行**）。
