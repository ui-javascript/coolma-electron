# Muya 编辑器详细设计参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充。

## 完整目录结构

```
muya/
├── lib/
│   ├── index.js                    # 主入口，Muya 类
│   ├── config.js                   # 配置常量
│   ├── contentState/
│   │   ├── index.js               # 状态管理核心（render/renderRange/history）
│   │   ├── history.js             # 撤销/重做
│   │   ├── inputCtrl.js           # 输入处理
│   │   ├── enterCtrl.js           # 回车处理
│   │   ├── backspaceCtrl.js       # 退格处理
│   │   ├── updateCtrl.js          # 内容更新触发 rerender
│   │   ├── arrowCtrl.js           # 方向键移动
│   │   ├── pasteCtrl.js           # 粘贴处理
│   │   ├── copyCutCtrl.js         # 复制/剪切
│   │   ├── tableBlockCtrl.js      # 表格编辑
│   │   ├── formatCtrl.js          # 格式化
│   │   ├── searchCtrl.js          # 搜索与替换
│   │   └── ...
│   ├── parser/
│   │   ├── index.js               # 行内 tokenizer
│   │   ├── rules.js              # 行内规则定义
│   │   ├── marked/               # 基于 marked 的块级解析
│   │   │   ├── blockRules.js     # 块级规则
│   │   │   ├── lexer.js          # 块级 Lexer
│   │   │   ├── renderer.js       # HTML 渲染器
│   │   │   └── ...
│   │   └── render/               # 虚拟 DOM 渲染器
│   │       ├── index.js           # StateRender（中枢）
│   │       ├── snabbdom.js        # snabbdom 封装
│   │       ├── renderBlock/       # 块级渲染
│   │       │   ├── index.js      # renderBlock 分发
│   │       │   ├── renderLeafBlock.js    # 叶子块
│   │       │   ├── renderContainerBlock.js # 容器块
│   │       │   └── ...
│   │       └── renderInlines/     # 行内渲染（30+ 个文件）
│   │           ├── index.js
│   │           ├── text.js
│   │           ├── echoAnno.js    # Echo 占位符（Memocast）
│   │           └── ...
│   ├── eventHandler/
│   │   ├── event.js              # EventCenter
│   │   ├── keyboard.js            # 键盘事件
│   │   ├── mouseEvent.js          # 鼠标事件
│   │   ├── clipboard.js           # 剪贴板
│   │   └── dragDrop.js            # 拖拽
│   ├── selection/                 # 选择管理（cursor/dom）
│   ├── ui/                        # UI 组件浮层
│   └── utils/
│       ├── importMarkdown.js      # Markdown → Block 树
│       └── exportMarkdown.js      # Block 树 → Markdown
```

## 渲染管线详解（完整流程）

Muya 的渲染管线分为**五个阶段**：

### 阶段 1：Block 树构建（importMarkdown）

```
Markdown Text
    ↓
importMarkdown()  (utils/importMarkdown.js)
    ↓  TurndownService 将 HTML 转回 Markdown 片段
    ↓  识别 CURSOR_ANCHOR_DNA / CURSOR_FOCUS_DNA 标记
Block 树
```

关键文件：`utils/importMarkdown.js`（578+ 行），其中 `turnSoftBreakToSpan()` 函数将换行符转回 `<span class="ag-soft-line-break">`。

### 阶段 2：块级 Token 化（Lexer）

```
Block 树
    ↓
Lexer.lex(src)  (parser/marked/lexer.js)
    ↓  按 blockRules 逐行识别
    ↓  处理 frontmatter / footnote 等特殊块
Token 数组
```

### 阶段 3：行内 Token 化（tokenizer）

```
Block.text
    ↓
tokenizer(text, { highlights, hasBeginRules, labels, options })
    ↓  tokenizerFac() 逐字符扫描
    ↓  优先级：beginRules > inline_code > del > emoji > math > image > link > html > break
    ↓  支持嵌套：strong 内部可递归调用 tokenizerFac
Token[]
```

