# libs-muya-vue2

Memocast 编辑器核心 —— Muya Markdown 编辑器，内置 **rune（符文）** 和 **echo（回响）** 扩展。

> **这是一个独立的 npm 包**（未 scoped，避开 npm 私有 scoped 包的付费限制），可以单独构建产出 UMD bundle（8.12 MB full / 6.93 MB core），通过 CDN `<script>` 直接 `new Muya()` 嵌入任何页面。
>
> `desktop-vue2/` 下的桌面应用通过 `workspace:*` 直接加载本包的 ESM 源码。

---

## 1. 浏览器 / CDN 用法（推荐）

构建产物在 `dist/`，**两个变体**：

| 文件 | 大小 | 含义 |
|---|---|---|
| `dist/index.min.js` | 8.12 MB | **完整版** —— 自带 katex、vega-embed、mermaid、flowchart、prism 200+ 语言，零依赖 CDN 即可使用 |
| `dist/index.core.min.js` | 6.93 MB | **Core 版** —— 这些 heavy 依赖标记为 externals，**运行时需要你另外通过 CDN 注入** `window.katex` / `window.mermaid` / `window.flowchart` / `window.vegaEmbed` / `window.Prism` |

### 1.1 HTML 引入（Full 版）

```html
<!DOCTYPE html>
<html>
<head>
  <!-- peer dependencies -->
  <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js"></script>

  <!-- muya full bundle -->
  <script src="https://your-cdn/libs-muya-vue2/index.min.js"></script>

  <link rel="stylesheet" href="https://your-cdn/libs-muya-vue2/themes/default.css" />
</head>
<body>
  <div id="editor" style="height: 100vh;"></div>
  <script>
    const muya = new Muya('#editor', {
      markdown: '# Hello Muya\n\nStart typing your markdown here...',
      // 主题配色：'light' (默认) / 'dark'
      theme: 'light',
      // 富文本模式 / Markdown 源码模式
      mode: 'normal',
    })

    // 监听变化
    muya.on('change', ({ markdown }) => {
      console.log('markdown updated:', markdown)
    })

    // 取 Markdown
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') {
        console.log(muya.getMarkdown())
      }
    })
  </script>
</body>
</html>
```

### 1.2 HTML 引入（Core 版）

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js"></script>

  <!-- core 版所需的 externals：必须按顺序注入到 window 上 -->
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/flowchart.js@1.18.0/release/flowchart.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-embed@6.21.0/build/vega-embed.min.js"></script>

  <script src="https://your-cdn/libs-muya-vue2/index.core.min.js"></script>
  <link rel="stylesheet" href="https://your-cdn/libs-muya-vue2/themes/default.css" />
</head>
<body>
  <div id="editor" style="height: 100vh;"></div>
  <script>
    const muya = new Muya('#editor', { markdown: '# Hello' })
  </script>
</body>
</html>
```

> **如果不需要数学公式 / 图表 / 代码高亮**（只做纯 Markdown 编辑），只引 `prismjs` 一个就够了，katex / mermaid / flowchart / vega-embed 可以省略；编辑器在加载图表时会优雅降级（`src/components/renderers/index.js` 已经处理 `loadRenderer()` 的未知名称报错）。

### 1.3 ESM 引入（webpack / vite / rollup 等）

```js
// 完整版
import Muya from 'libs-muya-vue2'
import 'libs-muya-vue2/themes/default.css'

// 或 core 版（需要 declare module 或配 alias）
import Muya from 'libs-muya-vue2/dist/index.core.min.js'

