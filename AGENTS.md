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

- 包管理器固定使用 **yarn**，禁止 `npm install` / `pnpm install`。
- 更多细则见 `.cursor/rules/` 下的规则文件；临时试验代码统一放在 `./_temp/`。
