# Memocast 博客符文/回响实现方案（VuePress 1.x 端）

> 项目：Memocast (coolma)
> 创建：2026-07-17
> 状态：**设计稿**，未启动编码
> 范围：在导出到 VuePress 1.x 博客的 `_posts/<id>.md` 里，把 Muya 已有的 `@name{attrs}(id)` 行内语法（`echo_anno`）和 rune 占位符语法**重现为可阅读、可点击、留出副作用扩展口的运行时**。
> 强约束：**0 新依赖**（不引入 markdown-it 之外的东西；vuepress 1.x 自带 markdown-it 与 lodash）。
> 主项目（coolma/Memocast）与博客导出目录是**两个独立 npm 项目**，不要在主项目 `package.json` 加任何东西。

---

## 0. 三句话总结

1. **Muya 端的语法已经跨平台可移植** —— `@name{attrs}(id)` 与 rune 占位符都已经是字符串级标记，markdown-it 直接能解析。我们**复用 Muya 端已定义的语法子集**，不重新发明。
2. **第一阶段只读 + frontmatter 数据预注入 + markdown-it 构建期处理** —— 这是 0 新依赖下最快、最稳的实现路径。回响"长成卡片的样子"在构建期就用 `md.renderer.rules` 输出；点击交互**留 hook**但不实装。
3. **第二阶段用 Vue.extend + jQuery 副作用渲染扩展** —— 当用户要求"运行时再算一些东西"（比如根据浏览时间染色、根据当前日期派发节气回响），把构建期 renderer 降级为"输出占位 DOM + 自定义 data-attr"，在博客主题 entry 之前注入一段 jQuery 启动脚本即可。**这是兜底，不阻塞第一阶段**。

---

## 1. 目标 / 非目标 / 不变量

### 1.1 目标（第一阶段）

| # | 目标 | 验收 |
|---|------|------|
| G1 | 导出的 `_posts/<id>.md` 里如果包含 `@lucky{...}(note:xxx)`，在博客页面里渲染为一张"强运"卡片（图标 + 标题 + 引用的笔记摘要） | 卡片可在 `vuepress dev` 中看到，颜色 / 形状与 Memocast 编辑器内**视觉一致**（不需要逐像素对齐） |
| G2 | 导出的 markdown 里如果包含 `{{rune:calc}}{ ... }` 这类 rune 占位符（与 Muya `data-rune-name` 等价的行内语法），渲染为静态卡片 | 卡片显示 rune 名称 + 缩略值；值可通过 frontmatter 注入替换 |
| G3 | 博客端不引入新 npm 依赖 | `blogDir/package.json` 不增 `dependencies` / `devDependencies` 字段 |
| G4 | 与现有 `blog-deploy-handler.js` 流水线无破坏性变更 | 新逻辑全部塞在 `.vuepress/utils/` 下的**新文件** + `blog-config-writer.js` 单一开关位 |
| G5 | 留出"将来升级到可点击 / 副作用"的口子 | 占位 DOM 上挂 `data-rune-action` / `data-echo-action` 属性 + 集中 dispatch 表 |

### 1.2 非目标（明确不做）

- ❌ 不在博客端实装完整 AI / Streaming / IPC。回响的"AI 计算"全部**在主项目导出时预计算**，博客只展示快照。
- ❌ 不实装"运行时根据浏览历史/设备动态改变回响"。那是 §9 扩展点，本期不写。
- ❌ 不在博客目录装 VuePress V2 或换主题。沿用现有 default/vdoing/hope/reco 四套主题。
- ❌ 不重写 `buildSidebar / buildNav / verify-paths`。只在它们旁边新增 `runeEchoRenderer.js` 一个新 builder。
- ❌ 不动 `RuneFormDialog.vue` / `RuneTemplateService.js` 等主项目代码。

### 1.3 永久不变量（不可破）

- **permalink 仍是 `/<id>.html` 平铺**——与 `TODO-vuepress博客打包部署优化-2026.md` §3.1 一致，不嵌套。
- **`buildFrontmatter` 字段名不与 rune/echo 数据冲突**——所有预注入数据放 `runes:` / `echoes:` 两个**数组**字段下。
- **VuePress 1.x 主题代码不被改**——所有逻辑落在 `.vuepress/utils/*.js` + `.vuepress/enhanceApp.js`（或者 `theme/enhanceApp.js`，看主题形态）。
- **博客目录的 `package.json` 依赖不变**。

---

