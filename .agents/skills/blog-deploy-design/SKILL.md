---
name: blog-deploy-design
description: Memocast 博客打包部署（vuepress 1.x）架构与约定指南。用于分析、修改或扩展 vitepress/vuepress 部署流程，包括 blog 目录结构、id-mappings.json / seq-manifest.json 中间产物、permalink 模式（/&lt;id&gt;.html 平铺）、categories 字段、sidebar/nav/verify builders 自动写入 .vuepress/utils/、GitHub Actions 或 SFTP 推送、SFTP 远程目录备份开关、Quasar 弹框 base 规范化、Electron 主进程 IPC 链路。遇到"博客打包失败"、"sidebar 只显示一个分类"、"nav 没分类"、"部署弹框"、"SFTP 上传"、"GitHub 触发部署"、"blog 目录结构"、"id-mappings.json"、categories 字段、permalink 冲突、cite Vuepress 等等关键词时应自动使用。
---

# Memocast 博客打包部署（Vuepress 1.x）

## 0. 定位与边界

Memocast 提供"笔记 → blog 部署"功能：用户在 Memocast 里写笔记，选中若干条，触发"博客部署"操作（`StartBlogDeployDialog.vue` / `BlogDeployDialog.vue`），最终产物是

1. 一份 Vuepress 1.x 博客源代码（`_posts/<id>.md`、`.vuepress/config.js`、`.vuepress/utils/*-builder.js`）
2. `yarn run build` 构建到 `.vuepress/dist/`
3. 可选地上传到 GitHub（触发 GitHub Actions）或 SFTP

**关键决策（本项目不可变）**：permalink **不嵌套** —— `_posts/<id>.md` 平铺 → `/<id>.html`。这是为了让用户在不改路径的前提下重命名笔记仍能命中旧 URL（短链 base36 id 稳定）。**所有分类 / sidebar / nav 信息只能通过 frontmatter 或 builder 在内存态组合，绝不通过物理目录嵌套表达**。

## 1. 关键文件位置

| 路径 | 作用 |
|------|------|
| `src/services/BlogDeployService.js` | 渲染进程 → 主进程前的"前置处理"：写 `_posts/<id>.md`、写 `id-mappings.json` / `seq-manifest.json` / `shortlink-map.json`、写分类下 `README.md`、生成 `buildFrontmatter` |
| `src-electron/main-process/service/blog-deploy-handler.js` | 主进程入口：`execBlogBuild` —— 串起 Node 检测、依赖补齐、blog-utils 写入、verify-paths、build、SFTP、GitHub Actions |
| `src-electron/main-process/service/blog-config-writer.js` | 实际写入 `.vuepress/utils/{sidebar-builder,nav-builder,verify-paths}.js` 和 `config.js`，提供 `writeBlogUtilities`、`writeVuepressConfig`、`runBuilders`、`runVerifyPaths`、`ensureBlogConfig`。**这是唯一真相源**（v2026-07-29 起，scripts/blog/ 整目录已删除，与本文件同源的镜像副本 + smoke 测试入口都已迁出） |
| `src-electron/main-process/service/sftp-service.js` | `uploadDirectory` / `backupRemoteDir` / `testConnection` |
| `src-electron/main-process/api.js` | IPC 入口：所有 `handleApi('start-blog-deploy' / 'export-blog-ci' / ...)` 都在这里 |
| `src/components/ui/dialog/BlogDeployDialog.vue` | 部署弹框（Quasar），集合 github + sftp + **theme（default/vdoing/hope/reco）** + custom-build + base |
| `src/store/server/actions.js` | 触发入口：`blogDeploy({ blogDir, githubConfig, theme, sftpConfig, customBuildCommand, base, notes, category })` |

## 2. 中间产物（在 `.vuepress/` 下）

```text
.vuepress/
├── config.js                              # vuepress 配置,base / themeConfig 由 writer 注入
├── id-mappings.json                       # { mappings: [...], stats }
├── seq-manifest.json                      # { '<id>': <seq:int> }
├── shortlink-map.json                     # permalink 反向索引
├── nav.json                               # buildNav() 写入(诊断用,实际用 config.js 里的 nav)
├── sidebar.json                           # 同上（诊断用，实际 sidebar 在 config.js 内存态生成）
└── utils/
    ├── sidebar-builder.js                 # buildSidebar(): m.category 分组 → { '/': [group,...] }
    ├── nav-builder.js                     # buildNav(): m.category 分组 → [{text,link,items}]
    └── verify-paths.js                    # verify-paths 主入口
```

