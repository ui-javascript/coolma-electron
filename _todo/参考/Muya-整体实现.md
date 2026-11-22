# coolma-muya 整体源码实现（深度版）

> 范围：`_plugins/coolma-muya/lib/` 9 大子系统（~ 150 个 JS 文件）+ 主项目 `src/components/muya/` 业务适配。
>
> 视角：超越「是什么」层面，回答「为什么这样写」「每个决定牺牲了什么」「哪些地方可以继续演进」。
>
> 文档自成体系，可作为新同学 / AI agent 接手 coolma-muya 的"地图"。所有路径用 `E:/work-coolma/coolma/_plugins/coolma-muya/lib/...` 简写为 `_plugins/coolma-muya/lib/...` 相对路径标注，对应绝对路径见末尾附录。

---

## 0. 一句话总览

> **coolma-muya 是一台"以 Markdown 为真源、以 Block Tree 为内存模型、以 tokenizer 为格式层、以 Snabbdom + jQuery 为渲染+副作用层、以 EventCenter + 插件为扩展边界、以 Vue SFC + jQuery handler 为业务注入点"的所见即所得 Markdown 编辑器内核**。
>
> 它对外通过 `coolma-muya/lib` 暴露一个 `Muya` 类（`new Muya(container, options)`），其余业务（Echo / Rune / 云函数 / 笔记存储 / Monaco 切换）100% 由主项目 `src/components/muya/` 这一"宿主适配层"承担——SDK 边界感很强。
>
> 文件目录本身就是顶层设计图：

```
_plugins/coolma-muya/lib/
├── index.js              ← 主入口（Muya 类 + 插件注册 + mutationObserver）
├── config/               ← CSS class 表、HTML 标签表、默认 options、turndown 配置
├── contentState/         ← 内存模型 + 27 个控制器（inputCtrl/backspaceCtrl/…）
│   ├── index.js          ← ContentState 类（481 行）+ cursor/history 双向链表
│   ├── core.js           ← 与 tree 无关的"对外 API"工具函数
│   ├── history.js        ← 撤销栈：blocks/renderRange/cursor 三件套
│   └── *Ctrl.js          ← 27 个 ctrl（按事件类目分文件）
├── parser/               ← Markdown ↔ Token 编译器
│   ├── index.js          ← tokenizerFac 主函数（579 行） + generator + setEchoAnnoRule
│   ├── rules.js          ← 14 条 inlineRules + beginRules + createEchoAnnoRule
│   ├── utils.js          ← getAttributes / parseSrcAndTitle / validateEmphasize …
│   ├── escapeCharacter.js
│   ├── marked/           ← 块级 Lexer（fork 自 marked）
│   └── render/           ← Block → VNode → Snabbdom DOM
│       ├── index.js      ← StateRender 类 + Rune/Echo 占位符通道
│       ├── snabbdom.js   ← patch/h/toHTML/toVNode 适配层
│       ├── renderBlock/  ← 容器块 / 叶子块 / 工具栏 / 表格拖拽
│       ├── renderInlines/← 27 种 inline token 渲染器（每个 token 一份）
│       └── sequence.js
├── selection/            ← 浏览器 Selection ↔ 内部 cursor 模型
│   ├── cursor.js         ← Cursor 类：anchor/focus/start/end
│   ├── dom.js            ← DOM ↔ block key ↔ caret offset 的所有解析函数
│   └── index.js          ← selection 入口
├── eventHandler/         ← 浏览器原始事件 → controller 路由
│   ├── event.js          ← EventCenter（自定义事件总线 + DOM 事件簿记）
│   ├── keyboard.js       ← keydown/keyup/composition 路由到 27 个 ctrl
│   ├── mouseEvent.js     ← mouseup/mousedown/contextmenu
│   ├── clipboard.js      ← 剪贴板读写（copyAsMarkdown / copyAsHtml / pasteAsPlainText）
│   ├── dragDrop.js       ← 拖拽（图片上传 / block 排序）
│   ├── resize.js
│   └── clickEvent.js     ← 前置事件 click 收集 → selectText
├── ui/                   ← 13 个浮层工具
│   ├── tooltip/index.js
│   ├── baseFloat/        ← 浮层基类（popper 定位、show/hide、订阅 muya-float）
│   ├── baseScrollFloat/  ← QuickInsert / CodePicker / EmojiPicker 的滚动浮层基类
│   ├── quickInsert/      ← / 命令面板（@ 触发的核心入口）
│   ├── tablePicker/ / codePicker/ / emojiPicker/
│   ├── imagePicker/ / imageSelector/ / imageToolbar/
│   ├── formatPicker/     ← 浮动格式工具栏（粗体/斜体/code/…）
│   ├── linkTools/ / tableTools/  ← 链接 / 表格单元格浮动工具
│   ├── frontMenu/        ← 段落左侧"汉堡"图标菜单（转 paragraph/heading/list/…）
│   ├── transformer/      ← 图片 resize + 拖拽 transformer
│   ├── fileIcons/
│   ├── emojis/           ← emoji 数据 + 检查是否在编辑 emoji token
│   └── footnoteTool/
├── utils/                ← 16 个无状态工具
│   ├── importMarkdown.js ← markdown → blocks（含 cursor 注入锚点）
│   ├── exportMarkdown.js ← blocks → markdown（CommonMark/GFM 合规）
│   ├── exportHtml.js     ← blocks → 静态 HTML（用 DOMPurify 清洗）
│   ├── turndownService.js← HTML → markdown 的 Turndown 封装（自写 plugin）
│   ├── dompurify.js      ← DOMPurify sanitize 入口
│   ├── getImageInfo.js   / getLinkInfo.js / getParentCheckBox.js
│   ├── domManipulate.js  ← setSelection / createRange / chopHtmlByCursor
│   ├── cumputeCheckBoxStatus.js
│   ├── resizeCodeLineNumber.js
│   ├── snakeToCamel.js / deepCopy / getUniqueId / getLongUniqueId / conflict / mixins
│   └── index.js          ← utils namespace
├── renderers/            ← 动态 import katex/mermaid/flowchart/vega-lite
├── prism/                ← 代码高亮（按需 loadLanguage）
├── parser/               ← lexer + tokenizer（见上）
└── assets/               ← css / pngicons / 第三方 lib
```

---

## 1. 顶层架构：Muya = M(状态) → V(vnode 树) → DOM（Patcher + 副作用 postRender）

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Markdown 字符串                                                          │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ importMarkdown / setMarkdown / 粘贴
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ContentState.blocks (Block Tree)                                          │
│  - 稳定 key（getUniqueId 自增）                                              │
│  - parent / preSibling / nextSibling / children                            │
│  - 27 个 ctrl 共享同一棵树（inputCtrl/backspaceCtrl/deleteCtrl/enterCtrl/…）│
│  - cursor = { start: {key, offset}, end: {key, offset} }                  │
│  - history stack: { blocks, cursor, renderRange } × UNDO_DEPTH           │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ render() / partialRender() / singleRender()
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  StateRender.renderBlock(parent, block, activeBlocks, matches, useCache) │
│  - 分发：leafBlock → tokenizer → 27 个 inline renderer                       │
│  - 分发：containerBlock → 递归 + 工具栏/preview/editIcon/footnoteJump       │
│  - snabbdom `h()` 返回 vnode tree                                           │
│  - collectLabels(blocks)：把 reference_definition 收纳进 labels Map          │
│  - postRender: renderMermaid() / renderDiagram() / renderRunes() / 清理缓存  │
│    → renderRunes() 内部走到 Rune/Echo 占位符 jQuery 通道                       │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ Snabbdom patch(oldVdom, newVdom)│
                  │ + 直接 innerHTML 写入占位符 host │
                  └──────────────┬────────────────┘
                                 │
                                 ▼
              ┌─────────────────────────────────────┐
              │  contenteditable DOM                  │
              │  Rune 占位符 → Vue SFC (mountRuneVueHosts) │
              │  Echo 占位符 → jQuery handler 集合    │
              │  代码块   → Prism 异步 highlight      │
              │  KaTeX / Mermaid / Flowchart → 异步插件   │
              └─────────────────┬───────────────────┘
                                │ 浏览器原生 input / keydown / click / paste
                                ▼
                  ┌──────────────────────────────────────┐
                  │ EventCenter (subscribers + detachDL) │
                  │   ↓ router                             │
                  │  ContentState.<27 个 ctrl>.XxxHandler │
                  │   ↓ mutate blocks/renderRange/cursor  │
                  │  partialRender / singleRender          │
                  └──────────────────────────────────────┘
