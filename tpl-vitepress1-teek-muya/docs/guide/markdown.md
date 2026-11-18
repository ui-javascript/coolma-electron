---
title: Markdown 语法
date: '2026-11-12'
description: 基础与扩展语法
categories:
  - 基础
tags:
  - Markdown
  - 脚注
---

# Markdown 语法

[[toc]]

## 文字、链接与换行

**粗体**、*斜体*、~~删除线~~、`行内代码`、==高亮==、H~2~O、x^2^。这是一个[站内引用链接][guide]，也是一个脚注示例[^render]。

第一行末尾有两个空格。  
第二行会硬换行。

## 表格、引用与定义列表

| 数据 | 类型 | 说明 |
| :--- | :---: | ---: |
| `tokens` | 数组 | Markdown 解析结果 |
| `html` | 字符串 | 页面渲染结果 |

> 给读者看的说明可以包含 **强调**。
>
> > 引用也可以嵌套。

Markdown token
: 解析器输出的语法单元。
: 一个语法单元也可以包含子节点。

## 列表与图片

1. 读取 Markdown
   - 标记文档中的 **行内语法**。
   - 保留链接和图像信息。
2. 生成输出

- [x] 验证基础语法
- [ ] 对照 Muya 的渲染结果

点击图片可测试主题的图像预览。

![从 Markdown 到 HTML 的三步渲染流程](/media/render-pipeline.svg)

[guide]: ./index.md
[^render]: 脚注可以包含 **Markdown 格式** 和 `行内代码`。
