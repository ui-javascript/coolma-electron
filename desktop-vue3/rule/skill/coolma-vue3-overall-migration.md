# Coolma → Coolma Vue3 整体迁移方案

> 状态：**P2 已完成；P3 真实数据/CRUD 完成；P4 Muya 首版接入**
> 基线日期：2026-11-09
> 目标工程：`E:\work-coolma-vue3`
> 业务参照：`coolma-electron` `master` @ `56d135e`
> 框架基线：`electron-egg` `demo_v4_ts` @ `0a4de64`（v4.2.0）
> 新版参考：`electron-egg` `dev_v5` @ `2fce364`（v5.0.0 / ee-core 5.0.3）

---

## 0. 结论先行

这次不做“在 Coolma 老仓库里把 Vue 2 改成 Vue 3”，而是：

```text
用 electron-egg 的 TS 模板新建一个工程
  + 复用 Coolma 的数据格式、业务规则、交互与视觉
  + 重写主进程边界、Vue3 渲染层、Muya 包装层和 Rune 编译器
```

核心判断：

1. **以 `demo_v4_ts` 为脚手架**。它是 electron-egg 目前唯一的全栈 TypeScript demo：
   主进程 TS、前端 Vue 3 + Vite + TS。v5 的主进程虽然也是 TS，但前端仍是 JS，
   且改成了 pnpm workspace，不适合作为“同时复刻业务”的起点。
2. **复刻的是行为和资产，不是文件结构**。Coolma 的 `electron-main.js` 有 4079 行、
   99 个 IPC handler，`api.js` 另有 27 个通道，不能按文件 1:1 搬。
3. **最大风险不在 Vue 本身**，而在：
   - Muya 的 Vue 2 包装层；
   - Rune 动态 SFC 的编译与执行；
   - Quasar 1 / Element UI → Element Plus 的 UI 断代；
   - SQLite 数据与 126 个 IPC 通道的完整性。
4. **先交付可运行的 MVP，再补重服务**。MVP 范围：窗口、三栏布局、分类/标签/笔记、
   Muya 编辑与自动保存、搜索、设置、导入旧数据库。AI、同步、博客部署、微应用、
   自定义 Rune 放到后续阶段。

路线总览：

```text
P0 基线与方案          ✅ 已完成
P1 工程骨架与安全边界   ✅ 已完成
P2 数据层与旧库导入         ✅ 核心完成
P3 三栏壳 + 真实笔记 CRUD    ✅ 核心完成，编辑入口待补
P4 Muya 编辑器              ✅ 首版接入，自动保存已接
P5 Rune / Echo 运行时
P6 AI / 同步 / 博客 / 微应用
P7 打包、性能、安全、验收
```

---

## 1. 当前基线

### 1.1 已下载内容

| 本地目录 | 上游 | Commit | 说明 |
| --- | --- | --- | --- |
| `.tmp/electron-egg-ts/` | `wallace5303/electron-egg` `demo_v4_ts` | `0a4de64` | v4.2.0，全栈 TS 模板 |
| `.tmp/electron-egg-v5/` | `wallace5303/electron-egg` `dev_v5` | `2fce364` | v5 架构参考，前端为 JS |
| `.tmp/coolma-electron/` | `ui-javascript/coolma-electron` `master` | `56d135e` | 业务参照，MIT |

补充说明见 [`.tmp/SOURCES.md`](../../.tmp/SOURCES.md)。三个目录都是浅克隆，**只读**，
不在其中直接开发，也不把 `.git` 带进目标工程。

### 1.2 版本选择记录

| 方案 | 内容 | 判断 |
| --- | --- | --- |
| A. `demo_v4_ts` v4.2.0 | 主进程 TS + 前端 Vue3/Vite/TS | **采用** |
| B. `dev_v5` | 主进程 TS + 前端 Vue3/JS + workspace | 参考，不直接做基线 |
| C. 自己搭 Electron + Vite | 自由但重复造轮子 | 不采用 |

选 A 的原因：

- 前后端都是 TypeScript，符合“TS 版本”的目标；
- `ee-core` / `ee-bin` 的构建、开发、打包链路是现成的；
- v5 尚未提供 TS 前端 demo，直接上 v5 会把“框架升级”和“业务复刻”绑在一起；
- v4.2.0 的 Electron 39 / Vue 3.5 / Vite 5 已经足够新，可在 P7 再评估升级。

**P1 先锁定精确版本**，不使用 `^` 浮动升级。Electron 先跟模板的 39.x，
不直接追 Coolma 的 45.x；原生模块（better-sqlite3）和 electron-builder 的兼容性
在 P2/P7 单独验证。

### 1.3 目标工程状态

目前 `E:\work-coolma-vue3` 只有 `.tmp/`、`rule/` 和本方案，**还没有初始化应用代码**。
这样可以在 P1 一次性决定目录、包管理器、IPC 契约，避免先复制模板再反复迁移。

---

## 2. 目标技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 桌面框架 | electron-egg 4.2.0 | 主进程 / preload / 构建 / 升级 |
| 运行时 | Electron 39.x → P7 评估 4x | 先稳定，后升级 |
| 语言 | TypeScript 5.x | 主进程、preload、渲染层、shared 全 TS |
| 前端 | Vue 3.5 + Vite 5 | 沿用模板 |
| 状态 | Pinia | 不迁 Vuex 3；按领域重划 store |
| 路由 | Vue Router 4（hash） | `file://` 场景必须 hash |
| i18n | vue-i18n 11 | 复用 Coolma 的 15 个语言文件 |
| 枚举/字典 | **enum-plus** | 业务枚举、label/tag 元数据、Element Plus 下拉数据源；主进程与渲染层共用 |
| UI 主库 | **Element Plus** | 唯一 UI 组件库；`q-*` / `el-*` / `a-*` 统一迁到 Element Plus |
| UI 次库 | 无 | 不引入 Quasar / Ant Design Vue，避免多套设计系统 |
| 图标 | `@element-plus/icons-vue` | 与 Element Plus 同版本生态 |
| 数据库 | better-sqlite3 | 主进程同步访问；兼容 sql.js 生成的 SQLite 文件 |
| 校验 | zod | IPC 入参、配置、导入包 |
| 日志 | electron-log | 主进程文件日志 + 渲染层转发 |
| 更新 | electron-updater | 沿用 Coolma 的 GitHub release 思路 |
| 测试 | Vitest + @vue/test-utils 2 + Playwright | 单测、组件、Electron E2E |
| 包管理 | pnpm 10 workspace | 统一管理 frontend、libs-muya、plugins-muya-*；`workspace:*` 链接本地包 |

### 2.1 为什么最终选 Element Plus，而不是 Quasar 2

最初方案倾向于 Quasar 2，因为 Coolma 的界面里 `q-*` 标签非常多：

