---
name: wujie-microapp-decommission
description: 下架 / 解耦 wujie 子应用微项目（如 echo-monster-deleter）的可复用清单。覆盖「业务内置微应用」从主项目 src/ + src-electron/ 中彻底抽离的步骤，包括 renderer 端 builtins/ 插件、boot 注册、main-process migration、NoteList.vue / SettingsMicroAppsPanel.vue 等调用方清理，以及 Jest 测试更新。使用场景：用户提到「下架微应用」「解耦微应用」「随时下架」「去掉怪兽特效」「删除 _plugins/xxx」「不想让 src-electron 持有业务 id」。
---

# wujie-microapp-decommission —— 微应用下架 SOP

> **目标**：把一个 wujie 子应用微项目从主项目主仓库里干净拆出去。主项目 `src/` 和 `src-electron/` **不持有任何业务 id 字符串**，未来下架只需删业务模块本身。

## 何时使用

- 用户说「下架」「解耦」「随时下架」「不想让主项目持有 xxx 字样」
- 用户问「怎么把 _plugins/xxx 这个子应用从主项目里拿掉」
- 一个 wujie 子应用不再维护 / 不想维护了，但仓库历史已 mix 进主项目

## 前置判断

- 该子项目是否在主项目 boot 里被 **install**？→ 通过 `grep -r "_plugins/<name>" src src-electron` 找出所有依赖
- 主项目是否有它的**业务 hook**（如 NoteList 里的删除确认）？→ 通过业务名搜索
- 是否有**老 SQLite key** 做过一次性 migration？→ 主进程 boot 钩子里

## 下架 / 解耦流程

复制这份 checklist 跟踪进度：

```
Task Progress:
- [ ] Step 1：识别污染面
- [ ] Step 2：建业务内置插件（renderer 端）
- [ ] Step 3：microAppService 改造为注册点
- [ ] Step 4：通用 fullscreenOverlay / fullscreenBridge
- [ ] Step 5：调用方改为 hook 注入
- [ ] Step 6：SettingsMicroAppsPanel 不依赖业务 id
- [ ] Step 7：main-process migration 抽到业务模块
- [ ] Step 8：写 / 更新 Jest 测试
- [ ] Step 9：grep 自检主项目无业务字样
```

### Step 1：识别污染面

```bash
grep -r "_plugins/<name>" src src-electron
grep -r "<name>" src src-electron --include="*.vue" --include="*.js"
```

期望找到这些类别：
- `src/components/microApp/...` —— overlay / bridge
- `src/components/<consumer>/<consumer>.vue` —— 业务调用方
- `src/components/microApp/microAppService.js` —— BUILTIN_APPS 硬编码
- `src-electron/main-process/electron-main.js` —— migration 钩子
- `src/utils/enum/*.js` —— 注释里提到业务 id

### Step 2：建业务内置插件（renderer 端）

在 `src/components/microApp/builtins/<name>.js` 写一个内置模块：

```javascript
import { registerBuiltinApps, MICRO_APP_DISPLAY_MODES } from 'components/microApp/microAppService'

export const <NAME>_APP_ID = '<name>'

export const <name>BuiltinApp = Object.freeze({
  id: <NAME>_APP_ID,
  name: '...',
  icon: '...',
  url: '', devUrl: '',
  isDefault: false, enabled: false,
  isMobile: false,
  displayMode: MICRO_APP_DISPLAY_MODES.FULLSCREEN, // 或 DRAWER
  isBuiltIn: true
})

export function install<Name>Builtin () {
  registerBuiltinApps([<name>BuiltinApp])
}

// 如果业务方有「流程 hook」需求（NoteList 删除确认、文件上传等），
// 同时暴露一个 hook factory：
export function install<Name>ConfirmHook () {
  async function _findBuiltinEntry () { /* ... */ }
  return {
    async isEnabled () { /* ... */ },
    async runSummon (overlayRef, target) { /* ... */ },
    _findBuiltinEntry
  }
}
```

