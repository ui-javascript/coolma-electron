# C-01：旧 stash 审计

日期：2026-11-22
Stash：`stash@{0}` / commit `20a2098`
Base：`b4e87b6 feat(views): 恢复 vue2 双层 splitter 布局并改 px 语义`
Patch SHA-256：`b60d5cdcbe01af655dbbfcf1f817d3204a6d6608e207872e6ad8646156255c38`

## 内容

14 个文件，+522/−49，主要分三块：

1. `desktop-vue2` / `desktop-vue2-tauri`：`Muya.vue` 增加 `runeProps` 整包透传；`meltRuneHost.js` 增加 dep 级 loader、`getMeltDepKey`、`getMeltPoolKey`、`resetMeltDepLoader`；对应测试补 52 行。
2. `desktop-vue3`：`enums/app.ts`、`HeaderBar.vue`、`SettingsServerPanel.vue`、`HomeView.vue`、`package.json` 的旧迭代。
3. `libs-muya-vue2` 与 `pnpm-lock.yaml` 的配套改动。

## 审计结论

这些能力已经进了当前 `master`，不是未合并的独有实现：

- `desktop-vue2/src/components/muya/Muya.vue` 已有 `runeProps` 声明与 `...(this.runeProps || {})` 透传。
- `desktop-vue2/src/components/rune/meltRuneHost.js` 已有 `getMeltDepKey`、`depLoaderCache`、`getMeltPoolKey`、`resetMeltDepLoader`，且实现比 stash 更完整（包含 dep loader entry 与刷新世代）。
- `desktop-vue2/tests/unit/rune/melt-rune-host.test.js` 已断言 `getMeltDepKey` 等接口。
- `desktop-vue3/electron/shared/enums/app.ts`、`SettingsServerPanel.vue`、`desktop-vue3/package.json` 与 stash 无差异。
- `git diff HEAD stash@{0}` 对 `meltRuneHost.js` 的差异是“stash 旧版 → HEAD 新版”的净删除，没有 HEAD 缺失的新增能力。

## 处理

确认无独有工作后执行 `git stash drop stash@{0}`，不把旧 WIP 合进当前分支。

Stash 对应的 commit `20a2098` 仍可按 hash 找回：

```bash
git show 20a2098
git stash apply 20a2098
```

直到 Git 对象被 gc 前都可恢复，因此这次 drop 不是不可逆删除。