| UI 标签 | 出现次数 | 迁移判断 |
| --- | ---: | --- |
| `q-*` | 766 | 全部改写成 Element Plus 等价组件 |
| `el-*` | 66 | 直接迁到 Element Plus，API 变化最小 |
| `a-*` | 9 | 改用 Element Plus，移除 Ant Design Vue |

**2026-11-09 决策更新：不引入 Quasar，Element Plus 作为唯一 UI 组件库。**
这意味着布局、按钮、输入、弹层、标签、树等都要按 Element Plus 重画，
视觉回归成本高于“保留 Quasar 2”的方案；换取的是：

- 只维护一套设计系统与一套 CSS 变量；
- 团队/生态更熟悉，后续表单、表格、设置面板开发更快；
- 不需要 `@quasar/vite-plugin` + Quasar CLI 之外的额外构建层；
- 避免 Quasar 与 Element Plus 两套主题变量互相污染。

代价与对策：

| 代价 | 对策 |
| --- | --- |
| `q-*` 需要逐一映射 | 建立 `q-* → el-*` 映射表，先布局后表单 |
| Quasar 布局/弹层行为不同 | P1 先用 Element Plus 重搭三栏壳，P3 再逐页对齐 |
| 视觉与 Coolma 原版有差异 | 固定 1280×800 / 1440×900 截图基线，允许差异但必须可解释 |
| Element Plus 没有 Quasar 的 `Notify` | 用 `ElMessage` / `ElNotification` / `ElMessageBox` 替代 |

结论：**UI 目标是“Coolma 的信息架构与交互，Element Plus 的实现”，不是像素级复刻 Quasar 1。**

### 2.2 非目标

- 不在 P1 追求 100% 功能对等；
- 不保留 Node integration / `@electron/remote` 这类旧安全模型；
- 不 1:1 复刻 126 个 IPC 通道名；
- 不在第一轮迁 Pinia 的同时重写全部业务逻辑；
- 不承诺兼容 Coolma 的旧安装目录和旧 userData 路径（只承诺可导入旧数据库）。

### 2.3 enum-plus 使用约定

项目会大量使用 `enum-plus`，从 P1 开始统一约定：

```ts
import { Enum } from 'enum-plus';

export const AppThemeEnum = Enum({
  Light: { value: 'light', label: 'settings.light', icon: 'Sunny' },
  Dark: { value: 'dark', label: 'settings.dark', icon: 'Moon' },
});
```

约定：

1. **业务字典一律用 `Enum({...})`**，不再新增原生 `enum` 或裸字符串联合类型；
2. shared 字典放在 `electron/shared/enums/`，渲染层通过 `@shared/enums/*` 引用；
3. `label` 存 i18n key，UI 用 `t(item.label)` 渲染，不在组件里维护第二份中文映射；
4. Element Plus 的 select / radio / tabs / table filter 优先由 `.items` 驱动；
5. 需要颜色、图标、权限等元数据时直接放在枚举项上，用 `.meta` / `.findBy()` 读取；
6. 已接入的 P1 示例：`AppThemeEnum`、`AppLocaleEnum`、`BootStatusEnum`。

---

## 3. 复刻边界

### 3.1 功能范围

| 域 | MVP（P1–P4） | 完整复刻（P5–P7） |
| --- | --- | --- |
| 窗口 | 主窗口、单实例、窗口状态、最小化/最大化/关闭 | 无边框拖拽、边缘 resize、多窗口 |
| 数据 | 导入旧库、笔记/分类/标签 CRUD | 诊断、去重、GUID 修复、批量迁移 |
| 布局 | 三栏、可拖拽、暗色/亮色 | 侧栏抽屉、右键菜单、快捷键全覆盖 |
| 笔记 | 列表、搜索、标签、自动保存 | 日历、排序、置顶、批量操作、导出 |
| 编辑器 | Muya 打开/编辑/保存、Markdown 渲染 | 图片上传、模板、预览、PPT、思维导图 |
| 设置 | 通用、编辑器、外观 | AI、云函数、同步、博客、微应用、CDN 依赖 |
| Rune/Echo | 只读展示内置模板 | 自定义 SFC、导入导出、批量导入、远程包 |
| AI | — | Provider、模型、Skill、自动标签、校对 |
| 同步 | — | WizNote / 云函数 / dirty 策略 / 冲突处理 |
| 博客 | — | 构建、GitHub、SFTP、CI 导出 |
| 微应用 | — | wujie / 内置迁移 / IPC bridge |
| 更新 | 手动检查 | 自动更新、灰度、回滚 |

### 3.2 兼容承诺

必须兼容：

- 旧 `memocast.db` 的 12 张核心表 + 2 张模板表；
- 笔记 `doc_guid` / `kb_guid` / `local_*` 语义；
- Rune 的 `template`（Vue SFC 文本）和 Echo 的 `anno_source` 数据；
- Markdown 原文和图片相对路径；
- 导出 Markdown / PNG / 文件的行为。

不承诺兼容：

- 旧 Electron 的 `nodeIntegration: true` 插件写法；
- 旧 `Vue.prototype.$xxx` 全局注入；
- 旧 Quasar 1 的组件 API；
- 旧 `@electron/remote` 调用；
- 旧 userData 目录直接原地升级。

---

## 4. 现状扫描（迁移工作量基线）

对 `.tmp/coolma-electron` 的静态扫描：

| 区域 | 规模 |
| --- | --- |
| `src/` | 276 个文件，约 1.9 MB |
| `src/**/*.vue` | 84 个 |
| `src/**/*.js` | 177 个 |
| `src/components/` | 150 个文件，约 1.2 MB，27 个业务目录 |
| `src-electron/` | 49 个文件，约 1.39 MB |
| `src-electron/main-process/electron-main.js` | 4079 行，约 157 KB |
| `src/store/server/actions.js` | 约 112.7 KB |
| `src/components/muya/Muya.vue` | 约 60 KB |
| `src/components/settings/` | 19 个面板 |
| IPC | 99 个主进程通道 + 27 个 `api.js` 通道 = **126** |
| SQLite | 12 张核心表 + `rune_templates` / `note_templates` |
| 内置 Echo | 19 个文件 |
| 内置 Rune 模板 | 15 个文件 |

这说明：

- 不能按“页面数量”估工作量，主进程和 store 才是大头；
- `electron-main.js` 必须拆成 service/repository，不能平移；
- 126 个 IPC 是最容易产生“功能看起来有、实际没接上”的地方；
- Rune/Echo 是产品差异点，也是迁移风险最高的部分。

---

## 5. 目标架构

