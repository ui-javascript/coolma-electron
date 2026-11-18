# Memocast 博客打包部署

> 项目：Memocast (coolma)
> 最后更新：2026-07-17
> 当前状态：**核心功能已全部落地并稳定运行**，本文件为现状维护文档，不再跟踪已完成的工时。

---

## 0. 项目背景与核心约束

从参考项目 `E:\work-前端\note\`（vuepress 1.x + gulp 流水线）提炼的核心规则：

| 关键点 | 参考实现 | 本项目复用形式 |
| --- | --- | --- |
| **侧边导航自动生成** | `_docs\.vuepress\utils\utils.js` 用目录前缀扫描生成 `nav` + 多 `sidebar`；`utils-shortlink.js` 转短链 | `src-electron/main-process/service/blog-config-writer.js` 在博客目录运行时生成 `sidebar.json` / `nav.json` |
| **publicPath / base 路径** | `_docs\.vuepress\config.js` 按环境变量切换 | `BlogDeployDialog.vue` 输入 → `replaceBaseInConfig` 注入 `config.js` |
| **路径 hash / 短链 ID** | `gulpfile.js` 的 `cyrb53 + base36` 生成 ~26 字符 ID | `src/services/BlogDeployService.js` 极简 cyrb53（与原 vuepress-build 算法同源） |

**强约束（永久）：**

- **Memocast 主项目本身不安装 VuePress 依赖**——所有 vuepress / 主题 / lodash 依赖都写到**导出博客目录自动生成的 `package.json`** 中。
- 不要 `yarn add vuepress` 到主项目根目录的 `package.json`。
- `_posts/` 不应作为可点击 path；sidebar/nav 中所有 URL 必须是 `_<id>.html` 短链形式。

---

## 1. 总体目标（全部 ✅ 已完成）

1. ✅ **从 SQLite 导出 markdown**：右键分类 → 批量导出 MD 到 `_posts/<id>.md`
2. ✅ **目录即导航**：脚本运行时生成 `nav.json` / `sidebar.json`
3. ✅ **hash 短链 + 稳定排序**：`cyrb53+base36` 命名，序号写入 `seq-manifest.json`
4. ✅ **publicPath 双模**：`base` 字段可由弹框注入，覆盖既有或新建 `config.js`
5. ✅ **CI/CD 一条命令**：本地 `BlogDeployDialog` 一键触发；远端 `.github/workflows/blog-*.yml` 三件套

---

## 2. 现状（架构 & 数据流）

```
Renderer (Vue2 + Quasar)
  └─ BlogDeployDialog.vue / BlogDeployProgressDialog.vue
       │ Bus: blogDeployStart / blog-deploy-progress / blog-deploy-done
       ▼
Vuex Action (server/blogDeploy)
  └─ 调用 ApiInvoker → ipcRenderer.invoke('start-blog-deploy', ...)
                              │
                              ▼
Main Process (blog-deploy-handler.js)
  ├─ checkNodeJSInstalled           ← 缺失则引导用户安装
  ├─ validateBlogDir                ← 校验目录合法性
  ├─ ensureBlogConfig               ← 生成/保留 config.js + package.json + utils/
  ├─ blog-config-writer.writeBlogUtilities + runVerifyPaths (防 404)
  ├─ runNpmInstall (npm/yarn/pnpm)  ← 缺 vuepress 时触发
  ├─ 清理构建缓存 (cachePaths 5 项)
  ├─ runVuepressBuild               ← child_process.spawn('cmd.exe', ['/c', 'npm run build'])
  ├─ dispatchWorkflow (GitHub API)  ← 条件触发
  └─ sftpUpload (ssh2)              ← 条件触发
                              │
                              ▼
导出博客目录（独立 package.json / node_modules）
  .vuepress/
    config.js                ← 4 主题模板自动切换
    sidebar.json / nav.json  ← 每次部署前重新生成
    id-mappings.json / seq-manifest.json / shortlink-map.json
    utils/ (sidebar-builder.js / nav-builder.js / verify-paths.js)
  _posts/<id>.md             ← permalink frontmatter + 内容
  package.json               ← vuepress@1.x + lodash + 主题依赖
