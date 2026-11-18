# AGENTS.md — 仓库协作约定

本文件是本仓库的**常驻规则**，所有 AI/自动化代理与贡献者都必须遵守。

## 提交信息规范（强制）

- 所有 `git commit` 的提交信息**必须使用中文**书写（标题与正文都是中文）。
- 可以保留 Conventional Commits 的类型前缀（`feat` / `fix` / `chore` / `docs` / `refactor` / `perf` / `test` / `build` / `ci` / `style`），但**类型之后的描述必须是中文**。
- 禁止纯英文标题，也禁止 `small`、`adjust`、`update` 这类无信息量标题。
- 需要正文时用中文说明**动机与影响面**（为什么改、改了哪些模块、有无破坏性变更）。

正确示例：

```
feat(同步): 实现云端同步策略并更新相关组件
fix(设置): 修复 SQLite 配置写入后未即时刷新的问题
perf(启动): 缩短冷启动耗时
```

错误示例：

```
feat(sync): implement cloud sync strategies and update related components
small
adjust
```

## 其他项目约定

- 包管理器固定使用 **pnpm**；在仓库根目录执行 workspace 安装与脚本。
- workspace 包：`desktop-vue2`、`desktop-vue3`、`libs-muya`、`demo-vue2-vite-muya`、`tpl-vuepress1-voding-muya`、`tpl-vitepress1-teek-muya`。
- 临时试验代码统一放在 `./_temp/`。

**Windows 清理 `node_modules` 前，必须先读 [链接安全规则](.agents/rules/safe-shell.mdc#8-windows-清理-node_modules)。** pnpm 建立的 junction 可能直接指向 workspace 源码。曾有 `Move-Item` 移动根 `node_modules` 时沿 junction 误删源码的事故。禁止用 `Move-Item` 搬走依赖树；清理遇到链接只能移除链接本身。

## 代理技能与规则

- 仓库内的所有代理技能包和规则统一在 `.agents/` 下维护。技能包放在 [`.agents/skills/`](.agents/skills/)，每个技能有独立的 `<技能名>/SKILL.md`，配套文件与技能放在同一目录。规则文件放在 [`.agents/rules/`](.agents/rules/)。
- 新增或修改技能与规则时，只编辑 `.agents/` 下的源文件。需要工具专用入口时，入口仅引用这里的文件，避免多份正文分别维护。
- 开始任务前，先读取适用的规则和技能。规则入口如下：

| 工作内容 | 先读取的规则 |
| --- | --- |
| Git 提交、依赖与 workspace | [中文提交](.agents/rules/commit-message.mdc)、[包管理](.agents/rules/package-manager.mdc) |
| 文件操作、脚本编写 | [Shell 与文件操作安全](.agents/rules/safe-shell.mdc)、[脚本位置](.agents/rules/script-file-location.mdc) |
| Vue 组件与界面 | [命名](.agents/rules/component-naming.mdc)、[Vue 版本](.agents/rules/plugin-vue-version.mdc)、[UI 库](.agents/rules/ui-library-mix.mdc)、[弹层组件](.agents/rules/vue-dialog-component.mdc)、[Mixin](.agents/rules/no-mixins.mdc) |
| JS 类型判断、Quasar 依赖转译 | [类型判断](.agents/rules/type-check-with-lodash.mdc)、[依赖转译](.agents/rules/quasar-transpile-dependencies.mdc) |
| 设置存储 | [SQLite 存储](.agents/rules/sqlite-settings-storage.mdc) |
| Muya SDK、符文、回响和云函数 | [Muya SDK 约定](.agents/rules/coolma-muya-sdk-guidelines.mdc)、[试验阶段约定](.agents/rules/rune-echo-cloudfn-experimental.mdc)、[符文与回响测试](.agents/rules/rune-echo-test-moat.mdc) |
