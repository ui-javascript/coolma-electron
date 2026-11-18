---
title: Teek 主题能力
date: '2026-11-14'
description: 主题卡片、容器与归档
categories:
  - 主题
tags:
  - 主题
  - 卡片
---

# Teek 主题能力

## 导航卡片

::: navCard 2
```yaml
config:
  target: _self
data:
  - name: Markdown 语法
    desc: 标准语法与社区扩展
    link: /guide/markdown.html
    badge: 基础
    badgeType: tip
  - name: Muya 对照样例
    desc: 同源 AST 对照输入
    link: /guide/muya-fixture.html
    badge: 进阶
```
:::

## 分享卡片

::: shareCard 2
```yaml
config:
  target: _self
data:
  - name: 技术文档与图表
    desc: KaTeX、Mermaid 与标签页
    link: /guide/technical.html
```
:::

## 图文卡片

::: imgCard 2
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

## 组件 Demo

点击计数按钮可验证 Vue 3 组件交互；也可以展开 Demo 查看同一个组件的源文件。

::: demo effect 可交互的计数器
CounterDemo.vue
:::

## 博客

首页展示 Teek 的文章卡片；[归档](/archives.md)按照示例文章的日期整理，文章的分类、标签与摘要可从 YAML frontmatter 复用。