```

---

## 2. 数据模型：Block Tree 与 Cursor

### 2.1 Block

```js
// _plugins/coolma-muya/lib/contentState/index.js:274 createBlock
{
  key:           string,        // 稳定 id（getUniqueId）
  text:          string,        // 仅叶子块（span）有
  type:          'span'|'p'|'h1'..'h6'|'ul'|'ol'|'li'|'blockquote'|'pre'|
                 'hr'|'figure'|'code'|'table'|'thead'|'tbody'|'tr'|'th'|'td'|
                 'div'|'input'|'root'
  functionType:  string|undefined,  // 'paragraphContent'|'atxLine'|'codeContent'|
                                     // 'languageInput'|'cellContent'|'footnoteInput'|
                                     // 'thematicBreakLine'|'fencecode'|'indentcode'|
                                     // 'html'|'multiplemath'|'mermaid'|…
  parent:        string|null,   // 父 block 的 key
  preSibling:    string|null,   // 同层左兄 key
  nextSibling:   string|null,   // 同层右弟 key
  children:      Block[],       // 子节点
  editable:      true|false,    // false → 对应 contenteditable=false
  // 块特定字段（按 type 累积）：
  lang?:         string,        // code/span/figure
  headingStyle?: 'atx'|'setext',
  marker?:       string,
  checked?:      boolean,       // 任务列表的 input[type=checkbox]
  listItemType?: 'task'|'order'|'bullet',
  bulletMarkerOrDelimiter?: '-'|'+'|'*'|'.')'|')',
  isLooseListItem?: boolean,
  align?:        'left'|'center'|'right'|'',
  column?:       number,        // 表格列索引
  row?:          number,        // 表格行数（仅 figure > table 有）
  functionType?? 'table'|'footnote'|'html'|'mermaid'|'multiplemath'|'flowchart'|
                 'sequence'|'vega-lite'|'fencecode'|'indentcode'|'frontmatter',
  listType?:     'order'|'bullet',
  start?:        number,        // ol 的起始编号
  style?:        string         // frontmatter 风格（';' for jsonc 等）
}
```

**关键设计**：
1. **`parent` + `pre/nextSibling` 是显式的双向链**：每个 block 都冗余存了三个指针。理由：DOM 是双向链表，编辑器要来回穿梭，光靠 `children` 数组的 index 是不够的。`findPreBlockInLocation` / `findNextBlockInLocation`（677-710 行）反复用到这种"向上回溯 + 跳过 input/不可编辑子节点"。
2. **`type` 是结构类型，`functionType` 是逻辑类型**：`type` 决定 DOM 元素名 + CSS class；`functionType` 决定真正的语义（同一个 `span` 的 `functionType: 'codeContent'` 表示它在 code block 里，`'paragraphContent'` 表示它是普通段落里的 line）。这种二分让"同一个 DOM 元素在不同上下文里行为不同"的逻辑内聚到一处。
3. **`exemption` Set**（`this.exemption = new Set()`，74 行）：临时保护某些 block 不被"removeTextOrBlock"删除。这是删除跨块内容（Ctrl+A 删除整张表）时给 `figure/table` 的临时防删红线——典型的"用 mutable 状态标注正在被删除的安全边界"。
4. **`renderRange = [preSiblingKey, nextSiblingKey]`**：标记下一次 `partialRender` 要更新的区间（"中间轴的两个端点"）。`setNextRenderRange` 用 cursor 的 start/end 各取最外层 block 的相邻兄弟，保证局部渲染只动这个区间。这是性能优化的核心。

### 2.2 Cursor 模型

`_plugins/coolma-muya/lib/selection/cursor.js` 的 `Cursor` 类（注意：cursor 实例有两个等价形式共存）：

```js
{
  anchor: { key, offset },    // 浏览器 Selection 原生
  focus:  { key, offset },
  start:  { key, offset },    // 本编辑器自用：保证 start <= end（按 DOM 顺序）
  end:    { key, offset },
  noHistory: boolean          // 标记这次 cursor 变化不入历史栈（如 undo/redo 自身）
}
```

`contentState.cursor` 是一个**带 setter 的 getter**（index.js 134-163 行）：

- 每次赋值会把当前 `currentCursor` 推到 `prevCursor`，再写新 cursor。
- 如果 `prevCursor.start.key !== cursor.start.key || prevCursor.end.key !== cursor.end.key` → **立刻 push history**。
- 否则等 2 秒 `historyTimer` 后再 push（连续小编辑合并成一次 undo 粒度）。
- `cursor.noHistory === true` 时不入栈（这是 `History.undo/redo` 必须的，否则按一次 undo 又被 push 回去就死循环了）。

> **思考**：这种"两段合并 + 2 秒 timeout"是良好的折衷——比每次 keystroke 入栈更稀疏，比显式 transaction 更不打扰。但仍有边界 bug（如快速打字 1.9 秒后停 100ms 再打字会被分成两个 undo 粒度）。

### 2.3 Tree 操作工具

`_plugins/coolma-muya/lib/contentState/index.js` 暴露：

| 方法 | 行数 | 用途 |
|---|---|---|
| `createBlock(type, extras)` | 274 | 工厂（含 functionType 推断、code 转义） |
| `createBlockP(text)` | 303 | 快捷创建一个 `p > span` |
| `getBlock(key)` 递归 | 324 | 用 key 拉 block（DFS） |
| `getParent / getParents` | 368 / 376 | 父节点 / 祖先链 |
| `getPreSibling / getNextSibling` | 387 / 392 | 双向链表读 |
| `insertBefore / insertAfter` | 556 / 542 | 双向链插入（重写四个指针） |
| `prependChild / appendChild` | 581 / 590 | 单向追加 |
| `replaceBlock` | 604 | 保留前后指针的"换核" |
| `removeBlock / removeBlocks` | 502 / 452 | 单删 + 区间删（带 exemption 保护） |
| `removeTextOrBlock` | 414 | 智能删除（exemption 节点清空 vs editable 节点真删） |
| `isFirstChild / isLastChild / isOnlyChild` | 623-633 | 用于 Enter/Backspace 退化判断 |
| `isOnlyRemoveableChild` | 635 | 列表项"还能不能继续脱壳"的判定 |
| `firstInDescendant / lastInDescendant` | 651 / 667 | DFS 取最左/最右的 span block（光标定位用） |
| `findPreBlockInLocation / findNextBlockInLocation` | 680 / 697 | 按"块级顺序"的邻居（跳过 input/不可编辑 div） |
| `getActiveBlocks` | 529 | 从当前 cursor 的 start block 一路 getParent 到 root |
| `getAnchor` | 754 | 关键概念映射：`span` → `figure`（code/cellContent）或 `p`（普通） |
| `findOutMostBlock` | 572 | 递归取最外层 block |
| `copyBlock` | 343 | 深拷贝并**重新生成所有 key**（粘贴/复制一个 block 用） |
| `closest(block, type)` | 742 | DOM closest 思路的 block 版本 |
| `getPositionReference` | 712 | 给浮层用的"虚拟 anchor"（带 boundingClientRect） |
| `getFirstBlock / getLastBlock` | 732 / 736 | DFS 最左/最右文本块 |

> **关键设计权衡**：所有这些方法都是 **DFS + mutable pointer 修改**，没有 immutable update。意味着：
> - `undo/redo` 必须 `deepCopy` 整棵树（因为旧版本的指针别名一旦修改就找不到原版了）；
> - 任何"重置整棵树"的操作（如全选删除）只能整块替换 `this.blocks = [...]`；
> - 这是为什么 `history.js:41-49` 的 `push()` 在 `stack.splice(this.index + 1)` 后 `deepCopy(state)`。

---

## 3. 解析层：Markdown → Token → Block

### 3.1 两层架构图

```
Markdown 字符串
   │
   │ importMarkdown.markdownToState()
   ▼
┌──────────────────────────────────────────────────────┐
│  Marked Lexer (parser/marked/lexer.js, fork 自 marked) │
│  - 块级规则 (blockRules.js)                                │
│    · frontmatter / heading / hr / code / multipleMath    │
│    · blockquote_start/end                                │
│    · table / footnote_start/end                         │
│    · list_start / list_item_start (loose/tight)         │
│    · paragraph / text / html                            │
│  - 没有任何 inline 解析（disableInline: true）             │
└────────────────┬─────────────────────────────────────┘
                 │
                 │  switch(token.type) → createBlock + appendChild
                 ▼
        ContentState.blocks (Block Tree)
                 │
                 │  在叶子块需要内嵌格式时
                 ▼
┌──────────────────────────────────────────────────────┐
│  tokenizerFac() (parser/index.js:41, 共 579 行)         │
│  输入：beginRules + inlineRules + src                  │
│  输出：tokens[]                                         │
│  流程：                                                  │
│   1) beginRules 试 5 种 "开头就识别" 语法                 │
│      header / hr / code_fense / multiple_math / refdef   │
│   2) 进入 while(src.length) 主循环                       │
│      按以下优先级 + 长度 顺序逐条 rules.exec(src):        │
│      ① backlash（转义）                                   │
│      ② strong / em（按内容嵌套递归 tokenizerFac）          │
│      ③ inline_code / emoji / inline_math / del / echo_anno│
│      ④ superSubScript / footnoteIdentifier              │
│      ⑤ image / link / reference_image / reference_link   │
│      ⑥ html_escape / auto_link_extension / auto_link     │
│      ⑦ html_tag（含评论）                                  │
│      ⑧ soft_line_break / hard_line_break / tail_header   │
│      ⑨ 兜底：pending += src[0]                          │
│   3) 每个 token：{ type, raw, range: {start, end} }      │
│   4) 递归用 children 在 link/em/strong/html_tag 等里嵌套  │
└────────────────┬─────────────────────────────────────┘
                 │
                 │ StateRender.renderLeafBlock → tokens.reduce(this[snakeToCamel(token.type)]())
                 ▼
         27 个 inline renderer 生成 vnode