**beginRules**（仅在行首检查一次）：
- `header`：ATX 标题（`# `）
- `hr`：分割线（`***`）
- `code_fense`：代码围栏（` ``` `）
- `multiple_math`：数学公式（`$$`）
- `reference_definition`：引用定义（`[...]: url`）

**echo_anno** 是 Memocast 扩展的语法：`@name{value}(id)`，在行内规则中被解析。

### 阶段 4：虚拟 DOM 构建（renderBlock → renderLeafBlock / renderContainerBlock）

```
Block 树
    ↓
renderBlock()  根据 block.children 是否有内容
    ↓
├─ renderContainerBlock()  有 children → 容器块
│     children.map(renderBlock)  递归
│
└─ renderLeafBlock()  无 children → 叶子块
      tokenizer()  行内 token 化
      ↓
      tokens.reduce((acc, token) =>
        [...acc, ...this[snakeToCamel(token.type)](h, cursor, block, token)]
      )
      ↓
      h(selector, data, vnodeChildren)  生成 vnode
```

**tokenCache 优化**：`renderLeafBlock` 中，当 `highlights.length === 0` 且 `DEVICE_MEMORY >= 4` 时，tokenizer 结果会被缓存到 `tokenCache`，下次相同文本直接命中缓存。

### 阶段 5：snabbdom Patch

```
render() / partialRender() / singleRender()
    ↓
h(tag, children)  创建新 vnode
    ↓
toVNode(dom)     读取当前真实 DOM 为旧 vnode
    ↓
patch(oldVdom, newVdom)  snabbdom diff + patch
    ↓
renderMermaid()  异步渲染 Mermaid（mermaidCache）
    ↓
renderDiagram()  异步渲染 Flowchart/Sequence/Vega（diagramCache）
    ↓
renderRunes()   Rune/Echo 占位符渲染
```

## 三种渲染模式的抉择

| 场景 | 方法 | 说明 |
|------|------|------|
| 首次加载 | `render()` | 全量 snabbdom patch |
| 大量内容变更 | `render()` | 全量 snabbdom patch |
| 光标区域内输入 | `partialRender()` | 直接操作 DOM（`insertAdjacentHTML`），不经过 snabbdom |
| 单个 block 变更 | `singleRender()` | snabbdom patch 单节点 |

**为什么 `partialRender` 不用 snabbdom？** 因为 snabbdom 需要完整的 vnode 树，而 `partialRender` 的场景是：光标所在的区块范围内有多行 block 需要更新，范围外不需要变化。用 `insertAdjacentHTML` + `removeChild` 可以精确替换而不影响外部 DOM 节点（光标位置等）。

## 行内渲染函数表

每个行内 Token 类型通过 `snakeToCamel(token.type)` 映射到渲染函数名：

| Token type | 渲染函数 | 输出 |
|-----------|---------|------|
| `text` | `text.js` | `<span class="ag-plain-text">` + highlight 处理 |
| `strong` | `strong.js` | `<strong>` + 递归 children |
| `em` | `em.js` | `<em>` + 递归 children |
| `del` | `del.js` | `<del>` + 递归 children |
| `inline_code` | `inlineCode.js` | `<code class="ag-inline-code">` |
| `inline_math` | `inlineMath.js` | KaTeX 渲染的 `<span>` |
| `image` | `image.js` | `<span class="ag-image-marked-text">` + `<span class="ag-image-container">` |
| `link` | `link.js` | `<a class="ag-link">` + 递归 children |
| `emoji` | `emoji.js` | `<span class="ag-emoji">` |
| `hard_line_break` | `hardLineBreak.js` | `<br>` 或 `<span class="ag-hard-line-break-space">` + `<br>` |
| `soft_line_break` | `softLineBreak.js` | `<span class="ag-soft-line-break">` |
| `html_tag` | `htmlTag.js` | 原始 HTML（`contenteditable="false"`） |
| `html_escape` | `htmlEscape.js` | HTML 实体字符 |
| `reference_link` | `referenceLink.js` | `<span class="ag-reference-link">` |
| `reference_image` | `referenceImage.js` | 同 image，但使用 labels 映射 |
| `reference_definition` | `referenceDefinition.js` | 隐藏（不渲染到可见内容） |
| `echo_anno` | `echoAnno.js` | `<span data-echo-node-id>` 占位符（Memocast） |
| `auto_link` | `autoLink.js` | `<a class="ag-auto-link">` |
| `auto_link_extension` | `autoLinkExtension.js` | 同上，扩展 URL |
| `code_fense` | `codeFense.js` | `<span class="ag-code-highlight">` |
| `multiple_math` | `multipleMath.js` | KaTeX 渲染的 `<span class="ag-multiple-math">` |
| `super_sub_script` | `superSubScript.js` | `<sup>` / `<sub>` |
| `footnote_identifier` | `footnoteIdentifier.js` | `<sup class="ag-footnote-identifier">` |
| `hr` | `hr.js` | `<hr class="ag-hr">` |
| `header` | `header.js` | `<span class="ag-header-tail">`（标题尾部空格+`#`） |
| `tail_header` | `tailHeader.js` | 同上 |
| `backlash` | `backlash.js` | 转义字符渲染 |
| `backlash_in_token` | `backlashInToken.js` | Token 内转义符 |
| `html_ruby` | `htmlRuby.js` | `<ruby>` + `<rt>` 注音 |

