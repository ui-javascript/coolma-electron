# vue2 → vue3 差距清点（2026-11-18）

口径：只认 vue2 实际行为。`desktop-vue2/src` 共 27 个组件目录，`desktop-vue3/frontend/src` 目前 33 个组件 + 2 个视图。
下面分三档：**P0 功能缺口**（用户能直接感知的整块功能）、**P1 引擎欠账**、**P2 已接受差异**。

## P0 功能缺口（按 vue2 源文件逐项对出来的）

| # | vue2 位置 | 缺什么 | 备注 |
|---|---|---|---|
| 1 | `search/SearchDialog.vue` | 全库搜索面板 | vue3 只有 Ctrl+F 聚焦列表搜索框，没有跨字段高亮面板 |
| 2 | `note/NoteOutlineDrawer.vue` | 大纲抽屉 | 标题层级跳转，vue3 无 |
| 3 | `contextMenu/`（13 文件，4 套菜单） | 右键菜单体系 | vue2 有 noteList / muya / markMap / sideDrawer 四套，vue3 只有 `NoteContextMenu.vue` 一层 |
| 4 | `common/busDialog*`（5 文件） | 全局弹层总线 | `busDialogBus/context/registry/BusDialogLayerHost/BusLayerContainer`，供任意模块 `bus.$emit` 开对话框；vue3 无 |
| 5 | `ai/AiHelperDrawer.vue`、`AiDoubaoDrawer.vue`、`AiHelperBusDialog.vue` | AI 助手 / 豆包抽屉 | vue3 只有设置页的模型与技能管理，没有对话入口 |
| 6 | `settings/SettingsServerPanel.vue` | 服务器 / 同步服务配置 | 通道 `sync.pending` 在，配置面板不在 |
| 7 | `settings/settingsProfilePanel.vue` | 个人资料 | 头像 / 昵称 / 简介 |
| 8 | `settings/SettingsCloudFnPanel.vue` + `cloud/cloudFunctionConfigDialog.vue` + `cloud/cloudBspAppDemoDialog.vue` | 云函数 / 云应用 | 三个文件一整条链路 |
| 9 | `settings/cdnDepEditDialog.vue` | CDN 依赖编辑 | 导出 HTML / 渲染依赖注入用 |
| 10 | `blog/BlogDeployDialog.vue`、`BlogDeployProgressDialog.vue` | 博客部署 | 部署 + 进度，两个 dialog |
| 11 | `image/ImageUploadServiceDialog.vue` | 图床上传服务 | 已接：PicGo / 为知官方 / 本地，失败回退本地（P5 11.51） |
| 12 | `update/UpdateDialog.vue` | 检查更新 | 版本比对 + 下载提示 |
| 13 | `ranking/rankingTierDialog.vue` | 榜单分层 | — |
| 14 | `navigation/NavigationDialog.vue` | 导航 | — |
| 15 | `sync/syncOfflinePromptDialog.vue` | 离线提示 | — |
| 16 | `import/ImportDialog.vue` | 通用导入 | vue3 的 `PackImportDialog` 只覆盖 pack v1，vue2 还支持别来源，需逐条核对 |
| 17 | `components/echo`（34 文件）/ `rune`（22 文件） | 分类专属交互 | vue3 用 `LibraryManagePanel` 统一管理，列表 / 拖拽 / 分类 Tab 已复刻；echo/rune 各自的卡片样式与专属操作（如回响气泡、符文 SFC 预览细节）未逐项对齐 |

## P1 引擎欠账（`libs-muya` / `libs-muya-v3`）

1. **libs-muya 没有 src 目录**，源码就在 `lib/` 里，webpack 直接从 `lib/index.js` 出包；因此「改源码」和「构建产物」是同一份，无法做 clean build。
2. **引擎仍有 2 个 app 级依赖**：`boot/i18n`、`src/components/echo/echoCore`。四端全靠 alias 兜（demo-vue2、vitepress、vuepress、desktop-vue2 各一份 shim）。
3. **SSR 不安全**（本次构建实证）：
   - 已修：`lib/config/index.js` 的 `window && window.navigator` 改成 `typeof window` 守卫。
   - 已修（消费端）：`MuyaLive.vue` 不再静态导入 `libs-muya/lib`，改成 `mounted` 里 `await import('libs-muya/lib')`；SSR 阶段只渲染页面正文和组件外壳，引擎模块体等客户端挂载后才求值。`vuepress build` 不再出现 `Failed to resolve async component / document is not defined`，`/pages/03ae9f/` 静态 HTML 已有正文。
   - 仍记：引擎本身仍有顶层 DOM 访问（`selection/index.js` 的 `new Selection(document)`、`snap.svg-min.js` 的 `a.window.document`），真正的引擎级 SSR 安全另批处理；当前四端消费方都按客户端动态加载兜住。
   - vitepress 没炸是因为那页走 ClientOnly，不代表引擎 SSR 安全。

## P2 已接受差异（用户已拍板，不再追）

- 日历视图客户端聚合（5000 条全量 + computed），服务端聚合留占位。
- `markdownOnly` 设置项占位。
- AI portkey 连通测试暂不跑。
- hel-micro 只做类型与调用链，无远端 lib 地址不真机联调。
- 无 Electron 真机验证链路（cgroup 4G 必 OOM），一切走静态层验收。
- 微应用：`click-at / choice` 只透传不消费（vue2 同为空调）。

## 各前端包构建结果（本次实测）

| 包 | 命令 | 结果 |
|---|---|---|
| `echo-core` | `esbuild src/index.ts` esm+cjs | 通过（3.2kb / 4.2kb） |
| `rune-core` | 同上 | 通过（4.5kb / 5.5kb） |
| `libs-muya` renderer | `node scripts/build.js` | 通过，webpack 5 警告 5 条（runtimeChunk / 体积） |
| `libs-muya` core | `node scripts/build.js --core` | 通过，警告 4 条 |
| `demo-vue2-vite-muya` | `vite build` | 通过（补 `stubs/popper.js/dist/esm/popper.js` 空壳后） |
| `tpl-vitepress1-teek-muya` | `vitepress build docs` | 通过，53s |
| `tpl-vuepress1-voding-muya` | `vuepress build docs` | 通过，但 SSR 阶段 `document is not defined` 警告（见 P1-3） |
| `desktop-vue2` | `quasar build -m spa` | 通过（打包产物 `dist/spa`），说明 vue2 侧当前无语法错误 |
| `desktop-vue3/frontend` | `vue-tsc --noEmit && vite build` | 通过，51s |
| `desktop-vue3/packages/*` | 无 build 脚本 | 纯源码，由前端 typecheck 覆盖 |
| `_plugins/box-im-wujie` | `vue-cli-service build` | **未验证**：目录内无 node_modules |
| `_plugins/doubao-input` | `vite build` | **未验证**：目录内无 node_modules |

## 建议顺序

1. 引擎 SSR 收口（P1-3）：把所有模块顶层 `document/window` 改成惰性访问，让 vuepress/vitepress 真能 SSR。
2. 引擎去 app 依赖（P1-2）：`boot/i18n` 改成注入式 `setI18n()`，echoCore 移到 `plugins-muya-echo`。
3. P0 里按使用频率补：搜索面板（1）→ 大纲（2）→ 右键菜单四套（3）→ busDialog（4）→ AI 助手抽屉（5）。
4. 其余设置类面板（6-11）成批补，跟设置页分组合并。
