---
name: 符文接入 melt-js 远程组件
overview: 为符文增加 `type: 'melt-js'` 定义类型：卡片不再是本地 Vue SFC，而是按 hel-micro 远程组件加载；Markdown 占位符上的 `data-rune-prop-*` 属性按 props schema 强转后直接驱动远端组件 props，事件仍回写 `data-rune-value`。老 `vue-sfc` 机制原样保留，零迁移。
todos: []
isProject: false
---

# 符文接入 melt-js 远程组件 · 方案

> 状态：**调研与方案沉淀，未动代码**。
> 基线：`desktop-vue2`（Vue 2.7.16 + hel-micro 4.15.3）、`libs-muya-vue2`、`desktop-vue2-tauri`（同源复刻）。
> 参考：Melt JS 文档 <https://melt-js.github.io/docs-all/dist/>（核心分层、加载策略、组件目录）。

## 1. 一句话结论

技术可行，且比想象中近：melt-js 的 Vue 2 适配层就是"`inheritAttrs: false` + 把 `$attrs` 同时当 `props` 传给远端组件"，而符文的 Markdown ABI 里**已经有** `data-rune-prop-*` → props 的手写通道。所以真正要做的是三件事：

1. 符文的定义类型加一个 `melt-js` 分支（配置 JSON 替代 SFC 字符串），props 白名单从 SFC 声明改成配置里的 schema；
2. 新增一个"壳组件"承接远端组件的加载 / 错误 / 重试 / 卸载，并做 props 类型强转；
3. **先修掉一个现存缺陷**：现在每次 `$emit('input')` 回写都会重建 `<div>` 并丢掉自定义属性，不修的话用户写的 props 第一次输入就被抹平。

## 2. melt-js 机制拆解

### 2.1 分层职责（文档「核心分层」）

| 层 | 职责 |
| --- | --- |
| `libs-core` | 框架无关：地址解析、加载、导出校验、错误规范、请求缓存与串行队列 |
| `libs-core-vue2` / `vue3` / `react` | 薄适配：把远端组件包成"带加载提示 + 失败重试"的本地组件，负责生命周期与参数/事件/插槽透传 |
| `comps-*` / 专题 `libs-*` | 真正的组件与领域能力 |
| `tpl-*` / `demo-*` | 编排业务，选择版本与加载时机 |

关键约束：适配层**不重复实现底层协议**；业务侧只装 npm 代理（类型 + 入口），真正实现由 `hel-meta.json` 指向的远程地址下载。

### 2.2 地址协议与依赖声明

```ts
type HelLoadSpec = {
  name: string            // 包名，如 comps-vue2-meme
  host: string            // 完整入口：hel-meta.json 的 URL 或开发服务器入口
  platform?: string       // 平台隔离，避免跨平台串包
  appGroupName?: string
  requiredExports?: string[]  // 加载后校验具名导出是否存在
  custom?: Record<string, unknown>
}
type HelAddressOptions = { type?: 'unpkg' | 'github' | 'custom', base?: string }
```

- `unpkg`（默认）：`https://unpkg.com` + `/@scope/name@version/hel_dist/hel-meta.json`，**保留 npm 包名与版本**；
- `github`：由 `@owner` 推导 `https://owner.github.io`，路径 `/包名[@版本]/hel_dist/hel-meta.json`，无 scope 时必须显式 `base`；
- `custom`：接到自建静态站点 `base` 下（内网 / 私有部署可用）；
- 显式 `host` 不再追加后缀；**同一 platform + 同一组名绑定了不同地址或版本 → 直接报配置错误**（不是静默覆盖）；
- `resolveHelDep` 只解析、不发请求，可用它做"配置预览/校验"。

> 落地含义：符文的远端依赖必须写成"包名 + 版本 + 来源类型（可带 host）"，并且版本要和 npm 代理、`hel_dist` 三者一致，否则加载到的是另一份实现。

### 2.3 加载策略与缓存

- `createHelLoader()`：单实例共享请求缓存 + 串行队列；`loadHelLib`（按需）/ `loadHelLibsSerial`（显式顺序）/ `preloadHelLibs({ deps, loading, loadApp })`（启动预加载，按 `libs-*` → `comps-*` → 其他分批阻塞）。
- 失败请求会释放，允许显式重试；**没有内置自动重试、超时和取消**（文档明确）。
- 预加载与按需加载共享同一份请求，所以"同一组件被 20 个符文实例引用"只下载一次。

### 2.4 组件层 API

```ts
loadHelComponent({ dep | loader, exportName, onError }): Promise<component>
createHelComponentResource(options, onChange): {
  getState(): { status: 'loading'|'ready'|'error', component, error },
  load(), retry(), fail(error), dispose()
}
defineHelComponent({ ...options, loadingComponent?, errorComponent? }): Component
```

### 2.5 Vue 2 适配层的真实语义（`@melt-js/libs-core-vue2@2026.11.16-1` 源码结构）

```js
Vue.extend({
  inheritAttrs: false,
  created () {
    this.resource = createHelComponentResource(options, state => {
      this.remoteState = state.status === 'ready' && typeof state.component === 'object'
        ? { ...state, component: Vue.extend(state.component) }   // 远端导出是选项对象 → extend
        : state
    })
    this.resource.load()          // 挂载即加载（懒加载的含义是"用到了才挂"，不是"点了才加载"）
  },
  beforeDestroy () { this.resource.dispose() },
  errorCaptured (err) { if (this.remoteState.status !== 'ready') return this.resource.fail(err), false },
  render (h) {
    const s = this.remoteState
    return s.status === 'ready'
      ? h(s.component, {
          attrs: this.$attrs,        // ★ HTML 属性
          props: this.$attrs,        // ★ 同一份对象也当 props 传
          on: this.$listeners,       // ★ 事件（含 v-model 的 input）
          scopedSlots: this.$scopedSlots
        }, slots)
      : s.status === 'error'
        ? h(options.errorComponent || HelError, { props: { error: s.error, retry: this.resource.retry } })
        : h(options.loadingComponent || HelLoading)
  }
})
```