在 `src/boot/microapp-builtins.js` 调 install：

```javascript
import { install<Name>Builtin } from 'components/microApp/builtins/<name>'

export default () => {
  // 下架流程：注释掉这一行 + 删 builtins/<name>.js + rm -rf _plugins/<name>/
  install<Name>Builtin()
}
```

把 `microapp-builtins.js` 加入 `quasar.conf.js` 的 `boot: []`。

### Step 3：microAppService 改造为注册点

把原来的 `BUILTIN_APPS = Object.freeze([...])` 替换为：

```javascript
const _builtinAppsRegistry = []

export function registerBuiltinApps (apps) { /* dedupe by id */ }
export function _resetBuiltinAppsRegistry () { /* 测试用 */ }
export function getBuiltinApps () { /* 只读快照 */ }

export function buildDefaultMicroApps () {
  return [
    { id: 'box-im', ... }, { id: 'coolma', ... }, { id: 'vue2-sfc-playground', ... },
    ..._builtinAppsRegistry.map(app => ({ ...app }))
  ]
}
```

`normalizeMicroApp` / `mergeBuiltInApps` 里查 builtin 时改为 `_builtinAppsRegistry.find(a => a.id === id)`。

### Step 4：通用 fullscreenOverlay / fullscreenBridge（如果业务是 displayMode=fullscreen）

把 `deleteEffectOverlay.vue` 改名为 `fullscreenOverlay.vue`：
- 组件 `name` / 文件名 / class 全部去业务化
- `name="echo-monster-deleter"` 改成 `name="wujieName"`（取自 `appEntry.id` computed）
- 删 fallback 路径里的硬编码 `_plugins/echo-monster-deleter/dist/index.html`，改为返回空字符串
- 删除所有 log prefix 的 `deleteEffectOverlay` 字样

把 `deleteEffectBridge.js` 改名为 `fullscreenBridge.js`：
- 事件名 `microapp:delete-effect:*` → `microapp:fullscreen:*`
- 保留旧事件名 alias emit/listen（兼容旧子项目）
- export 函数名改为 `installFullscreenBridge` / `summonFullscreen` / `teardownFullscreen`，**同时 alias export 旧名**（避免破坏第三方可能还在 import 的代码）

### Step 5：调用方改为 hook 注入

业务方（如 NoteList.vue）：

```javascript
import { install<Name>ConfirmHook } from 'components/microApp/builtins/<name>'

export default {
  // ...
  deleteConfirmHook: install<Name>ConfirmHook(),  // component option
  data () {
    return {
      // fullscreenAppEntry 改为「业务内置条目」，null 时 overlay 不挂载
      fullscreenAppEntry: null
    }
  },
  methods: {
    async <bizFlow>Handler (...) {
      if (await this.deleteConfirmHook.isEnabled()) {
        const overlay = this.$refs.fullscreenOverlay
        const result = await this.deleteConfirmHook.runSummon(overlay, { target })
        if (result && result.outcome === 'destroyed') {
          this.<realAction>(...)
        }
      } else {
        // fallback: 原生 $q.dialog
      }
    }
  },
  mounted () {
    bus.$on('microAppsChanged', this._onMicroAppsChanged)
    this._loadFullscreenAppEntry()
  },
  async _loadFullscreenAppEntry () {
    try {
      this.fullscreenAppEntry = await this.deleteConfirmHook._findBuiltinEntry()
    } catch (err) { this.fullscreenAppEntry = null }
  }
}
```

### Step 6：SettingsMicroAppsPanel 不依赖业务 id

该 panel 已经只需要看 `app.isBuiltIn` 字段就能正确隐藏「删除 / 编辑」按钮，无需调整。

仅当业务方有特殊 UI 行为（如「怪兽特效额外一个开关」）才需要改。原则：**任何「业务 id 字符串」都不该出现在 settings 通用 panel 里**。

