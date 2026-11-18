# Echo / Boot 测试套件契约规范

v2026-07-29 起，本仓库所有 rune / echo / blog / boot 相关验证**全部**迁入 Jest 29（`tests/` 下）。`scripts/` 只保留打包 / 部署相关脚本（`after-pack.js`），不再有 `verify-*.js`、`scripts/blog/*`。

测试入口：

```bash
yarn verify                  # 全部 13 个 suite / 700+ 个 test
yarn verify:echo             # 6 个 echo 套件
yarn verify:rune             # 2 个 rune 套件
yarn verify:blog             # 1 个 blog 打包套件
yarn verify:boot             # 3 个 boot 套件
yarn verify:smoke            # 1 个工具链烟雾套件
yarn jest tests/unit/echo    # 任意子集
yarn jest tests/unit/echo -t "type=echo-chant"  # 任意 describe/test name
```

---

## 1. 测试目录结构

```
tests/
├── fixtures/
│   └── jquery-setup.js                           # jsdom 全局注入 jQuery，让 handlerBody 用 $ 能跑
├── smoke/
│   └── vue-mount.test.js                         # Jest 29 + @vue/vue2-jest + @vue/test-utils@1.3.6 + jsdom 在 Vue 2.7 仓库能跑通
├── unit/
│   ├── echo/
│   │   ├── jquery-echo-compile.test.js           # 16 张内置 anno_source 顶层结构（type / field / title / version / props；render 返回 string；kind 不再出现）
│   │   ├── jquery-afterrender.test.js            # 16 张 handlerBody 全 jQuery 化（无 native fallback）；HANDLER_PRELUDE / createDefaultEchoAnnoSource 导出名锁住
│   │   ├── runtime-props.test.js                 # EchoRuntime props / fallback / graceful skip / payload round-trip
│   │   ├── schema-formcreate-align.test.js       # echo propsSchema 贴合 form-create rule 的白名单
│   │   ├── inherit-from-previous.test.js         # inheritFromPrevious helper 全套语义 + encodeEchoPayload / decodeEchoPayload round-trip
│   │   └── main-builtin-echoes.test.js           # renderer → IPC payload 契约（main 端镜像 v2026-07-29 删除）
│   ├── rune/
│   │   ├── templates.test.js                     # 14 个 rune SFC 模板契约（源转义 / props.value / $emit）
│   │   └── main-builtin-templates.test.js        # renderer → IPC payload 契约（main 端镜像 v2026-07-29 删除）+ BUILTIN_RUNE_TEMPLATE_META 单源
│   ├── blog/
│   │   └── blog-config-writer.test.js            # blog 打包（VuePress）—— 主进程版 writer 端到端契约；v2026-07-29 起取代旧 scripts/blog/run-smoke.js
│   └── boot/
│       ├── enum-boot-smoke.test.js               # $enums 挂载完整性
│       ├── util-boot-smoke.test.js               # $utils 挂载完整性
│       └── enum-util-regex.test.js               # 文件命名规范 regex 自检
└── (jest.config.js / babel.config.test.js 在 scripts/ 下，按 yarn verify 自动调用)
```

---

## 2. 复用场景与各套件覆盖

### 2.1 场景 1：Renderer → Main IPC payload 契约

**目的**：把 renderer 端 `src/components/echo/echoBuiltins/echoBuiltins.js`（16 张内置回响的聚合入口）通过 IPC 直接推到 main 进程，落 DB。

**历史**（v2026-07-29 之前）：renderer 端 ESM 源文件经 `scripts/transform-main-builtin-echoes.js` 转译为 main 端 `src-electron/main-process/service/builtin-echoes.js`（CJS 镜像）。代价：每次改 `echoBuiltins/` 都要记得跑 transform 同步镜像。

**现状**（v2026-07-29 起）：main 端**不再维护** `builtin-echoes.js` 镜像（连同 `transform-main-builtin-echoes.js` / `verify-main-builtin-echoes.js` 已删除）。DB 落库完全由 renderer 通过 IPC payload 推送：

| IPC handler | payload 来源 | 字段含义 |
|---|---|---|
| `db:clearEchoes` | `payload.builtins` = renderer 端 `BUILTIN_ECHO_CARDS` 完整数组 | 重置 DB 内置 echo 行（保留自定义） |
| `db:saveEcho` | `echo` = 单个 echo 对象 | 增/改 echo 行；内置 echo 的 category 直接读 `echo.category`（renderer 真相源） |
| `db:saveEchoes` | `echoes` = echo 对象数组 | 批量增/改 |