```

---

## 3. 核心实现要点

### 3.1 短链 ID 算法（已完成，与参考项目一致）

实现位置：`src/services/BlogDeployService.js:11-38`（v2026-07-29 起 scripts/blog/cyrb53.js 已删除，cyrb53 唯一真相源是 BlogDeployService 内嵌版）

```js
function cyrb53 (str, seed = 0) { /* 双重 hash，返回 base36 字符串 */ }
function shortlinkId (dir, base) {
  const basename = String(base || '').replace(/^\d+[a-zA-Z]*[-_]/, '')
  return cyrb53((basename || 'index') + (dir ? '/' + dir : ''))
}
function permalinkFor (dir, base)  { return `/${shortlinkId(dir, base)}.html` }
function sidebarPathFor (dir, base) { return `_posts/${shortlinkId(dir, base)}.md` }
```

**关键不变量**：sidebar `item.path` 与 frontmatter `permalink` 必须用**同一个** `shortlinkId()` 计算 → 物理上指向同一份 `.md` 文件 → 永远不 404。

### 3.2 三大主题（default / vdoing / hope / reco）模板生成（已完成）

实现位置：`src-electron/main-process/service/blog-deploy-handler.js:351-721`

| 主题 | config.js 风格 | 依赖 |
| --- | --- | --- |
| `default` | `module.exports = { themeConfig: { nav, sidebar } }` | `vuepress ^1.9.0` + `lodash` |
| `vdoing` | `module.exports = { theme: 'vdoing', themeConfig: { ... } }` | + `vuepress-theme-vdoing ^1.5.0` |
| `hope` | `const { config } = require('vuepress-theme-hope'); module.exports = config({ ... })` | + `vuepress-theme-hope ^1.30.0` |
| `reco` | `module.exports = { theme: 'reco', themeConfig: { type: 'blog', ... } }` | + `vuepress-theme-reco ^1.6.17` |

**注意**：v1 API 与 v2 完全不兼容。hope 主题**不要**用 `defineUserConfig + hopeTheme`；reco 主题**不要**用 `defineUserConfig + recoTheme`。

### 3.3 主题自动检测与切换（已完成）

`detectCurrentTheme(configPath)` 通过正则扫描 `config.js` 文本：

```
theme: 'vdoing'                        → 'vdoing'
theme: 'reco'                          → 'reco'
require('vuepress-theme-hope') + config({...}) → 'hope'
无 theme 字段 / 用户自定义              → 'default'
读取失败                                → null
```

**切换策略**：同主题 → `kept`（保留原文件，用户手工编辑不丢失）；主题变化 → 强制覆盖为新主题模板。

### 3.4 base 路径注入（已完成，远超早期设计）

实现位置：`src-electron/main-process/service/blog-deploy-handler.js:207-325`

`replaceBaseInConfig` + `quoteBase` + `normalizeBase` 三件套：

- 命中已有 `base: 'x'` → 整段替换，注释同步 `// memocast: base=<值>`
- 命中 `module.exports = {` 但缺 base → 在 `{` 后插入
- 兜底 → 文件末追加 `module.exports.base = ...`
- 用户手工编辑过的 config.js **不**被覆盖（除非显式传 base）

路径规范化：`'/foo///'` → `'/foo/'`、`'./foo'` → `'./foo/'`、`'/'` → `'/'`、`''` → `''`（不强制）

### 3.5 防 404 verify-paths（已完成）

实现位置：`src-electron/main-process/service/blog-config-writer.js`

- 三个 `.vuepress/utils/*.js` 源码以字符串常量内联在主进程，写入时同步到博客目录
- `verify-paths.js` 扫描 `sidebar.json` + `nav.json` 中的所有 URL：
  - 短链 `/<id>.html` → 必须 `_posts/<id>.md` 物理存在
  - 分类路径 → 必须 `_posts/<category>/<basename>.md` 物理存在
  - 兜底 → 查 `dist/`（已构建过的情况）
- verify 失败时 `blog-deploy-handler` 仅发送 `blog-deploy-warn`，**不阻断**构建（因为首次部署时可能尚无 md 文件）

### 3.6 构建缓存清理（已完成，2026-07-16 修复）

实现位置：`src-electron/main-process/service/blog-deploy-handler.js:1058-1072`