Vue 3 版结构等价（`setup` + `shallowRef` + `h(comp, attrs, slots)`，`onMounted` 加载、`onBeforeUnmount` 释放）。

**这就是我们要的机制**：属性（`$attrs`）同时作为 props，事件透传，加载/错误/重试由壳接管，卸载自动 dispose。但直接用 `defineHelComponent` 有两个不够用的点：

1. 它把所有 `$attrs` 无脑塞给远端（含 `class`、`data-*`），没有类型强转与白名单——HTML 属性值恒为字符串，`count="3"` 到期组件拿到 `"3"` 而不是 `3`；
2. 加载态是通用 `<p>加载中</p>`，不符合符文卡片占位符的视觉与 `contenteditable=false` 约束。

所以方案是：**复用 `createHelComponentResource`（底层），自己写壳组件**，不直接用 `defineHelComponent`。

### 2.6 框架运行时绑定（必须做的一步）

`hel-micro` 的 `bindVueRuntime({ Vue })` 实测就是：

```js
function bindVueRuntime (vueRuntimeObj) {
  const vueMod = injectDefault(vueRuntimeObj.Vue)
  bindExternals({ LEAH_Vue: vueMod, Vue: vueMod })   // 远程包声明的 Vue external 直接拿宿主实例
}
```

（`hel-micro/es/index.js:2986`，4.15.3）

不做这一步，远端 Vue 组件会用自己的 Vue 打包副本或直接报 `Vue 未定义` → 组件实例与宿主不是同一个 Vue，生命周期、`$attrs`、作用域样式全部错乱。当前项目的 boot（`src/boot/hel-micro-renderer.js`）只挂了 `Vue.prototype.$hel = helMicro`，**没有 bindVueRuntime**，这是 P0 必须补的。

## 3. 当前符文机制拆解

### 3.1 定义数据模型

表 `rune_templates`（`src-electron/main-process/service/rune-template-service.js:123`）：

```
id, category_key, name, desc, color, icon, template TEXT NOT NULL,
source_url, is_builtin, sort_order, created_at, updated_at
```

`template` 就是一段 Vue SFC 源码字符串。定义流向：DB → `RuneTemplateService.listFlat()` → store `runeCards` → Muya `options.runeCards` → `StateRender.getRuneMap()`（`libs-muya-vue2/lib/parser/render/index.js`）。

### 3.2 渲染管线

```
Markdown: <div data-rune-name data-rune-id data-rune-node-id data-rune-value>名称</div>
   ↓ Muya 当普通 HTML block 解析，全部属性原样进 host.dataset
renderRunePlaceholderNodes()  → 生成占位卡片 + host.dataset.runeRenderKey
   ↓
mountRuneVueHosts()           → 每个 host 挂一个 RunePreviewRenderer 实例
   ↓ propsData: { runeId, nodeId, rune, ...sfcProps, value, onValueChange }
RunePreviewRenderer  → computed rendererCtor = createRuneRendererCtor(rune)
   ↓
createRuneRendererCtor（src/components/muya/runeSfcRendererFactory.js:148）
   - 同步：vue-template-compiler.parseComponent + compileToFunctions + Vue.extend
   - 注入 data-v-rune-<id> 作为 scopeId，<style> 挂到 document.head
   - 自动补 runeId / nodeId / rune / value 四个 props（SFC 未声明时）
   - 缓存 key = `${rune.id}:${template}`（同模板同 id 只编译一次）
```

### 3.3 属性 → props 的现有通道（比预想的好）

`libs-muya-vue2/lib/parser/render/index.js` 里已经实现了：

- `parseSfcPropsDef(template)`：从 SFC `<script>` 里正则解析 `props` 声明（含 `default`）；
- `toRunePropAttr(name)`：`inheritFromPrevious` → `runePropInheritFromPrevious` → DOM 上就是 `data-rune-prop-inherit-from-previous`；
- `collectRunePropsFromHost(host, propDefs)`：只收白名单内、用户显式写过的属性，`'1'/'0'/'true'/'false'` 归一成布尔，其余保留字符串；
- 三优先级（quickInsert 注释声明的口径）：`data-rune-prop-*`（用户手写，最高）> 卡片级字段 > SFC `props.default`；实际挂载时执行的是"`data-rune-prop-*` 显式值 + SFC default 兜底"。

也就是说，"HTML 属性驱动 Vue props"这件事在 `vue-sfc` 体系里已经跑通，只是**白名单来源是 SFC 声明**。melt-js 版本只需要把白名单换成配置里的 schema，再补类型强转。

### 3.4 回写链路与一个必须修的缺陷

```
SFC 内 $emit('input', v)
  → RunePreviewRenderer.onValueChange
  → Muya.updateRunePlaceholderValue({ runeId, nodeId, value })
  → rewriteRunePlaceholderByNodeId(markdown, nodeId, value)     // Muya.vue:96
  → contentEditor.setMarkdown(...)                              // Muya 全量重渲
```