```text
work-coolma-vue3/
├─ electron/                       # 主进程（TS）
│  ├─ main.ts                      # ElectronEgg 启动、生命周期注册
│  ├─ config/
│  │  ├─ config.default.ts
│  │  ├─ config.local.ts
│  │  └─ config.prod.ts
│  ├─ controller/                  # 薄 IPC 控制器：校验 → 调 service
│  │  ├─ notes.ts
│  │  ├─ categories.ts
│  │  ├─ tags.ts
│  │  ├─ settings.ts
│  │  ├─ runes.ts
│  │  ├─ echoes.ts
│  │  ├─ ai.ts
│  │  ├─ sync.ts
│  │  └─ ...
│  ├─ service/
│  │  ├─ db/                       # better-sqlite3、迁移、repository
│  │  ├─ notes/
│  │  ├─ sync/
│  │  ├─ ai/
│  │  ├─ blog/
│  │  ├─ microapp/
│  │  ├─ editor/                   # SFC 编译（主进程侧）
│  │  └─ os/                       # window / tray / updater / security
│  └─ preload/
│     ├─ index.ts
│     └─ bridge.ts                 # contextBridge 白名单
├─ frontend/                       # 渲染进程（Vue3 + Vite + TS）
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ App.vue
│  │  ├─ router/
│  │  ├─ stores/                   # Pinia，按领域拆
│  │  ├─ layouts/
│  │  ├─ views/
│  │  ├─ components/
│  │  │  ├─ editor/                # Muya 包装
│  │  │  ├─ rune/
│  │  │  ├─ echo/
│  │  │  ├─ settings/
│  │  │  └─ microapp/
│  │  ├─ services/                 # 只做渲染层编排，不碰 Node
│  │  ├─ composables/
│  │  ├─ i18n/
│  │  └─ styles/
│  └─ vite.config.ts
├─ shared/                         # 主/渲染共享：纯类型、IPC 常量、校验 schema
│  ├─ ipc/
│  │  ├─ channels.ts
│  │  ├─ contract.ts
│  │  └─ schemas.ts
│  └─ types/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
├─ build/                          # 图标、安装器、extraResources
├─ rule/skill/                     # 项目规则与迁移文档
└─ .tmp/                           # 上游只读参考（不提交）
```

### 5.1 进程职责

| 进程 | 可以做 | 不可以做 |
| --- | --- | --- |
| main | 文件、SQLite、网络、密钥、子进程、菜单、托盘、更新 | 直接操作 DOM |
| preload | `contextBridge` 暴露白名单 API、事件订阅 | 暴露 `ipcRenderer` / `require` / `fs` |
| renderer | UI、状态、表单、编辑器视图 | 读文件、连数据库、拿 API Key |

### 5.2 安全基线（P1 必须完成）

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  preload: path.join(getElectronDir(), 'preload', 'bridge.js'),
}
```

同时：

- `setWindowOpenHandler` 默认 `deny`，外链走 `shell.openExternal`；
- `will-navigate` 只允许应用自身 origin；
- 关闭 `@electron/remote`；
- 生产环境 CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:;`；
- API Key 只存主进程，使用 `safeStorage` 加密；
- 所有 IPC 入参在主进程用 zod 校验，错误统一映射为错误码。

> electron-egg 模板默认 `contextIsolation: false` + `nodeIntegration: true`，
> 这是 demo 配置，**不能继承**。P1 第一件事就是把 preload bridge 跑通，再关掉 Node integration。

---

## 6. 模块映射

| Coolma 现状 | 目标落点 | 迁移策略 | 风险 |
| --- | --- | --- | --- |
| `src/App.vue`、`pages/Index.vue` | `frontend/src/App.vue`、`layouts/` | 重写壳层，保留三栏结构与视觉 | 中 |
| `src/router/*` | `frontend/src/router/*` | Vue Router 4，hash 模式 | 低 |
| `src/store/client`、`server` | `frontend/src/stores/*` | Vuex → Pinia，按 notes/categories/tags/settings 重划 | 中 |
| `src/ApiInvoker.js`、`ApiHandler.js` | `shared/ipc` + `frontend/src/services/ipc.ts` | 统一 typed invoke，删除全局回调注册 | 高 |
| `src-electron/main-process/electron-main.js` | `electron/main.ts` + `service/*` | 按域拆分，禁止 4000 行单文件 | 高 |
| `src-electron/main-process/api.js` | `electron/controller/*` | 27 个通道按域归并 | 中 |
| `src-electron/main-process/menu/*` | `electron/service/os/menu.ts` | 保留菜单模板，改为 TS + i18n | 中 |
| `src-electron/main-process/keyboard/shortcut.js` | `electron/service/os/shortcuts.ts` | 保留键位表，改用 Electron 原生 API | 低 |
| `src-electron/main-process/utils/theme-manager.js` | `electron/service/os/theme.ts` | 保留主题 JSON/CSS 生成逻辑 | 低 |
| `src-electron/main-process/i18n/*` | `frontend/src/i18n` + main i18n | 主进程只保留菜单/对话框文案 | 低 |
| `electron-main.js` 数据库段 | `electron/service/db/*` | 拆 schema、migration、repository | 高 |
| `src/store/server/notePersistenceService.js` | `electron/service/notes/persistence.ts` | 写入主进程，渲染层不再直接写库 | 中 |
| `src/store/server/localSyncMigration.js` | `electron/service/db/migrations/*` | 版本化迁移 | 高 |
| `src/components/muya/Muya.vue` | `frontend/src/components/editor/MuyaEditor.vue` | **重写 Vue3 包装**，复用 Muya 核心 | 极高 |
| `src/components/muya/runeSfcRendererFactory.js` | `frontend/src/components/editor/rune/compiler.ts` | `@vue/compiler-sfc` 重写 | 极高 |
| `src/components/echo/*` | `frontend/src/components/echo/*` | 解析器可复用，渲染层改 Vue3 + sanitize | 高 |
| `src/components/rune/*` | `frontend/src/components/rune/*` | 表单/导入导出按 Vue3 重写 | 高 |
| `src/components/settings/*` | `frontend/src/views/settings/*` | 19 个面板逐页迁 | 中 |
| `src/components/microApp/*` | `frontend/src/components/microapp/*` | wujie 适配 Vue3，或先 iframe 隔离 | 高 |
| `src/services/Ai*.js`、`PortkeyService.js` | `electron/service/ai/*` + renderer store | 密钥和网络移到主进程 | 高 |
| `src/services/SyncService.js`、`CloudSyncService.js` | `electron/service/sync/*` | 保留 dirty/GUID 协议，重写编排 | 高 |
| `src/services/BlogDeployService.js` | `electron/service/blog/*` | 子进程构建 + 进度事件 | 中 |
| `src/i18n/*` | `frontend/src/i18n/*` | 文案 JSON 直接复用，key 保持 | 低 |
| `src/assets/css/style.css` | `frontend/src/styles/*` | 拆 token/layout/editor/theme | 中 |
| `src/utils/*` | `shared/utils` 或 `frontend/src/utils` | 纯函数先迁，带 Electron 的移到 main | 中 |
| `tests/unit/*` | `tests/unit/*` | 先迁契约测试，作为回归护栏 | 中 |