## 2. 总体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│ 主项目 (coolma/Memocast)                                              │
│                                                                      │
│  笔记 SQLite ──► BlogDeployService.writeBlogPosts                    │
│                       │                                              │
│                       ├── 解析 echo_anno: @name{attrs}(id)            │
│                       ├── 解析 rune:   {{rune:name}}{attrs}           │
│                       │                                              │
│                       ├── 收集本篇引用的 rune/echo 定义 + 上下文       │
│                       │   (RuneTemplateService + builtinEchoes.js)    │
│                       │                                              │
│                       ▼                                              │
│              buildFrontmatter({                                       │
│                ...现有的 title/categories/date/...,                  │
│                runes: [{ name, attrs, value }],                      │
│                echoes: [{ name, id, attrs, payload }],                │
│              })                                                       │
│                       │                                              │
│                       ▼                                              │
│              _posts/<id>.md   (frontmatter 含 runes/echoes 数组)       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  （物理 export 到 blogDir）
┌──────────────────────────────────────────────────────────────────────┐
│ 博客项目（独立 npm）                                                  │
│                                                                      │
│  .vuepress/utils/                                                    │
│    ├── sidebar-builder.js   (已存在)                                  │
│    ├── nav-builder.js       (已存在)                                  │
│    ├── verify-paths.js      (已存在)                                  │
│    └── runeEchoRenderer.js  (新增)                                    │
│                                                                      │
│  .vuepress/                                                          │
│    ├── config.js             (buildNav / buildSidebar 内联调用)       │
│    └── enhanceApp.js         (新增; 或主题对应文件)                   │
│                                                                      │
│  每个 _posts/<id>.md 在 vuepress 构建期被 markdown-it 解析:           │
│                                                                      │
│  md.renderer.rules.echo_anno = function (...args) {                   │
│    // 取出 @name{attrs}(id) 三个分组                                 │
│    // 在 frontmatter.echoes[] 里找 payload                            │
│    // 返回 HTML 字符串                                                │
│  }                                                                    │
│                                                                      │
│  md.renderer.rules.rune_block = function (...args) {                  │
│    // 取出 {{rune:name}}{attrs}                                       │
│    // 在 frontmatter.runes[] 里找 value                                │
│    // 返回 HTML 字符串                                                │
│  }                                                                    │
│                                                                      │
│  markdown-it-attrs 之类 → 不需要，自实现正则分组                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**关键决策**：**第一阶段所有渲染都在 markdown-it 的 renderer rules 里完成**（构建期），不需要运行时 jQuery 介入。这给 G5 的扩展留了一个清晰的"降级路径"（见 §6）。

---

## 3. 与 Muya 端的语法对齐（直接复用）

Muya 端的 `parser/rules.js` 已经定义了：

```js
echo_anno: /^@([^\s\{\(\)@]+)?(?:\{([\s\S]*?)\})?\(([\s\S]*?)\)\$/,
```

含义：
- `@<name>` 必需（`lucky` / `nice` / `__builtin_lucky__` 等）
- `{<attrs>}` 可选，键值对字符串
- `(<id>)` 可选，引用目标（`note:xxx` / `rune:xxx` / `image:xxx` 等）

Muya 端的 rune 占位符在 `parser/render/renderBlock/renderLeafBlock.js` 里以 `[data-rune-name][data-rune-id][data-rune-node-id]` 属性节点形式出现，由 `mountRuneVueHosts` 二次渲染。我们**反推其文本形式**为：

```markdown
{{rune:calc}} 输入: a + b = ?
```

与 `echo_anno` 共用同一份 `name{attrs}(id)` 三元组即可。

> **对齐原则**：博客端支持的语法**严格是 Muya 子集**，不做反向扩展。如果以后 Muya 端加入新语法，**先在 Muya 端实现，博客端再同步**。在 TODO-总览 §2.2 已明确"反链 UI 仍未做、双链待启动"——博客端不要替 Muya 端做超集。

---

## 4. 数据流分两段

### 4.1 导出段（主项目侧，写入 `_posts/<id>.md` 的 frontmatter）

| 步骤 | 在哪里做 | 输出 |
|------|---------|------|
| 扫描笔记 markdown 文本里的 `@...` 和 `{{rune:...}}` | `BlogDeployService.writeBlogPosts` 内**新增** `extractEchoAndRuneTokens(md)` | `[{name, attrs, id, type:'echo'\|'rune', range}]` |
| 从 `runes` 表 / `echoes` 表查定义 + 收集上下文（被引用笔记的摘要 / 标签） | 复用 `RuneTemplateService` + `builtinEchoes.js` | `{ echoCards: {id: {title, color, icon, summary}}, runeCards: {name: {title, defaultValue, color, icon}} }` |
| 生成 frontmatter `runes[]` / `echoes[]` | 复用现有 `buildFrontmatter`，**新增两个 key** | frontmatter JSON |

### 4.2 构建段（博客目录侧，markdown-it 渲染期）