**缺陷（实测代码）**：`rewriteRunePlaceholderByNodeId` 是"整段重建 div"：

```js
return `<div data-rune-name="${...}" data-rune-id="${...}" data-rune-node-id="${...}" data-rune-value="${...}">${...}</div>`
```

只保留这 4 个系统属性 → 用户手写的 `data-rune-prop-*`、`data-rune-width/height` 全部被抹掉。对比之下 `rewriteRunePlaceholderSizeByNodeId` 用的是 in-place `setAttr`，属性保真。

后果：只要熔断到"属性当 props"这一步，用户的 props 会在**第一次输入回写时消失**（直到再手写）。这是 P0 前置项，必须先修。

### 3.5 其他现状约束

| 约束 | 现状 | 对 melt-js 的影响 |
| --- | --- | --- |
| 重渲染粒度 | `setMarkdown` 全量重渲；`renderKey` 含 `innerText`，value 一变即重建 vm | 远端组件必须"无内部状态 / 状态由 props 驱动"，且加载结果必须全局缓存，否则每次输入都重新挂载 |
| 两处 `mountRuneVueHosts` | `render/index.js` 639 与 813 两处同名方法，后者生效 | 改挂载逻辑必须改 813 那处，否则改了没反应 |
| 现有 helmicro 用法 | 内置模板 `createHolyShieldTemplate` 用 `this.$hel.preFetchLib('hel-tpl-remote-lib','2.0.1')`（旧 API，裸调用、无错误态） | 说明渲染进程能加载远程脚本（`webSecurity:false`，无 CSP），但这条路径没有加载/错误/重试治理 |
| Vue / hel 版本 | Vue 2.7.16、hel-micro 4.15.3 | 与 melt-js `libs-core` 依赖的 hel-micro 4.15.3、vue2 适配 `peer ^2.6.14` 完全兼容，不需要再装第二份 hel-micro |
| 定义编辑 UI | `runeFormDialog` 字段：name/desc/category/icon/color/template（SFC）+ GitHub 远端导入 | 需要为 melt-js 增加"类型切换 + 配置编辑 + 依赖校验" |

## 4. 方案设计

### 4.1 定义形态：`type` 判定与配置 JSON

**不新增数据库列**，用 `template` 列承载 JSON，类型由内容判定：

```js
// RuneTemplateService 归一化时派生，不落库
function detectRuneType (template) {
  const s = String(template || '').trim()
  if (!s) return 'vue-sfc'
  if (!s.startsWith('{')) return 'vue-sfc'
  try {
    const obj = JSON.parse(s)
    return obj && obj.$type === 'melt-js' ? 'melt-js' : 'vue-sfc'
  } catch (_) { return 'vue-sfc' }
}
```

理由：`rune_templates` 在 sql.js（desktop-vue2）与 rusqlite（desktop-vue2-tauri）两套引擎里都要跑幂等 `ALTER`，改表成本与风险都高于"内容判定"；导出/导入（front matter + 代码块）也天然兼容——melt 定义的代码块用 ```` ```json ````，SFC 仍是 ```` ```html ````。

若将来需要"按类型查询/统计"，再加 `type TEXT DEFAULT 'vue-sfc'` 列（P2 可选，单独一步做）。

配置结构：

```json
{
  "$type": "melt-js",
  "version": 1,
  "dep": {
    "name": "comps-vue2-meme",
    "type": "unpkg",
    "version": "2026.11.17-1",
    "platform": "meme",
    "host": "",
    "requiredExports": ["TierRanking"]
  },
  "exportName": "TierRanking",
  "props": {
    "title":     { "type": "string",  "default": "从夯到拉", "label": "标题" },
    "tiers":     { "type": "json",    "default": [],        "label": "评级数据" },
    "editable":  { "type": "boolean", "default": true,      "label": "可编辑" },
    "maxHeight": { "type": "number",  "default": 320,       "label": "最大高度" }
  },
  "valueProp": "value",
  "valueEvent": "input",
  "style": { "width": "100%", "minHeight": "120px" }
}
```

- `props` 的类型集合：`string | number | boolean | json`（`json` 走 `JSON.parse`，失败回落 `default`）；
- `valueProp` / `valueEvent`：兼容 `value`+`input`（Vue 2 风格）与 `modelValue`+`update:modelValue`（若远端包是 vue3 风格包装）；
- `style`：给壳组件容器用，避免远端组件没定尺寸时塌陷。

### 4.2 渲染分支

```
createRuneRendererCtor(rune)
  ├─ type === 'melt-js' → createMeltRuneRendererCtor(rune)     ← 新增
  └─ 其它（默认）        → 现有 SFC 编译路径                    ← 原样保留
```

两个工厂各自独立缓存：

- SFC：现有 `runeRendererCtorCache`，key = `${id}:${template}`；
- melt：`meltRendererCtorCache`，key = `${id}:${stableStringify(config)}`（配置变了才重建壳）。

`mountRuneVueHosts` 侧只改一处：白名单来源

```js
const propDefs = resolveRunePropDefs(rune)   // 新增：melt → config.props 展开；vue-sfc → parseSfcPropsDef
const sfcProps = collectRunePropsFromHost(host, propDefs)   // 现有函数不动
```

`collectRunePropsFromHost` 的布尔归一已覆盖 `boolean`；`number`/`json` 的强转放到壳组件里做（因为需要 schema 的类型信息，libs 侧只做"取值"）。

### 4.3 壳组件 `MeltRuneHost`（新增 `src/components/rune/meltRuneHost.js`）