**main 端契约**：
- `db:clearEchoes`：`payload.builtins` 必传且为非空数组（缺省 → `{ success: false, code: 'NO_BUILTIN_ECHO_CARDS' }`）。
- `db:saveEcho` / `db:saveEchoes`：内置 echo（id 前缀 `__builtin_`）的 category 直接读 `payload.echo.category`，主进程**不再查内置 meta 表强制覆盖**。`echo.category` 为空时按 id 前缀兜底：`isBuiltin ? 'builtin' : 'marker'`。
- 启动期"内置 echo showy/marker 类纠正"迁移已删除——历史脏数据由 renderer 端 `loadEchoes` 通过 `{ ...template, ...override }` 自然覆盖（DB 行的 category 永远是代码版默认值）。

**护城河**：`tests/unit/echo/main-builtin-echoes.test.js` 锁住 renderer 端 `BUILTIN_ECHO_CARDS` 具备完整 IPC payload 字段（`id` / `name` / `desc` / `icon` / `color` / `category` / `anno_source` / `isBuiltin` / `metaId`），并校验 `id` 形态（`__builtin_*__`）、`category` enum（`showy` / `builtin`）、`anno_source` 顶层 type 三态合法、`kind` 不再出现、可被 `new Function(prelude + source)` 编译。

### 2.2 场景 2：anno_source 编译套件的公共逻辑

所有 anno_source 编译套件（`jquery-echo-compile.test.js` / `main-builtin-echoes.test.js`）共享以下模式：

**HANDLER_PRELUDE_SOURCE**：注入 `$` helper（从 `src/components/echo/echoAnnoSource.js` 导出）。

```javascript
// 当前实际值（echoAnnoSource.js 导出）
const HANDLER_PRELUDE = "const $ = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null\n"
```

handler body 统一用 jQuery（`$ = window.jQuery`）。Node 端 `$` 退化为 `null`，但 `render(props)` 不依赖 `$`，`afterRender` 报错由 `EchoRuntime._doAfterRender` try-catch 兜住（graceful skip）。

**三个 anno_source 编译套件各自锁的契约**（按列对应）：

| 检查项 | main-builtin-echoes.test.js | jquery-echo-compile.test.js | jquery-afterrender.test.js |
|-------|------------------------------|------------------------------|----------------------------|
| anno_source 能被 `new Function()` 编译 | ✅ | ✅ | - |
| 顶层 type 三态合法（echo / echo-chant / echo-tbd） | ✅ | ✅ | - |
| `kind` 字段已合并到 type（不再出现） | ✅ | ✅ | - |
| `render({})` 返回 string | ✅ | ✅ | - |
| `afterRender` 是函数（type=echo-chant 必填） | ✅ | ✅ | - |
| jQuery 化（无 native fallback） | - | - | ✅ |
| afterRender 直接用 `$()` | - | - | ✅ |
| IPC payload 字段完整（id / name / desc / icon / color / category / anno_source / isBuiltin / metaId） | ✅ | - | - |
| `id` 形态：`__builtin_*__` | ✅ | - | - |
| `category` enum：`showy` / `builtin` | ✅ | - | - |

### 2.3 场景 3：EchoRuntime props / fallback / graceful skip（`runtime-props.test.js`）

**目的**：验证 `definition.render(props)` / `definition.afterRender(node, props)` 真的能拿到参数；props 合并顺序；fallback 路径（no anno_source / compile fail / render throws / echo 未注册）；对未知 type graceful skip；payload round-trip。

### 2.4 场景 4：propsSchema 对齐 form-create（`schema-formcreate-align.test.js`）

**目的**：echo `propsSchema` 贴合 form-create rule——禁止 `placeholder` / `default` 顶层字段、每项 schema 至少含 `type` + `field`、rule 字段必须是 form-create 标准字段、`buildFormCreateRule` 默认值与实例 props 优先级。

### 2.5 场景 5：inheritFromPrevious helper（`inherit-from-previous.test.js`）

**目的**：验证 EchoRuntime 新增的「上一节点 value 继承」helper 函数。

| 函数 | 作用 |
|------|------|
| `isInheritFromPreviousEnabled(attrs)` | 判断是否开启继承 |
| `echoInheritFromPrevious(attrs)` | 支持 attrs/inheritFromPrevious 多挂载位置 |
| `extractPrevEchoTokenValue(md, targetIdx, opts)` | 从 markdown 提取上一 echo token 的 value |
| `applyInheritedEchoValue(attrs, prevValue)` | 应用继承值到当前 attrs |
| `createEchoPlaceholderPayload(echo, opts)` | 创建开启继承的 echo 占位 payload |