| 步骤 | 在哪里做 | 输出 |
|------|---------|------|
| 注册自定义 renderer | `runeEchoRenderer.js` 导出 `install(md, opts)` | md 实例增强 |
| `opts.frontmatter` 由 `config.js` 注入 | `config.js` 调用 `install(md, ...)` | 渲染时拿到 `page.frontmatter.runes/echoes` |
| 解析 `@name{attrs}(id)` → 输出 `<span class="ag-echo ag-echo--lucky" data-echo-id="..." data-echo-action="lucky-click">…</span>` | `md.renderer.rules.echo_anno` | HTML 字符串 |
| 解析 `{{rune:name}}{attrs}` → 输出 `<span class="ag-rune ag-rune--calc" data-rune-name="calc" data-rune-action="rune-click">…</span>` | `md.renderer.rules.rune_block` | HTML 字符串 |

> **没有运行时介入时**，博客主题只需加载一个 CSS 文件给 `.ag-echo` / `.ag-rune` 套样式即可（CSS 可由 `BlogDeployService.writeBlogPosts` 一并写到 `.vuepress/public/styles/rune-echo.css`，或写到主题的 `styles/` 下；具体路径随主题形态变化，见 §5.4）。

---

## 5. 构建期方案（第一阶段，详细）

### 5.1 新增文件清单

| 文件 | 位置（主项目源） | 写入路径（博客目录） | 角色 |
|------|----------------|----------------------|------|
| 模板字符串常量 | `src/services/BlogDeployService.js` 内新增 `RUNE_ECHO_RENDERER_SRC` | 写到 `.vuepress/utils/runeEchoRenderer.js` | markdown-it 渲染插件 |
| 模板字符串常量 | `src/services/BlogDeployService.js` 内新增 `RUNE_ECHO_CSS_SRC` | 写到 `.vuepress/public/styles/rune-echo.css` | 卡片样式 |
| 写入函数 | `src/services/BlogDeployService.js` 内新增 `writeRuneEchoAssets(blogDir)` | 同上 | 主流程 |
| 主流程开关 | `src-electron/main-process/service/blog-config-writer.js` `writeBlogUtilities` 增加新分支 | 同上 | 与现有 builder 并列 |
| 主流程开关 | `src-electron/main-process/service/blog-config-writer.js` `blog-deploy-handler.js:execBlogBuild` 在 `runBuilders` 前调用 | 同上 | 执行写盘 |

> **不在主项目新增文件**——所有模板常量都追加到 `BlogDeployService.js`（它已经是"模板字符串仓库"），调用入口追加到 `blog-config-writer.js`（它已经是"统一写入器"）。

### 5.2 `runeEchoRenderer.js` 的代码骨架

```js
// 由 BlogDeployService.RUNE_ECHO_RENDERER_SRC 内联生成
// 写入 .vuepress/utils/runeEchoRenderer.js
const path = require('path')
const fs = require('fs')

const ECHO_REGEX = /^@([^\s\{\(\)@]+)?(?:\{([\s\S]*?)\})?\(([\s\S]*?)\)\$/
const RUNE_REGEX = /^\{\{rune:([a-zA-Z0-9_-]+)\}\}(?:\{([\s\S]*?)\})?/

function loadFrontmatterCache (pagePath, memocastRoot) {
  // 在博客构建期从 memocast 导出时落盘的 .vuepress/echo-cache.json 读
  // 文件结构: { '<page-path>': { echoes: [...], runes: [...] } }
  // 第一阶段先尝试读这个缓存文件; 读不到则跳过自定义渲染 (回退到原文)
  const cachePath = path.join(memocastRoot, '.vuepress', 'echo-cache.json')
  if (!fs.existsSync(cachePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  } catch (_) {
    return {}
  }
}

function renderEcho (name, attrs, id, ctx) {
  const card = ctx.echoes && ctx.echoes.find(c => c.name === name) || null
  const title = (card && card.title) || name
  const color = (card && card.color) || '#6b7280'
  const icon = (card && card.icon) || '✦'
  const summary = (card && card.summary) || ''
  return `<span class="ag-echo ag-echo--${name}" data-echo-name="${name}" data-echo-id="${id || ''}" data-echo-action="echo-click" style="border-left:3px solid ${color}"><span class="ag-echo__icon">${icon}</span><span class="ag-echo__title">${title}</span>${summary ? `<span class="ag-echo__summary">${summary}</span>` : ''}</span>`
}

function renderRune (name, attrs, ctx) {
  const card = ctx.runes && ctx.runes.find(c => c.name === name) || null
  const title = (card && card.title) || name
  const value = (card && card.value) || ''
  const color = (card && card.color) || '#3b82f6'
  return `<span class="ag-rune ag-rune--${name}" data-rune-name="${name}" data-rune-action="rune-click" style="border:1px dashed ${color}"><span class="ag-rune__title">${title}</span>${value ? `<span class="ag-rune__value">${value}</span>` : ''}</span>`
}

function install (md, opts = {}) {
  const cache = opts.cache || {}

  // 替换 inline token 的 renderer
  md.renderer.rules.echo_anno = function (tokens, idx, options, env, slf) {
    const token = tokens[idx]
    const m = ECHO_REGEX.exec(token.content)
    if (!m) return slf.renderToken(tokens, idx, options)
    const [, name, attrs, id] = m
    const pageKey = (env && env.page && env.page.relativePath) || ''
    const ctx = cache[pageKey] || { echoes: [], runes: [] }
    return renderEcho(name, attrs, id, ctx)
  }

  // 注册新的 inline rule
  md.inline.ruler.after('emphasis', 'rune_block', function (state, silent) {
    const start = state.pos
    const src = state.src.slice(start)
    const m = RUNE_REGEX.exec(src)
    if (!m) return false
    if (silent) return true
    const [, name, attrs] = m
    const token = state.push('rune_block', '', 0)
    token.content = `@${name}${attrs ? `{${attrs}}` : ''}`   // 复用 echo_anno 内容形态
    state.pos += m[0].length
    return true
  })

  md.renderer.rules.rune_block = function (tokens, idx, options, env, slf) {
    const token = tokens[idx]
    const m = ECHO_REGEX.exec(token.content)
    if (!m) return slf.renderToken(tokens, idx, options)
    const [, name, attrs] = m
    const pageKey = (env && env.page && env.page.relativePath) || ''
    const ctx = cache[pageKey] || { echoes: [], runes: [] }
    return renderRune(name, attrs, ctx)
  }
}

module.exports = { install, ECHO_REGEX, RUNE_REGEX }
```

