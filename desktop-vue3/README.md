# Coolma Vue3

基于 [electron-egg](https://github.com/wallace5303/electron-egg) TypeScript 模板复刻
[Coolma](https://github.com/ui-javascript/coolma-electron) 的桌面笔记应用。

> 当前状态：**P3 真实数据/CRUD 完成，P4 Muya 已接入，无边框窗口已启用**。SQLite 笔记、
> 文件夹/标签/时间索引、全量搜索、新建/删除、700ms 自动保存、Muya 编辑器与自绘窗口按钮均已跑通；
> 下一步补重命名/移动/标签编辑，再进入 Echo/Rune 插件运行时。

## 技术路线

```text
electron-egg demo_v4_ts (v4.2.0)
  + Vue 3 + Vite + TypeScript
  + Pinia + Vue Router 4 + vue-i18n 11
  + Element Plus（UI 组件库）+ splitpanes（三栏拖拽）
  + enum-plus（业务枚举 / 字典）
  + better-sqlite3（schema v1 / WAL）
  + libs-muya（独立 Muya core + Vue 3 wrapper）
  + plugins-muya-echo / plugins-muya-rune（插件边界）
```

## 快速开始

> 在 `desktop-vue3` 目录执行以下命令。这里的 pnpm workspace 覆盖 `frontend` 与 `packages/*`，仓库根目录的安装不会安装这些子包。

```powershell
pnpm install

# 本机没有 VS Build Tools，使用 Electron ABI 预编译包
pnpm rebuild:sqlite

pnpm dev
```

> Vue3 开发服务使用 `127.0.0.1:8081`，Vue2 保留 `8080`。
> 如果启动报 `Could not locate the bindings file` 或 `NODE_MODULE_VERSION` 不匹配，重新执行 `pnpm rebuild:sqlite`。
> 详见 [P2 数据层](docs/P2.md)。

## 生产构建

```powershell
pnpm typecheck
pnpm build
pnpm build-w
```

## 目录

```text
electron/         主进程：配置、controller、preload、安全服务、SQLite
electron/shared/  IPC channel、类型、enum-plus 共享字典
frontend/         Vue3 + Element Plus 渲染层
packages/         libs-muya + plugins-muya-echo/rune 独立包
tests/            旧库 fixture 与测试说明
rule/skill/       迁移方案与长期规则
docs/             阶段说明与源码基线
```

## 下一步

P3.1：重命名、移动分类、标签编辑、列表虚拟滚动；之后进入 P5 Echo/Rune 插件运行时。

## 文档

- [整体迁移方案](rule/skill/coolma-vue3-overall-migration.md)
- [P1 工程骨架](docs/P1.md)
- [P2 数据层](docs/P2.md)
- [P3 真实数据与 CRUD](docs/P3.md)
- [Muya 独立包](docs/MUYA.md)
- [无边框窗口](docs/WINDOW.md)
- [源码基线](docs/SOURCES.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)
- [Rule / Skill 索引](rule/skill/README.md)

## 参考

- electron-egg：<https://github.com/wallace5303/electron-egg>
- Coolma：<https://github.com/ui-javascript/coolma-electron>