```js
const cachePaths = [
  path.join(vuepressDir, 'cache'),
  path.join(vuepressDir, '.cache'),      // 新增：避免 webpack manifest 残留
  path.join(vuepressDir, 'dist'),
  path.join(blogDir, 'node_modules', '.cache'),  // 新增
  path.join(blogDir, '.cache'),          // 新增
]
```

**修复历史**：早期"缓存清理在 package.json 处理后"导致中断的构建残留 `Cannot find module ... manifest/client.json`；现改为"构建前一刻清理"，覆盖所有 5 个可能缓存位置。

### 3.7 GitHub Actions / SFTP 双部署通道（已完成）

| 通道 | 实现 | 触发条件 | 状态 |
| --- | --- | --- | --- |
| **GitHub Actions** | `src-electron/main-process/service/github-api.js` + `dispatchWorkflow` | `githubConfig.token && githubConfig.owner && githubConfig.workflowId` 全部存在 | ✅ |
| **SFTP 上传** | `src-electron/main-process/service/sftp-service.js`（ssh2） | `sftpConfig.enabled === true` | ✅ |
| **SFTP 备份** | 同上 `backupRemoteDir` | `sftpConfig.backupEnabled === true` | ✅ |

**进度分配**：build 40-85%、GitHub trigger 85%、SFTP 92-100%、done 100%（任务栏进度条同步更新）。

### 3.8 CI 工作流（已完成）

`.github/workflows/` 目录下三件套：

- `blog-build.yml` — 完整构建 + 部署 gh-pages（push master/main、tag v\*、PR、workflow_dispatch）
- `blog-db-upload.yml` — 手动上传 `memocast.db` 到 artifact
- `blog-preview.yml` — PR 上自动跑 sidebar/config，不部署

模板字符串常量内联在 `src/services/BlogDeployService.js`，避免 runtime + template 双份维护。

---

## 4. 文件清单（按职责分组）

```
src/services/BlogDeployService.js              # 短链 ID + CI 模板常量 + GitHub/SFTP 配置 Schema
src/components/ui/dialog/
  BlogDeployDialog.vue                         # 配置弹框（博客目录 / 主题 / base / 包管理器 / GitHub / SFTP）
  BlogDeployProgressDialog.vue                 # 进度弹框（步骤列表 + 日志区）
src/contextMenu/sideDrawer/
  menuItems.js                                 # 已注册 EXPORT_TO_BLOG 菜单项
  actions.js                                   # 同上
src/i18n/{zh-cn,en-us}/other.js                # 部署相关 i18n
src/i18n/{zh-cn,en-us}/contextMenu/sideDrawer.js
src-electron/main-process/service/
  blog-deploy-handler.js                       # 主流程：Node 检测 / ensureBlogConfig / runVuepressBuild / GitHub / SFTP
  blog-config-writer.js                        # 三个 utils/*.js 模板 + verify-paths + theme 检测
  github-api.js                                # dispatchWorkflow
  sftp-service.js                              # testConnection / uploadDirectory / backupRemoteDir
src-electron/main-process/api.js               # 注册 start-blog-deploy IPC handler
src/store/server/actions.js                    # blogDeploy action
src/ApiInvoker.js / src/ApiHandler.js          # IPC 封装
share/channels.js                              # IPC channel 定义

# v2026-07-29 起 scripts/blog/ 整目录已删除（run-smoke.js 迁到 tests/unit/blog/blog-config-writer.test.js；blog-config-writer.js + cyrb53.js 均为孤儿副本）

.github/workflows/
  blog-build.yml / blog-db-upload.yml / blog-preview.yml

.agents/skills/blog-deploy-design/SKILL.md     # 详细技能文档（与本文档互为补充）
```

---

## 5. 关键设计决策（保留为决策记录）

### 5.1 GitHub API vs gh CLI
**采用 GitHub REST API** — Electron 主进程内置 `fetch`（Node 18+），无新依赖；gh CLI 需用户额外安装，体验反而更差。

### 5.2 PAT 安全存储
**加密存储** — `electron-store` + CryptoJS AES，与项目现有 AI API Key 存储一致；明文不输出日志。

### 5.3 子进程稳定性
- `child_process.spawn('cmd.exe', ['/c', '...'])` + Promise 封装，不阻塞主进程
- 进度通过 `webContents.send('blog-deploy-progress', ...)` 实时推送
- 取消：`cancelBlogBuild()` 调用 `taskkill /pid /f /t` 终止子进程树（Windows）