### 2.6 场景 6：rune 模板契约（`templates.test.js` + `main-builtin-templates.test.js`）

#### 2.6.A `templates.test.js`

14 个 rune SFC 模板分散在 `src/components/rune/runeTemplates/` 子目录；测试扫描每个文件，验证**源文件级转义**（`</script>` 必须写成 `<\/script>`，否则 .vue 文件 import 时会被截断）；运行时**语法可编译**；**`props.value` 必须声明**（`mountRuneVueHosts` 硬约定）；非纯展示型 rune 必须有 `$emit('input', ...)` 回写通道。`create*Template → runeTemplates*` 命名映射：测试会去掉 `create` 前缀和 `Template` 后缀，拼出对应的导出名。

#### 2.6.B `main-builtin-templates.test.js`（v2026-07-29 新增）

**目的**：把 renderer 端 `src/components/rune/runeTemplates/runeTemplates.js` 的 `BUILTIN_RUNE_TEMPLATE_META`（14 张元数据 + factory 引用）通过 IPC 直接推到 main 进程，落 DB。

**历史**（v2026-07-29 之前）：renderer 端 ESM 源文件经手工同步镜像到 `src-electron/main-process/service/builtin-rune-templates.js`（CJS 镜像，且在 v2026-07-29 之前**已出现真实漂移**——main 端只有 13 张，渲染端 14 张，缺 `InheritDemo`，新装机用户永远看不到 InheritDemo）。代价：每次改 `runeTemplates.js` 都要记得同步镜像。

**现状**（v2026-07-29 起）：main 端**不再维护** `builtin-rune-templates.js` 镜像（已 `git rm`）。DB 落库完全由 renderer 通过 IPC payload 推送：

| IPC handler | payload 来源 | 字段含义 |
|---|---|---|
| `db:clearRuneTemplates` | `payload.builtins` = renderer 端 `BUILTIN_RUNE_TEMPLATE_META` 拼装行数组 | 重置 DB 内置 rune 模板行（保留自定义） |
| `db:saveRuneTemplate` | `row` = 单个模板对象 | 增/改模板行；`saveOne` 是 upsert 语义（已存在则 UPDATE，不存在则 INSERT） |
| `db:saveRuneTemplates` | `rows` = 模板对象数组 | 批量增/改 |

**renderer 端入口**（`src/services/RuneTemplateService.js`）：

| 方法 | 触发场景 |
|---|---|
| `RuneTemplateService.seedBuiltin()` | `ensureLoaded()` 缓存 miss + DB `rune_templates` 为空（或无 builtin 行）→ 一次懒灌种子，并发去重 |
| `RuneTemplateService.buildBuiltinRows()` | 「设置 → 重置符文模板」按 renderer 端 `BUILTIN_RUNE_TEMPLATE_META` 拼装内置行推给 main |
| `RuneTemplateService.clearAll({ builtins })` | 调用 `db:clearRuneTemplates(payload)`；payload 为空 → main 端返回 `NO_BUILTIN_RUNE_TEMPLATES` |

**main 端契约**：
- `db:clearRuneTemplates`：payload 必传且为非空数组（缺省 → `{ success: false, code: 'NO_BUILTIN_RUNE_TEMPLATES' }`）。
- 启动期"首次 seed"已删除——renderer 端通过 `RuneTemplateService.ensureLoaded` 懒灌种子；用户已在「设置 → 重置符文模板」点过 → 通过 `buildBuiltinRows` 再次 push。
- 保留用户自定义（`is_builtin = 0` 的行）；只覆盖 / 重置 `is_builtin = 1` 的内置行。

**护城河**：`tests/unit/rune/main-builtin-templates.test.js` 锁住 renderer 端 `BUILTIN_RUNE_TEMPLATE_META` 具备完整 IPC payload 字段（`id` / `category_key` / `name` / `desc` / `color` / `icon` / `factory`），并校验：
- `id` 形态：`builtin-tpl-*`（main 端 reset 删除 `is_builtin=1` 行的约定）。
- `category_key` enum：`general` / `resume`。
- `factory()` 输出非空字符串。
- `factory()` 输出的 SFC 语法可编译（`new Function(return script)` 不抛错）。
- `factory` 名称与 `TEMPLATE_NAMES` 双向无漂移（避免 renderer 端再分裂两套名单）。

### 2.7 场景 7：已删除（v2026-07-28 / 2026-07-29）