> **不引入 markdown-it-attrs**：attrs 解析自实现，足够第一阶段使用。
> **不引入 lodash**：模板常量里只用数组 `find`，原生即可。

### 5.3 `config.js` 集成

在 `writeVuepressConfig` 生成的 `config.js` 末尾追加：

```js
// === rune/echo renderer ===
const { install: installRuneEcho } = require('./utils/runeEchoRenderer')
const echoCache = require('./echo-cache.json')   // 第二阶段才用; 第一阶段文件可空
module.exports.markdown = {
  extendMarkdown (md) {
    installRuneEcho(md, { cache: echoCache })
  }
}
```

> VuePress 1.x 的 `markdown.extendMarkdown` 是官方 hook（见 VuePress 1.x `siteConfig.markdown`），**主题不影响**。

### 5.4 CSS 注入策略

| 主题 | 注入方式 |
|------|---------|
| `default` | `head` 数组加 `[{ link: '/styles/rune-echo.css' }]` |
| `vdoing` | 同上（vdoing 内部用 default 风格的 head） |
| `hope` | `themeConfig.head` 或 `head` 选项（hope v1 支持） |
| `reco` | `themeConfig.head` |

**实现**：在 `writeVuepressConfig` 内追加 `head: ['<link rel="stylesheet" href="/styles/rune-echo.css">']`，并由 `writeBlogUtilities` 把 `rune-echo.css` 写到 `.vuepress/public/styles/`。

> **不依赖主题**：CSS 是公开静态资源，由 vuepress 默认静态服务托管。

### 5.5 CSS 形态（最小可用）

```css
.ag-echo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  margin: 0 2px;
  border-radius: 4px;
  font-size: 0.9em;
  background: rgba(107, 114, 128, 0.08);
  cursor: default;            /* 第一阶段不可点击; 改 cursor 让用户感知 */
}
.ag-echo__icon { font-size: 1.1em; }
.ag-echo__title { font-weight: 600; }
.ag-echo__summary {
  color: #6b7280;
  margin-left: 4px;
  font-size: 0.85em;
}
.ag-rune {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 3px;
  font-family: 'Fira Code', monospace;
  font-size: 0.85em;
  background: rgba(59, 130, 246, 0.06);
}
.ag-rune__title { color: #3b82f6; font-weight: 600; }
.ag-rune__value { color: #374151; }
```

> CSS 是**常量字符串**写进 `BlogDeployService.RUNE_ECHO_CSS_SRC`，与现有 `SIDEBAR_BUILDER_SRC` 同模式管理。

---

## 6. 副作用渲染（第二阶段，运行时扩展）

> 本节是**扩展点**，**不**在第一阶段实装，但占位 DOM 上**已经留好 `data-*-action` 属性**。

### 6.1 触发条件

当满足以下任一条件时，进入第二阶段：

1. 用户在博客上**点击回响卡片**——目前 `cursor: default`，用户会反馈"点了没反应"。
2. 用户希望根据**浏览时长** / **访问时间**触发回响（比如"深夜浏览自动亮起招灾"）。
3. 用户希望接入**浏览端 AI**（例如让 AI 根据已读文章摘要生成回响）。

