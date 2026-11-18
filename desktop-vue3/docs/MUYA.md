# Muya 独立包与 Vue 3 集成

> 状态：P4 首版。内容区已接入 Muya；Echo / Rune 已接入独立包运行时，仍缺少完整内置卡片库和编辑弹窗。

## 1. 包结构

```text
packages/
├─ libs-muya/                 Muya 核心 + Vue 3 包装层（独立包）
│  ├─ src/core/               从 coolma-muya lib 拆出的编辑器核心
│  ├─ src/MuyaEditor.vue      Vue 3 <script setup> 包装
│  ├─ src/plugin.ts           MuyaPlugin / defineMuyaPlugin
│  ├─ src/index.ts            对外导出
│  └─ src/themes/             default.css + fonts + prismjs
├─ plugins-muya-echo/         Echo 注册表、anno_source 运行时与 payload 编解码
└─ plugins-muya-rune/         Vue 3 SFC 编译器与旧 Muya 挂载协议适配器
```

`frontend` 通过 workspace 协议使用：

```json
"libs-muya": "workspace:*"
```

根目录使用 pnpm workspace（`frontend` + `packages/*`），`pnpm install` 会一次性链接
`libs-muya`、Echo/Rune 插件包与前端依赖。

Vite 仍需允许读取上级目录，并跳过对 TS 源码包做依赖预构建：

```ts
optimizeDeps: { exclude: ['libs-muya'] },
server: { fs: { allow: [path.resolve(__dirname, '..')] } }
```

## 2. Vue 3 包装层

```vue
<MuyaEditor
  v-model="activeContent"
  :theme="appStore.theme"
  @ready="onReady"
  @change="onChange"
/>
```

Props：

| Prop | 说明 |
| --- | --- |
| `modelValue` | Markdown 文本 |
| `theme` | `light` / `dark`，映射 Muya 的 `--themeColor` |
| `readonly` | 设置 `contenteditable=false` |
| `plugins` | `MuyaPlugin[]`，当前传给核心做扩展点 |
| `options` | 透传 Muya 核心 options，可注入 `echoCards` / `runeCards` 等运行时配置 |

Emits：`update:modelValue`、`change`、`selectionChange`、`ready`。

包装层把 Muya 挂载到 host 内的临时子节点，因为 Muya 会 `replaceWith` 自己的容器；
这样 Vue 卸载 host 时能一并清理编辑器 DOM。

## 3. 为脱离 Vue 2 做的改造

| 原实现 | 独立包处理 |
| --- | --- |
| `import { i18n } from 'boot/i18n'` | 改为包内 `core/i18n.js` shim，宿主可覆盖 |
| `parseEchoProps from 'src/components/echo/echoCore'` | 内置 `core/parser/echoPropsParser.js`，后续 Echo 插件可替换 |
| `require('snabbdom')` | 改为 ESM `import { init } from 'snabbdom'` |
| `require('joplin-turndown-plugin-gfm')` | 改为 `import { gfm }` |
| CSS 默认导入用于导出 HTML | 改为 Vite `?inline` 字符串导入 |
| 运行时 `import('prismjs/components/prism-' + lang)` | 暂时停用自动加载，仅保留 Prism 核心语言 |
| Snap.svg 序列图 | 暂时用 stub，后续插件恢复 |
| `require('path')` 处理本地图片 | 改为浏览器安全的 `file://` 路径拼接 |

核心仍是 vanilla JS + snabbdom；**没有 Vue 2 运行时依赖**。Vue 3 只存在于包装层。

## 4. 插件边界

```ts
export interface MuyaPlugin {
  name: string;
  install(context: { editor: Muya; container: HTMLElement }): void | (() => void);
}
```

`plugins-muya-echo` 与 `plugins-muya-rune` 通过 `MuyaPlugin.install` 注入运行时：

- Echo：`EchoRegistry` + `EchoRuntime` 负责 `anno_source` 编译、HTML 输出、后渲染钩子与 payload 编解码；
- Rune：使用 `@vue/compiler-dom` 编译 `<template>`，并以 `createApp` 适配 Muya 仍使用的 `$mount/$destroy/propsData` 接口。

插件不得直接改 `libs-muya` 源码，只能通过 `install` 和核心公开方法扩展。

编辑区输入 `@` 会唤起 Muya 的快捷插入浮层：保留原有 Markdown 区块命令，并按 Rune、Echo 分区追加已注册卡片；继续输入名称/描述可筛选，方向键移动、Enter 插入、Esc 关闭。快捷项由插件注册到 `quickInsertProvider`，Rune 插入生成带实例 id 的占位符，Echo 插入生成对应的 `@name{}()` 注解。

## 5. 当前集成

`HomeView.vue` 编辑区：

```vue
<MuyaEditor
  v-model="activeContent"
  :theme="appStore.theme"
  :plugins="muyaPlugins"
  class="muya-editor"
/>
```

Muya 保持**单实例**，切换笔记时只更新 `activeContent`（内部 `setMarkdown`），
不按 `:key` 重挂载。Muya 会替换挂载节点，频繁 remount 会让 Vue vnode 与真实 DOM 脱节。

编辑内容 700ms 防抖写入 `notes:update`；切走/卸载前先 `flushSave()`。
标题从正文第一个 `# 标题` 派生。详见 [P3](P3.md)。

## 6. 已知限制

- 包体积较大：Mermaid / Vega / KaTeX / Prism 都在首包或异步 chunk 里；
- 序列图、运行时 Prism 语言加载暂时关闭；
- Echo / Rune 当前支持自定义 cards；内置卡片库、完整实例编辑弹窗和更复杂的 SFC 语法仍待补齐；
- `readonly` 只是关闭 `contenteditable`，不是只读渲染模式；
- 没有编辑器单测，当前用 Electron + CDP 冒烟（输入、切换、渲染）。

## 7. 验证

- `pnpm typecheck` 通过；
- `pnpm build` 通过；
- 编辑区渲染 Markdown（标题、列表、引用、代码块）；
- CDP `Input.insertText` 输入后 DOM 文本变化；
- 三栏 Splitpanes 拖拽正常（左 18% / 中 27% / 右 55%，总和 100%）。
