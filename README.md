# README

基于memocast，加入自己的笔记习惯进行二创，全程鞭策AI实现(基本已失控！！！)。


## 本地开发

在仓库根目录使用 Node.js 22.12 或更新版本，通过 Corepack 启用项目指定的 pnpm 版本：

```sh
corepack enable
pnpm install
cd desktop-vue2
corepack yarn install --frozen-lockfile
corepack yarn dev
```

Vue 2 桌面应用位于 [`desktop-vue2/`](desktop-vue2/)，与 `desktop-vue3/` 同级。编辑器包位于 [`libs-muya/`](libs-muya/)。Vue 2 桌面应用由 Yarn Classic 独立管理，通过 `link:../libs-muya` 直接引用编辑器源码；根目录的其他 workspace 包仍由 pnpm 管理。安装完成后，也可在根目录运行 `pnpm dev` 启动桌面应用、运行 `pnpm verify` 执行测试，或运行 `pnpm --filter libs-muya build:dev` 单独构建编辑器。

Muya 的 Vue 2 + Vite 示例位于 [`demo-vue2-vite-muya/`](demo-vue2-vite-muya/)，在根目录运行 `pnpm --filter demo-vue2-vite-muya dev`。符文和回响模板分别位于 [`tpl-rune/`](tpl-rune/) 和 [`tpl-echo/`](tpl-echo/)。

# 新功能

- 2026-08-13 ikun历险记
  - https://github.com/Lichtspektrum/liang-intensity-calibrator
  - https://github.com/luo0412/ikun-adventure
  - https://luo0412.github.io/ikun-adventure
  - https://raw.githubusercontent.com/luo0412/ikun-adventure/refs/heads/master/memocast-runes-2026-08-13.json

```
@ps 原作是 滑动变祖器，但因果太大了，还是我们伟大的宗主好
```

<img width="1282" height="960" alt="image" src="https://github.com/user-attachments/assets/dcad5be3-2338-4ab8-8e2e-494749a17c01" />


- 2026-08-08 小怪兽删除
  - https://github.com/531149627/MonsterDeleter
  - https://github.com/luo0412/echo-monster-deleter

<img width="420" height="468" alt="image" src="https://github.com/user-attachments/assets/4be2024a-199d-4549-a817-69cc596b56b8" />

- 2026-05-01 从夯到拉
  - https://github.com/dayun-cloud/tools

<img width="745" height="498" alt="image" src="https://github.com/user-attachments/assets/56add3c0-5862-4c44-bc6c-fcdc7fd029a3" />

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