```

### 3.2 beginRules vs inlineRules（lib/parser/rules.js）

```js
export const beginRules = {
  hr:                  /^(\*{3,}$|^\-{3,}$|^\_{3,}$)/,
  code_fense:          /^(`{3,})([^`]*)$/,
  header:              /(^ {0,3}#{1,6}(\s{1,}|$))/,
  reference_definition:/^( {0,3}\[)([^\]]+?)(\\*)(\]: *)(<?)([^\s>]+)(>?)(?:( +)(["'(]?)([^\n"'\(\)]+)\9)?( *)$/,
  multiple_math:       /^(\$\$)$/
}

export const inlineRules = {
  strong:       /^(\*\*|__)(?=\S)([\s\S]*?[^\s\\])(\\*)\1(?!(\*|_))/,
  em:           /^(\*|_)(?=\S)([\s\S]*?[^\s\*\\])(\\*)\1(?!\1)/,
  inline_code:  /^(`{1,3})([^`]+?|.{2,})\1/,
  image:        /^(\!\[)(.*?)(\\*)\]\((.*)(\\*)\)/,
  link:         /^(\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*?)(\\*)\]\((.*)(\\*)\)/,
  emoji:        /^(:)([a-z_\d+-]+?)\1/,
  del:          /^(~{2})(?=\S)([\s\S]*?\S)(\\*)\1/,
  auto_link:    /^<(?:(...))>/,
  auto_link_extension: /^(?:(www\....|http...|email))/,
  reference_link: /^\[([^\]]+?)(\\*)](?:\[([^\]]*?)(\\*)])?/,
  reference_image: /^\!\[([^\]]+?)(\\*)](?:\[([^\]]*?)(\\*)])?/,
  tail_header:  /^(\s{1,}#{1,})(\s*)$/,
  html_tag:     /^(<!--[\s\S]*?-->|(<([a-zA-Z]{1}[a-zA-Z\d-]*) *[^\n<>]* *(?:\/)?>)(?:([\s\S]*?)(<\/\3 *>))?)/,
  html_escape:  new RegExp(`^(${escapeCharacters.join('|')})`, 'i'),
  soft_line_break:     /^(\n)(?!\n)/,
  hard_line_break:     /^( {2,})(\n)(?!\n)/,
  backlash:    /^(\\)([\\`*{}\[\]()#+\-.!_>~:\|\<\>$]{1})/,

  inline_math: /^(\$)([^\$]*?[^\$\\])(\\*)\1(?!\1)/,
  echo_anno:   /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)$/   // ★ v2026-07-31 起可运行时替换
}

export const inlineExtensionRules = {  // 默认关闭，由 options.superSubScript / footnote 开启
  superscript: /^(\^)((?:[^\^\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  subscript:   /^(~)((?:[^~\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  footnote_identifier: /^(\[\^)([^\^\[\]\s]+?)(?<!\\)\]/
}
```

设计要点：

1. **每个 token 类型都自带 `raw`、`marker`、`range: {start, end}`**。`raw` 是无损的还原字段；`marker` 是像 `*`、`**`、`~~` 这种外层包裹；`range` 是关键：
    - **存储 token 在 span.text 中的字符偏移**，与 `block.text` 真正等价（不算 Markdown 包裹字符）；
    - 让"光标位置（key+offset）"能精准穿越任何 token 中间（`cursor.offset` 与 `token.range.start/end` 同坐标系）；
    - 让"搜索高亮 / 引用链接解析 / echo_anno 命中"能精确计算；
    - 这是 coolma-muya 不用 contenteditable HTML 做模型的最大收益——字符坐标直接对得上。

2. **`isLengthEven(to[3])`**：所有规则末尾的 `\\*)` 区段必须凑偶数（因为 `\*` 是转义）。这是为了让 `*foo\**` 不被误识别为 `strong`——奇数个 `\` 视为"还在逃逸"。

3. **`em`/`strong` 嵌套**：因为 tokenizerFac 是函数式递归，em/strong 的捕获组 `[2]` 内部直接再调一次 `tokenizerFac`。`CAN_NEST_RULES = ['strong', 'em', 'link', 'del', 'a_link', 'reference_link', 'html_tag']`（注释里有）。

4. **`validateEmphasize`**：空 `*`、嵌套冲突时拒绝（否则 `*` 会成对错位）。

### 3.3 `setEchoAnnoRule` —— 运行时 mutate parser 规则的唯一入口

v2026-07-31 起的关键改动（`_plugins/coolma-muya/lib/parser/rules.js:60-73`、`parser/index.js:638-641`）：

```js
export const createEchoAnnoRule = ({ requireParens = true } = {}) => {
  if (requireParens) {
    return /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)$/
  }
  return /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?(?:\(([^)]*)\))?$/
}

export const setEchoAnnoRule = ({ requireParens = true } = {}) => {
  inlineRules.echo_anno = createEchoAnnoRule({ requireParens })
  return inlineRules.echo_anno
}
```

> 设计哲学：规则是**共享引用**，主项目通过 `setEchoAnnoRule({ requireParens })` 替换 `inlineRules.echo_anno` 字段。下一次所有调用 `tokenizer()` 的位置（inputCtrl/backspaceCtrl/deleteCtrl/enterCtrl/formatCtrl/renderLeafBlock/importMarkdown/...）闭包自动拿到新 RE。**唯一推荐的运行时切换入口**，避免两套真相（settings 在 SQLite，但 token 化规则与 inlineRules.echo_anno 共享）。
>
> 副作用：已解析的 block token **不会被回滚**，调用方需要触发 `contentState.render(false, true)` 全量重 render。

### 3.4 importMarkdown / getCodeMirrorCursor / addCursorToMarkdown / importCursor

`_plugins/coolma-muya/lib/utils/importMarkdown.js` 暴露了一组保持"光标 + Markdown 串"双向无损的核心工具：

```js
// 1) Markdown → Block Tree，禁用 inline 解析（避免重复劳动）
ContentState.prototype.markdownToState = function (markdown) {
  const tokens = new Lexer({ disableInline: true, footnote }).lex(markdown)
  // switch(token.type) → frontmatter / hr / heading / multiplemath / code /
  //                     table / html / text / paragraph / blockquote / footnote /
  //                     list / list_item
  // 每个 case 都用 createBlock + appendChild 重建
}

// 2) Block Tree → {anchor, focus, line, ch} 对象（CodeMirror 风格）
ContentState.prototype.getCodeMirrorCursor = function () {
  // 思路：在 start block 文本里嵌入两个独特 sentinel：
  //   CURSOR_ANCHOR_DNA = getLongUniqueId()   (config/index.js:167)
  //   CURSOR_FOCUS_DNA  = getLongUniqueId()
  // 然后 export → 在导出文本里 indexOf → 转成 {line, ch}
  // 最后再把 sentinel 复原回去
}

// 3) {anchor, focus, line, ch} → 插入 sentinel 的 Markdown 串
ContentState.prototype.addCursorToMarkdown = function (markdown, cursor) { … }

// 4) 从 importMarkdown 后的 Block Tree 里找 sentinel，决定最终 cursor
ContentState.prototype.importCursor = function (hasCursor) {
  // dfs 找 CURSOR_ANCHOR_DNA / CURSOR_FOCUS_DNA 出现的 block key+offset
  // 找到之后把 sentinel 抹掉再回填到 this.cursor
}

// 5) 顶层入口（被 Muya.setMarkdown 用到）
ContentState.prototype.importMarkdown = function (markdown) {
  this.blocks = this.markdownToState(markdown)
}
```

> **为什么 sentinel 而不是更复杂的数据结构**：因为 markdown 字符串是文本协议，没法挂 metadata；用极不可能撞车的 long unique id 作"插入符"是 lossless 的标记方案，类似 CodeMirror 的 `marker` 思路。

---

## 4. 渲染层：Block → VNode → DOM

### 4.1 三种入口

```js
// _plugins/coolma-muya/lib/contentState/index.js:211, 231, 253
render (isRenderCursor = true, clearCache = false)            // 全量
partialRender (isRenderCursor = true)                       // 按 renderRange 局部
singleRender (block, isRenderCursor = true)                // 单 block 局部
```

三种都做这些事（统一配方）：

1. `getActiveBlocks()`：从 cursor.start 的 block 一路 getParent 到 root；
2. `matches.forEach((m, i) => m.active = i === index)`：把搜索高亮里的"当前命中"标好；
3. `setNextRenderRange()`：重置 `renderRange = [startOutmostBlock.preSibling, endOutmostBlock.nextSibling]`；
4. `stateRender.collectLabels(blocks)`：重新收集 `reference_definition` 的 `labels Map`；
5. 调底层 render（patch / insertAdjacentHTML / patch single block）；
6. `setCursor()` 或 `muya.blur()`（局部渲染更频繁，光标必须重置）；
7. `postRender()`：默认只调 `resizeLineNumber()`（被 setOptions 禁用了，待 delete）；
8. `stateRender.renderMermaid() / renderDiagram() / renderRunes() / codeCache.clear()`。

### 4.2 renderLeafBlock 与 tokenCache

`_plugins/coolma-muya/lib/parser/render/renderBlock/renderLeafBlock.js:98-117` 关键点：

```js
if (effectiveHighlights.length === 0 && this.tokenCache.has(text)) {
  tokens = this.tokenCache.get(text)
} else if (
  HAS_TEXT_BLOCK_REG.test(type) &&                  // 文本型 span 才走 tokenizer
  functionType !== 'codeContent' &&
  functionType !== 'languageInput'
) {
  const hasBeginRules = /paragraphContent|atxLine/.test(functionType)
  tokens = tokenizer(text, {
    highlights: effectiveHighlights,                // 搜索高亮要叠在 range 上
    hasBeginRules,
    labels: this.labels,                             // 参考链接的标签表
    options: this.muya.options
  })
  const hasReferenceTokens = hasReferenceToken(tokens)
  if (effectiveHighlights.length === 0 && useCache && DEVICE_MEMORY >= 4 && !hasReferenceTokens) {
    this.tokenCache.set(text, tokens)                // 文本级 LRU cache
  }
}
children = tokens.reduce((acc, token) => [...acc, ...this[snakeToCamel(token.type)](h, cursor, block, token)], [])
```

> **tokenCache 的本意**：同样的 `text` 在不同 block 重出现时复用 token 结果（典型场景：很多行的相同脚注标题、或连续的相同占位符）。但 `text` 作 key 在中文长文本里碰撞概率近乎为 0，实际上是个伪 LRU 的简单 Map，没有 size cap → 长期运行有内存压力。值得未来升级为 LRU。

### 4.3 Snabbdom 适配层

`_plugins/coolma-muya/lib/parser/render/snabbdom.js` 全文件极小但关键：

```js
const snabbdom = require('snabbdom')

export const patch = snabbdom.init([
  require('snabbdom/modules/class').default,       // 动态 class 切换（如 cursor 在不在 token 里）
  require('snabbdom/modules/attributes').default,
  require('snabbdom/modules/style').default,
  require('snabbdom/modules/props').default,
  require('snabbdom/modules/dataset').default,     // data-* 走这个
  require('snabbdom/modules/eventlisteners').default
])
export const h          = require('snabbdom/h').default
export const toHTML     = require('snabbdom-to-html')
export const toVNode    = require('snabbdom/tovnode').default
export const htmlToVNode = html => {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  return toVNode(wrapper).children
}
```

> v2026-07-29 的一个关键 fix（见 `renderInlines/echoAnno.js:73-87`）：为了让 cursor 在 / 不在 echo token 时 outer span 不被替换（vnode.sel 不同会触发 removeVnode + createElm），把 AG_GRAY / AG_HIDE 从 `sel` 移到 `class: { ag-gray: bool, ag-hide: bool }`，让 snabbdom class module 动态增减。这是为了避免"焦点切换时 echo marker 包裹突变"的视觉跳跃。
>
> 再加：每个 echo token 的 outer span 用稳定 `key: echoNodeId`（由 range+raw 哈希）锁定 patch 路径。

### 4.4 renderContainerBlock 的"工具栏生态"

`_plugins/coolma-muya/lib/parser/render/renderBlock/renderContainerBlock.js` 是最复杂的入口之一，按 block.type 分发：

| type | 工具栏/预览标识 |
|---|---|
| `th`/`td` | 选中时的边框四态（top/right/bottom/left），左上 + 右下拖拽条 |
| `figure` | table → renderTableTools；html/math/diagram → container preview；footnote → jump icon |
| `h1..h6` | 大纲 hook（`data-role: type`），TODO 里标了"这里应该建 TOC 缓存" |
| `ul`/`ol` + `listType` | `.ag-{type}-list`，`ol.start` 走 `data-start` |
| `li` + `listItemType` | `.ag-task-list-item` / `.ag-order-list-item`，紧 / 松弛切换 |
| `pre` | 复制按钮 + 语言 class + 保存 `codeCache` |
| `table` | 左拖 / 右拖 / 下拖（`renderLeftBar/renderBottomBar`）由 activeBlocks + renderingRowContainer 联合判定 |

> 这种"渲染函数内嵌 mini 控制器"的方式让 container block 的 DOM 结构自带交互，但调试时要小心：每条判定都耦合了 activeBlocks + this.renderingRowContainer 等渲染器上下文。

### 4.5 Rune / Echo 占位符通道（v2026-07-29 起的双流）

`_plugins/coolma-muya/lib/parser/render/index.js` 中关键的 renderRunes 流程：

```js
renderRunes () {
  // 1) 渲染 Rune 占位符（jQuery 通道）
  this.renderRunePlaceholders()      // 用 placeholder HTML 写进 host.innerHTML

  // 2) 渲染 Echo 占位符（双模式：jQuery + Vue）
  this.renderEchoPlaceholders()      // 调用 echoRuntime.renderToHtml() 写 host.innerHTML
                                     // + echoRuntime.afterRender(root, { cleanupFirst: true }) 派发特效

  // 3) 清理 detached
  this.cleanupDetachedRunePlaceholders()
  this.cleanupDetachedEchoPlaceholders()

  // 4) 启用 Vue renderer 时，把 host 当 mount 容器跑 new RuneRenderer() / new EchoRenderer()
  if (this.muya?.options?.enableRuneVueRenderer) {
    this.renderRunesWithVue()
  } else {
    this.cleanupDetachedRuneVms(true)
    this.cleanupDetachedEchoVms(true)
  }
}
```

> Rune 与 Echo 走两套独立 selector、cache、VM 池（`runeVmMap` / `echoVmMap`），互不干扰。
>
> Echo 端有意思的取舍：默认 `enableEchoVueRenderer: false`（见 `src/components/muya/Muya.vue:989`），原因是 `echoRuntime.renderToHtml` 已经把特效直接写进 `host.innerHTML`，再 mount Vue 会把 renderToHtml 写的 hover/effect 全部覆盖掉。Vue renderer 只在用户显式开启时启用。

#### mountRuneVueHosts 的"三优先级合并"

`_plugins/coolma-muya/lib/parser/render/index.js:639-732` 是 Rune 系统的入口：

```js
const propDefs = parseSfcPropsDef(rune?.template || '')  // 正则抠 SFC props 块（避免引入 vue-template-compiler）
const sfcProps = collectRunePropsFromHost(host, propDefs)
const vm = new RuneRenderer({
  propsData: {
    runeId, nodeId, rune,
    ...sfcProps,                                  // ① 来自 host.dataset.userProp
    value: runeValue,                             // ② Markdown 自带的 value
    onValueChange
  }
})
```

三优先级合并（自上而下）：

1. **用户在 Markdown 里手写的 `data-rune-prop-*`**：最高优先级，从 `host.dataset` 收集（`collectRunePropsFromHost`），按 Vue props 规则传入 SFC；
2. **SFC 自身的 `props.default`**：Vue 兜底；
3. **`props/rune` 卡片的字段级默认值**：被废弃（v2026-07-29 后），行为完全交给 SFC。

> 这种"用户写 > SFC 默认 > 全交给 SFC"的分工，避免了"卡片级开关 / 名片级开关 / SFC 内开关"三套真相——这是 `rune-echo-cloudfn-experimental.mdc` §1 强调的「不背历史包袱」原则的具体落地。

### 4.6 parser/index.js:5 —— 还没拆掉的"业务耦合"红线

```js
import { parseEchoProps } from 'src/components/echo/echoCore'
```

> 这是 `coolma-muya-sdk-guidelines.mdc` §6.2 的 P0 红线——`coolma-muya/lib/parser/index.js:5` 直接跨工程读主项目的 echo 业务模块。SDK 化最终要把它内联或下沉。**目前状态：已知耦合，未拆**。

---

## 5. 27 个 controller：键盘 / 鼠标 / 拖拽 / 粘贴的真相层

### 5.1 controller 装载机制

`_plugins/coolma-muya/lib/contentState/index.js:36-64` 把 27 个 controller 文件按顺序 push 到数组，每个文件都用 monkey-patch 风格：

```js
const prototypes = [coreApi, tabCtrl, enterCtrl, ..., importMarkdown]
prototypes.forEach(ctrl => ctrl(ContentState))   // 全部在 class 外挂一遍
```

> **这种"func 注册到 prototype"模式 vs ES6 class extends**：可以无脑分文件、自动按数组顺序覆盖，并允许运行时按需裁剪某个 ctrl（如 host app 想屏蔽回车行为，删掉 enterCtrl 即可）。代价：调试栈很难一眼看出方法在哪个文件。

### 5.2 ctrl 分类全景

| 类别 | 文件 | 关键事件 | 关键逻辑 |
|---|---|---|---|
| **核心** | `core.js` | — | `replaceWordInline(line, wordCursor, replacement)`：给 QuickInsert 这种"行内替换单词"用 |
| **输入** | `inputCtrl.js` | `input` event | 自动配对括号、删除同步、token 重切、IME compositionend、quick insert 触发、partialRender |
| **回车** | `enterCtrl.js` | Enter | `chopBlockByCursor`、`chopBlock`、`enterInEmptyParagraph`、表格 `Cmd/Ctrl+Enter` 加行、代码块自动缩进、footnote/语言后缀检测 |
| **退格** | `backspaceCtrl.js` | Backspace | `checkBackspaceCase`、`docBackspaceHandler`、`backspaceHandler`：表格 / 列表 / blockquote 退化为普通段、echo_anno 整段删除 |
| **删除** | `deleteCtrl.js` | Delete | 与 backspace 镜像但方向相反 |
| **代码块** | `codeBlockCtrl.js` | — | fence/indent 转换、`updateCodeLanguage`、KaTeX/Mermaid/HTML 等特殊块的 enter 处理 |
| **更新容器** | `updateCtrl.js` | — | 段落类型升级（`<h2>` ↔ `<p>`）、list 紧 / 松弛切换、表格 cell ↔ figure |
| **格式** | `formatCtrl.js` | — | bold/italic/code/link 等格式施加 |
| **搜索** | `searchCtrl.js` | — | `search(value, opt)`、`find(action)`、`replace(value, opt)`、`searchMatches` 状态 |
| **容器** | `containerCtrl.js` | — | 容器块（figure/table）的拖动 / 调整 |
| **HTML** | `htmlBlock.js` | — | `<details>` 等特殊 HTML 块的 enter 处理 |
| **点击** | `clickCtrl.js` | click | 点击事件 → cursor 设置 |
| **箭头** | `arrowCtrl.js` | 方向键 | 上下左右光标移动，跨块、跨表格 |
| **粘贴** | `pasteCtrl.js` | paste | 接收 HTML/Markdown/Doc 多种粘贴格式 → importMarkdown |
| **复制剪切** | `copyCutCtrl.js` | copy/cut | 选中后用 Clipboard 交互 |
| **段落** | `paragraphCtrl.js` | — | paragraph 类型互转 |
| **Tab** | `tabCtrl.js` | Tab | `\t` 字符、code 块缩进、列表嵌套缩进 |
| **表格** | `tableBlockCtrl.js` | — | 表格创建、单元格编辑、行列增删 |
| **表格选中** | `tableSelectCellsCtrl.js` | — | 多 cell 选中、复制、合并（语义未实现合并） |
| **表格拖拽** | `tableDragBarCtrl.js` | — | 表格列宽调整 |
| **TOC** | `tocCtrl.js` | — | 大纲生成（`contentState.getTOC()`） |
| **Emoji** | `emojiCtrl.js` | — | `:smile:` → emoji token |
| **图片** | `imageCtrl.js` | — | 内联图片 CRUD、上传、placeholder |
| **链接** | `linkCtrl.js` | — | link 自动补全、打开 |
| **拖放** | `dragDropCtrl.js` | drop | 拖文件上传、拖 block 重排 |
| **脚注** | `footnoteCtrl.js` | — | `[^id]:` 语法解析 + figure 化 |
| **markdown import** | `importMarkdown.js` | — | `markdownToState` / `getCodeMirrorCursor` / `importCursor`（见 §3.4） |

### 5.3 inputCtrl 的"快速自动配对 + token 复检"

`_plugins/coolma-muya/lib/contentState/inputCtrl.js:123` 的 `inputHandler` 是最长最复杂的 ctrl。其逻辑骨架：

```js
ContentState.prototype.inputHandler = function (event, notEqual = false) {
  const { start, end } = selection.getCursorRange()    // 从 DOM Selection 拿当前光标
  // 1) 取段落当前 DOM 文本（getTextContent 排除 AG_MATH_RENDER / AG_RUBY_RENDER）
  // 2) 与 block.text 对比，不一致说明用户键入了东西
  // 3) 删除/键入/自动配对大括号 → text 调整 + needRender = true
  //    - inputType 含 'delete'：postInputChar === BRACKET_HASH[deletedChar] → 多删一个
  //    - 输入 )/]/}/"/' 而下一字符同样：多删一个（避免双尾符）
  //    - 若是 ( [ { " ' * $ ` ~ _ 自动配对：插入对应右半
  //    - 输入 " 在 letter/digit 后面不配对
  //    - 输入 * 而 prePreInputChar 是 * + 输入是 * ：去掉一个 * 形成 ** 加行
  //    - 反斜杠转义不配对
  // 4) shift+enter 软换行：shift+enter 在 codeContent 不算
  // 5) 写入 block.text（保留语言块单独赋值）
  // 6) 触发 'muya-quick-insert'：@ 触发浮层（inline @）
  // 7) cursor = { start, end }
  // 8) 若是 codeContent：节流 300ms partialRender
  // 9) checkMarkedUpdate / checkInlineUpdate 决定 partialRender 还是 full render
}
```

> 这种基于字符级 `BRACKET_HASH` map 的自动配对实现非常轻量——但显然不处理嵌套（如"用户输入 [，自动加 ] 时正好已有 ] 应该跳过"）。跟 Typora / VSCode 的智能配对比还是简化版。

### 5.4 eventHandler 路由层

`_plugins/coolma-muya/lib/eventHandler/event.js` 的 EventCenter 是一份"自定义事件 + DOM 事件簿记"双效合一：

```js
class EventCenter {
  constructor () { this.events = []; this.listeners = {} }
  attachDOMEvent (target, event, listener, capture) { /* 记一笔 + addEventListener */ }
  detachDOMEvent (eventId) { /* removeEventListener + 移除记录 */ }
  detachAllDomEvents () { /* destroy 时调，避免泄漏 */ }
  subscribe(event, listener) / subscribeOnce / unsubscribe / dispatch
}
```

EventCenter 是单向架构：UI 子系统（QuickInsert / FormatPicker / CodePicker …）从不直接调 controller，而是 controller 调 `eventCenter.dispatch('muya-quick-insert', reference, block, isShown)`，UI 组件 subscribe 这个事件。

> 这种解耦设计让 QuickInsert 之类的 UI 可以独立卸载/重装，测试时也可以 mock EventCenter。

---

## 6. UI 浮层系统：BaseFloat + BaseScrollFloat + 11 个 plugin

### 6.1 UI 子系统布局

```
ui/
├── tooltip/        ← 鼠标 hover 提示（小黄条）
├── baseFloat/      ← 浮层基类（popper 定位、show/hide、外界点击关闭、订阅 'muya-float'）
├── baseScrollFloat/← 滚动列表浮层基类（QuickInsert / EmojiPicker / CodePicker 继承）
├── tablePicker/    ← 表格尺寸选择器（grid picker）
├── quickInsert/    ← / 命令面板（@ 触发，见 §7）
├── codePicker/     ← 代码语言选择器
├── emojiPicker/    ← emoji 面板
├── imagePicker/    ← 内联选择本地图片
├── imageSelector/  ← 已上传图片选择
├── imageToolbar/   ← 选中图片后的浮动工具（替换、删除）
├── formatPicker/   ← 选中文字后的浮动格式工具
├── frontMenu/      ← 段落左侧汉堡图标菜单（变 h1/h2/list/...）
├── linkTools/      ← link 悬浮工具
├── tableTools/     ← 表格内 cell 工具
├── transformer/    ← 图片 resize transformer
├── fileIcons/
├── emojis/         ← emoji 数据 + cursor 检查
└── footnoteTool/
```

### 6.2 插件注册流程（`new Muya(container, options)` 中）

```js
// _plugins/coolma-muya/lib/index.js:46-50
if (Muya.plugins.length) {
  for (const { plugin: Plugin, options: opts } of Muya.plugins) {
    this[Plugin.pluginName] = new Plugin(this, opts)   // 实例挂到 this[xxx]
  }
}
this.contentState = new ContentState(this, this.options)
this.clipboard    = new Clipboard(this)              // eventHandler/
this.clickEvent   = new ClickEvent(this)
this.keyboard     = new Keyboard(this)
this.dragdrop     = new DragDrop(this)
this.resize       = new Resize(this)
this.mouseEvent   = new MouseEvent(this)
```

> 11 个 UI plugin + 6 个 eventHandler + 1 个 ContentState 是 Muya 一启动就初始化的固定拓扑。`Muya.use()` 必须放在 `new Muya()` 之前（典型模式在 `src/components/muya/Muya.vue:858-873`）。

### 6.3 baseFloat / baseScrollFloat 的设计

`baseFloat/index.js` 用 Popper（MiniPopper / 重写的 ref 定位）做锚定 + 自动 hide on outside click + Esc 关闭：

```js
class BaseFloat {
  constructor (muya, name) { /* 创建 div、popper 实例、bind hide 逻辑 */ }
  show (reference, cb)    /* 显示，reference 是带 getBoundingClientRect() 的对象 */
  hide ()                 /* 隐藏 */
  listen ()               /* 默认订阅 'muya-float' 事件，外部统一管理 shownFloat */
  destroy ()              /* 移除 DOM + 取消订阅 */
}
```

`baseScrollFloat/index.js` 在 baseFloat 之上加：

- 用 snabbdom 渲染滚动列表（patch 优化）
- 维护 `renderArray`（拍平的 item 列表）+ `sectionOffsets`（每段起始索引，便于键盘上下 = 跨段切）
- 维护 `activeItem`（当前高亮）+ `activeEleScrollIntoView`（滚到可视区）
- 维护 `step(step)` 内部：上/下方向键的逻辑（`baseScrollFloat` 已经实现，`QuickInsert` 说"step 方法继承自 BaseScrollFloat，无需重写"——见 `ui/quickInsert/index.js:778`）

### 6.4 quickInsert 是 UI 子系统里最复杂的一个

`_plugins/coolma-muya/lib/ui/quickInsert/index.js` 总长 795 行，包含：

| 功能 | 行数 |
|---|---|
| 自定义 substring filter（替代 fuzzaldrin） | 25-31 |
| SFC props.default 解析（决定「插入瞬间 rune 默认 value」）| 108-166 |
| Rune 卡片 SVG base64 icon 兜底 | 45-59 |
| Rune 占位符 HTML 生成（4 个 data-rune-*） | 186-200 |
| Echo 占位符 Markdown 文本生成（含 echoId 自动写 uuid） | 209-226 |
| `getRenderObj`：merge 内置 sections + dynamicProvider，加权 sort sections | 281-307 |
| `search` 二次过滤后重 render | 438-450 |
| Rune 上一行 value 继承（只当 SFC props.inheritFromPrevious.default === true 时） | 467-553 |
| Rune/Echo 插入到 block.text + 触发 cursor 重置 + partialRender | 555-706 |
| `selectItem`：route 到 para / image / updateParagraph / insertRune / insertEcho | 708-776 |

#### echoId 自动注入（v2026-07-30 起固定）

```js
// ui/quickInsert/index.js:219-226
const echoId = uuidv4()
const parts = [`echoId: '${escapeEchoAttrValue(echoId)}'`]
parts.push(`value: '${escapeEchoAttrValue(normalizedPrompt)}'`)
return `@${echoName}{${parts.join(', ')}}()`
```

> **命名约定固定**：`echoId`，避免和 `id` 冲突（与 rune 端 `data-rune-id` 命名风格一致）。兼容性靠 parser 端的 fallback 链：`propsParsed.echoId > propsParsed.id`。

---

## 7. utils 子系统

### 7.1 importMarkdown.js 的核心套路

上文 §3.4。

### 7.2 exportMarkdown.js 的块遍历与转回

`_plugins/coolma-muya/lib/utils/exportMarkdown.js` 把 Block Tree 反向翻译成 markdown：

- 根控制 translateBlocks2Markdown(blocks, indent='', listIndent='')
- 按 block.type 分发到 normalizeParagraphText / normalizeHeaderText / normalizeBlockquote / normalizeFrontMatter / normalizeMultipleMath / normalizeContainer (mermaid/flowchart/seq/vega-lite) / normalizeCodeBlock / normalizeTable / normalizeListItem / normalizeFootnote
- 列表项的 listIndent 处理（`dfm` = 4 空格；`number` = listIndentationCount 1-4 空格）
- 紧 / 松弛列表的判断用 `this.isLooseParentList` 实例变量

**关键**：这个 translator 的目标是 CommonMark / GFM 合规——参见源文件顶部的 4 行注释：

```
 * Commonmark Spec: https://spec.commonmark.org/0.29/
 * GitHub Flavored Markdown Spec: https://github.github.com/gfm/
 * Pandoc Markdown: https://pandoc.org/MANUAL.html#pandocs-markdown
```

### 7.3 exportHtml.js 的 static HTML 输出

走的是另一条路：blocks → markdown（ExportMarkdown）→ 用 Turndown / DOMPurify 反复转换最终吐出 HTML。和 StateRender 那条"实时富文本"路径完全是分开的（一个用于"无副作用地导出预览"，一个用于"实时光标 + 内嵌交互"）。

### 7.4 turndownService.js

`new TurndownService(turndownConfig)` + `usePluginAddRules(turndown, keeps)`：自定义 HTML → Markdown 的 Turndown 插件（Muya 内部 `html2State` / `htmlToMarkdown` 会用到）。`DEFAULT_TURNDOWN_CONFIG` 在 `config/index.js:170-191` 里定义：

```js
DEFAULT_TURNDOWN_CONFIG = {
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
  blankReplacement (content, node, options) {
    if (node.classList.contains('ag-soft-line-break')) return LINE_BREAK
    if (node.classList.contains('ag-hard-line-break'))   return '  ' + LINE_BREAK
    if (node.classList.contains('ag-hard-line-break-space')) return ''
    return node.isBlock ? '\n\n' : ''
  }
}
```

> soft-line-break / hard-line-break / hard-line-break-space 三类自定义 class 是为 Turndown 留的"翻译提示"——inline token 的渲染器（`renderInlines/softLineBreak.js` 等）会给对应位置打上这些 class，让 Turndown 还原成 `  \n` / `\n`。

---

## 8. exportMarkdown.js 与 importMarkdown.js 的"块级"往返：细节

| Block Tree element | Markdown 形态 |
|---|---|
| `p` | 段落文本 |
| `h1..h6` (`headingStyle=atx`) | `#`…`######` + 空格 + 内容 |
| `h1..h6` (`headingStyle=setext`) | `===` / `---` 下划线 |
| `p` with `bulletMarkerOrDelimiter='-'` | `- text` |
| `ol` with `start=3` | `3. text` |
| `figure[functionType=table]` > `table[thead,tbody]` | GFM pipe table（自动算列宽） |
| `figure[functionType=footnote]` | `[^id]: content` |
| `figure[functionType=html]` | 原始 HTML（按行输出） |
| `figure[functionType=multiplemath]` | `$$\n...\n$$\n` |
| `figure[functionType=mermaid/flowchart/seq/vega-lite]` | ```` ```mermaid ... ``` ```` |
| `pre[functionType=fencecode/indentcode]` | ```` ```lang ... ``` ```` / `    ` 缩进 |
| `pre[functionType=frontmatter]` with `lang=yaml` | `---\n...\n---\n`（toml/json 也支持） |
| `blockquote` | `> ` 前缀 |
| `task list` | `- [ ] / - [x]` |
| 表格 | 按对齐方式生成 GFM：`|:---|`、`|---:|`、`|:---:|`、`| --- |` |

> 注意：`p` 中包含子 block（多 line block）会被忽略（Muya 用 `\` + indent 处理多行段落），这是和静态 markdown 的"按行"模型之间的细微差异。

---

## 9. 渲染层 inline token 的 27 个 renderer

`_plugins/coolma-muya/lib/parser/render/renderInlines/index.js`：

```js
backlashInToken, backlash, highlight, header, link, htmlTag, hr,
tailHeader, hardLineBreak, softLineBreak, codeFense, inlineMath,
autoLink, autoLinkExtension, loadImageAsync, image, delEmStrongFac,
emoji, inlineCode, text, del, em, strong, htmlEscape, multipleMath,
referenceDefinition, htmlRuby, referenceLink, referenceImage,
superSubScript, footnoteIdentifier, echoAnno
```

每个文件都接受 `(h, cursor, block, token, outerClass)` 签名，返回 vnode / vnode 数组。几个有代表性的细节：

### 9.1 text.js

最不起眼但最常见（text token 是绝大多数字符）。直接 `h('span', token.raw)`。

### 9.2 codeFense.js / inlineCode.js

区分三引号反引号围栏、内部打 `ag-soft-line-break`、外层 `ag-multiple-math` 等。

### 9.3 echoAnno.js（v2026-07-29 修复 marker 包裹突变的细节）

```js
// _plugins/coolma-muya/lib/parser/render/renderInlines/echoAnno.js:73-130
const baseSel = `span.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`   // 静态 sel
const classModuleMap = {
  [CLASS_OR_ID.AG_GRAY]: className === CLASS_OR_ID.AG_GRAY,    // 动态 class 走 module
  [CLASS_OR_ID.AG_HIDE]: className === CLASS_OR_ID.AG_HIDE
}
return [
  h(baseSel, {
    key: echoNodeId,    // 稳定 key
    dataset,             // data-echo-* 系列
    attrs: { spellcheck: 'false', title, contenteditable: 'false', ... },
    class: classModuleMap,
    style: hostStyle
  }, isHideSelf ? [] : [
    h('span.ag-echo-placeholder-marker', { key: '__marker__', ... }, [...])
  ])
]
```

> 这是 snabbdom patch 在"selector 稳定 + key 稳定"下复用同一 outer span 的标准套路。配合 `renderInlines/echoAnno.js:44-55` 的 `dataset` 写入各种 `data-echo-name / echo-id / echo-definition-id / echo-value / echo-props-json`，让后置 renderEchoPlaceholders 能精准找到 host 并 extend（jQuery）或 new EchoRenderer（Vue）。

### 9.4 image.js / autoLink.js / htmlTag.js

每个都有"如何匹配 token 参数 → 构建 attrs"的小型 schema；其中 htmlTag 用到 `getAttributes(htmlTo[0])`（parser/utils.js 的小型 HTML 属性解析器）。

### 9.5 superSubScript / footnoteIdentifier

这两个默认不开启，由 `options.superSubScript` / `options.footnote` 在 tokenizerFac 里 if (option) 才参与。

---

## 10. 主项目侧的"宿主适配层"

### 10.1 `src/components/muya/Muya.vue` 的双重身份

```js
// 同时承担：
//   1) Vue 组件（template/生命周期/vuex/事件总线订阅）
//   2) Muya 实例化器 + 业务注入（echoRuntime / quickInsertProvider / runeRendererCtor / …）
```

注入的关键 `options`：

| option | 来源 | 用途 |
|---|---|---|
| `memoMuya` / `onRuneResize` | `Muya.vue` 自身 | renderer 把 value/size 变化回写到 Markdown |
| `echoRuntime` | `EchoRuntime(registry=this.echoRegistry)` | `renderToHtml` + `afterRender` |
| `quickInsertProvider` | 闭包返回 `{ sectionName, items, echoSectionName }` | 把 `runeCards` / `echoCards` 喂给 QuickInsert |
| `runeCards` / `echoCards` | vuex mapState | state 透传 |
| `echoRegistry` | `this.echoRegistry` | echo definition 集合（key: id / name / id:xxx） |
| `runeRendererCtor` | `RunePreviewRenderer` (Vue.extend) | `mountRuneVueHosts` 用 |
| `echoRendererCtor` | `EchoPlaceholderHost` (= EchoPreviewRenderer) | 同上 |
| `enableRuneVueRenderer: true` | 写死 | Rune 走 Vue 通道 |
| `enableEchoVueRenderer: false` | 写死 | Echo 走 jQuery renderToHtml |
| `onEchoPlaceholderCommit` | `this.updateEchoPlaceholderPayload` | Echo 点击 → 跳实例编辑器 |
| `imagePathPicker` / `imageAction` | `importImageFromLocal` / `uploadImage` | Electron 主进程的图片上传 |

### 10.2 echo / rune 的回写闭环

#### Rune 的"Vue SFC emit('input') → 写 Markdown"

```js
// src/components/muya/Muya.vue RunePreviewRenderer, props.onValueChange

// 1) SFC 内部: this.$emit('input', value)
// 2) RunePreviewRenderer 触发 on('input'), 把 value 包装成 { runeId, nodeId, value }
// 3) RunePreviewRenderer.props.onValueChange = (payload) =>
//      muya.updateRunePlaceholderValue({ runeId, nodeId, value: payload.value })
//      这是 mountRuneVueHosts 时通过 propsData 注入的：
//        const onValueChange = (payload) =>
//          muyaInstance.updateRunePlaceholderValue({ runeId, nodeId, value })
// 4) Muya.vue.updateRunePlaceholderValue:
//      - getMarkdown()
//      - rewriteRunePlaceholderByNodeId(markdown, targetNodeId, value)
//      - 按 nodeId 精准定位 <div data-rune-node-id=...>...</div> 的整段 html，
//        同步更新 data-rune-value 与 innerText（escape 一次以防注入）
//      - contentEditor.setMarkdown(nextMarkdown, cursor, false)
//      - updateContentsList + updateNoteState('changed') + dispatchChange
```

#### Echo 的"document 级 click 委托 → updateEchoPlaceholderPayload"

```js
// Muya.vue:1043-1067
const echoCaptureHandler = (event) => {
  const targetEl = event?.target
  if (!targetEl?.closest) return
  const echoTarget = targetEl.closest('[data-echo-inline="true"]')   // 锁定 echo host
  if (!echoTarget) return
  event.preventDefault()
  event.stopImmediatePropagation()                                    // 直接吞掉
  const { echoId, echoName, echoValue, echoDefinitionId } = echoTarget.dataset
  this.updateEchoPlaceholderPayload({
    echoId, echoName, value: echoValue,
    payload: encodeEchoPayload({ prompt: value, props: { id, definitionId, value } }),
    mode: 'open-instance'
  })
}
document.addEventListener('click', echoCaptureHandler, true)          // capture，最稳
```

> 为什么不挂 container？因为 Muya 内部 host 是动态 patch 的，挂 container 会随 patch 失效。document capture + `closest('[data-echo-inline="true"]')` 锁定 host 是最稳的捕获方式。

> `data-echo-inline="true"` 是 v2026-07-30 起固化的"in-token marker"标识，renderInlines/echoAnno.js:54 一律写 `'true'`。

### 10.3 setEchoAnnoRule 的两端同步

```js
// 1) settings SQL 真源 → vuex state.echoRequireParens
// 2) vuex.watch.echoRequireParens → setEchoAnnoRule + contentState.render(false, true)
// 3) setEchoAnnoRule 改 inlineRules.echo_anno 引用
// 4) 后续所有 tokenizer() 闭包拿到新 RE
// 5) 全量 render 把已解析 token 重新走一遍新规则
```

> 这是"设置 + 解析器 + 渲染器"三层贯通的关键通路——一篇文档里值得反复强调。

### 10.4 Echo Definition / Runtime 的协作（`src/components/echo/`）

> `echoCore.js`（`EchoRegistry` / `EchoRuntime` / `parseEchoProps` / `encodeEchoPayload` / `decodeEchoPayload` / `createEchoPlaceholderPayload` / `extractPrevEchoTokenValue` / `echoInheritFromPrevious` 等）是主项目的"echo 业务层"。coolma-muya 只暴露"runtime 按 echoName 找 definition → 调用 definition.render(props) / afterRender(node, props)"的统一约定（`echoRuntime.renderToHtml(token, echo)` / `echoRuntime.afterRender(root, { cleanupFirst: true })`）。具体 16+7 个 echo 的 anno_source 写法、handler 写法都住在主项目 `src/components/echo/echoBuiltins/`。

---

## 11. 与 `coolma-muya-sdk-guidelines.mdc` 8 问自检

| 问 | 当前 lib/ 是否满足 | 已识别改进点 |
|---|---|---|
| 1. SDK 在 Memocast 外能跑吗？ | ❌ | 4 个 ui/import / 6 个 ui/formatPicker 等仍 `import { i18n } from 'boot/i18n'` |
| 2. 有没有 `boot/i18n` / `src/...` / vuex / vue-router / Quasar 全局 import？ | ❌ | `parser/index.js:5` 是最严重的（`parseEchoProps from 'src/components/echo/echoCore'`） |
| 3. 有没有跨工程绝对路径？ | ❌ | 同上 |
| 4. demo-web 还能跑吗？ | ✅（demo-web 已经有 stub） | — |
| 5. 强耦合 Vue 了吗？ | 部分 | `lib/parser/render` 用 Vue 2 兼容写法（`Vue.extend` / 都不是），但短期不强制 |
| 6. 新 API 是不是只在 echo/rune 场景才有意义？ | ✅ | `echo_*` 字段、`runeRendererCtor`、`echoRendererCtor` 是显式注入，不污染主类 |
| 7. README / package.json 还能对外宣称「通用 markdown 编辑器」吗？ | ✅（主描述仍通用，但 echo/rune 注释里已提 Memocast） | — |
| 8. 这次改动是「解耦」还是「把业务逻辑搬到 lib/ 里省事」？ | — | 迁出计划：i18n → setter 注入、parseEchoProps → 内联闭包、`new Muya(opts)` 散落业务字段 → `Muya.use(EchoPlugin)` / `Muya.use(RunePlugin)` |

最关键的 P0：

1. **`parser/index.js:5`**：`import { parseEchoProps } from 'src/components/echo/echoCore'` —— 这是 lib/parser 跨工程读主项目业务模块，最严重；
2. **`ui/{imageToolbar,formatPicker,tableTools,quickInsert,frontMenu,imageSelector}/config.js:...`**：6 个文件 `import { i18n } from 'boot/i18n'` —— 需要 `Muya.useI18n(t)` setter 注入。

迁出路线见 `coolma-muya-sdk-guidelines.mdc` §6.1-6.5。

---

## 12. 其他子系统

### 12.1 selection 模块

| 文件 | 行 | 用途 |
|---|---|---|
| `selection/index.js` | ? | entry |
| `selection/dom.js` | 174 | `getTextContent`, `getOffsetOfParagraph`, `findNearestParagraph`, `findOutMostParagraph`, `isMuyaEditorElement`, `getFirstSelectableLeafNode`, `getClosestBlockContainer`, `compareParagraphsOrder` |
| `selection/cursor.js` | 47 | `Cursor` class，anchor/focus/start/end 转换 |

`compareParagraphsOrder` 用 `Node.compareDocumentPosition` 来比较 DOM 位置，速度比 walk O(log n) 更好——但仍需 DOM 已经渲染好；这就是 `setMarkdown()` 里 `setTimeout(dispatchChange, 0)` 的原因（render 异步）。

### 12.2 prism 子系统（代码高亮）

`_plugins/coolma-muya/lib/prism/loadLanguage.js` + `index.js`：

- 内置核心 language，从 `prism/languages.json` 索引
- 未知语言通过 CDN 加载（fallback）
- `loadedCache` 模块级缓存
- `transfromAliasToOrigin` 把 `vue` / `js` 这种简写映射到 `markup` + `javascript`

### 12.3 renderers 子系统（外部异步渲染器）

`_plugins/coolma-muya/lib/renderers/index.js`：

```js
const loadRenderer = async (name) => {
  if (!rendererCache.has(name)) {
    let m
    switch (name) {
      case 'sequence':    m = await import('../parser/render/sequence'); break
      case 'flowchart':   m = await import('flowchart.js'); break
      case 'mermaid':     m = await import('mermaid/dist/mermaid.esm.min.mjs'); break
      case 'vega-lite':   m = await import('vega-embed'); break
    }
    rendererCache.set(name, m.default)
  }
  return rendererCache.get(name)
}
```

> 动态 import 减少首屏 bundle 体积；mermaid 自身 ~1MB，必须异步。

---

## 13. 自检：如果我是维护者，改动前要看什么

1. **你修改的代码在哪个子系统？**
    - `lib/index.js` / `lib/config/` / `lib/parser/` / `lib/contentState/` → 改模型/契约；
    - `lib/parser/render/` / `lib/ui/` → 改渲染/交互；
    - `lib/utils/` → 改无状态工具；
    - `lib/eventHandler/` → 改路由；
    - **`lib/eventHandler/event.js` / `lib/contentState/history.js` → 改基础设施**。
2. **是否动到 `inlineRules.echo_anno`？** 必须用 `setEchoAnnoRule` 而不是覆盖字面量。
3. **是否动到 tokenCache？** 没有 LRU cap，长跑会内存增长。
4. **是否动到 `Muya.use()` 注册点？** UI 子系统初始化顺序由 `new Muya()` 内部循环，不能放在 use 之前。
5. **是否动到 sentinel `CURSOR_ANCHOR_DNA` / `CURSOR_FOCUS_DNA`？** 是 `getUniqueId()` 的长字符串，必须保持 long unique 才能无损。
6. **是否动到 Snabbdom 模块配置？** 改了 class module 就直接破坏 cursor 闪烁体验。

---

## 14. 设计取舍一览（"为什么"层）

| 设计 | 为什么 | 牺牲了什么 |
|---|---|---|
| Block Tree 可变指针 | 编辑器需要高频"在 DOM 双向链里穿梭" | undo 必须 deepCopy |
| tokenizerFac 而非 immutable AST | 编辑场景下"重新 parse 一段 span"成本必须低 | undo 必须重新 tokenize 才能 diff |
| Snabbdom 而非虚拟 DOM 框架 | Vue 的 patch 粒度太大，编辑场景要 key-level 精确控制 | 学习曲线 |
| 通过 plugins 注入 UI | UI 可独立装载 / 替换 / 禁用（Echo 默认不开 Vue renderer） | 启动顺序敏感 |
| 共享 inlineRules 引用 | 给 SDK 一个"运行时切换规则"的统一入口 | 调用方有责任触发重 render |
| inline parse 与 block parse 分离 | 块级稳定，行内常变 → 两层 cache | 已经发现：tokenCache 无 LRU 限 |
| DOM 是渲染 + 副作用层 | 让 model/Markdown 永远是 source of truth | DOM、Block、Token 三方同步成本高 |
| `data-echo-inline="true"` 标识 | document 级 capture 不需 hover container 直接命中 | 内联 echo 占位符必须保住这个属性 |
| Echo 默认不开 Vue renderer | `renderToHtml` 直接写 host.innerHTML；Vue renderer 会清空特效 | 一些列扩展性受限于 jQuery |
| `noHistory` 标志 | undo/redo 不污染自身 history 栈 | 任何手动 push history 必须显式 noHistory |

---

## 15. 升级方向（不是 roadmap，是可能性）

1. **`tokenCache` 加 LRU**：把 `STATE.TOKEN_CACHE_MAX` 暴露为 options，长跑 + 大文档时内存可控。
2. **`compile()` 类方式增量 tokenize**：当前每次 renderLeafBlock 都重新 tokenize；能用 `start/end` 区间增量。
3. **拆 SDK**：把 `coolma-muya` 拆为：
    - `coolma-muya-core`：通用 markdown 编辑器
    - `coolma-muya-echo-plugin`：echo 占位符 + runtime plugin
    - `coolma-muya-rune-plugin`：rune 占位符 + Vue SFC plugin
4. **i18n 解耦**（P0）：6 个文件的 `import { i18n } from 'boot/i18n'` 改 setter 注入。
5. **`parser/index.js:5 parseEchoProps`** 收回到 lib/ 内部（inline 闭包版本）。
6. **`new Muya(opts)` 业务字段收口**（P1）：业务 fields → `Muya.use(EchoPlugin, {...})` / `Muya.use(RunePlugin, {...})`。
7. **ContentState.prototype.cursor setter 沉到 History**：事务化更明确，避免 timeout-based 合并的边界。
8. **echoAnno.js 的 `dataset.echoPropsJson` 简化**：直接用 spread props，不二次 JSON 序列化。
9. **`data-echo-inline="true"` / `data-echo-mount="true"` 命名空间统一**：当前为 inline 标识 vs placeholder 标识用了 `data-echo-inline` / `data-echo-mounted` 两套，可统一前缀。

---

## 16. 阅读顺序（从总到分）

1. `_plugins/coolma-muya/lib/index.js` —— Muya 类 → 弄清"整个 Muya 长什么样"。
2. `_plugins/coolma-muya/lib/eventHandler/event.js` —— EventCenter → 弄清"事件总线怎么走"。
3. `_plugins/coolma-muya/lib/contentState/index.js` —— Block Tree + cursor setter → 弄清"数据模型长什么样"。
4. `_plugins/coolma-muya/lib/contentState/history.js` —— History → 弄清"撤销栈存什么"。
5. `_plugins/coolma-muya/lib/parser/index.js` + `lib/parser/rules.js` —— tokenizer → 弄清"Markdown 怎么变 token"。
6. `_plugins/coolma-muya/lib/parser/render/index.js` + `lib/parser/render/renderBlock/renderLeafBlock.js` + `lib/parser/render/renderBlock/renderContainerBlock.js` —— StateRender → 弄清"token 怎么变 DOM"。
7. `_plugins/coolma-muya/lib/parser/render/renderInlines/echoAnno.js` + `lib/parser/render/snabbdom.js` —— inline echo token 在 snabbdom 下的细节。
8. `_plugins/coolma-muya/lib/contentState/inputCtrl.js` + `enterCtrl.js` + `backspaceCtrl.js` —— 看一两个 ctrl，感受"事件→ctrl→mutate→render"的闭环。
9. `_plugins/coolma-muya/lib/ui/quickInsert/index.js` —— UI subsystem 的代表，看懂 baseFloat → UI 子类 → 拿到外部 resources（rune cards/echo cards）。
10. `_plugins/coolma-muya/lib/utils/importMarkdown.js` + `lib/utils/exportMarkdown.js` —— 弄清"块级 Markdown 互转"。
11. `src/components/muya/Muya.vue` + `src/components/muya/runeSfcRendererFactory.js` —— 看 Muya 是怎么把 SDK 用成产线编辑器的，以及 Rune Vue SFC 编译是怎么样的。
12. `src/components/echo/echoCore.js` + `src/components/echo/echoBuiltins/` —— 看 Echo runtime 与 definition 的契约。

---

## 17. 附录：路径速查

### lib/ 内（绝对路径全部以 `E:/work-coolma/coolma/_plugins/coolma-muya/` 为前缀）

- `lib/index.js`
- `lib/config/index.js` · `lib/config/imageConfig.js`
- `lib/eventHandler/event.js` · `lib/eventHandler/keyboard.js` · `lib/eventHandler/mouseEvent.js` · `lib/eventHandler/clipboard.js` · `lib/eventHandler/dragDrop.js` · `lib/eventHandler/clickEvent.js` · `lib/eventHandler/resize.js`
- `lib/contentState/index.js` · `lib/contentState/{core,history}.js` · `lib/contentState/{inputCtrl,enterCtrl,backspaceCtrl,deleteCtrl,clickCtrl,arrowCtrl,tabCtrl,pasteCtrl,copyCutCtrl,paragraphCtrl,formatCtrl,searchCtrl,containerCtrl,htmlBlock,tocCtrl,emojiCtrl,imageCtrl,linkCtrl,dragDropCtrl,footnoteCtrl,codeBlockCtrl,tableBlockCtrl,tableDragBarCtrl,tableSelectCellsCtrl,updateCtrl}.js`
- `lib/parser/index.js` · `lib/parser/rules.js` · `lib/parser/utils.js` · `lib/parser/escapeCharacter.js`
- `lib/parser/marked/{lexer,parser,renderer,textRenderer,inlineLexer,inlineRules,blockRules,options,slugger,utils,index}.js`
- `lib/parser/render/index.js` · `lib/parser/render/{snabbdom,sequence}.js`
- `lib/parser/render/renderBlock/{renderBlock,renderLeafBlock,renderContainerBlock,renderContainerEditIcon,renderCopyButton,renderFootnoteJump,renderIcon,renderToolBar,renderLineNumber,renderTableDargBar}.js`
- `lib/parser/render/renderInlines/index.js` 和 27 个 renderer：`autoLink, autoLinkExtension, backlash, backlashInToken, codeFense, del, delEmStringFactory, echoAnno, em, emoji, footnoteIdentifier, hardLineBreak, header, highlight, hr, htmlEscape, htmlRuby, htmlTag, image, inlineCode, inlineMath, link, loadImageAsync, multipleMath, referenceDefinition, referenceImage, referenceLink, softLineBreak, strong, superSubScript, tailHeader, text`
- `lib/selection/{index,cursor,dom}.js`
- `lib/ui/{baseFloat,baseScrollFloat,tooltip,tablePicker,quickInsert,codePicker,emojiPicker,imagePicker,imageSelector,imageToolbar,formatPicker,frontMenu,linkTools,tableTools,transformer,fileIcons,emojis,footnoteTool}/...`
- `lib/utils/{index,domManipulate,dompurify,exportHtml,exportMarkdown,getImageInfo,getLinkInfo,getParentCheckBox,importMarkdown,turndownService,cumputeCheckBoxStatus,resizeCodeLineNumber}.js`
- `lib/prism/{index,loadLanguage}.js` · `lib/renderers/index.js` · `lib/assets/...`

### 主项目侧

- `src/components/muya/Muya.vue`（1500+ 行宿主适配层）
- `src/components/muya/runeSfcRendererFactory.js` · `runeTransformer.js`
- `src/components/echo/echoCore.js` · `echoBuiltins/` · `echoFormDialog.vue` · `echoInstanceDialog.vue`
- `src/components/rune/runeFormDialog.vue` · `runeCard.vue` · `runeTemplates/`
- `src/utils/DatabaseClient.js`（`app_state` 表读写 `setting/...`）
- `_plugins/coolma-muya/lib/{config,parser,contentState}` 是 SDK 边界内的修改；其他都在主项目侧。

---

## 18. 一句话总结 v2

> coolma-muya 通过**可变 Block Tree + 共享 inlineRules 引用 + Snabbdom patch + 27 个 ctrl 分文件挂载**，把"Markdown 编辑即所见即所得"拆成"模型 / 解析 / 渲染 / 事件 / 浮层"五层独立可替换的子系统；
> 主项目 `src/components/muya/Muya.vue` 用 `new Muya(container, options)` 把 Vue 2 + jQuery + form-create + KaTeX + Echo Runtime + Rune Vue SFC 编译 + 笔记 Vuex 全部串成一条链；
> `setEchoAnnoRule` 这条规则 mutate 入口、靠 SQLite 持久化的 `setting/parsing/*` 配置、vuex 一层缓存、`contentState.render(false, true)` 一次全量渲染重切，是"配置 → 模型 → 渲染"贯通的代表案例。

