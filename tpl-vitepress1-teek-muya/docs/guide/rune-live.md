---
title: 符文 / 回响运行时
---
# 符文 / 回响运行时（VitePress / Vue3）

和 VuePress 版本同一套 Markdown 写法，宿主换成 VitePress + Vue 3.5，符文渲染器换成 `libs-muya-rune-vue3`，回响共用 `libs-echo-runtime`。

| 层 | VuePress 1.x | 本页（VitePress 1.x） |
|---|---|---|
| 宿主 Vue | 2.7.16 | 3.5 |
| SFC 编译 | `vue-template-compiler` | `@vue/compiler-dom` |
| 远端加载 | `@melt-js/libs-core-vue2` | `@melt-js/libs-core-vue3` |
| 远端包 | `comps-vue2` | `comps-vue3` |
| 回响运行时 | `libs-echo-runtime` | `libs-echo-runtime` |

## 1. 本地 SFC 符文

`createRuneRendererCtor` 编译模板后 `createApp` 挂到一个容器里，宿主只负责挂载 / 卸载 / 传值。输入可以直接改。

<RuneHost name="输入框" value="Vue3 宿主下输入，值回写" rune-id="vt-input-1" node-id="vt-node-1" />

## 2. 带继承语义的 SFC 符文

<RuneHost name="演示符文" value="来自上一行的文本" rune-id="vt-demo-1" node-id="vt-node-2" />

## 3. hel-micro 远程 Vue3 组件

```json
{
  "$type": "melt-js",
  "dep": {
    "name": "comps-vue3",
    "type": "custom",
    "host": "https://cdn.jsdelivr.net/gh/melt-js/comps-vue3@master/hel_dist/hel-meta.json"
  },
  "exportName": "HelloWorld"
}
```

产物是 Vue3 组件，加载和渲染都在客户端 `mounted` 之后；构建期不请求网络。

<RuneHost name="melt-hello-vue3" rune-id="vt-melt-1" node-id="vt-node-3" />

## 4. 回响运行时：打字机

回响不执行 `anno_source` 里的 JS，只读 `field` 元信息走内置渲染器。打字机取标记的上一个块，量宽高、隐藏占位撑布局，再逐字写入。

上一段文字会被逐字展开，标记单独占一段。

<EchoHost name="打字机" attrs="speed: 45" prompt="逐字展开" />

## 5. 回响运行时：弹幕飘过

弹幕克隆上一个块，固定定位从右向左飘，`animationend` 自动移除，原段落保留。

上一段文字会被克隆成一条弹幕，从屏幕右侧飘到左侧，原段落仍然保留。

<EchoHost name="弹幕飘过" attrs="speed: 7, scope: prev-block" />

## 6. 和 VuePress 版的关系

同一份导出产物可以同时喂给两个模板：

- VuePress 1.x：`RuneHost` 里用 `vue-template-compiler` + `libs-core-vue2`；
- VitePress：`RuneHost` 里用 `libs-muya-rune-vue3` + `libs-core-vue3`；
- 回响：两边都用 `libs-echo-runtime`，纯 DOM，不依赖框架版本。

Markdown 里只写 `<RuneHost name="…" value="…" />` 和 `<EchoHost name="…" attrs="…" />`，宿主版本决定用哪条运行时；导出器不需要感知宿主。