### 2.1 id-mappings.json 字段含义

```jsonc
{
  "mappings": [
    {
      "id": "aaaa",            // 短链 id, base36, 由 cyrb53(dirTag + title) 派生
      "fileName": "前端入门.md",
      "fullPath": "技术/前端入门",        // 只用于诊断,不写到磁盘(我们是平铺 .md)
      "title": "前端入门",
      "category": "技术",        // ★ 核心字段;空字符串视为"未分类"
      "defaultUrl": "/aaaa.html",
      "shortUrl": "/aaaa.html",
      "level": 2
    }
  ]
}
```

### 2.2 seq-manifest.json

`{ '<id>': <seq:int> }` —— **同一 blogDir 内全局递增**,笔记被写入的次序。`buildSidebar / buildNav` 用它做同 category 内的稳定排序。

### 2.3 permalink 模式（绝对契约）

- 形式：`/<id>.html`，不带 category 前缀
- 算法：`permalinkFor(dirTag, baseName)` → cyrb53 → base36 → 短链
- **不要改**：除非推翻重写"重命名不破坏 URL"这一不变量
- 物理 .md 路径：`_posts/<id>.md`（**平铺**到 `_posts/`，**绝不做** `_posts/<category>/<id>.md` 嵌套）

## 3. sidebar / nav / verify builders

### 3.1 sidebar-builder.js（`buildSidebar()`）

输入：id-mappings.json + seq-manifest.json
输出：vuepress 1.x 默认主题能直接消费的 sidebar：

```js
{
  '/': [
    { title: '技术',    collapsable: true, children: [{ title, path }, ...] },
    { title: '生活',    collapsable: true, children: [...] },
    { title: '未分类',  collapsable: true, children: [...] }   // 空 category
  ]
}
```

**关键约定**：
- 顶层 key 必须是 `'/'`(对应 permalink `/<id>.html` 命中的页面)。vuepress 1.x 默认主题不允许 `'_posts/'` 这种 key,那是无效路由前缀。
- category 字符串原样作为组标题,`'技术/前端'` 这种带斜杠的层级原样保留。
- 空 category 必须归到 `'未分类'` 组,而不是丢弃 —— 否则永远在 sidebar 上找不到它们。
- 同 category 内按 `seq` 升序,同 seq 再按 title 字典序。
- 出现次序保持稳定: 先看到 `技术` → 先排在前面(不要按字典序,尊重用户次序)。

### 3.2 nav-builder.js（`buildNav()`）

```js
[
  { text: '技术', link: '/<first-id>.html', items: [{ text, link }, ...] },
  { text: '生活', link: '/<first-id>.html', items: [...] },
  { text: '文章', items: [...] }   // 空 category → '文章'
]
```

注意空 category 在 nav 用 `'文章'` 默认标题,与 sidebar 的 `'未分类'` **不一致是有意的**(nav 是品牌语义 / sidebar 是技术语义)。

### 3.3 verify-paths.js（`main()`）

构建前兜底：把 sidebar + nav 里的所有 link 当字符串收集,过正则 `/(\.html$|\.md$)/` 过滤,挨个检查 `_posts/<id>.md` 存在。任何缺失 → 抛错,构建停在 `progress=5`。**这是为什么"少写了一篇 md 文件导致 404"这种事被提前拦截**。

### 3.4 config.js 模板注入

`config.js` 由 `writeVuepressConfig` 用模板字符串写出,关键字段：