### 6.2 实现路径：jQuery + Vue.extend 副作用渲染

**为什么用 Vue.extend + jQuery**：
- VuePress 1.x 主题是 Vue 2 单页应用；`window.Vue` 在主题入口已暴露（vuepress 1.x 默认主题布局组件就是 `Vue.extend` 注册的）。我们**复用**这份 Vue，不引入新依赖。
- jQuery 在博客**目前没有依赖**，但可走 CDN inline script（**不写到 package.json**）或者**完全不用 jQuery**——见 6.4。

### 6.3 三种渲染通道对比

| 通道 | 何时用 | 优点 | 缺点 |
|------|--------|------|------|
| **A. markdown-it renderer（构建期）** | 内容**确定**的回响（卡牌颜色 / 摘要 / 引用笔记列表） | 0 运行时开销，SEO 友好 | 不支持运行时改变 |
| **B. Vue.extend（运行时）** | 内容**需要交互**的回响（点击展开 / 计算器 / 表单） | 真正的 Vue 组件能力 | 需要博客主题注入 mount point |
| **C. jQuery DOM 操作（运行时副作用）** | 内容**只动样式 / 文案**的回响（高亮 / 着色 / 文本替换） | 不依赖 Vue 主题加载顺序 | 难以维护状态 |

**建议策略**：第一阶段走 A；第二阶段按回响类型**分流**——
- "卡片型 / 摘要型 / 计算器型"（lucky, nice, growth）→ B
- "染色型 / 时间型 / 动画型"（calamity, clock, shatter）→ C

### 6.4 jQuery 引入策略（**0 新依赖**的折中）

**反对意见**：博客目录 `package.json` 不能加 `dependencies.jquery`。

**解决**：
1. **不走 npm** —— 在博客导出时，由 `BlogDeployService.writeRuneEchoAssets` 把 jQuery 3.7.1 minified 字符串（约 87KB）**直接写到** `.vuepress/public/js/jquery-3.7.1.min.js`，再在 `config.js.head` 加 `<script src="/js/jquery-3.7.1.min.js"></script>`。
2. **CDN 兜底** —— `head` 写成 `<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" crossorigin="anonymous"></script>`。优先本地，CDN 失败也能跑。
3. **不强求 jQuery** —— 通道 C 的所有副作用都可用原生 `document.querySelectorAll + classList + setInterval` 实现；jQuery 只是**写法便利**。所以严格说**连 jQuery 都不用内置**，运行时脚本 100% 原生 JS 即可。

**最终建议**：第二阶段实际编码时，**首选原生 JS**；只有在维护老代码 / 跨浏览器兼容遇到坑时才走 jQuery CDN 兜底。

### 6.5 Vue.extend 副作用渲染模板

```js
// 由 BlogDeployService.RUNE_ECHO_VUE_RUNTIME_SRC 写出
// 文件路径: .vuepress/public/js/rune-echo-runtime.js
(function () {
  if (typeof window.Vue === 'undefined') return
  const Vue = window.Vue
  const EchoClickable = Vue.extend({
    props: ['name', 'id', 'title'],
    data: () => ({ open: false }),
    template: `
      <span class="ag-echo ag-echo--clickable" :style="style" @click="open = !open">
        <span class="ag-echo__icon">✦</span>
        <span class="ag-echo__title">{{ title }}</span>
        <span class="ag-echo__panel" v-if="open">
          <slot></slot>
        </span>
      </span>
    `,
    computed: {
      style () {
        return { borderLeft: '3px solid ' + (this.color || '#6b7280') }
      }
    }
  })

  function mountAll () {
    document.querySelectorAll('[data-echo-action="echo-click"]').forEach(el => {
      if (el.__vueMounted) return
      el.__vueMounted = true
      const inst = new EchoClickable({
        propsData: {
          name: el.dataset.echoName,
          id: el.dataset.echoId,
          title: el.querySelector('.ag-echo__title').textContent
        }
      })
      inst.$mount(el)
    })
  }
  if (document.readyState !== 'loading') mountAll()
  else document.addEventListener('DOMContentLoaded', mountAll)
})()
```

注入方式：`config.js.head` 末尾追加 `<script defer src="/js/rune-echo-runtime.js"></script>`。**完全无构建工具介入**，纯静态脚本。

---

## 7. 数据导出策略（frontmatter 注入）

### 7.1 哪些字段需要从主项目传到博客

| 字段 | 来源 | 形态 |
|------|------|------|
| `runes[]` | `RuneTemplateService.listRunes()` + 本篇 markdown 里出现的 rune 名 | `[{name, title, color, icon, value}]` |
| `echoes[]` | `builtinEchoes.js` + 用户自定义 echo + 本篇 markdown 里出现的 echo 名 | `[{name, id, title, color, icon, summary, refs: [...]}]` |
| `runeRefs[]` | 本篇引用的其他笔记（双链 + 回响里的 `note:xxx`） | `[{id, title, summary, tags}]` —— 用于回响摘要 |

