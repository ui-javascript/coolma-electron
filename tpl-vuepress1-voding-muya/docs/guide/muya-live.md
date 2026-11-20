---
title: muya-live
date: 2026-11-19 15:05:32
permalink: /pages/03ae9f/
categories:
  - guide
tags:
  - 
---
# 引擎实机演示（VuePress）

这一页是**真正跑起来的 Muya 编辑器**（Vue2 引擎 `libs-muya`，预编译 ESM lib）。

<MuyaLive />

## 复用关系

| 层 | 包 | 本站消费方式 |
|---|---|---|
| 引擎 | `libs-muya`（vue2 桌面同款） | ESM lib，webpack4 直吃 |
| 符文数据构造 | `rune-core` | `lib/index.cjs`（webpack4 走 main） |
| 回响数据构造 | `echo-core` | 同上 |
| 插入语义 | 引擎内置（vue2 现状） | `insertRuneTemplate` / `insertEchoTemplate` |

数据构造与 desktop-vue2、vitepress 模板共用 `buildRuneItems` / `buildEchoItems`；
引擎里没有符文/回响的数据代码，只有插入执行——这就是拆包后的接口层。