```js
module.exports = {
  title: '<opts.title>',
  description: '<opts.description>',
  theme: '<theme>',               // 'default' | 'vdoing' | 'hope' | 'reco'
  base: '<base>',                  // 含注释: `// memocast: base=<rawBase>`
  themeConfig: {
    nav: buildNav(),               // 而不是 require(nav.json)
    sidebar: buildSidebar(),
    sidebarDepth: 2,
    lastUpdated: true
  }
}
```

**为什么** `nav = buildNav()` 而非 `require('./nav.json')`?
答：vuepress 构建时 `require()` 会缓存,第一次 build 后 sidebar/nav.json 改了不会重读。即时执行确保每次构建拿到最新值。

### 3.5 主题支持（default / vdoing / hope / reco）

| 主题 | 包名 | VuePress 版本 | config.js 风格 | 特有字段 |
|------|------|---------------|----------------|---------|
| `default` | 无（内置） | vuepress@1.x | `module.exports = {}` | sidebar/nav 在 themeConfig |
| `vdoing` | `vuepress-theme-vdoing@^1.5.0` | vuepress@1.x | `module.exports = { theme: 'vdoing' }` | 无额外配置 |
| `hope` | `vuepress-theme-hope@^1.30.0` | vuepress@1.x | `const { config } = require('vuepress-theme-hope'); config({ ... themeConfig: { navbar, sidebar } })` | navbar/sidebar 在 themeConfig |
| `reco` | `vuepress-theme-reco@^1.6.0` | vuepress@1.x | `module.exports = { theme: 'reco', themeConfig: { ... } }` | darkmode/author |

**关键注意事项（v1 API 与 v2 的区别）：**
- `vdoing` v1：**不要**用 `vdoingTheme({})`，直接 `theme: 'vdoing'` 字符串
- `hope` v1：**不要**用 `defineUserConfig` + `hopeTheme({...})`，用 `const { config } = require('vuepress-theme-hope')` + `config({...})`
- `reco` v1：**不要**用 `defineUserConfig` + `recoTheme({...})`，直接 `theme: 'reco'` 字符串
- 以上错误常见于直接复制 VuePress V2 文档示例，v1 与 v2 API 完全不兼容

## 4. base 规范化（用户容易踩的坑）

用户期望"在弹框里随手填 base,不用管尾斜杠"。`/foo`、`/foo/`、`/foo///` 都应写进 config.js 时变成 `/foo/`。详见 `blog-deploy-handler.js` / `blog-config-writer.js` / `api.js` 的 `normalizeBase()` 函数:

```
''          → ''
'./'        → './'              # 相对路径保留原样(github-pages 不需要 repo 子路径)
'./foo'     → './foo/'
'/foo'      → '/foo/'
'/foo/'     → '/foo/'
'/'         → '/'
'/foo///'   → '/foo/'           # 多余尾斜杠折叠
```

实现: 字符串处理,先解引号再清洗。**3 处全栈都跑**（IPC 边界 + writeVuepressConfig + quoteBase 内部）做双保险。

## 5. SFTP 上传

### 5.1 数据流

`blogDir/.vuepress/dist/` → `sftpUpload(config, outputDir, onProgress)` → 临时 `.sftp-tmp/*` → 远程 `config.remotePath/`。中途 `cancelUpload()` 可中断（`currentProcess` 风格）。

### 5.2 备份开关

`sftpConfig.backupEnabled` (默认 `true`) → `backupRemoteDir(sftpConfig)`：

```js
const backupPath = `${config.remotePath}_backup_${Date.now()}`
sftp.rename(config.remotePath, backupPath)   // 旧目录改名
```

失败 `console.warn` 不阻断上传(避免"备份失败导致什么都不发布")。UI 在 `BlogDeployDialog.vue` 的 SFTP 区块内部嵌了 `<q-toggle v-model="localConfig.sftp.backupEnabled">`,开关与"是否启用 SFTP"互斥(不开 SFTP 时不显示)。

### 5.3 通道别名

当前仓库只有一条 IPC 通道 `handleApi('start-blog-deploy', ...)`，承载 github / sftp / cblog 写入等所有部署形态。早期设计中提到的 `start-cblog-deploy` 别名不再保留——如需复用，请直接走 `start-blog-deploy`，并在调用方传 `githubConfig` / `sftpConfig` 区分。参见 `src-electron/main-process/api.js`。

## 6. GitHub Actions / CI 触发

走 `dispatchWorkflow` —— `src-electron/main-process/service/github-api.js`。把 `.github/workflows/*.yml` 用 `exportCIWorkflows()` 写到目标 git 仓库根，再 `git add + commit + push` 触发 Actions 构建产物到 gh-pages。

## 7. 工作流：用户报告"侧栏只显示一个分类"

症状：vuepress build 出来打开 `_posts/foo.html`,侧栏里看不到其它分类的文章。

排查链路(按优先级)：

1. **`.vuepress/sidebar.json` / `config.js` 里的 `themeConfig.sidebar` 是否按 category 分组?**
   - 旧版: `{ '_posts/': [...] }` 单 key —— 是这个 bug 就是它,改用 `{ '/': [...] }` 多 group 形态。
   - 新版: `{ '/': [{ title: '技术', children: [{ title, path: '/<id>.html' }, ...] }, ...] }`。
   - **当前代码实际输出 `'/': groups`**（groups 为 category 分组数组），不是 `'_posts/'`。