职责：**加载 / 状态 / 类型强转 / 事件回写 / 释放**，不碰 Muya。

```js
// 伪代码
const resourcePool = new Map()   // key: platform|name@version|origin|exportName

function acquire (key, options) {
  let entry = resourcePool.get(key)
  if (!entry) {
    const resource = createHelComponentResource(options, state => entry.listeners.forEach(fn => fn(state)))
    entry = { resource, refs: 0, state: resource.getState(), listeners: new Set() }
    resourcePool.set(key, entry)
  }
  entry.refs++
  return entry
}
function release (entry) { if (--entry.refs <= 0) { entry.resource.dispose(); resourcePool.delete(key) } }

export function createMeltRuneComponent (config) {
  return Vue.extend({
    name: `MeltRune(${config.exportName})`,
    props: ['runeId', 'nodeId', 'rune', 'value', 'onValueChange', ...schemaPropNames],
    created () { this.entry = acquire(...); this.entry.listeners.add(s => { this.state = s }) },
    beforeDestroy () { this.entry.listeners.delete(...); release(this.entry) },
    methods: {
      buildProps () {
        const out = {}
        for (const [name, def] of Object.entries(config.props)) {
          out[name] = coerce(this[name], def)          // string/number/boolean/json + default
        }
        if (config.valueProp) out[config.valueProp] = this.value
        return out
      },
      emitValue (v) { this.onValueChange && this.onValueChange({ runeId, nodeId, value: normalize(v) }) }
    },
    render (h) {
      const s = this.state
      if (s.status === 'loading') return h(MeltRuneSkeleton, { props: { title: this.rune?.name } })
      if (s.status === 'error') return h(MeltRuneError, { props: { error: s.error, onRetry: () => this.entry.resource.retry() } })
      return h(s.component, {
        class: 'melt-rune-host',
        style: config.style,
        props: this.buildProps(),
        on: { [config.valueEvent || 'input']: v => this.emitValue(v) }
      })
    }
  })
}
```

要点：

1. **引用计数 + 资源池**：同一依赖的 N 个实例共享一次加载；全部卸载才 dispose，重进笔记时走 hel-micro 的模块缓存（不重复下载）；
2. **加载骨架 / 错误卡**：都带 `contenteditable="false"`（宿主 `mountRuneVueHosts` 已设），错误卡有"重试"按钮，日志打 `[melt-rune] name@version phase=x`；
3. **框架校验**：ready 时若导出既不是对象/函数，或检测到 Vue 3 特征（`__vccOpts` / `setup`）→ 直接进 error 态并提示"需要 Vue 2 组件包（comps-vue2-*）"；
4. **不 state 化远端组件的内部状态**：依赖"value + props 驱动"，符合 3.5 的重渲约束。

### 4.4 属性 ABI（两套，canonical 一套）

| 方案 | 写法 | 可读性 | 风险 | 结论 |
| --- | --- | --- | --- | --- |
| **A. `data-rune-prop-*`（推荐 canonical）** | `<div data-rune-prop-title="从夯到拉" data-rune-prop-max-height="320">` | 一般（前缀长） | 无：已在现网跑通，`host.dataset` 直接可读，Muya 原样保留 | P0 |
| B. 自然属性别名 | `<div title="从夯到拉" max-height="320">` | 好 | 需要 `getAttribute` 白名单读取；与 `name/value/id` 等系统键冲突要避让；空格/大小写规则要定 | P2 可选 |

P0 只做 A，B 作为后续体验优化（配置里加 `"attrMode": "plain"` 才启用，默认 `dataset`）。

### 4.5 回写修正（P0 前置，独立一步）

新增/改造三个纯函数（目标位置：`src/components/muya/runePlaceholderAttrs.js`，从 `Muya.vue` 抽出，便于单测）：

```js
readRuneAttrs(markdown, nodeId)                  // { attrs: {name: value}, innerText }
patchRuneAttrs(markdown, nodeId, patch)          // in-place setAttr/removeAttr，保留其它属性
rewriteRunePlaceholderByNodeId(...)              // 改为：只 patch data-rune-value + innerText
rewriteRunePlaceholderPropByNodeId(...)          // 新：按 schema 写 data-rune-prop-*
```

验收：手写 `data-rune-prop-*` 的 rune，触发一次 `$emit('input')` 后属性仍在（现有行为是消失）。

### 4.6 作者与运维体验（P1）

| 功能 | 落点 | 说明 |
| --- | --- | --- |
| 类型切换 | `runeFormDialog.vue` / `runeFormFields.vue` | `vue-sfc` / `melt-js` 单选；切换时保留两份配置，不互删 |
| 配置编辑器 | `runeFormEditor.vue` | Monaco `json`；带 JSON Schema 校验（必填 `dep.name` / `exportName`） |
| 依赖校验 | `resolveHelDep` 预览 | 保存前把"包名+版本+来源"解析成真实 URL 显示给用户，避免版本/来源写错 |
| 组件选择 | 输入 `name@version` + 来源 → 拉 `hel-meta.json` → 列出 `exports` 便于选 `exportName` | 若 meta 里带 propsSchema（部分包有 `src/components/X/propsSchema.json`，hel_dist 是否导出待验）则自动填 schema；否则手填 |
| 实例属性面板 | 新增 `runeInstancePropsDialog.vue` | 读定义 schema 生成表单 → 写回 `data-rune-prop-*`（调 4.5 的 helper），补齐"不手改 Markdown 也能调参" |
| 预加载开关 | 设置项 + boot | `preloadHelLibs({ deps })` 列出高频 melt rune；默认关闭（懒加载），失败不阻塞启动 |
| i18n | `zh-cn` / `en-us` 同步 | 类型名、错误文案、重试按钮 |

