# Electron 真机验证（2026-11-22）

## 环境

- Electron `39.8.10`，Linux + Xvfb `1280x1024`
- 生产前端 `desktop-vue3/public/dist`
- SQLite schema `6`，`better-sqlite3` 已按 Electron ABI `140` 重建
- 无窗口管理器；无桌面会话、无真实登录

## 操作路径

1. `pnpm rebuild:sqlite`
2. `xvfb-run -a pnpm start`
3. 登录弹窗点“跳过登录”
4. `Ctrl+N` 新建笔记，模板“空模板”，标题 `electron-check.md`
5. 在 Muya 正文输入 `Hello Electron`

## 结果

- 主进程、preload、CSP、SQLite、自动备份均正常启动
- 无边框窗口正常显示，右上角最小化/最大化/关闭按钮存在
- “我的笔记”嵌套根、0/1 计数、列表项、空态 Memocast 标志正常
- 新建笔记落库并自动打开，顶栏显示标题
- Muya 正常渲染 H1 标题与正文段落
- 输入后底部显示“已保存”，说明编辑与保存链路可用
- 截图：`electron-verify-20261122.png`

## 未验证

- Xvfb 没有窗口管理器，点击最大化只触发 hover，窗口尺寸未变化；最大化/还原状态需要真实桌面复验
- 未登录为知，未验证云同步、附件下载、账号态顶栏图标
- 仅创建一条本地测试笔记，未验证大量笔记性能

## 启动日志要点

```text
[lifecycle] window-ready
[preload] Coolma Vue3 bootstrap
[security] CSP, navigation and permission hardening enabled
[db] ready: .../coolma.db schemaVersion: 6
[db] backup created
```