## Echo 占位符渲染管线（Memocast 扩展）

```
Block.text 中有 @name{value}(id) 语法
    ↓
tokenizer() → echo_anno token
    ↓
echoAnno() → <span data-echo-node-id="..."> 占位符 DOM
    ↓
StateRender.renderEchoPlaceholderNodes()  post-render 阶段
    ↓
document.querySelectorAll('[data-echo-node-id]')
    ↓
echoRegistry.getAll() / echoCards 查找定义
    ↓
createEchoPlaceholderMarkup(echo, dataset) → 回响卡片 HTML
    ↓
this.echoPlaceholderCache.set(host, cacheKey)  缓存比较
```

**Echo 卡片结构**：
```
<span class="ag-echo-placeholder-host">
  <span class="ag-echo-placeholder-card" data-echo-mounted="true">
    <span class="ag-echo-placeholder-body">
      <span class="material-icons">graphic_eq</span>
      <span class="ag-echo-placeholder-copy">
        <span>回响名称</span>
        <span>值/描述</span>
      </span>
    </span>
  </span>
</span>
```

**Vue 渲染模式**（`enableRuneVueRenderer = true`）：
- `EchoRenderer` Vue 构造函数通过 `new EchoRenderer({ propsData })` 创建实例
- `vm.$mount()` 后 `host.appendChild(vm.$el)`
- `echoVmMap` 维护 nodeId → Vue instance 映射，支持复用

## Rune 占位符渲染管线（Memocast 扩展）

与 Echo 类似，但使用 Vue 组件渲染：

```
Rune card: { name, id, template, value, ... }
    ↓
tokenizer() → ??? (Rune 目前由 Markdown 语法生成占位符)
    ↓
<span data-rune-name data-rune-id data-rune-node-id>
    ↓
StateRender.mountRuneVueHosts()  post-render 阶段
    ↓
runeCards 查找定义 → runeRendererCtor 构造 Vue 实例
    ↓
new RuneRenderer({ runeId, nodeId, rune, value })
    ↓
vm.$mount() → host.appendChild(vm.$el)
    ↓
this.runeVmMap.set(nodeId, vm)
```

## 搜索高亮机制

搜索高亮在两个层面生效：

**Block 级别**：在 `renderLeafBlock` 中通过 `matches.filter(m => m.key === block.key)` 收集属于当前 block 的所有高亮范围。

**Token 级别**：在 `text.js` 中调用 `highlight()`：

```javascript
// highlight.js 核心
for (const light of highlights) {
  const un = union(tokenRange, light)  // 求交集
  if (un) {
    result.push(h(`span.${active ? 'ag-highlight' : 'ag-selection'}`, text))
  }
}
```