### 4.7 双端同步

| 位置 | desktop-vue2 | desktop-vue2-tauri | 说明 |
| --- | --- | --- | --- |
| `libs-muya-vue2/**` | 共用 workspace 包 | 同左 | **改一次**：`resolveRunePropDefs`、挂载逻辑（813 那处） |
| `src/components/rune/**`、`src/components/muya/**` | 有一份 | 有一份（镜像） | 两份都要改，保持 diff 只含既有的平台适配项 |
| `src-electron/.../rune-template-service.js` | 主进程服务 | `src/desktop/database/**` + service（rusqlite） | 类型归一化逻辑抽成纯函数放 `share/` 或 `src/utils`，两边引同一份 |
| boot | `hel-micro-renderer.js` 加 `bindVueRuntime` | 有同名文件，同样要加 | 两侧行为一致 |
| 测试 | `tests/unit/rune/*`（jsdom + vue2-jest） | `tests/*.test.js`（node 环境） | 组件用例只放 vue2；tauri 侧只放纯函数用例 |

## 5. 分期与验收

### P0 —— 机制打通（可独立提交 3 个单元）

1. `fix(rune): 回写占位符时保留自定义属性`：4.5 的 helper + 单测；老 SFC 符文行为不变（回归 `yarn verify:rune`）。
2. `feat(rune): 支持 type=melt-js 的定义解析与属性映射`：`detectRuneType` + `resolveRunePropDefs` + `meltRuneHost` + `createMeltRuneRendererCtor` + `createRuneRendererCtor` 分派；不接 UI，先用一条手写 JSON 定义验证。
3. `feat(rune): 补 bindVueRuntime 与远端加载资源池`：boot 绑定 + 资源池/引用计数 + 错误可重试。

**P0 验收（真机）**：

- 内置演示 melt rune（建议 `MagneticButton`（体积小）或 `TierRanking`（真实低频场景））：插入后先骨架再出组件；
- 改 Markdown 上的 `data-rune-prop-*`（如 `title` / `max-height`）→ 组件属性随之变化；
- 触发组件 `input` → `data-rune-value` 回写，且**自定义属性仍在**；
- 断网 → 错误卡 + 重试；重试成功；
- 同一依赖插入 3 个实例 → 网络面板只有 1 次 `hel-meta.json` + 1 次实现脚本；
- 关闭笔记 / 删除 rune → 实例销毁，无控制台报错，无泄漏（`resourcePool` 归零）。

**单测**：配置解析（合法/非法/缺字段）、props 强转（string/number/boolean/json + default 回落）、三态渲染与 retry、引用计数 dispose、属性 round-trip。

> 测试落点：组件级用例（挂 Vue 实例、jsdom、`@vue/vue2-jest`）只能放 `desktop-vue2/tests/unit/rune/`；`desktop-vue2-tauri` 的 `jest.tauri.config.js` 是 `testEnvironment: 'node'`，只适合放纯函数用例（类型判定、props 强转、属性 patch），不要在那儿挂组件。
> 提交前按 `.agents/rules/rune-echo-test-moat.mdc`：`yarn verify:rune` + `yarn verify`。

### P1 —— 作者与运维

- 类型切换 + JSON 编辑器 + 依赖解析预览 + 实例属性面板 + 预加载开关 + i18n + 导出/导入（`type` 与代码块语言）。
- 验收：在 UI 里建一个 melt rune、选组件、配 2 个 props、插入笔记、改属性、导出再导入后仍可渲染。

### P2 —— 体验与边界

- 自然属性别名（`attrMode: 'plain'`）；
- propsSchema 自动发现（读 hel-meta / 包内 schema）；
- 离线/内网 `custom` host 与本地缓存策略（是否落盘 JS、版本灰名单）；
- 可选 DB 加 `type` 列 + 按类型筛选/统计。

## 6. 风险与对策

| 风险 | 后果 | 对策 |
| --- | --- | --- |
| 未 `bindVueRuntime` | 双 Vue 实例，`$attrs`/事件/样式全乱 | boot 里绑定一次（幂等）；ready 时做导出形态校验，Vue3 组件直接报"框架不匹配" |
| 远端脚本执行 | 供应链风险（`webSecurity:false` + 无 CSP） | 只允许 `unpkg`（限定 `@melt-js` / 白名单 scope）与显式确认过的 `custom` host；`host` 手填需二次确认弹窗；记录来源到日志 |
| unpkg 限流 / 内网无外网 | 卡片长期 loading | 版本固定 + 内置 `custom base` 支持内网静态站；错误卡可重试；可选本地缓存（P2） |
| `setMarkdown` 全量重渲 + renderKey 含 innerText | 每次输入重建 vm，组件内部状态丢失 | 远端组件按"props 驱动 + 无内部状态"接入；加载结果进程级缓存；后续可评估把 melt 类型的 renderKey 去掉 innerText（需配合占位符不重刷，属 P2 优化） |
| `rewriteRunePlaceholderByNodeId` 属性丢失 | props 第一次回写就没了 | P0-1 先修（in-place patch）+ 单测锁死 |
| `mountRuneVueHosts` 有两处定义（639/813） | 改错位置、改了没效果 | P0 顺手去重（保留 813 的实现，删 639 旧版）并加注释 |
| 远端组件体积大（TierRanking 含 html2canvas / IndexedDB） | 首屏变慢 | 默认懒加载 + 骨架；预加载列表只放高频小组件；`requiredExports` 精确到具名导出 |
| 源码模式 / 打印导出时组件未就绪 | 导出内容缺失 | 导出走"占位文本兜底"（现有 placeholder 文本），不阻塞导出 |