### 6.1 不要直接搬的文件

- `electron-main.js`：拆成 service 后逐段搬，不要整文件复制。
- `src/store/server/actions.js`（112 KB）：先按用例拆，再迁 Pinia。
- `Muya.vue`（60 KB）：Vue2 生命周期、`Vue.extend`、`$refs` 写法都需要重写。
- `runeSfcRendererFactory.js`：Vue2 编译器 API 在 Vue3 不存在。
- `quasar.conf.js`：Quasar CLI 配置不适用于 electron-egg 的 Vite 构建。
- `src/boot/*`：Vue2 全局插件启动方式，改为 `main.ts` 显式安装。

---

## 7. IPC 契约

### 7.1 原则

1. **按领域命名，不按旧文件命名**：
   `notes:list`、`notes:get`、`notes:create`、`notes:update`、`notes:delete`；
   不保留 `db:getNotes` 这类既像数据库又像业务的通道。
2. **一个通道一个入参对象**，禁止位置参数。
3. **主进程校验**：zod schema 在 controller 入口执行。
4. **统一返回 envelope**，不要有的返回 `null`、有的抛异常、有的返回 `{error}`。
5. **事件与请求分离**：进度、日志、更新状态走 `events:*`，不塞进 invoke 返回值。
6. **preload 白名单**：只暴露 `shared/ipc/channels.ts` 中登记的通道。

### 7.2 返回类型

```ts
// shared/ipc/contract.ts
export type IpcOk<T> = { ok: true; data: T };
export type IpcErr = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
export type IpcResult<T> = IpcOk<T> | IpcErr;
```

### 7.3 通道分组

| 命名空间 | 典型通道 | 对应旧功能 |
| --- | --- | --- |
| `app:*` | `app:info`、`app:openExternal`、`app:paths` | get-app-path、shell |
| `window:*` | `window:minimize`、`window:maximize`、`window:state` | window-* |
| `dialog:*` | `dialog:openFile`、`dialog:saveFile`、`dialog:selectDirectory` | import-image、select-directory |
| `notes:*` | list/get/create/update/delete/search | `db:*Note*` |
| `categories:*` | tree/create/rename/delete/migrate | `db:*Categor*` |
| `tags:*` | list/create/rename/delete/attach/detach | `db:*Tag*` |
| `settings:*` | get/set/getAll/reset | `settings`、app_state |
| `runes:*` | list/save/delete/import/export/templates | `db:*Rune*`、rune-pack |
| `echoes:*` | list/save/delete/import/export | `db:*Echo*` |
| `templates:*` | note/rune template CRUD | `db:*Template*` |
| `files:*` | image cache/save/read/export | `*-image`、`export-*` |
| `ai:*` | models/skills/test/chat/proofread/tag | `db:*Ai*`、Portkey |
| `sync:*` | status/start/cancel/conflict/resolve | SyncService |
| `blog:*` | config/build/cancel/exportCI/sftp | blog-* |
| `microapps:*` | list/save/launch/migrate | microApp |
| `updater:*` | check/download/install | check-update 等 |
| `events:*` | sync-progress、build-progress、update-status | 主进程推送 |

旧 126 个通道先做一张 **source → target 映射表**（放 `docs/ipc-mapping.md`），
每迁完一个域就勾掉一组；不保留旧通道名作为长期兼容层。

### 7.4 preload 示例

```ts
// electron/preload/bridge.ts
import { contextBridge, ipcRenderer } from 'electron';
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '../../shared/ipc/channels';

const invoke = (channel: string, payload?: unknown) => {
  if (!INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  return ipcRenderer.invoke(channel, payload);
};

const on = (channel: string, listener: (...args: unknown[]) => void) => {
  if (!EVENT_CHANNELS.has(channel)) {
    throw new Error(`IPC event not allowed: ${channel}`);
  }
  const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld('coolma', { invoke, on });
```

渲染层只使用：

```ts
const notes = await window.coolma.invoke('notes:list', { category, keyword });
```

**不要**暴露 `ipcRenderer` 本身，也不要恢复 `nodeIntegration`。

---

## 8. 数据迁移

### 8.1 现状

Coolma 使用 `sql.js`，数据库文件位于 `app.getPath('userData')/memocast.db`。
核心表：

```text
notes
tags
note_tags
local_categories
app_state
sync_log
guid_mapping
settings
runes
echoes
ai_model_configs
ai_skills
rune_templates   （由 rune-template-service 建表）
note_templates   （由 note-template-service 建表）
```

`notes` 的关键字段/索引：

- `doc_guid`、`kb_guid`、`category`、`title`、`dirty`；
- `doc_guid` 唯一索引排除 `local_%`；
- `(kb_guid, doc_guid)` 唯一；
- `(category, title, kb_guid)` 唯一（`title != 'Untitled'`）。

这些约束直接决定同步、重名、离线笔记的行为，**新库必须保留**。

### 8.2 目标

- 新库继续用标准 SQLite 文件，主进程用 `better-sqlite3` 打开；
- 引入 `PRAGMA user_version` + 版本化 migration；
- 表结构以 Coolma 为基线，先“兼容”再“重构”；
- 业务代码只通过 repository 访问，不散落 SQL；
- 导入旧库时保留原始 GUID，不重新生成。

### 8.3 导入流程（P2）

```text
1. 用户选择旧 memocast.db（或自动探测）
2. 复制到临时目录，计算 SHA-256
3. PRAGMA integrity_check
4. 只读打开，统计 notes/tags/runes/echoes 数量
5. 备份当前新库（如果存在）
6. 在事务中执行 schema migration
7. 校验：
   - notes 数量一致
   - 非 local_ 的 doc_guid 无重复
   - tags / note_tags 关联无悬空
   - runes/echoes 数量一致
8. 写入 import 记录（来源文件、时间、hash、统计）
9. 成功后保留旧文件，不删除
```

**失败必须回滚**，且旧库永远不被修改。导入向导要显示“将导入多少笔记、多少标签、
多少 Rune/Echo”，而不是静默覆盖。

### 8.4 设置与密钥

- `electron-store` 的配置迁移到主进程 settings service；
- AI API Key 从旧 CryptoJS/AES 迁移到 `safeStorage`；
- 无法解密时标记为“需要重新填写”，不要静默清空；
- 主题、语言、编辑器偏好按 key 迁移，保留默认值兜底。

---

## 9. 编辑器与 Rune / Echo

### 9.1 Muya

Coolma 的 `Muya.vue` 是 Vue 2 包装层，依赖：