### 5.4 软链接策略已弃用
早期方案（自动创建 `mklink /J` junction 指向 Memocast node_modules）**已弃用**。原因：跨驱动器限制 + 用户易混淆 + 实际打包时 `npm install` 已能解决依赖。现策略：直接 `npm/yarn/pnpm install`，依赖写入博客目录的 `package.json`。

### 5.5 SQLite 导出策略
- 过滤：分类 `published`、排除 `@private/@draft/@archive` 命名前缀
- 资源：base64 内嵌图片 → 落盘到 `_docs/.vuepress/public/assets/<note-id>/`，markdown 引用替换为相对路径
- **当前导出入口**：`BlogDeployDialog` 触发批量导出到 `_posts/<id>.md`，frontmatter 包含 `permalink`

---

## 6. 待办（仅未完成项）

### 6.1 用户已确认但尚未实现

- [ ] **博客导出 MD 时同步导出分类 README.md** —— 当前只有文章 `.md` 缺分类 README，nav-builder 中 `node.link = './' + cat + '/'` 指向的是不存在的 README
- [ ] **`base` 路径合法性校验增强** —— 当前 `normalizeBase` 已处理 `///`、缺尾斜杠，但非法字符（`#`、`?`）未拦截
- [ ] **菜单项国际化 key 补全** —— `exportMarkdownAndCopy` 等条目部分 i18n key 缺失英文翻译

### 6.2 优化方向（P2 / P3，可选）

- [ ] 导出层加 `manifest.json` 记录 `(noteId → outPath, mtime, hash)` —— 增量导出
- [ ] 大库性能：千篇笔记下 `cyrb53` + fs 操作并发化（`p-limit` 限流）
- [ ] 部署历史记录：SQLite 记录每次部署时间 / 状态 / 目标仓库
- [ ] 预览模式：打包后自动打开 `vuepress dev` 本地预览
- [ ] Gitee / GitLab 支持：扩展 API 封装

### 6.3 风险点（待长期观察）

- ⚠️ `vuepress@1.x` 与 Node 18+ 兼容性 —— 当前通过 `set NODE_OPTIONS=--openssl-legacy-provider` + lodash override 解决，长期需关注 1.x EOL
- ⚠️ `hope` / `reco` 主题在最新 `vuepress@1.9.x` 下偶发依赖冲突 —— 当前通过 `overrides` 解决，新版 vuepress 发布时需回归

---

## 7. 验证命令速查

```bash
# 本地一键打包（推荐通过 UI 弹框）
yarn start  # 启动 Memocast → 右键分类 → "部署到博客"

# 跑 blog 打包契约测试（v2026-07-29 起取代旧的 scripts/blog/run-smoke.js）
yarn verify:blog

# 单独验证 cyrb53 算法（v2026-07-29 起 scripts/blog/cyrb53.js 已删，cyrb53 在 BlogDeployService.js 内嵌）
node -e "console.log(require('./src/services/BlogDeployService'))"

# 远端 CI 触发
git push origin master          # 自动触发 blog-build.yml
gh workflow run blog-db-upload.yml  # 手动上传 db
```

---

## 8. 相关 TODO / 文档索引

- `.agents/skills/blog-deploy-design/SKILL.md` — 详细技能文档（与本文档互为补充，包含更多代码片段与具体命令）
- `_todo/TODO-vuepress部署优化-2026.md` — **已删除**（早期事故复盘 + 代码片段，已沉淀到代码注释）
- `_todo/TODO-vuepress博客自动打包部署-202609.md` — **已删除**（实施计划已全部完成）
- `_todo/TODO-vuepress博客打包部署优化-2026.md` — **本文档**（保留为最新维护入口）

---

## 9. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-06-21 | 初版实施计划（GitHub API + SFTP + 进度对话框）|
| 2026-06-24 | 软链接策略调整 / 任务栏进度条 / 进度对话框增强 |
| 2026-07-16 | 主题支持扩展（hope/reco）/ 构建缓存清理修复 / 主题自动检测 |
| 2026-07-17 | 合并 3 份 TODO，删除事故复盘与已完成的实施计划，保留现状 + 设计决策 |