## 7. 需要拍板的三件事

1. **属性 ABI**：P0 只做 `data-rune-prop-*`（稳），还是同时上"自然属性"（好看但要定冲突规则）。建议先 A，B 留 P2。
2. **来源白名单**：只允许 `@melt-js/*` 的 unpkg/github，还是允许用户填任意 `host`（内网/私有）。建议"默认白名单 + 手填需确认"。
3. **是否把 `@melt-js/libs-core-vue2` 作为正式依赖**（约 10 KB 级 + 复用现有 hel-micro）而不是自己写加载逻辑。建议引入：加载/重试/地址解析这些"坑最多"的部分交给上游，我们只写壳。

## 8. 关键代码定位（便于落地时直接跳转）

| 关注点 | 文件:行 |
| --- | --- |
| 符文 SFC 编译工厂与缓存 | `desktop-vue2/src/components/muya/runeSfcRendererFactory.js:148` |
| `RunePreviewRenderer`（props/onValueChange） | `desktop-vue2/src/components/muya/Muya.vue:233` |
| 回写（重建 div，丢属性） | `desktop-vue2/src/components/muya/Muya.vue:96` |
| 尺寸回写（in-place，可参考） | `desktop-vue2/src/components/muya/Muya.vue` `rewriteRunePlaceholderSizeByNodeId` |
| 挂载（生效实现） | `libs-muya-vue2/lib/parser/render/index.js:813`（639 为被覆盖的旧版） |
| props 白名单与采集 | 同文件 `parseSfcPropsDef` / `toRunePropAttr` / `collectRunePropsFromHost` |
| 占位符 ABI 生成 | `libs-muya-vue2/lib/ui/quickInsert/index.js:185` |
| 符文定义表与落库 | `src-electron/main-process/service/rune-template-service.js:123` |
| 定义读取与种子 | `desktop-vue2/src/services/RuneTemplateService.js`（`listFlat` / `fetchFromGithub` / `seedBuiltin`） |
| 定义编辑 UI | `desktop-vue2/src/components/rune/runeFormDialog.vue` / `runeFormFields.vue` / `runeFormEditor.vue` |
| hel 运行时现状 | `desktop-vue2/src/boot/hel-micro-renderer.js`（只有 `Vue.prototype.$hel`） |
| 现有远程加载示例 | `desktop-vue2/src/components/rune/runeTemplates/runeTemplatesHolyShield.js` |
| 测试护城河 | `.agents/rules/rune-echo-test-moat.mdc`、`tests/unit/rune/*.test.js` |

## 9. 落地记录（笔记侧适配，v2026-11-22）

P0 的前两个单元已完成并提交（第三个单元「接远端组件」按用户要求延后，本轮只做笔记自身适配）：

| 单元 | 提交 | 落点 |
| --- | --- | --- |
| 占位符属性读写抽纯函数 + 回写保真 | `a0b2a32` | `desktop-vue2/src/components/muya/runePlaceholderAttrs.js`（新）+ `Muya.vue`（删 98 行内联实现） |
| 定义类型判定 + props 解析层 + 双 ABI | `acd5391` | `libs-muya-vue2/lib/rune/runeDefinition.js`、`runeProps.js`、`runePropDefs.js`（新）+ `parser/render/index.js`、`RuneTemplateService.js`、`runeSfcRendererFactory.js` |
| tauri 侧同步 | `07c5e87` | `desktop-vue2-tauri` 同四处镜像 + 2 个纯函数测试 |

与本文档原设计的偏差（均为落地时的实证修正，后续按此口径）：

1. **props schema 用对象 map 而不是数组**：`props: { maxHeight: { type, default, label } }`。
   渲染层的 `propDefs` 仍是数组，由 `listMeltPropDefs` 转换，与 SFC 解析结果形态对齐。
2. **类型判定签名是 `detectRuneType(template)`**，不看 `rune.type`；「显式 type 优先」收敛在
   `resolveRunePropDefs(rune)`（宿主归一化后的 `rune.type` 优先）。
3. **props 解析层独立成 `runePropDefs.js`**：`parser/render/index.js` 顶层 import 了
   `katex.min.css` / `boot/i18n`，Jest 跑不起来；抽出来后 props 解析与属性采集都能纯函数单测。
4. **属性采集独立成 `runeProps.js`**：同理，脱离渲染链可在 jsdom 下单测。
5. **自然属性黑名单（`class/style/contenteditable/hidden/spellcheck/draggable/tabindex`）**，
   `title` 放行（用户可用它驱动 prop）。
6. **校验返回 `[{ field, message }]`** 而不是字符串数组，便于表单按字段定位。

测试口径：`cd desktop-vue2 && npx jest` → 46 suites / 1230 tests 全绿；
`cd desktop-vue2-tauri && pnpm exec jest --config jest.tauri.config.js` → 14 suites / 103 tests 全绿。
eslint：改动文件相对 HEAD 基线无新增 error（`Muya.vue`/`runeSfcRendererFactory.js`/`RuneTemplateService.js`
的存量 error 仍在，未顺手改，避免混入无关改动）。