- `Vue.extend` / `new Vue`；
- `vue-template-compiler` 的 `parseComponent` / `compileToFunctions`；
- Vuex `createNamespacedHelpers`；
- `coolma-muya/lib` 的编辑器核心。

好消息是：`coolma-muya` 的核心是 **vanilla JS + jQuery + snabbdom**，
`lib/index.js` 没有直接 `require('vue')`。因此：

```text
复用：coolma-muya 的 Muya core、parser、UI 插件、主题
重写：Vue 2 包装层、生命周期、事件绑定、Rune 预览挂载
```

目标组件：

```text
frontend/src/components/editor/MuyaEditor.vue
frontend/src/components/editor/useMuya.ts
frontend/src/components/editor/rune/compiler.ts
frontend/src/components/editor/rune/PreviewRenderer.ts
frontend/src/components/editor/echo/runtime.ts
```

`MuyaEditor.vue` 只负责：

- `new Muya(container, options)`；
- `markdown` / `theme` / `mode` 同步；
- `change` 事件防抖后 `emit('update:modelValue')`；
- `destroy()` 与事件解绑；
- 图片选择、右键菜单、快捷键通过 props/emit 注入。

不要在 Vue 组件里直接 `new Function` 执行用户模板。

### 9.2 Rune 编译器

现状：

```text
rune.template (SFC 文本)
  → vue-template-compiler.parseComponent
  → compileToFunctions
  → Vue.extend(...)
  → 挂到 Muya 的预览容器
```

Vue3 目标：

```text
rune.template
  → @vue/compiler-sfc.parse
  → compileScript / compileTemplate（inlineTemplate 或分离 render）
  → 生成组件对象
  → createApp(component).mount(container)
  → 卸载时 app.unmount()
```

必须处理：

| 问题 | 方案 |
| --- | --- |
| `<script>` 里的 `export default` | `compileScript` 或受控的 `new Function` 包装 |
| scoped style | `compileStyle({ scoped: true, id })` + 注入 |
| 组件缓存 | LRU，key = hash(template + compilerVersion) |
| 编译失败 | 显示错误卡片，不让整篇文档崩 |
| 多实例 | 每个卡片独立 app，卸载时销毁 |
| 用户代码安全 | MVP 仅内置模板；自定义模板走沙箱（见 9.4） |

### 9.3 Echo

现状 `EchoRuntime.js` 用字符串拼 HTML，再 `innerHTML` 挂事件。Vue3 迁移：

- 复用 `@xxx{props}(prompt)` 解析器和 `anno_source` 数据；
- 渲染层改成组件/受控 DOM，不再直接拼用户输入；
- 所有文本、属性、样式值走 escape / DOMPurify；
- 事件用事件委托 + `data-*` 绑定，卸载时统一清理；
- 内置 19 个 Echo 先静态组件化，自定义 Echo 后置。

### 9.4 自定义 SFC 的沙箱

用户 Rune 本质是“可执行代码”，不是普通 Markdown。三种级别：

| 级别 | 做法 | 适用 |
| --- | --- | --- |
| L0 | 只允许内置 Rune | MVP 默认 |
| L1 | `vue3-sfc-loader` + 受限 globals | 可信用户/本地导入 |
| L2 | sandboxed iframe + `postMessage` 桥 | 公开分享/远程模板 |

建议顺序：**L0 → L1 → L2**。不要在 P5 一开始就开放任意 `new Function` +
Node/Electron 能力；这是远程代码执行面。

### 9.5 验收

- 15 个内置 Rune 模板全部渲染；
- 19 个内置 Echo 全部可点击/提交；
- 同一篇文档 50 个 Rune 不卡死；
- Rune 编译失败只影响单个卡片；
- 卸载后无 DOM/事件/定时器泄漏；
- 旧 `rune.template` / `anno_source` 不需改数据即可读取。

---

## 10. UI 迁移

### 10.1 Element Plus 接入

- 安装 `element-plus`、`@element-plus/icons-vue`；
- `main.ts` 里 `app.use(ElementPlus, { locale: zhCn })`；
- 引入 `element-plus/dist/index.css` 与暗色变量 `theme-chalk/dark/css-vars.css`；
- 业务样式通过 `--el-*` 与项目 `--coolma-*` 变量收敛，不直接改组件内部 DOM；
- 不引入 Quasar、Ant Design Vue、Tailwind，避免多套设计系统。

### 10.2 组件迁移顺序

1. 布局：`q-layout` / `q-drawer` / `q-page-container` → `el-container` / `el-aside` / `el-main` + 自定义 grid；
   三栏可拖拽宽度用 `splitpanes@4`（Vue 3），Pane 的 `size` 必须显式合计 100；
2. 基础：`q-btn` → `el-button`，`q-icon` → `@element-plus/icons-vue`，`q-input` → `el-input`，`q-select` → `el-select`，`q-toggle` → `el-switch`；
3. 弹层：`q-dialog` → `el-dialog`，`q-menu` → `el-dropdown`，`q-tooltip` → `el-tooltip`；
4. 数据展示：`q-list` / `q-item` → 自定义列表或 `el-menu`，`q-tabs` → `el-tabs`，`q-table` → `el-table`；
5. 反馈：`Notify` → `ElMessage`，`Dialog` → `ElMessageBox`，`Loading` → `v-loading`；
6. 业务组件：分类树（`el-tree`）、笔记列表、设置面板、编辑器工具栏。

### 10.2.1 `q-*` 映射速查

| Quasar | Element Plus | 备注 |
| --- | --- | --- |
| `q-btn` | `el-button` | `flat` → `text`，`round` → `circle` |
| `q-input` | `el-input` | `outlined` 默认样式差异用 CSS 收敛 |
| `q-select` | `el-select` | `use-input` 用 `filterable` |
| `q-toggle` | `el-switch` | — |
| `q-dialog` | `el-dialog` | `persistent` 用 `:close-on-click-modal="false"` |
| `q-menu` | `el-dropdown` | 右键菜单用 `el-dropdown` + 自定义定位 |
| `q-tooltip` | `el-tooltip` | — |
| `q-tabs` | `el-tabs` | — |
| `q-card` | `el-card` | 无边框用 `shadow="never"` |
| `q-chip` | `el-tag` | `round` 保留 |
| `q-spinner` | `v-loading` / `el-skeleton` | — |
| `Notify` | `ElMessage` | — |
| `Dialog` | `ElMessageBox` | — |

### 10.3 Vue 2 → Vue 3 语法清单

| Vue 2 | Vue 3 |
| --- | --- |
| `beforeDestroy` / `destroyed` | `beforeUnmount` / `unmounted` |
| `.sync` | `v-model:prop` / `@update:prop` |
| `.native` | 组件显式 emit 或 `inheritAttrs` |
| `slot-scope` | `v-slot` |
| `model: { prop, event }` | `defineModel()` / `modelValue` |
| `new Vue()` event bus | `mitt` 或 Pinia action |
| `Vue.prototype.$x` | `app.config.globalProperties` 或 composable |
| `Vue.extend` | `defineComponent` / 普通组件对象 |
| `$listeners` | `$attrs` |
| `$scopedSlots` | `$slots` |