搜索替换后调用 `editor.replace()` → `contentState.replace()` → `render(false)` 全量重新渲染，因为替换可能影响多个 block。

## 状态机流程

```
用户输入/点击/粘贴/拖拽
  → Keyboard / Mouse / Clipboard / DragDrop 事件层
  → ContentState 对 Block 树和 Cursor 做变更
  → EventCenter.dispatch('stateChange')
  → Muya.dispatchChange()
  → EventCenter.dispatch('change')
  → `src/components/muya/Muya.vue` 监听 change / selectionChange / contextmenu
  → 更新目录、字数、保存状态与右键菜单
```

注意区分：
- `stateChange` 是内部事件，驱动 `dispatchChange()`
- `change` 是公开事件，主应用通过 `editor.on('change', ...)` 监听
- Memocast 的 Vue 封装层还监听 `selectionFormats` 和 `crashed`

## 容器块 vs 叶子块判断

```javascript
// renderBlock/index.js
const method = Array.isArray(block.children) && block.children.length > 0
  ? 'renderContainerBlock'
  : 'renderLeafBlock'
```

**常见容器块**：`p`, `h1-h6`, `blockquote`, `ul`, `ol`, `li`, `pre`, `figure`, `table`, `div`, `thead`, `tbody`, `th`, `td`

**常见叶子块**：`span`, `hr`, `input`

注意：`pre` 块是容器块（包含 `codeContent` 类型的 `span` 子块），`p` 块是容器块（包含 `paragraphContent` 类型的 `span` 子块）。

## functionType 完整速查

`functionType` 是 Block 的细分功能类型，决定渲染行为：

| functionType | 父 type | 说明 |
|-------------|---------|------|
| `paragraphContent` | span | 段落文本 |
| `atxLine` | span | ATX 标题行 |
| `codeContent` | span | 代码块内容，Prism 高亮 |
| `languageInput` | span | 代码块语言选择输入框 |
| `cellContent` | span | 表格单元格内容 |
| `html` | div | HTML 块预览 |
| `multiplemath` | div | 块级数学公式（KaTeX） |
| `mermaid` | div | Mermaid 图表 |
| `flowchart` | div | 流程图 |
| `sequence` | div | 时序图 |
| `vega-lite` | div | Vega-Lite 图表 |

## ContentState 控制器详解

| 控制器 | 职责 | 关键文件 |
|--------|------|---------|
| `coreApi` | Block 增删改查 | `core.js` |
| `tabCtrl` | Tab 缩进 | `tabCtrl.js` |
| `enterCtrl` | 回车拆分/续接列表 | `enterCtrl.js` |
| `updateCtrl` | 内容更新触发 rerender | `updateCtrl.js` |
| `backspaceCtrl` | 退格合并/空块清理 | `backspaceCtrl.js` |
| `deleteCtrl` | Delete 前向删除 | `deleteCtrl.js` |
| `codeBlockCtrl` | 代码块编辑 | `codeBlockCtrl.js` |
| `arrowCtrl` | 方向键跨 block 移动 | `arrowCtrl.js` |
| `pasteCtrl` | 粘贴处理 | `pasteCtrl.js` |
| `copyCutCtrl` | 复制/剪切 | `copyCutCtrl.js` |
| `tableBlockCtrl` | 表格 CRUD | `tableBlockCtrl.js` |
| `tableDragBarCtrl` | 表格拖拽调整列宽 | `tableDragBarCtrl.js` |
| `tableSelectCellsCtrl` | 表格单元格选择 | `tableSelectCellsCtrl.js` |
| `paragraphCtrl` | 段落级操作 | `paragraphCtrl.js` |
| `formatCtrl` | 格式化（bold/italic/code/link 等） | `formatCtrl.js` |
| `searchCtrl` | 搜索高亮/替换 | `searchCtrl.js` |
| `containerCtrl` | 容器块处理 | `containerCtrl.js` |
| `htmlBlockCtrl` | HTML 块处理 | `htmlBlock.js` |
| `clickCtrl` | 点击行为（选中 block 等） | `clickCtrl.js` |
| `inputCtrl` | 输入事件捕获 | `inputCtrl.js` |
| `tocCtrl` | 目录提取 | `tocCtrl.js` |
| `emojiCtrl` | Emoji 选择 | `emojiCtrl.js` |
| `imageCtrl` | 图片上传/选择 | `imageCtrl.js` |
| `linkCtrl` | 链接插入 | `linkCtrl.js` |
| `dragDropCtrl` | 块拖拽 | `dragDropCtrl.js` |
| `footnoteCtrl` | 脚注处理 | `footnoteCtrl.js` |
| `importMarkdown` | Markdown → Block 树导入 | `importMarkdown.js` |

