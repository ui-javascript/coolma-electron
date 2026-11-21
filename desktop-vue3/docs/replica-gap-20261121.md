# vue2 → vue3 复刻流程级复审（2026-11-21）

## 口径

- 只认 `desktop-vue2` 实际行为，不以旧清单的打勾状态为准。
- 验收单位是**流程闭环**：入口 → 动作 → 数据变化 → 可见结果 / 恢复路径。
- “有文件、有按钮、有类型”不等于已复刻；死入口、接错弹窗、只读展示都算缺口。
- 样式差异后置，本清单只记功能、数据和行为差异。

旧 `gap-audit.md`（2026-11-18）与 `_todo/TODO-vue3-P0缺口-202611.md` 的 18 个 `[x]` 仅代表文件级覆盖。本轮按 vue2 页面、顶栏、对话框、右键菜单和 busDialog 逐块重走，新增以下 24 条。

> 2026-11-21 批 A 已落地：P0-1 回响实例弹窗、P0-2 手动标签入口、P0-3 文件夹笔记导入、P0-4 豆包 provider。B1/B2 已落地：P1-5 自动上传与顶栏同步（App 级 3s 首传 + 30s 轮询 + 5min 冷却，顶栏 push/pull 与 pending 角标，Settings 手动同步共用同一把锁）；P1-6 强运 AI 校对（全局 handler 注册、当前 Markdown 校对、变化检测后整篇写回）；B3 已落地：P1-7 符文/回响表单 AI 代码生成（`aiCodegen` 构建 prompt、表单 AI 按钮经 busDialog 带 callback、面板 codegen 模式预填/提取/回写源码）；B4 已落地：P1-8 博客构建环境引导（Node 检测与安装指引、package.json/config 自动生成或修复、sidebar/nav builders、缺依赖安装、清缓存后构建）；B5 已落地：P1-9 博客 base 输入与 VuePress base 规范化回写（已有 config 只改 base、保留其它字段，hope 的 config({...}) 也支持）。B6 已落地：P1-10 单条 GitHub `.vue` 符文导入（blob/raw/gist URL 归一、SSRF 白名单、302 逐跳校验、5MB/20s、前 20 行注释元数据、1MB 模板、入库后列表刷新）。B7 已落地：P1-11 微应用通用 IPC 桥 + `vue-sfc:parse` 特例桥（通用桥解包 IpcResult、白名单/越权/失败回包；`controller/microapp/parse` 复用 `@vue/compiler-sfc` 2.7.16，输出与 Vue2 playground 同形的 template/script/style/customBlocks）。B8 已落地：P1-12 完整键盘 accelerator 表（`utils/shortcuts.ts` 对齐 vue2 KeyBindings，按物理键与精确修饰键匹配，Muya/Monaco 双编辑器命令和应用级视图/搜索/DevTools 已接）。C 批仍待做。

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
| 5 | 自动上传与顶栏同步入口缺失 | 登录后顶栏 push/pull 按钮 + pending 角标；启动 3 秒首次补传，之后每 30 秒轮询，失败冷却 5 分钟 | ✅ 已补：`stores/sync.ts` 统一调度，App 启动轮询、登录后立即补传，Home 顶栏 push/pull + pending 角标，Settings 手动同步共用同一 store 锁 |
| 6 | “强运”回响点击无反应 | `window.__memocastEchoChantHandlers.lucky` 调 `AiProofreadService.proofread()` 并替换当前笔记 | ✅ 已补：`services/aiProofread.ts` 对齐 vue2 提示词，`EditorPane.vue` 注册/清理 lucky handler，校对成功且有变化才整篇写回；切笔记/改正文/截断时拒绝覆盖 |
| 7 | 符文/回响 AI 代码生成缺失 | 表单 AI 生成入口把内置模板拼成 prompt，经 `codeGenMode` 生成并回调写回表单 | ✅ 已补：`utils/aiCodegen.ts` 按 vue2 拼符文/回响 prompt 并提取代码块；`LibraryFormDialog` 描述旁 AI 按钮经 `AiHelperBusDialog.open` 带 `codeGenPrompt/type/targetName/callback`；`AiHelperPanel` codegen 模式预填 prompt、隐藏笔记上下文、生成后回写源码框 |
| 8 | 博客“一键构建”缺环境引导 | 自动检查/创建 `package.json`、`.vuepress/config.js`，软链或安装 `node_modules`，改 `base/theme` 后构建 | ✅ 已补 Node/theme/package/config/依赖部分：`blogEnv.ts` 生成四套主题模板与 sidebar/nav builders，`build.ts` 构建前检测 Node、修复/生成 package.json 与 config.js、缺依赖自动安装、清缓存再执行 build；缺 Node 时 UI 给安装指引。`base` 输入与 config 回写仍归 B5 |
| 9 | 博客部署 base 路径缺失 | 表单 `base` 字段，空值保留已有配置，非空改写 VuePress publicPath | ✅ 已补：`BlogDeployDialog` 增 `base` 输入并持久化；`blogEnv.ts` 复刻 `normalizeBase`（`/foo///`→`/foo/`、`./` 保留）与 `applyBaseToConfig`，已有 config 只替换/插入 base 并保留其它字段，新建 config 直接写入规范化 base |
| 10 | 符文单条 GitHub SFC 导入缺失 | 支持 github blob/raw、raw.githubusercontent、gist，导入单个 `.vue` 模板并可选分类 | ✅ 已补：`remote-fetch.ts` 做 URL 归一、SSRF 白名单与 302 逐跳重新校验；`shared/runeRemote.ts` 复刻前 20 行注释解析与 URL 文件名回退；`RuneRemoteImportDialog` 从符文分类工具栏进入，可选分类，1MB 模板直接入库并刷新列表。真实 GitHub blob 抓取+解析已过 smoke；未在 Electron 窗口内点击端到端 |
| 11 | 微应用通用 IPC 桥未接 | `genericMicroAppIpcBridge` 监听 `microapp:ipc:request`，按白名单 invoke，另有 `vue-sfc:parse` 特例 | ✅ 已补：通用桥已接 `coolma.invoke` 并解包 `IpcResult`，白名单外返回 `CHANNEL_NOT_ALLOWED`；`microapp:parse:request` 经 `controller/microapp/parse` 编译 Vue2 SFC，前端桥默认实现已注册；runtime 覆盖成功、越权、失败、缺 requestId、卸载。未在 Electron 窗口内用 vue2-sfc-playground 真机点击 |
| 12 | 键盘加速键只复刻 4 个 | 撤销/重做、复制为 Markdown/HTML、纯文本粘贴、标题层级、代码块/表格/公式、加粗/斜体/链接/图片、源码模式、锁定、搜索等 | ✅ 已补：`utils/shortcuts.ts` 逐条对齐 vue2 KeyBindings（Linux/Windows 48 条、macOS 另加 3 条 appMenu），按 `event.code` 与精确修饰键匹配并挡输入法组合态；HomeView 分发布局/源码/锁定/保存/搜索/DevTools，Muya 接段落、格式、撤销、复制、纯文本粘贴与段落增删，Monaco 接撤销/重做/全选/复制/纯文本粘贴；`controller/window/openDevTools` 已进白名单。24 条 runtime 断言与 Muya 真命令过测；未在 Electron 窗口内逐键点击 |