### 10.4 视觉回归

P1 就建立基线，不要等到 P7：

- 固定窗口 1280×800、1440×900 两档；
- 截取：空状态、笔记列表、编辑器、设置-通用、设置-编辑器、暗色主题；
- 用 Playwright `toHaveScreenshot` 或人工对照；
- 允许字体渲染差异，布局/间距/颜色必须可解释。

### 10.5 索引模式（必须保留）

Coolma 的核心导航不是单一“全部笔记”，而是三种索引模式：

| 模式 | 数据来源 | 交互 |
| --- | --- | --- |
| 文件夹 | `notes.category` + `local_categories` | 按分类路径筛选 |
| 标签 | `tags` + `note_tags` | 按标签筛选 |
| 时间 | `notes.created_at` / `updated_at` | 今天 / 昨天 / 本周 / 更早；后续可切日历 |

约定：

1. 侧栏必须始终提供 **文件夹 / 标签 / 时间** 三档切换，不能因为换布局而删掉；
2. 模式用 `IndexModeEnum`（enum-plus）描述，UI 由 `.items` 驱动；
3. 当前模式写 `localStorage['coolma.indexMode']`，跨启动保留；
4. 切换模式清空跨模式的筛选，避免“文件夹 + 标签 + 时间”隐式叠加；
5. 具体筛选条件（active folder/tag/time）不持久化，回到默认全部；
6. P3 接真实 `categories:list` / `tags:list` / `notes:list` 后，三档都继续保留；
7. 时间模式先做分组；日历视图作为同一模式下的第二形态，不另起一个入口。

### 10.6 Muya 包拆分（Vue 3）

```text
packages/libs-muya/          核心 Muya + Vue 3 wrapper（独立包）
packages/plugins-muya-echo/  Echo 插件边界
packages/plugins-muya-rune/  Rune 插件边界
```

约定：

1. `libs-muya` 不依赖 Vue 2；核心是 vanilla JS + snabbdom，Vue 3 只在包装层；
2. 核心里的 `boot/i18n`、`src/components/echo/echoCore`、`require('snabbdom')` 等
   已替换为包内 shim / ESM，详见 `docs/MUYA.md`；
3. Echo / Rune 不直接改 core，通过 `MuyaPlugin.install({ editor, container })` 扩展；
4. Rune 使用 `@vue/compiler-sfc` + `createApp`，不再使用 `Vue.extend`；
5. 内容区通过 `<MuyaEditor v-model>` 使用，Muya 保持单实例，切笔记只 `setMarkdown`；
6. 序列图、运行时 Prism 语言加载暂时降级，后续插件恢复。

### 10.7 无边框窗口

- `frame: false` + `titleBarStyle: 'hidden'` + `Menu.setApplicationMenu(null)`；
- 自绘最小化/最大化/关闭，走 `controller/window/*` IPC；
- `.topbar` / `.settings-header` 作为 drag region，交互元素 no-drag；
- 详见 `docs/WINDOW.md`。

---

## 11. 分阶段实施

> 工期是单人估算，含自测，不含视觉精修、代码签名、应用商店审核。

### P0 基线与方案（已完成，0.5 天）

- [x] 下载 electron-egg TS 模板（v4.2.0）
- [x] 下载 electron-egg v5 参考
- [x] 下载 coolma-electron
- [x] 记录 commit / 版本 / 许可
- [x] 扫描模块、IPC、数据库、UI 依赖
- [x] 输出本方案

### P1 工程骨架与安全边界（已完成）

目标：一个能启动、能打包、但没有业务的 Coolma Vue3 壳。

已落地：

- [x] 从 `.tmp/electron-egg-ts` 派生模板（排除 `.git`、demo、Go/Python）
- [x] 改 `package.json`：`coolma-vue3`、`Coolma Vue3`、`cn.coolma.vue3`、`0.1.0`
- [x] 清理 demo 页面/控制器/服务，只保留 app / window 两个 controller
- [x] 接入 **Element Plus**、Pinia、Vue Router 4、vue-i18n 11、**enum-plus 3.4**
- [x] 建立 `electron/shared/ipc`：channels、contract、schemas
- [x] 建立 `electron/shared/enums`：主题 / 语言 / 启动状态字典
- [x] 建立 preload 白名单 bridge（`window.coolma.invoke/on`）
- [x] 关闭 `nodeIntegration`，开启 `contextIsolation` / `sandbox` / `webSecurity`
- [x] 主窗口、单实例、居中与工作区适配
- [x] 日志、CSP、外链拦截、权限拒绝、webview 拦截
- [x] pnpm workspace 脚本、TS strict、三栏 splitpanes 壳、设置页、主题/语言切换
- [x] `typecheck` / `build` / 生产模式启动 / IPC 与 CSP 验证
- [x] Windows 安装包生成，并用 packaged app 验证 IPC / 安全边界
- [ ] 菜单 / 托盘 / 窗口状态持久化（P1 后续或 P3）
- [ ] ESLint / Vitest（P1 后续）

退出标准：

- [x] 启动后显示 Coolma Vue3 空壳，不再出现 electron-egg demo
- [x] DevTools 中 `window.require` / `window.process` 不可用
- [x] `window.coolma.invoke('controller/app/info')` 可用，未登记通道被拒绝
- [x] Windows 安装包可生成并启动

P1 代码入口：

| 模块 | 路径 |
| --- | --- |
| 主进程入口 | `electron/main.ts` |
| 安全配置 | `electron/config/config.default.ts` |
| 安全服务 | `electron/service/os/security.ts` |
| preload 白名单 | `electron/preload/bridge.ts` |
| typed IPC | `electron/shared/ipc/*` |
| 共享枚举 | `electron/shared/enums/app.ts` |
| 主进程 controller | `electron/controller/app.ts`、`window.ts` |
| 渲染层入口 | `frontend/src/main.ts` |
| 三栏壳 | `frontend/src/views/HomeView.vue` |
| 设置页 | `frontend/src/views/SettingsView.vue` |

### P2 数据层与旧库导入（核心完成）

- [x] `better-sqlite3` 初始化、WAL、busy_timeout
- [x] schema v1：15 张表（含 `schema_migrations`）+ 索引 + `user_version`
- [x] migration runner（幂等、事务、失败回滚）
- [x] notes/categories/tags/settings repository
- [x] 旧库导入 + 完整性校验 + 自动备份 + 失败恢复
- [x] 导入 / 备份 / 打开目录 UI（设置 → 数据）
- [x] 旧库 fixture（2 篇 notes，缺 `dirty` 列，验证补列）
- [x] 1000 篇旧库导入（7.3s）与连续导入两次不累加
- [ ] repository 单测（当前用 Electron + CDP 冒烟）