### 7.2 与现有 `buildFrontmatter` 的耦合

`buildFrontmatter`（`src/services/BlogDeployService.js`）当前输出形如：

```yaml
---
title: 前端入门
date: 2026-07-15
categories: [技术]
permalink: /aaaa.html
---
```

**改造点**：
- 不破坏现有字段
- 末尾新增两个 key（数组）：

```yaml
runes:
  - name: calc
    title: 计算器
    color: '#3b82f6'
    icon: '🧮'
    value: 'a + b'
echoes:
  - name: lucky
    id: 'note:bbbb'
    title: 强运
    color: '#f59e0b'
    icon: '🍀'
    summary: '摘要由 SyncService 抓取最近修改的笔记...'
    refs:
      - id: bbbb
        title: 引用笔记标题
        summary: '...'
```

### 7.3 数据从哪儿来（调用清单）

| 字段 | 复用现有接口 | 文件 |
|------|-------------|------|
| 当前笔记的 rune/echo 文本提取 | 新增 `extractEchoAndRuneTokens(mdText)` 函数 | `src/services/BlogDeployService.js` |
| rune 定义（颜色/图标/默认值） | 复用 `RuneTemplateService.listRunes()` | `src/services/RuneTemplateService.js` |
| echo 定义 | 复用 `store/client/actions.js:loadEchoes` 的输出形态 | `src/store/client/actions.js` |
| 被引用笔记的摘要 | 复用 `DatabaseClient.getNoteSummary(id)` 或新增 | `src/utils/DatabaseClient.js` |

> **优先级**：第一阶段只取 echo / rune 的"展示用元数据"（标题 / 颜色 / 图标 / 摘要）。**不**取 AI 生成内容、不取实时计算结果。

### 7.4 数据同步点

`extractEchoAndRuneTokens` 在 `BlogDeployService.writeBlogPosts` 中**每一次**导出都重跑（已经是同步 IO），不会引入新瓶颈。

如果一篇笔记没有 rune/echo，frontmatter 的两个 key 仍然是空数组 `[]`（保持结构稳定，避免 vuepress 解析时 `undefined`）。

---

## 8. 与现有 blog-deploy-handler / config-writer 的耦合点

### 8.1 必须改的现有文件

| 文件 | 改动 | 行数估计 |
|------|------|---------|
| `src/services/BlogDeployService.js` | 新增 `RUNE_ECHO_RENDERER_SRC` / `RUNE_ECHO_CSS_SRC` / `RUNE_ECHO_RUNTIME_SRC` 三个字符串常量；`buildFrontmatter` 末尾追加 `runes` / `echoes` / `runeRefs`；新增 `extractEchoAndRuneTokens` / `collectEchoAndRuneContext` / `writeRuneEchoAssets` 三个函数 | +200 行 |
| `src-electron/main-process/service/blog-config-writer.js` | `writeBlogUtilities` 增加 rune/echo 资产分支；`writeVuepressConfig` 增加 `markdown.extendMarkdown` 与 `head` 注入；`echo-cache.json` 同步写入 | +60 行 |
| `src-electron/main-process/service/blog-deploy-handler.js` | `execBlogBuild` 在 `runBuilders` 之前调用 `writeRuneEchoAssets(blogDir)` | +10 行 |

### 8.2 必须新增的文件

| 文件 | 角色 | 在哪个 TODO 里跟踪 |
|------|------|------------------|
| `_todo/TODO-vuepress符文回响实现方案-202607.md` | **本文档** | 当前 |
| `scripts/blog/runeEchoRenderer.js` | 模板字符串副本（与主项目内联源同步；避免主进程/渲染端两份维护——这是 §8 提到的"双源陷阱"已在博客部署文档 §3.8 警告过的同形问题） | 本文档 §10 |

### 8.3 不改的现有文件

| 文件 | 为什么不动 |
|------|-----------|
| ~~`scripts/blog/blog-config-writer.js`~~ | **v2026-07-29 已删除**（与主进程版本已漂移；smoke 测试契约迁到 `tests/unit/blog/blog-config-writer.test.js`） |
| `src/components/ui/editor/Muya.vue` / `src/services/EchoRuntime.js` | 主项目运行时不动；博客端是独立链路 |
| `RuneFormDialog.vue` / `RuneTemplateService.js` | 输入端不动；导出时只读 |
| `.github/workflows/*.yml` | 不动；构建命令仍为 `yarn run build` |

### 8.4 双源同步策略（v2026-07-29 起已消除）