下一步（仍未做，按用户"后面再接"的口径）：`@melt-js/libs-core-vue2` 引入 + `bindVueRuntime` +
`createMeltRuneRendererCtor` + 资源池（`platform|name@version|origin|exportName` 引用计数）。

## 10. 落地记录（P0-3 接远端组件，v2026-11-22）

| 单元 | 提交 | 落点 |
| --- | --- | --- |
| 引入依赖 | `50cf7d6` | `@melt-js/libs-core-vue2@2026.11.16`（desktop-vue2 / desktop-vue2-tauri）+ `pnpm-workspace.yaml` allowBuilds 补 `esbuild@0.25.12` |
| 壳组件 + 资源池 + 分流 | `6b433c2` | `desktop-vue2/src/components/rune/meltRuneHost.js`（新）+ `Muya.vue`（RunePreviewRenderer 先 melt 后 SFC）+ `boot/hel-micro-renderer.js`（`bindVueRuntime({Vue})`） |
| tauri 镜像 | `c8d30f1` | `desktop-vue2-tauri` 同三处 + `tests/rune-melt-host.test.js` |

实现口径（与 4.3 伪代码的差异，均以实测/可维护性为准）：

1. **不直接用 `defineHelComponent`**，用 `createHelComponentResource` 自己做壳：需要
   类型强转、引用计数、loading/error 视觉；地址解析 / 导出校验仍交给上游。
2. **依赖懒加载**（函数内 `require('@melt-js/libs-core-vue2')`）：该包是纯 ESM，
   Jest 默认不转译 node_modules；懒加载让「不碰 melt 路径」的测试完全不受影响，
   测试里用 `jest.mock(..., factory)` 替身。生产由 webpack 4.47 打进 bundle，实测 0 error。
3. **壳缓存 key** = `${rune.id|name}:${stableStringify(config)}`；**资源池 key** =
   `platform|name@version|origin|exportName`（origin = `host || type`，区分 unpkg 与自建站点）。
4. **配置不合法不返回 null**，而是返回「错误卡 ctor」：直接把 `dep.name:` / `exportName:`
   等字段级错误显示出来，比退回空白占位卡片好排查。
5. **Vue 3 包判定**：导出对象带 `setup` 或 `__vccOpts` → 错误卡提示「请换 comps-vue2-*」。
6. **`value` 始终注入 `valueProp`**（默认 `value`），其余 schema prop 只在宿主写过时下发，
   空值/非法值走 `undefined`，交给远端组件自己的 `default`。
7. **系统保留名防护**：schema 里出现 `runeId/nodeId/rune/value/onValueChange` 时跳过声明，
   避免和壳自己的 props 撞车。
8. 壳名统一 `MeltRune + PascalCase(exportName)`（Vue 会校验组件名，不接受括号）。

测试口径：desktop-vue2 47 suites / 1247 tests 全绿（新增 melt 壳 17 例）；
desktop-vue2-tauri 15 suites / 120 tests 全绿。

真机待验收（环境无 GUI，未做）：真实 CDN 拉 `comps-vue2-meme` 的端到端渲染、
加载失败重试、断网回落错误卡、同一笔记内多实例共享一次加载。

## 11. P0-4 远端产物按需加载 + 用户 props 透传（本轮）

用户口径修正：**组件产物必须从对方远端拉**，我方只维护「指向（host/dep）+ 版本」。
因此壳不再把产物打进本地依赖，改成每次（命中缓存外）用 loader 去远端取。

### 11.1 加载策略

- 资源获取从 `{ dep }` 改为 `{ loader: () => loader.loadHelLib(spec) }`，
  `spec` 由 `buildMeltLoadSpec(config)` 产出。
- **dep 级 loader 缓存**（`depLoaderCache`，key = `platform|name|version|host|type`）：
  同一个 dep 只建一个 `createHelLoader` 实例，引用计数与「同笔记多实例只拉一次」都靠它兜住。
- **host 三种写法**（`resolveHelDep` 实跑确认）：
  1. 直连 `.../hel-meta.json` 或 `.../index.html` → 原样当 dep 用，name 由路径推导，不拼版本；
  2. 自建站点根（如 `https://ip/tools`）→ 拼 `https://ip/tools/@scope/name@version/hel_dist/hel-meta.json`
     （base 里若已含包目录会重复拼，属误用）；
  3. unpkg → `comps-*` 走 `hel_dist/`，`tpl-*`/`demo-*` 同，其余走 `dist/`。
  自建 host 最省事的接法是直接给到 `.../hel-meta.json`，版本由对方部署路径决定。
- **版本语义**：`dep.version` 为空或 `latest` = 浮动（每次重新解析最新 meta）；
  写死具体版本 = 冻结。这是「我方维护版本控制」的落点，目前编码在 spec 解析里，
  暂未单独抽成策略层。

### 11.2 刷新

错误卡按钮由「重试」改为「刷新」：换 dep loader（连带 hel/melt 进程内缓存）
+ `refreshEpoch` 世代 +1（池 key = `${base}#N`）→ 重新拉产物；旧实例继续用旧产物，
卸载时再释放。踩坑：方法直接挂 `v-on` 会丢 `this`（Vue 报 handler ReferenceError），
已改箭头函数包一层。

### 11.3 用户 props 透传（链路真实缺口）