退出标准：

- [x] 1000 篇旧笔记导入后数量/标题/分类/GUID 一致
- [x] 重复运行导入不产生重复数据（整库替换语义）
- [ ] 导入失败不破坏旧库和现有新库（回滚代码已实现，待故障注入）
- [x] repository CRUD 主路径通过 Electron IPC 验证

### P3 三栏壳 + 笔记 CRUD（核心完成）

- [x] 三栏布局、可拖拽、暗色主题（splitpanes）
- [x] 文件夹 / 标签 / 时间三档索引切换（IndexModeEnum）
- [x] 三档索引接真实 `categories:list` / `tags:list` / `notes:list`
- [ ] 文件夹树、标签管理、日历视图
- [x] 新建/删除笔记
- [ ] 重命名、移动分类、标签编辑
- [x] 搜索（标题 + 正文，LIKE；FTS 后置）
- [x] 编辑器编辑 + 700ms 自动保存
- [ ] 未保存提示、崩溃恢复草稿
- [ ] 快捷键：新建、搜索、保存、切换主题
- [ ] 导入旧库后的首次启动流程

退出标准：

- [x] 新建 → 输入 → 切走 → 切回 → 重启，内容不丢
- [x] 1000 篇列表滚动可接受（虚拟滚动后置）
- [x] 删除有确认，不误删
- [x] 目录 / 标签 / 时间三种索引都能筛选并保持模式
- [ ] 分类/标签变更即时反映（尚未提供编辑入口）

### P4 Muya 编辑器（首版完成，持续增强）

- [x] `packages/libs-muya` 独立包（core + Vue 3 wrapper）
- [x] 内容区接入 `<MuyaEditor v-model>`
- [x] 建立 `plugins-muya-echo` / `plugins-muya-rune` 包边界
- [x] Markdown 渲染与编辑（标题 / 列表 / 引用 / 代码）
- [x] 自动保存接 `notes:update`（700ms 防抖 + 切走 flush）
- [ ] 光标恢复、图片粘贴/拖拽/缓存
- [ ] 代码块语言按需加载、序列图渲染
- [ ] 导出 Markdown / PNG / 文件
- [ ] 笔记模板
- [ ] 编辑器设置（字体、行宽、主题）
- [ ] 20 篇真实笔记回归

退出标准：

- [ ] 复杂文档打开/编辑/保存无格式损坏
- [ ] 图片路径在重启后仍可加载
- [ ] 导出文件可被外部 Markdown 工具打开
- [ ] 编辑器卸载无泄漏

### P5 Rune / Echo（10–15 天）

- [ ] Echo parser/runtime 移植
- [ ] 19 个内置 Echo 组件化
- [ ] Rune 编译器（`@vue/compiler-sfc`）
- [ ] 15 个内置 Rune 模板
- [ ] Rune 卡片渲染/缓存/错误卡片
- [ ] Rune/Echo 设置面板
- [ ] 导入/导出/批量导入
- [ ] 沙箱分级（L0/L1/L2）

退出标准：

- [ ] 旧数据中的 Rune/Echo 可直接显示
- [ ] 编译失败不拖垮文档
- [ ] 自定义模板默认不执行任意 Node 能力
- [ ] 50 卡片压力测试通过

### P6 AI / 同步 / 博客 / 微应用（10–15 天）

- [ ] AI Provider / 模型 / Skill / 测试连接
- [ ] API Key 迁移到 `safeStorage`
- [ ] 自动标签 / 校对 / AI 抽屉
- [ ] WizNote 同步 / 云函数 Provider / dirty 策略
- [ ] 冲突提示与解决
- [ ] 博客构建、GitHub、SFTP、CI 导出
- [ ] 微应用宿主 / IPC bridge / 内置迁移

退出标准：

- [ ] AI Key 不以明文落盘
- [ ] 同步失败可恢复，不产生重复笔记
- [ ] 博客构建有进度/取消/日志
- [ ] 微应用崩溃不拖垮主窗口

### P7 硬化与发布（5–8 天）

- [ ] 三平台打包（Windows 优先）
- [ ] 自动更新 / 回滚
- [ ] 启动性能、内存、长文档性能
- [ ] 安全审计：CSP、IPC、外链、SFC、依赖
- [ ] E2E 冒烟 + 视觉回归
- [ ] 许可与第三方声明
- [ ] 发布说明与迁移指南

退出标准：

- [ ] Windows 安装/卸载/升级通过
- [ ] 冷启动达到约定阈值
- [ ] 关键路径 E2E 全绿
- [ ] 旧库导入 + 编辑 + 导出全链路通过

### 11.1 里程碑

| 里程碑 | 包含 | 预计 |
| --- | --- | --- |
| M1 可启动壳 | P1 | 第 1 周 |
| M2 可导入、可读写 | P2–P3 | 第 4–5 周 |
| M3 可日常使用（MVP） | P4 | 第 7–8 周 |
| M4 特色能力 | P5 | 第 10–11 周 |
| M5 完整复刻 | P6–P7 | 第 14–18 周 |

> 这是“一个人、熟悉 Electron/Vue、没有大块返工”的估算。Muya/Rune 若卡住，
> 按风险预案切到 Vue2 island 或 iframe，M4 会顺延。

---

## 12. 验收矩阵

| 能力 | MVP | 完整 | 验收方式 |
| --- | --- | --- | --- |
| 启动/单实例/窗口状态 | ✅ | ✅ | 手动 + E2E |
| 旧库导入 | ✅ | ✅ | fixture 对比 |
| 分类/标签/笔记 CRUD | ✅ | ✅ | 单测 + E2E |
| 搜索 | 标题/正文 LIKE | FTS + 高亮 | 性能用例 |
| Muya 编辑/保存 | ✅ | ✅ | 20 篇真实文档 |
| 图片 | 粘贴/缓存 | 上传/PicGo/Wiz | 手动 |
| 导出 | Markdown | PNG/批量/文件 | 文件对比 |
| 内置 Rune | 只读 | 编辑/导入 | 15 模板 |
| 自定义 Rune | — | 沙箱 | 安全用例 |
| 内置 Echo | 只读 | 交互/自定义 | 19 模板 |
| AI | — | ✅ | Mock + 真机 |
| 同步 | — | ✅ | 双端 fixture |
| 博客 | — | ✅ | 本地构建 |
| 微应用 | — | ✅ | 宿主/崩溃 |
| 自动更新 | 手动检查 | 自动 | 测试源 |
| 三平台打包 | Windows | Win/Mac/Linux | CI/手动 |

非功能验收：