`SIDEBAR_BUILDER_SRC` / `NAV_BUILDER_SRC` / `VERIFY_PATHS_SRC` 历史上分布在两处：
- `src/services/BlogDeployService.js`（运行时字符串）
- `src-electron/main-process/service/blog-config-writer.js`（主进程字符串）

**博客部署 §3.8 已警告过这个陷阱**。RUNE_ECHO 这条链路**不重蹈覆辙**：v2026-07-29 起 `scripts/blog/blog-config-writer.js` 这个孤儿副本已 `git rm`，主进程版成为唯一真相源（与 echo / rune builtin 镜像处置方式一致）。任何双源维护的子项目都按同样节奏清扫。

---

## 9. 扩展性预留

### 9.1 留出的扩展点（按"投入产出比"排序）

| # | 扩展点 | 实现成本 | 触发条件 |
|---|--------|---------|---------|
| E1 | 用户在博客上**点击回响卡片**触发折叠面板 | 0.5 人天（实装 §6.5 即可） | 任何用户反馈"博客上 rune/echo 不可点" |
| E2 | 按访问时间变色（白天/夜晚主题色） | 0.3 人天 | 用户要求"博客夜间模式" |
| E3 | 接入博客端 AI（懒加载 OpenAI-compatible 接口摘要） | 1.5 人天（涉及 fetch + 缓存 + 速率限制） | 用户希望在博客上做"AI 推荐相关笔记" |
| E4 | 运行时根据 URL 参数切换回响（`?echo=lucky`） | 0.5 人天 | 用户希望在博客里做"调参 / 切换视角"实验 |
| E5 | 真正的 Vue SFC 组件（脱离 markdown-it 渲染） | 2-3 人天（要切到 .vuepress/components/） | 用户希望 rune/echo 完全组件化 |
| E6 | 博客主题同步 echo/rune 主题色（深色模式） | 1 人天 | hope 主题用户量起来后 |

### 9.2 接口稳定承诺

- `data-echo-name` / `data-echo-id` / `data-echo-action` / `data-rune-name` / `data-rune-action` 这五个 **data-attr** 在所有阶段都保持稳定。
- 第二阶段升级时，新增的 data-attr 必须以 `data-muya-` 前缀（保留与主项目命名空间一致）。
- 占位 DOM 的 `class="ag-echo ag-echo--<name>"` / `class="ag-rune ag-rune--<name>"` 在所有阶段都保持稳定。

### 9.3 失败模式

| 失败 | 表现 | 兜底 |
|------|------|------|
| frontmatter 里没有 `runes/echoes` 字段（旧笔记） | renderer 拿到 `undefined`，`find` 返回 `undefined`，回退到 name 原样输出 | renderer 内显式 `|| null` 防御 |
| echo-cache.json 写入失败（磁盘满） | 构建继续，但回响卡片只有名字没有颜色 | `verify-paths.js` 增加新 check：warn 级别不阻断 |
| 用户改用了 vuepress-theme-vue 之类第三方主题 | `markdown.extendMarkdown` 不被支持 | §10 风险点登记 |

---

## 10. 实施路线 / 工时 / 风险

### 10.1 分阶段交付

| Phase | 内容 | 工时估计 | 阻塞点 |
|-------|------|---------|--------|
| **P1**（最简可演示） | 1) `extractEchoAndRuneTokens` + `buildFrontmatter` 追加；2) `RUNE_ECHO_RENDERER_SRC` 字符串；3) `writeRuneEchoAssets`；4) `config.js` 集成；5) CSS 最小版 | 1.5 人天 | 无 |
| **P2** | 6) `RUNE_ECHO_CSS_SRC` 扩展（每种 rune/echo 自定义颜色）；7) `verify-paths` 增加新 check；8) smoke test 用例 | 0.5 人天 | 无 |
| **P3** | 9) 实装 §6.5 Vue.extend 副作用运行时；10) `cursor: pointer`；11) 折叠面板 + 内容插槽 | 0.5 人天 | 用户提需求"可点击" |
| **P4**（视情况） | 12) AI 摘要接入；13) jQuery 兜底；14) 主题适配 | 1.5 人天 | 用户量大 + AI Key 准备好 |

### 10.2 风险点

