---
title: rune-live
date: 2026-11-23 15:10:00
permalink: /pages/rune-live/
categories:
  - guide
tags:
  - 符文
  - 回响
  - 远程组件
---
# 符文 / 回响运行时（VuePress 1.x POC）

这一页不是静态卡片，而是**真正挂载的 Vue2 组件 + 真正生效的回响效果**：本地 SFC 符文现场编译，`melt-js` 符文从 hel-micro 远端加载，回响按 `field` 走原生 DOM 渲染器。

宿主环境：VuePress 1.9.10 + Vue 2.7.16 + `vue-template-compiler` 2.7.16 + `@melt-js/libs-core-vue2` + `libs-echo-runtime`。

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

## 4. 回响运行时：打字机

回响不执行 `anno_source` 里的 JS，只从里面读 `field` 元信息，再交给内置渲染器。打字机取标记的上一个块，先量宽高、放隐藏占位撑住布局，再逐字写入，标点处自动停顿。

上一段文字会被逐字展开，标记单独占一段。

<EchoHost name="打字机" attrs="speed: 45" prompt="逐字展开"></EchoHost>

## 5. 回响运行时：弹幕飘过

弹幕克隆上一个块，改成 `position: fixed` 从右向左飘，`animationend` 自动移除，原段落不受影响。

上一段文字会被克隆成一条弹幕，从屏幕右侧飘到左侧，原段落仍然保留。

<EchoHost name="弹幕飘过" attrs="speed: 7, scope: prev-block"></EchoHost>

## 6. 三层降级

| 阶段 | 行为 |
|---|---|
| SSR 构建 | 只输出静态卡片与回响锚点，不碰 `window`、不发请求 |
| 客户端 mounted | 解析目录 → SFC 编译 / hel 加载 / 回响渲染器执行 |
| 失败 | 保留静态卡片并显示原因，回响退回只留锚点，页面不白屏 |

所以即使远端挂掉、SFC 有语法错误、回响的 `field` 不认识，页面也不会崩，最差就是一张静态卡片。

## 7. 接进博客导出要改什么

当前博客导出写的是 `ag-rune` / `ag-echo` 静态 HTML。要切到真组件与真回响，只需把导出模板换成：

```md
<RuneHost name="输入框" value="…" rune-id="…" node-id="…"></RuneHost>
<EchoHost name="打字机" attrs="speed: 50"></EchoHost>
```

并在博客主题的 `enhanceApp.js` 里注册 `RuneHost` / `EchoHost`，回响运行时由 `libs-echo-runtime` 提供。VitePress / VuePress 2 用 Vue3 版宿主，Markdown 语法不变。