- 冷启动：目标 < 3s（开发机，空库）；
- 1000 篇列表：滚动无明显掉帧；
- 50 个 Rune 卡片：不冻结 UI；
- 关闭窗口后无残留进程；
- 断网不阻塞启动；
- 旧库导入 1000 篇 < 30s；
- 无 `nodeIntegration`、无 `remote`、无明文密钥。

---

## 13. 测试策略

### 13.1 单元

- repository / migration / 纯函数；
- IPC schema：合法/非法入参；
- Rune 编译缓存、错误隔离；
- Echo parser / sanitize。

### 13.2 集成

- 临时 SQLite + 真实 migration；
- 旧库 fixture 导入；
- IPC controller → service 链路；
- 文件导入/导出。

### 13.3 E2E

Playwright Electron：

```text
启动 → 导入 fixture → 打开笔记 → 编辑 → 保存 → 重启 → 校验
→ 新建分类 → 移动笔记 → 搜索 → 导出
→ 打开设置 → 切换主题 → 截图
```

### 13.4 测试数据

- 空库；
- 10 篇基础笔记；
- 1000 篇含分类/标签；
- 重复 GUID / 脏 dirty / 缺 kb_guid；
- 含图片/代码/表格/公式/Rune/Echo 的复杂文档；
- 旧版 Rune 模板（Vue2 写法）。

测试 fixture 不要放用户真实数据；从 Coolma 测试中脱敏后复用。

---

## 14. 风险与预案

| 风险 | 概率 | 影响 | 预案 |
| --- | --- | --- | --- |
| Muya Vue2 包装重写超预期 | 高 | 高 | P4 先做 3 天 spike；失败则 iframe 挂 Muya core，主应用只传 Markdown |
| Rune 动态 SFC 无法安全执行 | 高 | 高 | MVP 只开内置；自定义走 L1/L2 沙箱；必要时暂停自定义 |
| Quasar → Element Plus 导致视觉回归 | 高 | 高 | 先布局后组件；截图基线；必要时自写轻量组件补齐 Quasar 行为 |
| 126 个 IPC 漏迁 | 高 | 中 | 映射表 + 每域 E2E；未登记通道直接报错 |
| SQLite 数据损坏/重复 | 中 | 高 | 只读导入、事务、校验、双备份 |
| 旧库 GUID 语义理解错 | 中 | 高 | 先用 fixture 锁契约；不重写 `local_%` |
| 微应用/wujie Vue3 不兼容 | 中 | 中 | 后置；先 iframe 隔离；必要时保留 Vue2 子应用 |
| AI/同步网络不稳定 | 中 | 中 | Mock + 超时/重试/取消；错误可恢复 |
| 自动更新签名/渠道 | 中 | 中 | P7 前只做手动检查；签名单独排期 |
| 许可/商标 | 低 | 中 | 保留 MIT/Apache 声明；对外用自有品牌 |

### 14.1 三个“停止线”

1. P4 的 Muya spike 3 天内跑不通“打开 → 编辑 → 保存”，暂停 P5，先解决编辑器。
2. Rune 沙箱无法阻止任意代码执行，就不开放自定义 SFC，只保留内置模板。
3. 旧库导入在 1000 篇 fixture 上无法保证数量/GUID 一致，不进入 P3。

---

## 15. 协作规则

- `.tmp/` 只读；所有修改发生在目标工程目录。
- 不把 `.tmp/*/.git`、`node_modules`、构建产物提交。
- 提交信息使用中文，保留 Conventional Commits 前缀，例如：
  `feat(笔记): 实现分类树与笔记列表联动`。
- 所有 IPC 必须先改 `shared/ipc`，再改 controller，再改 renderer。
- 所有跨进程数据必须可 JSON 序列化；不要传 `Date`、`Buffer`、类实例。
- 新增依赖先评估：Vue3 兼容、维护状态、许可证、打包体积。
- 每个阶段结束更新本文件的“状态”和“退出标准”勾选。
- 对外发布前补 `THIRD_PARTY_NOTICES.md`。

---

## 16. 当前进度与下一步

### P1 已完成

- [x] 模板派生、应用标识、图标、单实例
- [x] Element Plus + Pinia + Router + i18n + enum-plus
- [x] `shared/ipc` 与 preload 白名单
- [x] 关闭 Node integration，验证 IPC / CSP / 导航 / 权限
- [x] `typecheck` / `build` / 生产模式 / Windows 安装包
- [x] 打包后的 `app.asar` 启动与 `window.coolma.invoke` 验证
- [x] 三栏壳、设置页、主题/语言切换、enum-plus 字典驱动

### P2 已完成（核心）

- [x] `better-sqlite3` 12.11.1、WAL、busy_timeout、foreign_keys
- [x] schema v1（15 张表，含 `schema_migrations`）与 `user_version`
- [x] migration runner（事务 / 幂等 / 失败回滚）
- [x] notes / categories / tags / settings repository
- [x] 旧库导入：integrity check、backup API、自动备份、数量校验、失败恢复
- [x] 设置 → 数据：状态、导入、备份、打开目录
- [x] Electron ABI 预编译安装脚本 `pnpm rebuild:sqlite`
- [x] 旧库 fixture 与 Electron + CDP 冒烟
- [ ] 1000 篇 / 重复 GUID / 脏数据压力 fixture
- [ ] Vitest 单测

### 下一步：P3.1

P3 核心已完成（真实数据、搜索、自动保存、新建/删除）：

1. 重命名、移动分类、标签编辑；
2. 分类树、标签管理、日历视图；
3. 列表虚拟滚动与分页；
4. 未保存提示、崩溃恢复草稿与快捷键。

之后进入 P5 Echo/Rune 插件运行时。

---

## 17. 参考

- electron-egg 仓库：<https://github.com/wallace5303/electron-egg>
- electron-egg 文档：<https://www.kaka996.com/>
- Coolma 仓库：<https://github.com/ui-javascript/coolma-electron>
- Vue 3 迁移指南：<https://v3-migration.vuejs.org/>
- Vue Router 4：<https://router.vuejs.org/>
- Pinia：<https://pinia.vuejs.org/>
- Quasar 2（已弃用）：<https://quasar.dev/>
- Element Plus：<https://element-plus.org/>
- Muya / MarkText：<https://github.com/marktext/muya>
- better-sqlite3：<https://github.com/WiseLibs/better-sqlite3>
- Electron 安全清单：<https://www.electronjs.org/docs/latest/tutorial/security>

本地基线：

- [`.tmp/SOURCES.md`](../../.tmp/SOURCES.md)
- [`.tmp/electron-egg-ts/`](../../.tmp/electron-egg-ts/)
- [`.tmp/electron-egg-v5/`](../../.tmp/electron-egg-v5/)
- [`.tmp/coolma-electron/`](../../.tmp/coolma-electron/)