| 风险 | 等级 | 缓解 |
|------|------|------|
| VuePress 1.x `markdown.extendMarkdown` 在某些小众主题不被支持 | 🟡 中 | 文档明示支持的主题清单（default/vdoing/hope/reco）；不支持时给"降级到 vuepress 1.x 默认主题"指引 |
| echo-cache.json 与 `_posts/<id>.md` 不一致（重命名 / 删除） | 🟡 中 | `verify-paths.js` 增加：每篇 .md frontmatter 里的 `runes/echoes` 引用必须在 echo-cache 里存在 |
| `data-rune-*` 与博客主题内置 class 冲突 | 🟢 低 | 全部 `ag-` 前缀（来自 Muya CLASS_OR_ID 常量），与现有 `ag-editor` 等同类 |
| CSS 大小：未来几十种 rune/echo 各自样式 → CSS 膨胀 | 🟢 低 | CSS 是常量字符串，规模 100KB 以内；超阈值时切到外置资源 URL |
| 主项目升级时 `extractEchoAndRuneTokens` 与 Muya 解析规则不同步 | 🟡 中 | 单元测试覆盖：给定 Muya 解析后的 Block 树 dump，必须能被博客端 renderer 同样识别；测试放在 `scripts/blog/rune-echo.spec.js` |
| 双源同步陷阱（见 §8.4） | 🟡 中 | 在 `BlogDeployService.js` 顶部加显式注释，提醒"本字符串必须与 blog-config-writer.js 同步" |

### 10.3 验证命令

```bash
# 1) 单篇博客 dry-run：导出 + 预览一篇
node scripts/blog/rune-echo-smoke.js   # 单元级 smoke, 见 §10.4

# 2) 全流程
yarn start                              # 主项目启动
# UI: 右键分类 → 部署到博客 → 选 theme=default → 触发
# 打开 dist/技术/<id>.html 验证卡片显示

# 3) 端到端（用真实导出）
cd <blogDir>
yarn run dev                            # vuepress dev
# 访问 http://localhost:8080/<id>.html
```

### 10.4 smoke test 设计

`scripts/blog/rune-echo-smoke.js`：
1. 用 `os.tmpdir()` 下唯一目录（参考 `_temp/` 沙箱规则）
2. 复制 3 份 markdown fixture（分别含 `@lucky{}()` / `{{rune:calc}}` / 无 rune-echo）
3. 调 `BlogDeployService.writeBlogPosts` 模拟导出
4. 调 `runeEchoRenderer.install(md, ...)` 验证 renderer 形态
5. 断言：echo 卡片含 `data-echo-action`；rune 卡片含 `data-rune-name`；空 markdown 不崩
6. 清理 tmpdir

---

## 11. 与其它 TODO 的关系

| TODO 文档 | 关系 |
|----------|------|
| `TODO-vuepress博客打包部署优化-2026.md` | **主依赖**——所有流水线接入点都在该文档 §3 描述的 `blog-config-writer.js` / `blog-deploy-handler.js` 里 |
| `TODO-回响Echo建设-202607.md` | **输入源**——`builtinEchoes.js:774-895` 是 echo 元数据来源；总览 §9 已确认现状 |
| `TODO-符文Rune建设-202607.md` | **输入源**——`RuneTemplateService` 是 rune 元数据来源；总览 §10 已确认现状 |
| `TODO-总览-202607.md` | **索引**——本文档将在 §6 之后新增一节登记归位 |
| `TODO-模块联邦组件加载改造-202610.md` | **无关系**——本方案不引入 RemoteModuleLoader |
| `TODO-Skill管理机制.md` | **概念冲突**——已废弃；不要让 rune/echo 与 skill 命名空间混淆（总览 §12 已警告） |

---

## 12. 关键事实声明（避免后续 agent 误判）

1. **本方案不动 Muya 主项目运行时**。所有改动只在 `BlogDeployService.js` / `blog-config-writer.js` / `blog-deploy-handler.js` 三个文件 + 新增两个字符串常量。
2. **0 新依赖**指博客目录 `package.json` 不增加字段；主项目 `package.json` 不增加字段。
3. **语法严格 Muya 子集**——`echo_anno` 行内正则与 `rune_block` 行内正则都从 Muya `parser/rules.js` 推导，不发明新语法。
4. **构建期优先，副作用渲染留口子**——第一阶段所有渲染在 markdown-it renderer 内完成；`data-*-action` 属性是为第二阶段准备的扩展锚点。
5. **CSS 走 public 静态资源，不进主题**——主题无关，4 套主题通用。
6. **不做任何 AI / Streaming / IPC 改造**——主项目 `PortkeyService.js:373-378` 的 portkey SSE 仍不修；博客端的数据**导出时已算好**。
7. **不引入 markdown-it-attrs / lodash / jQuery**——纯 markdown-it 内核 + 原生 JS 足够。
8. **follow 现有 builder 模板字符串模式**——`SIDEBAR_BUILDER_SRC` / `NAV_BUILDER_SRC` 已有双源陷阱，新常量要警惕。
9. **不破坏 permalink 不变量**——permalink 仍是 `/<id>.html` 平铺，与 TODO-vuepress §3.1 一致。
10. **不在 blog-dir 装 jQuery**——如未来真要 jQuery，走 CDN 或本地 public/js，不写 package.json。

---

## 13. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 初版设计稿 |