- 主进程不再在启动时自动 sync 内置回响到 DB——用户在「设置 → 重置回响」里点一下走 `db:clearEchoes`。原来的 `seedBuiltinEchoes` 启动钩子已拆，无对应 jest 用例（场景 1 即覆盖）。
- 主进程不再在启动时自动 sync 内置 rune 模板到 DB——`RuneTemplateService.ensureLoaded` 懒灌种子（场景 2.6.B 覆盖）。原来的 `BUILTIN_RUNE_TEMPLATES` 镜像 + 启动期 if-count===0 seed 代码段均已删除。

### 2.8 场景 8：blog 打包（VuePress）—— `blog-config-writer.test.js`（v2026-07-29 新增）

**目的**：锁住 blog 打包链路（VuePress）的真相源（主进程版 `src-electron/main-process/service/blog-config-writer.js`）端到端契约。

**历史**（v2026-07-29 之前）：存在 `scripts/blog/blog-config-writer.js`（主进程版的孤儿副本，已漂移；实测 SIDEBAR / NAV / VERIFY 三个模板与主进程版不等）+ `scripts/blog/cyrb53.js`（与 `src/services/BlogDeployService.js` 内嵌 cyrb53 漂移，0 处 require）+ `scripts/blog/run-smoke.js`（独立 smoke 测试入口，不被 yarn 任何 alias 引用）。SKILL.md 旧版 §8 第 1 步还误导用户"改 scripts/blog/blog-config-writer.js 里 SIDEBAR_BUILDER_SRC"，但生产路径只调主进程版——这就是已知的双源陷阱。

**现状**（v2026-07-29 起）：`scripts/blog/` 整目录已删除（`git rm`），主进程版成为唯一真相源。smoke 测试的契约迁到 `tests/unit/blog/blog-config-writer.test.js`：

| 测试用例 | 锁住的契约 |
|---|---|
| `writeBlogUtilities` 写出 3 个 builder 文件 | sidebar-builder.js / nav-builder.js / verify-paths.js |
| `SIDEBAR_BUILDER_SRC` / `NAV_BUILDER_SRC` / `VERIFY_PATHS_SRC` 非空字符串模板 | 模板存在且有效（不会被默默清空） |
| `writeVuepressConfig` 不覆盖已存在的 config.js | 用户已写好的 config.js 不会被默认 writer 覆盖 |
| `runBuilders` positive：4 篇文章 → `sidebar._posts/` = 4 | 与旧 `run-smoke.js` 第 1 段断言等价 |
| `runVerifyPaths` negative 抛错 | id-mappings 有 4 条但 _posts/ 没文件 → verify 应抛错 |
| `ensureBlogConfig` 端到端 positive / negative | positive.ok=true；negative.ok=false 且 sidebar 仍能写出 |

---

## 3. Boot 扫描正则回归测试

`boot/globalGlobals.js` 当前用 `require.context` 扫描 `src/cloudfns/`，未来也计划扫描 `src/utils/enum/` 和 `src/utils/util/`。**项目文件名约定是小驼峰（camelCase）**，所以任何 `require.context` 的正则必须用 `/^[a-z]\w*Xxx\.js$/`，**不能用** `/[A-Z]\w+Xxx\.js$/`（后者要求首字母大写，会全部漏掉）。

> 历史教训：早期草稿正则 `/[A-Z]\w+Util\.js$/` 配项目 `emptyUtil.js` / `treeUtil.js` 等 camelCase 文件会**一个都匹配不到**，导致 `this.$utils.emptyUtil` 在组件里全是 undefined。这 3 个 jest 用例就是为了"打脸"那个旧正则、固化正确写法而写的。

### 3.1 `tests/unit/boot/enum-util-regex.test.js`

直接跑 RegExp 打几个文件名，打印 true/false，肉眼对照。

### 3.2 `tests/unit/boot/enum-boot-smoke.test.js`

扫 `src/utils/enum/` 实际目录：

- 对每个文件跑旧正则 `/[A-Z]\w+Enum\.js$/` 和新正则 `/^[a-z]\w*Enum\.js$/`，打印命中数。
- 期望新正则命中 6 个 enum 文件（`aiAssistantProvider` / `calendarDateBasis` / `cloudSyncProvider` / `noteOrderType` / `runeEchoCategories` / `settingsTab`），不命中 `index.js` / `enumSetup.js` 基础设施。
- 新增 enum 时**只**需要把 `EXPECTED_ENUM_FILES` 同步加 1 即可。

