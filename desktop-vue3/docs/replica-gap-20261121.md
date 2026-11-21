# vue2 → vue3 复刻流程级复审（2026-11-21）

## 口径

- 只认 `desktop-vue2` 实际行为，不以旧清单的打勾状态为准。
- 验收单位是**流程闭环**：入口 → 动作 → 数据变化 → 可见结果 / 恢复路径。
- “有文件、有按钮、有类型”不等于已复刻；死入口、接错弹窗、只读展示都算缺口。
- 样式差异后置，本清单只记功能、数据和行为差异。

旧 `gap-audit.md`（2026-11-18）与 `_todo/TODO-vue3-P0缺口-202611.md` 的 18 个 `[x]` 仅代表文件级覆盖。本轮按 vue2 页面、顶栏、对话框、右键菜单和 busDialog 逐块重走，新增以下 24 条。

## P0：流程断点

| # | 缺口 | vue2 实际行为 | vue3 现状 |
|---|---|---|---|
| 1 | 回响实例编辑链路缺失 | 点击正文 `@回响{}()` 打开 `EchoInstanceDialog`：按 schema 编辑 props/value、继承参数、展示实例 ID、跳转“编辑定义”，保存后回写当前实例 | 只有 `echoRegistry / echoPropsParser / echoPayloadCodec`；无 `EchoInstanceDialog`，无点击回响打开实例弹窗的回调 |
| 2 | 当前笔记手动标签入口不可达 | 顶栏点击笔记标题打开 `TagDialog`，选择/新建/删除标签，标题旁展示当前标签 | `TagEditorDialog.vue` 与 `tagVisible` 已存在，但 `HomeView` 没有按钮或菜单命令触发；只剩 AI 打标 |
| 3 | 文件夹右键“导入”接错弹窗 | 文件夹右键导入 `.md`，`ImportDialog` 多选后逐篇建笔记 | 文件夹“导入…”复用 `PackImportDialog`，默认导入符文 pack；`NoteImportDialog` 只在设置页数据卡，且未把当前文件夹作为 `category` |
| 4 | “豆包”AI 助手模式是死设置 | AI provider 选 `doubao` 时打开 `AiDoubaoDrawer`，选 `builtin` 开内置助手 | `SettingsView` 只把 `coolma.aiProvider` 写进 localStorage，全前端无消费；无 `AiDoubaoDrawer` |

## P1：主路径缺口

| # | 缺口 | vue2 实际行为 | vue3 现状 |
|---|---|---|---|
| 5 | 自动上传与顶栏同步入口缺失 | 登录后顶栏 push/pull 按钮 + pending 角标；启动 3 秒首次补传，之后每 30 秒轮询，失败冷却 5 分钟 | 只有设置页里的推送/拉取；无自动上传定时器、pending 轮询、顶栏同步控件 |
| 6 | “强运”回响点击无反应 | `window.__memocastEchoChantHandlers.lucky` 调 `AiProofreadService.proofread()` 并替换当前笔记 | 内置卡仍调用该全局 handler，但全仓无注册点，也无 AI 校对服务 |
| 7 | 符文/回响 AI 代码生成缺失 | 表单 AI 生成入口把内置模板拼成 prompt，经 `codeGenMode` 生成并回调写回表单 | `LibraryFormDialog` 无 AI 入口；`AiHelperPanel` 不接收 codeGen 参数 |
| 8 | 博客“一键构建”缺环境引导 | 自动检查/创建 `package.json`、`.vuepress/config.js`，软链或安装 `node_modules`，改 `base/theme` 后构建 | `build.ts` 只执行已有 build script，目录不能构建时直接失败 |
| 9 | 博客部署 base 路径缺失 | 表单 `base` 字段，空值保留已有配置，非空改写 VuePress publicPath | 无 `base` 输入，也无 config writer |
| 10 | 符文单条 GitHub SFC 导入缺失 | 支持 github blob/raw、raw.githubusercontent、gist，导入单个 `.vue` 模板并可选分类 | 只有 pack JSON 远程导入，不能直接导入一张 `.vue` 符文卡 |
| 11 | 微应用通用 IPC 桥未接 | `genericMicroAppIpcBridge` 监听 `microapp:ipc:request`，按白名单 invoke，另有 `vue-sfc:parse` 特例 | `microAppBridge.ts` 只有 parse 骨架，`setMicroAppParseImpl` 未调用，无通用 IPC 监听 |
| 12 | 键盘加速键只复刻 4 个 | 撤销/重做、复制为 Markdown/HTML、纯文本粘贴、标题层级、代码块/表格/公式、加粗/斜体/链接/图片、源码模式、锁定、搜索等 | 只处理 `Ctrl+N/F/S` 与 `Ctrl+Shift+L` |

