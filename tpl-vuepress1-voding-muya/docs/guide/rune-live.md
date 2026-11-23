---
title: rune-live
date: 2026-11-23 14:30:00
permalink: /pages/rune-live/
categories:
  - guide
tags:
  - 符文
  - 远程组件
---
# 符文 / 回响运行时（VuePress 1.x POC）

这一页不是静态卡片，而是**真正挂载的 Vue2 组件**：本地 SFC 符文现场编译，`melt-js` 符文从 hel-micro 远端加载。

宿主环境：VuePress 1.9.10 + Vue 2.7.16 + `vue-template-compiler` 2.7.16 + `@melt-js/libs-core-vue2`。

## 1. 本地 SFC 符文（运行时编译）

`<RuneHost>` 在浏览器里用 `parseComponent` 拆 SFC、`compileToFunctions` 编模板、`new Function` 执行 `export default`，然后 `Vue.extend` 成组件。输入框可以直接改，值会通过 `input` 事件回传。

<RuneHost name="输入框" value="在这里输入，值会回写" rune-id="rune-input-1" node-id="node-input-1"></RuneHost>

## 2. 带继承语义的 SFC 符文

这个符文声明了 `inheritFromPrevious` 与 `onValueChange`，宿主按桌面端同样的 props 契约透传。

<RuneHost name="演示符文" value="来自上一行的文本" rune-id="rune-demo-1" node-id="node-demo-1"></RuneHost>

## 3. hel-micro 远程 Vue2 组件

符文定义是一段 JSON：

```json
{
  "$type": "melt-js",
  "dep": {
    "name": "comps-vue2",
    "type": "custom",
    "host": "https://cdn.jsdelivr.net/gh/melt-js/comps-vue2@master/hel_dist/hel-meta.json"
  },
  "exportName": "HelloWorld"
}
```

宿主先 `bindVueRuntime({ Vue })` 把 Vue 实例交给 hel，避免远端包自己 new 一个 Vue；再从 meta 地址直接加载产物。**这段网络请求只发生在 mounted 之后**，构建期不会发起。

<RuneHost name="melt-hello" rune-id="rune-melt-1" node-id="node-melt-1"></RuneHost>

## 4. 回响锚点

回响不是 Vue 组件，桌面端是 `anno_source` 里的 `render / afterRender`（依赖 jQuery 操作前一个文本块）。这里先落成可点的锚点，运行时层后续接。

前一段文字用于演示打字机效果。<EchoHost name="打字机" attrs="speed: 60" prompt="逐字展开"></EchoHost>

## 5. 三层降级

| 阶段 | 行为 |
|---|---|
| SSR 构建 | 只输出静态卡片，不碰 `window`、不发请求 |
| 客户端 mounted | 解析目录 → SFC 编译 / hel 加载，成功替换静态卡片 |
| 失败 | 保留静态卡片并显示原因，可点「重试」 |

所以即使远端挂掉、SFC 有语法错误，页面也不会白屏，最差也是现在这张静态卡片。

## 6. 接进博客导出要改什么

当前博客导出写的是 `ag-rune` 静态 HTML。要切到真组件，只需把导出模板换成：

```md
<RuneHost name="输入框" value="…" rune-id="…" node-id="…"></RuneHost>
```

并在博客主题的 `enhanceApp.js` 里注册 `RuneHost` / `EchoHost`，运行时包从 `libs-rune-core` 拆出的 Vue2 版本提供。VitePress / VuePress 2 用 Vue3 版宿主，Markdown 语法不变。
