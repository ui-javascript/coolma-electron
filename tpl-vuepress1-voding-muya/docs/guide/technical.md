---
title: 技术文档与图表
date: '2026-11-13'
permalink: /guide/technical.html
description: 公式、代码与流程图
categories:
  - 技术
tags:
  - LaTeX
  - 图表
---

# 技术文档与图表

## LaTeX 公式

行内公式：$E = mc^2$。块级公式：

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

代码中的 `$E = mc^2$` 不会被解析成公式。

## 代码高亮与复制

第 2 行演示高亮，可在代码块上测试复制。

```js{2}
const text = '# Hello, Markdown'
const heading = text.replace(/^#+\s*/, '')
console.log(heading)
```

## 实时组件示例

此例由 `vuepress-plugin-demo-block` 编译为 Vue 2 组件，可点击按钮。

::: demo
```html
<template>
  <button type="button" @click="count += 1">计数：{{ count }}</button>
</template>
<script>
export default {
  data: () => ({ count: 0 })
}
</script>
```
:::

## 流程图

此图使用 `vuepress-plugin-flowchart` 的 `flow` 代码围栏。

```flow
start=>start: Markdown
parse=>operation: 解析节点
done=>end: 静态页面
start->parse->done
```