## 光标状态 (Cursor)

```javascript
class Cursor {
  key: string          // 所在 block 的 key
  offset: number        // block 内的字符偏移
  left: boolean         // 是否在 block 左侧（用于跨 block 光标判断）
}
```

实际存储为 `{ start: { key, offset }, end: { key, offset } }` 形式的选区对象。

## CLASS_OR_ID 常量

通过 `genUpper2LowerKeyHash()` 生成，每个 `AG_XXX` 映射到 `ag_xxx`：

| 常量 | 对应 class | 用途 |
|------|-----------|------|
| `AG_PARAGRAPH` | `.ag-paragraph` | 所有 block 的基础 class |
| `AG_ACTIVE` | `.ag-active` | 光标所在的 block |
| `AG_SELECTED` | `.ag-selected` | 选中的 block |
| `AG_HIGHLIGHT` | `.ag-highlight` | 搜索命中高亮 |
| `AG_SELECTION` | `.ag-selection` | 非当前搜索匹配 |
| `AG_GRAY` / `AG_HIDE` | `.ag-gray` / `.ag-hide` | 冲突区域隐藏 |
| `AG_LINE_END` | `.ag-line-end` | 行尾标记 |
| `AG_INLINE_RULE` | `.ag-inline-rule` | 行内元素的共同 class |
| `AG_EDITOR_ID` | `#ag-editor-id` | 编辑器根 DOM ID |
| `AG_FOCUS_MODE` | `.ag-focus-mode` | 专注模式 class |

## 搜索和替换

```javascript
// 搜索
editor.search(value, {
  isRegex: false,
  isCaseSensitive: false,
  matchWholeWord: false,
  searchMax: -1
})

// 替换
editor.replace(replacement, {
  isRegex: false,
  isCaseSensitive: false,
  matchWholeWord: false
})

// 定位下一个/上一个
editor.find('next')  // 或 'prev'
```

`searchMatches` 存储在 `contentState.searchMatches`：
```javascript
{
  value: '搜索词',
  matches: [{ key, start, end, active }],
  index: -1  // 当前高亮的索引
}
```

## 导出功能

### 导出为 HTML

```javascript
// 纯 HTML
const html = await editor.exportHtml()

// 带样式 HTML
const styledHtml = await editor.exportStyledHTML({
  theme: 'Default-Light',
  themeStyle: { fontSize: '16px', lineHeight: '1.6' },
  customHtml: '<div class="export-wrapper">{content}</div>'
})
```

### 复制为 Markdown/HTML

```javascript
editor.copyAsMarkdown()
editor.copyAsHtml()
editor.pasteAsPlainText()
```

## 调试技巧

### 查看 Block 树

```javascript
const state = editor.contentState
console.log('Blocks:', state.blocks)
console.log('History:', state.history)
```

### 查看当前光标

```javascript
const cursor = editor.contentState.cursor
console.log('Cursor:', cursor)
```

### 查看 Token 解析结果

```javascript
import { tokenizer } from 'libs-muya-vue2/lib/parser'
const tokens = tokenizer('# Hello **world**', {
  highlights: [],
  hasBeginRules: true,
  labels: new Map(),
  options: {}
})
console.log('Tokens:', tokens)
```

### 强制全量渲染

```javascript
editor.contentState.render(true, true)  // clearCache=true
```

### 查看 renderRange

```javascript
console.log('renderRange:', editor.contentState.renderRange)
```