## P2：细节与边界

| # | 缺口 | 说明 |
|---|---|---|
| 13 | 顶栏换肤下拉缺失 | vue2 顶栏可直接切 nezha/baiyang/infp；v3 只能进设置页 |
| 14 | 新建笔记不询问标题 | vue2 弹“模板 + 标题”；v3 直接建“未命名笔记” |
| 15 | 右键新建子目录不挂当前节点 | v3 只能手输 `/父/子`；vue2 预置右键节点为 `parentCategory` |
| 16 | 删除非空文件夹语义不同 | vue2 只删分类节点，笔记仍在；v3 返回 `CATEGORY_NOT_EMPTY` 拒绝删除 |
| 17 | 笔记模板缺批量删除、拖拽排序 | v3 只有新增/编辑/单删 |
| 18 | 符文/回响表单元数据缩水 | v2 有图标选择、代码编辑器、字段分区；v3 基本是名称/描述/颜色/分类 + textarea |
| 19 | 云函数设置少分支且测试不真实 | 少 Supabase、`electron/app-plus`；测试只 HEAD baseUrl；示例不能执行 `invokeDemo` |
| 20 | 自定义主题目录管理缺失 | v2 有主题帮助、刷新主题目录、打开主题目录；v3 皮肤固定三种 |
| 21 | 日志/SQLite 运维入口缺失 | v2 可打开日志目录、打开 SQLite、重置数据库/内置符文/回响；v3 只有备份、体检、重建标签索引 |
| 22 | 关闭窗口无二次确认 | v2 标题栏关闭提示“退出程序”；v3 `closeWindow()` 直接关，`beforeClose` 为空 |
| 23 | 默认笔记排序不一致 | v2 默认 `TitleAsc`；v3 默认 `ModifiedTimeDesc` |
| 24 | 博客自定义构建命令缺失 | v2 可填 `customBuildCommand`；v3 只能执行 `package.json` 已有脚本 |

## 已核对、不算缺口

- 博客进度不需要独立 `BlogDeployProgressDialog`：v3 已把日志、阶段、取消、结果合并进 `BlogDeployDialog`。
- 17 张内置回响、14 个内置符文模板已全量迁入 catalog。
- `libs-muya-echo-vue3` 的 runtime/registry/inherit 与 vue2 对应文件 diff 为空。
- 笔记导入弹窗本身存在，问题是文件夹入口接错。
- 设置页文件不一一对应不算缺口：v3 用卡片合并 General/Editor/AI/Cloud/Server 等能力。
- 导航中心、榜单、日历、搜索、四套右键菜单、离线同步提示、图床上传、SFTP、GitHub dispatch、数据库备份均已落地。
- `customFn` 自建云函数同步在 vue2 也基本是未消费的 provider 选项，不计为 v3 独有缺口。

## 建议批次

1. 批 A：P0-1 回响实例弹窗、P0-2 手动标签入口、P0-3 文件夹笔记导入、P0-4 豆包 provider。
2. 批 B：P1-5 自动同步、P1-6 强运 AI 校对、P1-7 符文/回响 AI 代码生成、P1-8/9 博客环境与 base、P1-10 单条远程符文导入。
3. 批 C：P1-11 微应用 IPC、P1-12 快捷键，以及 P2 的边界和入口对齐。