`mountRuneVueHosts` 采集到的宿主属性此前塞进 `propsData`，但渲染的是
`RunePreviewRenderer` 这层包装组件，它只声明 `runeId/nodeId/rune/value/onValueChange`，
schema props 落进 `$attrs` 且从不透传 → **「HTML 属性 ≈ props」在实环境里传不到**。
修法：采集结果打包成单个对象 prop `runeProps` 传下去，`RunePreviewRenderer.render`
里 `...(this.runeProps || {})` 摊到真正组件（运行时字段后写，避免被覆盖）；
复用分支同时保留老的逐 prop 赋值以兼容 SFC 路径。

### 11.4 状态

- desktop-vue2 47 suites / 1250 tests 绿；desktop-vue2-tauri 15 suites / 123 tests 绿。
- 真机仍未验收（云主机无 GUI）。等用户给 SFTP 自建静态托管地址后按其形态配 host 实测。

## 12. 远程组件源设置（设置 → 远程组件）

### 12.1 已实测的真实部署（对方 demo-vue2 / demo-vue3）

- `http://82.156.212.243/@melt-js/demo-vue2/dist/index.html` 里的启动代码：
  `preloadHelLibs({ deps: [{ name, host: "http://82.156.212.243/@melt-js/<pkg>/hel_dist/hel-meta.json", requiredExports }] })`
  + `bindVueRuntime({ Vue })`。**host 直接给 hel-meta.json、不带版本**，与我们壳的直连分支一致。
- 该服务器上存在 `@melt-js/comps-vue2-meme@2026.11.18`（npm/unpkg 都没有），
  其 meta 里 `src_map.webDirPath` = `http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist`。
- 该服务器**没有版本目录**：`.../comps-vue2-meme@2026.11.18/hel_dist/hel-meta.json` → 404，
  所以 sftp 上的「版本」= 对方部署路径，写 version 只会拼出 404。
- GitHub Pages 版 demo（`https://melt-js.github.io/demo-vue2/dist/`）deps 实测：
  `host: "https://melt-js.github.io/comps-vue2-meme/hel_dist/hel-meta.json"` ——
  **组织根 + 去 scope 的包名（= 仓库名）**，一包一仓库，同样没有版本目录
  （`/comps-vue2-meme@2026.11.18/...` 与 `/@melt-js/comps-vue2-meme/...` 均 404）。
  这条已按实测写进 `buildSourceEntryUrl` 的 github 分支（含「base 已是仓库根」的兼容）。

### 12.2 配置模型（`libs-muya-vue2/lib/rune/runeSourceRegistry.js`）

一条来源 = `{ name, type, base, version, distDir, enabled, note }`：

| type | 拼接规则 | version |
| --- | --- | --- |
| sftp | `base/name/hel_dist/hel-meta.json`（name 保留 scope） | 忽略（清空 + warning） |
| github | `base/<去掉 scope 的 name>/hel_dist/hel-meta.json` | 忽略 |
| unpkg | `https://unpkg.com/<name>@<version 或 latest>/<distDir>/hel-meta.json` | 支持 |
| direct | `base` 原样（`.../hel-meta.json` 或 `.../index.html`） | 由对方部署决定 |

- `distDir` 留空自动推断：`comps-* / tpl-* / demo-*` → `hel_dist`，其余 `dist`。
- **同名覆盖**：按数组顺序解析，**从末尾往前找**，后面的覆盖前面的；`enabled=false` 跳过。
- 定义里显式写了 `dep.host` 时**定义优先**，注册表不覆盖（保留「单个符文写死地址」的能力）。

### 12.3 界面

- 新一级 tab：`设置 → 远程组件`（`settingsTabEnum.RemoteComps`，icon `extension`）。
- 面板 `src/components/settings/SettingsMeltSourcesPanel.vue`：
  行内可编辑 组件名 / 来源类型 / 站点根 / 版本（仅 unpkg 可编辑）/ 产物目录 / 启用，
  支持上移下移、删除、新增；每行实时显示**拼接后的产物地址**与 warning；
  被后面同名条目压住的行会标「已被后面的同名条目覆盖」。
- 改动即时写入 localStorage（key `melt.rune.sources`），无需点保存。
- desktop-vue2 与 desktop-vue2-tauri 两份同步（含 i18n zh/en 文案）。

### 12.4 运行时接线

`meltRuneHost.resolveMeltConfig(config)`：
1. `dep.host` 存在 → 原样；
2. 否则查注册表同名来源 → 补 `host` / 平台版本（非 unpkg 清空 version）；
3. 都没有 → 原样交给默认 unpkg 流程。

`getMeltResourceKey` / `buildMeltLoadSpec` 都先经过它，所以池 key 天然区分来源，
错误卡文案也会带上解析后的 host + 来源 warning。

### 12.5 状态

desktop-vue2 49 suites / 1271 tests 绿；desktop-vue2-tauri 15 suites / 120 tests 绿。
真机待验收项不变（云主机无 GUI）。

### 12.6 端到端实测（jsdom，2026-11-22）

- 用 `jsdom`（`runScripts:dangerously`、`resources:usable`）+ 真实 `@melt-js/libs-core-vue2`
  与 `hel-micro`，按注册表解析出的
  `http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json` 拉包：
  **成功**，导出 `TierRanking`（object）。
- 同一次跑在跨源 origin（`http://localhost:8080`）下失败：`Error: Cross origin ... forbidden`。
  原因是该服务器**没有 `Access-Control-Allow-Origin` 响应头**。
  影响面：浏览器/纯 Web 模式会失败；Electron 主窗口 `webSecurity: false`，所以当前不受限。
  结论：自建托管上线前请让对方补 CORS 头（`Access-Control-Allow-Origin: *`），
  或后续用 `createHelLoader(fetchLib)` 走主进程请求 meta（未做）。
