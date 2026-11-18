---
title: Vdoing 主题能力
date: '2026-11-14'
permalink: /guide/theme.html
description: 主题卡片、容器与归档
categories:
  - 主题
tags:
  - 主题
  - 卡片
---

# Vdoing 主题能力

## 提示、定理与折叠

::: note 阅读提示
`note` 和 `theorem` 是本主题扩展的容器。
:::

::: theorem 勾股定理
直角三角形的边长满足 $a^2 + b^2 = c^2$。
:::

::: details 展开查看写作说明
可以在详情中继续使用 **Markdown**、列表和链接。
:::

::: center
这一段由 Vdoing 居中显示。
:::

## 链接卡片

::: cardList 2
```yaml
config:
  target: _self
data:
  - name: Markdown 语法
    desc: 查看基础与扩展语法
    link: /guide/markdown.html
  - name: Muya 对照样例
    desc: 未来做 AST 适配时可直接复用
    link: /guide/muya-fixture.html
```
:::

## 图文卡片

::: cardImgList 2
```yaml
config:
  target: _self
  imgHeight: 145px
data:
  - name: Markdown 渲染流程
    desc: 从源文件到静态页面
    img: /media/render-pipeline.svg
    link: /guide/technical.html
    author: 示例库
```
:::

## 分类、标签和归档

站点提供[分类](/categories/)、[标签](/tags/)和[归档](/archives/)；本页的 frontmatter 中有分类、标签及固定日期，可直接查看它在索引中的分组。
