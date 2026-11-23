# README

基于memocast，加入自己的笔记习惯进行二创。


## 本地开发

在仓库根目录使用 Node.js 22.12 或更新版本，通过 Corepack 启用项目指定的 pnpm 版本：

```sh
corepack enable
pnpm install
pnpm dev
```

所有子包共用根目录的 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml`，安装一次即可。`desktop-vue2`、`desktop-vue3`、Muya 工具包、模板和插件均由根 workspace 管理；Vue 2 和 Vue 3 各自解析所需的 Vue 版本。运行 `pnpm dev` 启动 Vue 2 桌面应用，运行 `pnpm verify` 执行测试，或运行 `pnpm --filter libs-muya-vue2 build:dev` 构建编辑器。

执行 `pnpm verify:workspace` 可检查子包登记、共享锁文件、本地链接和 Vue 版本解析，防止新增子包遗漏。

Muya 的 Vue 2 + Vite 示例位于 [`demo-vue2-vite-muya/`](demo-vue2-vite-muya/)，在根目录运行 `pnpm --filter demo-vue2-vite-muya dev`。符文和回响模板分别位于 [`tpl-rune/`](tpl-rune/) 和 [`tpl-echo/`](tpl-echo/)。

## 公共库

公共库平铺在仓库根目录，目录名和包名一致，其他 workspace 包通过 `workspace:*` 引用。

| 包 | 用途 |
| --- | --- |
| [`libs-muya-vue2`](libs-muya-vue2/) | Vue 2 版 Muya 编辑器 |
| [`libs-muya-vue3`](libs-muya-vue3/) | Muya 编辑器核心与 Vue 3 包装层 |
| [`libs-muya-echo-vue3`](libs-muya-echo-vue3/) | Vue 3 版 Muya 的 Echo 插件 |
| [`libs-muya-rune-vue3`](libs-muya-rune-vue3/) | Vue 3 版 Muya 的 Rune 插件 |
| [`libs-echo-core`](libs-echo-core/) | Echo 数据及插入逻辑，不依赖 Vue |
| [`libs-rune-core`](libs-rune-core/) | Rune 数据及插入逻辑，不依赖 Vue |

---

# 文件夹模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/ee1ac04d-3eb0-41fe-a58e-b414bf60e5c0" />

# 标签模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/93467559-16bd-48df-b730-9d21541ddb0f" />

# 日历模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/18fd3798-90c6-4205-a20e-5a00b43852d4" />

# Muya 编辑器 Echo & Rune

> **本文只放截图 + 一句话指引。Echo / Rune 的深度架构、命名约定、内置卡片清单、anno_source 模板、rune SFC 流水线、与 Muya 集成方式、决策树，全部迁到 skills 目录。**

Echo（回响）= `@xxx{props}(prompt)`，main 功能是改附近元素的排版/动画；Rune（符文）= Vue SFC 模板，由 `Vue.extend` 渲染成自包含卡片。两条管线完全独立。

**深度文档：**

- 设计速查 / 决策树 / 内置卡片清单 / 命名坑 → [`.agents/skills/rune-echo-design/SKILL.md`](.agents/skills/rune-echo-design/SKILL.md)
- 源码级逐行解析 / anno_source 完整形态 / rune SFC 编译流程 / handler body 范式 → [`.agents/skills/rune-echo-design/reference.md`](.agents/skills/rune-echo-design/reference.md)
- 试验阶段规则（不兼容、不背历史包袱、graceful skip 原则）→ [`.agents/rules/rune-echo-cloudfn-experimental.mdc`](.agents/rules/rune-echo-cloudfn-experimental.mdc)
- 测试护城河（哪些契约被 Jest 锁住、何时必须更新用例）→ [`.agents/rules/rune-echo-test-moat.mdc`](.agents/rules/rune-echo-test-moat.mdc)