const muya = new Muya('#editor', options)
```

---

## 2. 本地开发（Vue 2.7 + Memocast 主项目）

### 2.1 安装依赖

在仓库根目录执行 `pnpm install`，pnpm 会自动链接 `libs-muya-vue2`。

Vue 2 + Vite demo 位于 [`demo-vue2-vite-muya/`](../demo-vue2-vite-muya/)。安装依赖后，在仓库根目录运行 `pnpm --filter demo-vue2-vite-muya dev`。

### 2.2 监听构建

```bash
pnpm --filter libs-muya-vue2 dev
# 监听文件变更，webpack 自动重建 dist/
```

dev 模式下输出未压缩，开发调试更快；生产发布前跑 `pnpm --filter libs-muya-vue2 build:all`。

### 2.3 构建命令

| 命令 | 产物 |
|---|---|
| `pnpm --filter libs-muya-vue2 build` | 只构建 `dist/index.min.js`（full 版） |
| `pnpm --filter libs-muya-vue2 build:core` | 只构建 `dist/index.core.min.js`（core 版） |
| `pnpm --filter libs-muya-vue2 build:all` | 两个都构建（不互相覆盖） |
| `pnpm --filter libs-muya-vue2 build:dev` / `pnpm --filter libs-muya-vue2 dev` | development 模式（带 watch） |

> 旧版 `scripts/verify-*.js` 已删除（v2026-07-29），单元测试在主项目 `tests/unit/` 下，跑 `pnpm verify` / `pnpm verify:rune` / `pnpm verify:echo` 校验 rune / echo 契约。

---

## 3. API 速查

### 3.1 构造器

```js
const muya = new Muya(containerOrSelector, options)
```

**Options 关键字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `markdown` | `string` | 初始 Markdown 文本 |
| `theme` | `'light' \| 'dark'` | 默认 `'light'` |
| `mode` | `'normal' \| 'preview'` | 预览模式只读 |
| `imagePathPicker` | `() => string` | 图片选择回调 |
| `imageAction` | `(file, uploadFn) => void` | 上传行为 |
| `disableCache` | `boolean` | 是否禁用本地缓存 |
| `runeCards` | `RuneCard[]` | 已注册的 rune 卡片（rune 系统） |
| `i18n` | `{ lang: 'zh-cn' \| 'en-us', ... }` | 国际化文案覆盖 |

### 3.2 静态注册插件

```js
import { TablePicker, QuickInsert, CodePicker, EmojiPicker } from 'libs-muya-vue2'

Muya.use(TablePicker)
Muya.use(QuickInsert, { /* options */ })
Muya.use(CodePicker)
Muya.use(EmojiPicker)
```

完整插件列表见 `lib/ui/` 目录（每个文件夹对应一个 `*Picker` / `*Tools` 插件）。

### 3.3 实例方法

```js
muya.getMarkdown()              // → string
muya.setMarkdown('# Hi')        // 替换全文
muya.insertMarkdown('text')     // 在光标处插入
muya.focus()                    // 聚焦
muya.blur()                     // 失焦
muya.destroy()                  // 销毁
muya.on(event, handler)         // 订阅事件
muya.off(event, handler)        // 解绑
muya.emit(event, payload)       // 主动触发
muya.use(plugin, options)       // 注册自定义插件（运行时）
muya.refreshRuneCards(cards)    // 刷新 rune 卡片列表
```

### 3.4 事件

| 事件 | payload |
|---|---|
| `change` | `{ markdown }` |
| `selectionChange` | `{ selection, anchor, focus }` |
| `focus` / `blur` | — |
| `image-drop` | `{ file, callback }` |
| `exec` | `{ name, args }` |

---

## 4. Rune / Echo（实验性）

本包内置 **rune（符文）** 和 **echo（回响）** 两个实验性特性：

- **Rune**：用户自定义 Vue SFC 卡片，通过 `runeTemplates/` 目录维护，挂在 Muya 工具栏。
- **Echo**：`@xxx{}(prompt)` 占位符语法，对应 `echoBuiltins/` 里的 17 张内置卡片 + 用户自定义。

约定与契约详见主项目 `_todo/TODO-` 系列文档和 `tests/unit/echo/` / `tests/unit/rune/` 下的 Jest 契约测试。

⚠️ **实验阶段**：API 和卡片设计还会调整，按 `rune-echo-cloudfn-experimental.mdc` 规则维护。

---

## 5. 常见问题

### Q: CDN 加载后报 `Muya is not defined`
A: 检查 `<script>` 顺序 —— 必须先引 `jquery` 和 `vue`，**再引** `index.min.js`。

### Q: 报错 `Cannot find module 'vue'`
A: 这是因为 Vue 被打成了 externals（节省 100+ KB），浏览器必须通过 `<script>` 注入到 `window.Vue`。

### Q: 数学公式不渲染
A: 检查：
1. 用的是 full 版，或 core 版有没有引 `katex`
2. 公式语法 `$inline$` / `$$block$$` 是否正确
3. 浏览器控制台是否有 katex 内部报错

### Q: mermaid 图不显示
A: 需要在引入 muya **之后**调用一次：
```js
if (window.mermaid) window.mermaid.initialize({ startOnLoad: false })
```

### Q: 打包成 core 版后报 `katex is not defined`
A: Core 版 `require('katex')` 期望宿主提供 `window.katex`，请确保 katex 的 `<script>` 在 muya 的 `<script>` **之前**加载。

---

## 6. 许可证

MIT