## P2：细节与边界

| # | 缺口 | 说明 |
|---|---|---|
| 13 | 顶栏换肤下拉缺失 | vue2 顶栏可直接切 nezha/baiyang/infp；v3 只能进设置页 | ✅ 已补：`SkinDropdown` 插在 HomeView 布局键后，菜单固定哪吒/白羊/INFP；`useSkinPick` 与设置页共用同一动作，同皮只 info 提示、换皮落 store + 特效 bus + 配色 toast；皮肤名改读根级 `skin.*`，修掉设置页显示 key；typecheck/runtime/frontend build/build-electron 过；未在 Electron 窗口内点下拉验收 |
| 14 | 新建笔记不询问标题 | vue2 弹“模板 + 标题”；v3 直接建“未命名笔记” | ✅ 已补：`NewNoteDialog` 统一接列表新建、侧栏模板下拉、右键与 Ctrl+N；空模板置首、模板按 `sortOrder/createdAt` 排序，默认标题取末级分类 + `YYYYMM`，打开聚焦全选标题；无模板也交由主进程补 `# 标题`；typecheck/runtime/frontend build 过；未在 Electron 窗口内点弹窗 |
| 15 | 右键新建子目录不挂当前节点 | v3 只能手输 `/父/子`；vue2 预置右键节点为 `parentCategory` | ✅ 已补：`startCreateFolder(parentCategory)` 由右键节点传入，弹窗只收子目录名并用 `joinFolderPath` 拼成 `/父/子`；工具栏新建仍支持多级路径；typecheck/runtime/frontend build 过；未在 Electron 窗口内右键点菜单 |
| 16 | 删除非空文件夹语义不同 | vue2 只删分类节点，笔记仍在；v3 返回 `CATEGORY_NOT_EMPTY` 拒绝删除 | ✅ 已补：主进程去掉非空拦截，`categories.remove` 只删节点；侧栏删除不再按笔记数阻断，HomeView 删除后仅当筛选落在被删子树时回退并提示成功；db 断言确认删目录后笔记仍在；typecheck/test:db/runtime/frontend build/build-electron 过；未在 Electron 窗口内点删除 |
| 17 | 笔记模板缺批量删除（“拖拽排序”为误记） | vue2 实际只有勾选后批量删除，没有拖拽排序；v3 只有新增/编辑/单删 | ✅ 已补：`NoteTemplateCard` 加非内置模板勾选、已选数量与批删按钮，确认后逐条删并提示数量；`removableTemplateIds` 过滤内置与失效 id；typecheck/runtime/frontend build 过；未在 Electron 窗口内勾选批删 |
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

1. 批 A（已完成）：P0-1 回响实例弹窗、P0-2 手动标签入口、P0-3 文件夹笔记导入、P0-4 豆包 provider。
2. 批 B（已完成）：P1-5 自动同步、P1-6 强运 AI 校对、P1-7 符文/回响 AI 代码生成、P1-8/9 博客环境与 base、P1-10 单条远程符文导入。
3. 批 C（B7/B8 已提前完成）：P1-11 微应用 IPC、P1-12 完整快捷键已落地；剩余 P2 的边界和入口对齐（C1-C12）。