### 3.3 `tests/unit/boot/util-boot-smoke.test.js`

扫 `src/utils/util/` 实际目录：

- 跑旧/新正则对比。
- 模拟 `buildNameSpacedMap` 把命中文件转成 `$utils.emptyUtil` / `$utils.treeUtil` / `$utils.dateUtil` 这种 namespace map，确认 `NoteItem.vue` 用到的三个 key 都存在。

> **何时跑**：
> - 修改 `boot/globalGlobals.js` 的 require.context 正则时**必须**先跑 `yarn verify:boot`。
> - 在 `src/utils/enum/` 或 `src/utils/util/` 新增/删除/改名文件后跑对应 jest 套件，确认正则仍然覆盖到位。

---

## 4. 路径处理规范（jest 用例读源时）

| 测试位置 | 目标文件 | 路径写法 |
|---------|---------|---------|
| `tests/` | `src/components/echo/echoBuiltins/` | `path.resolve(__dirname, '..', '..', 'src', 'components', 'echo')` |
| `tests/` | `src/components/echo/echoBuiltins/echoBuiltins.js` | `path.join(ROOT, 'echoBuiltins', 'echoBuiltins.js')` |
| `tests/` | `src/components/echo/echoAnnoSource.js` | `path.resolve(__dirname, '..', '..', 'src', 'components', 'echo', 'echoAnnoSource.js')` |

> 注意：`ROOT` 常量在每个 suite 顶部定义，跨 suite 不要共享（每个 jest worker 进程独立加载）。

---

## 5. 新增 Jest 用例规范

1. **必须放在 `tests/unit/`** 或 `tests/smoke/` 下，按测试粒度分目录（`echo/` / `rune/` / `boot/`）
2. **文件名后缀必须是 `.test.js`**，Jest 才会自动发现
3. **必须从项目根目录跑**（`yarn verify:xxx` 或 `yarn jest <path>`），不要从子目录跑
4. **断言必须**抛错，**禁止**写成 `process.exit(0)` 绕过（约定见 `rune-echo-test-moat.mdc` §6）
5. **避免硬编码数字**：用 `BUILTIN_ECHO_CARDS.length` 这类动态来源，不要写死 `16`
6. **共享前置**：`HANDLER_PRELUDE` 字符串必须从 `echoAnnoSource.js` 读，不允许在不同 suite 里写不同值

---

## 6. 何时跑哪些测试

| 时机 | 跑的测试 |
|-----|---------|
| 修改 `echoBuiltins/` 子目录的卡片 / 工厂后 | `yarn verify:echo`（覆盖 `main-builtin-echoes.test.js` IPC payload 契约 + `jquery-echo-compile.test.js` / `jquery-afterrender.test.js`） |
| 修改 `echoRuntime.js` 后 | `yarn jest tests/unit/echo/runtime-props.test.js tests/unit/echo/inherit-from-previous.test.js` |
| 修改 afterRender 签名后 | `yarn jest tests/unit/echo/jquery-afterrender.test.js` |
| 修改 echo `propsSchema` 后 | `yarn jest tests/unit/echo/schema-formcreate-align.test.js` |
| 修改 `runeTemplates/runeTemplates.js` 或任一 `runeTemplates*.js` 后 | `yarn verify:rune`（覆盖 `templates.test.js` 源转义 / props.value + `main-builtin-templates.test.js` IPC payload 契约） |
| 修改 `RuneTemplateService.js` 或 `electron-main.js` 的 `db:clearRuneTemplates` IPC handler 后 | `yarn jest tests/unit/rune/main-builtin-templates.test.js` |
| 修改 `blog-config-writer.js` 的 `SIDEBAR_BUILDER_SRC` / `NAV_BUILDER_SRC` / `VERIFY_PATHS_SRC` 或 `writeVuepressConfig` / `runBuilders` / `runVerifyPaths` / `ensureBlogConfig` 后 | `yarn verify:blog` |
| 任何 echo 相关改动的最终验证 | `yarn verify:echo` |
| 修改 `boot/globalGlobals.js` 的 require.context 正则后 | `yarn verify:boot` |
| `src/utils/enum/` 新增/删除/改名 enum 文件后 | `yarn jest tests/unit/boot/enum-boot-smoke.test.js tests/unit/boot/enum-util-regex.test.js` |
| `src/utils/util/` 新增/删除/改名 util 文件后 | `yarn jest tests/unit/boot/util-boot-smoke.test.js` |
| PR 合并前最终门禁 | `yarn verify`（13 个 suite / 700+ 个 test） |
