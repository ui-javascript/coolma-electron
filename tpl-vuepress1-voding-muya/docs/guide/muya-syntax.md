---
title: Muya 语法直出
date: 2026-11-23 17:52:28
permalink: /guide/muya-syntax.html
categories: 
  - guide
tags: 
  - 
---
# Muya 语法直出（VuePress 1.x）

本页正文全部是 Muya 文档原文，没有手写 `<RuneHost>` / `<EchoHost>`。独立的 `libs-muya-md` 包在 markdown-it 的 block / inline 阶段把 Muya 节点改写成全局宿主组件。

## 回响：行内注解

上一段文字会被逐字展开，注解单独占一段。

@打字机{scope: prev-block}(春风吹又生)

<div class="muya-demo" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0">
<div class="muya-card" style="padding:14px;border:1px solid #e5e7eb;border-radius:10px"><b style="color:#43A047">春</b><br>种子破土</div>
<div class="muya-card" style="padding:14px;border:1px solid #e5e7eb;border-radius:10px"><b style="color:#43A047">夏</b><br>枝叶舒展</div>
<div class="muya-card" style="padding:14px;border:1px solid #e5e7eb;border-radius:10px"><b style="color:#43A047">秋</b><br>生生不息</div>
</div>

@生生不息{scope: siblings, trigger: auto, target: .muya-card}(生生不息)

## 符文：占位符 HTML

Muya 的符文节点是一串带 `data-rune-*` 的行内 HTML，宿主按 name 从目录取定义：

<span data-rune-name="输入框" data-rune-id="muya-rune-1" data-rune-node-id="muya-node-1" data-rune-value="来自 Muya 原文">@输入框</span>

## 支持的语法范围

| Muya 语法 | 处理方式 |
|---|---|
| `@名称(prompt)` | 行内回响，prompt 透传给触发节点 |
| `@名称{props}(prompt)` | props 支持 `key: value` 与 JSON 两种写法 |
| `<span data-rune-name …>` | 转成 `<RuneHost name value rune-id node-id>` |
| `data-rune-definition` | 原样透传，支持导出器内联定义 |
| GFM + footnote / deflist / mark / sub / sup / math | 沿用主题已有 markdown-it 插件 |