### Step 7：main-process migration 抽到业务模块

在 `src-electron/main-process/service/microApp/builtinMigrationRegistry.js` 写通用注册点：

```javascript
const builtinMigrations = []
function register (migrations) { /* dedupe by id */ }
async function applyAll (ctx) { /* 顺序执行，每条独立 try/catch */ }
module.exports = { register, applyAll, _reset, _count }
```

在 `src-electron/main-process/service/microApp/<name>BuiltinMigration.js` 写业务迁移：

```javascript
const LEGACY_KEY = 'setting/old-name'
const APP_ID = '<name>'

async function runMigration (ctx) {
  // ctx = { db, execOne, saveDatabase, log, MICRO_APPS_KEY }
  // ... 旧 key → 新结构
}

module.exports = {
  id: '<name>-builtin-migration',
  migrate: runMigration,
  LEGACY_KEY, APP_ID
}
```

在 `electron-main.js` 顶部 require + 在 `registerDatabaseHandlers` 末尾 register：

```javascript
const builtinMigrationRegistry = require('./service/microApp/builtinMigrationRegistry')
// ...
builtinMigrationRegistry.register([
  require('./service/microApp/<name>BuiltinMigration')
])

ipcMain.handle('db:applyBuiltinMigrations', async () => {
  // 通用调试 IPC：应用所有已注册迁移
  return await builtinMigrationRegistry.applyAll({ db, execOne, saveDatabase, log, MICRO_APPS_KEY })
})
```

`app.on('ready')` 启动钩子也调通用 `applyAll(...)`，不再写业务常量。

### Step 8：写 / 更新 Jest 测试

`tests/unit/microApp/microAppService.test.js`：
- 用 `_resetBuiltinAppsRegistry()` 隔离每个 case
- 验证 `registerBuiltinApps` 行为：注册 / 同 id 覆盖 / 与 buildDefaultMicroApps 联动
- 验证 `normalizeMicroApp` 对已注册内置条目强制 isBuiltIn=true / displayMode=fullscreen
- 验证 `mergeBuiltInApps` 升级场景下保留用户修改

新增 `tests/unit/microApp/builtinMigrationRegistry.test.js`（如果迁移复杂）：
- 验证 register dedupe、applyAll 顺序、异常隔离

### Step 9：grep 自检主项目无业务字样

```bash
grep -rn "_plugins/<name>" src src-electron
grep -rn "<NAME>_APP_ID\|<name>Overlay\|<name>Bridge" src src-electron
```

期望：剩余匹配**仅出现在业务模块本身**（如 `builtins/<name>.js`、`service/microApp/<name>BuiltinMigration.js`）以及「下架指引注释」。这些是有意保留的——告诉用户「删我就能下架」。

## 反模式

- ❌ 在主项目 main-process 里硬编码业务 id（如 `const BUILTIN_<NAME>_ID = '...'`，但没有 require 业务模块）
- ❌ 让 SettingsMicroAppsPanel.vue 根据 `app.id === 'xxx'` 做特殊 UI
- ❌ 在 boot 期一次性把业务逻辑写死在 microAppService.js 的 `BUILTIN_APPS` 数组里
- ❌ 让 NoteList.vue 自己 import 业务 id 常量（应该走 hook 暴露的 API）
- ❌ fullscreenOverlay.vue 的 fallback 路径硬编码 `_plugins/<name>/dist/index.html`

## 完成标准

- [ ] `grep -rn "<name>" src` 命中点**只在业务模块内**
- [ ] `src/components/microApp/microAppService.js` 不再有业务 id 字符串
- [ ] `src-electron/main-process/electron-main.js` 不再有业务 id 字符串
- [ ] SettingsMicroAppsPanel.vue / microAppEditDialog.vue 不再有业务 id 字符串
- [ ] `yarn verify` 全绿
- [ ] boot/microapp-builtins.js 里能看到一行业务 install，注释说明「下架流程」