2. **frontmatter 是否带 `categories`?**
   - 缺则 vuepress 不知道这是分组子项。
   - `BlogDeployService.buildFrontmatter` 默认会用 `note.category` 注入 `categories: ['<cat>']`。
3. **id-mappings.json 里 `category` 字段是否有正确填充?**
   - 是 `BlogDeployService.writeBlogPosts` 的入参 `category` 透传过来的。
4. **permalink 是否路径前缀与 sidebar key 匹配?**
   - permalink 永远是 `/<id>.html` → sidebar key 必须是 `'/'`(不是别的)。
5. **确认写入时 `seq-manifest.json` 与 id-mappings 同源**
   - 旧 bug：有时一侧写、一侧不写,`buildSidebar` 按 seq=0 全乱序,看起来"分组对但顺序乱"。

## 8. 工作流：修改 sidebar / nav 形态后

无论改哪个 builder，都做这件事：

1. 改 `src-electron/main-process/service/blog-config-writer.js` 里 `SIDEBAR_BUILDER_SRC` / `NAV_BUILDER_SRC` 字符串。
   - **唯一真相源**就是这一份（v2026-07-29 起，scripts/blog/blog-config-writer.js 这个孤儿副本已删除）。
2. 跑一次 `yarn jest tests/unit/blog/blog-config-writer.test.js` 验证 sidebar/nav/verify 形状。
   - 测试覆盖：positive（4 篇文章 → sidebar['_posts/']=4 + verify 全部 resolved）+ negative（id-mappings 有 4 条但 _posts/ 没文件 → verify 抛错）+ ensureBlogConfig 端到端。
3. ~~**同步改动 e2e**~~：以前 `blog-deploy-handler.js` 里还有第二份模板字符串，需要双写。**当前实现中已统一**：deploy 路径只调 `blog-config-writer.writeBlogUtilities()`，没有第二份模板。如果发现 deploy 路径直接 inline 模板，**改回走 writer**，不要重新引入双源。

## 9. 自动化测试模式

所有 inline JS 模板字符串（SIDEBAR / NAV / VERIFY）都是 string-template，不能直接 require 测 —— 走 `writer.writeBlogUtilities(blogDir)` 把模板写到 `.vuepress/utils/`，再 `require()` 真实文件，删 `require.cache` 后再 require。这是验证 builder 的标准姿势。

测试用 `os.tmpdir()` 下的 `memocast-blog-test-<label>-<timestamp>-<rand>` 唯一目录，跑完 `fs.remove`。**绝不在项目根留临时文件**。完整契约见 `tests/unit/blog/blog-config-writer.test.js`（v2026-07-29 起取代旧 `scripts/blog/run-smoke.js`）。

## 10. 与 TODO 文档约定对应

| TODO 文件 | 关联点 |
|----------|--------|
| `TODO-存储机制切换-202607.md` | blog 部署的 `id-mappings.json` / `seq-manifest.json` 中间产物路径与切换 SQLite 后的快照一致性 |
| `TODO-本地线上文件冲突合并-202608.md` | 部署时若本地 _posts 与线上 git 状态冲突的合并策略(可参考 `dispatchWorkflow` 与 `exportCIWorkflows`) |
| `TODO-Skill管理机制.md` | 概念上完全不同(应用内的占位填空模板),与本 skill 没关系 |

## 11. 别乱碰的边界

- **`buildFrontmatter` 一旦改动 `permalink`**：会破坏"重命名笔记 URL 稳定"这条不变量
- **从平铺 `_posts/<id>.md` 改成嵌套 `_posts/<cat>/<id>.md`**：会让旧笔记 URL 全 404,且让 id 短链算法被覆盖
- **把 sidebar key 写成 `'/'` 之外的字符串**(比如 `/posts/`):与 permalink 前缀不匹配,vuepress 默认主题不会渲染这个组
- **忘删 `require.cache` 重测同一 builder**：你会测到老版本

## 12. 必读源码片段

```bash
# 看 builder 形态（v2026-07-29 起唯一真相源：主进程版，scripts/blog/blog-config-writer.js 已删）
sed -n '30,100p' src-electron/main-process/service/blog-config-writer.js
# 看 frontmatter 注入
grep -A 25 "buildFrontmatter" src/services/BlogDeployService.js | head -45
# 看 deploy 流(主进程)
grep -n "sftpUpload\|backupRemoteDir\|dispatchWorkflow\|writeBlogUtilities" src-electron/main-process/service/blog-deploy-handler.js
```
