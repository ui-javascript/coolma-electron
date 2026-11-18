---
name: enum-plus
description: enum-plus 枚举增强库集成指南。用于在 Memocast 中使用 enum-plus 管理业务枚举，包括定义枚举、获取 label、生成 UI 选项、与 Element-UI 组件集成。遇到枚举定义、label 回显、下拉框选项、业务状态码、UI 组件绑定等场景时应自动使用。
---

# enum-plus 枚举增强库使用指南

> **来源**：`node_modules/enum-plus/README.md` + 源码
> **版本**：3.2.1

## 核心原则

enum-plus 的 **核心设计**：直接访问枚举项就是值本身！

```javascript
StatusEnum.Review === 2           // ✓ 直接就是值
StatusEnum.Review.value === undefined  // ✗ .value 不存在！
```

---

## 导入

```javascript
import { Enum } from 'enum-plus'
```

---

## API 一览（README 原文）

```javascript
const StatusEnum = Enum({
  Draft: { value: 1, label: 'Draft', color: 'default' },
  Review: { value: 2, label: 'In Review', color: 'processing' },
  Published: { value: 3, label: 'Published', color: 'success' },
})

// 直接访问就是值（核心特性！）
StatusEnum.Review         // 2
StatusEnum.label(2)       // 'In Review'
StatusEnum.has(2)         // true
StatusEnum.keys           // ['Draft', 'Review', 'Published']
StatusEnum.values          // [1, 2, 3]
StatusEnum.labels         // ['Draft', 'In Review', 'Published']
StatusEnum.items          // [{ key: 'Draft', value: 1, label: 'Draft', color: 'default' }, ...]
StatusEnum.named.Draft    // { key: 'Draft', value: 1, label: 'Draft', color: 'default' }
StatusEnum.item(1)        // { key: 'Draft', value: 1, label: 'Draft', color: 'default' }
StatusEnum.meta           // { color: [ 'default', 'processing', 'success' ] }
StatusEnum.findBy('color', 'success')  // { key: 'Published', value: 3, ... }
StatusEnum.toList({ valueField: 'id', labelField: 'name' })  // [{ id: 1, name: 'Draft' }, ...]
StatusEnum.toMap({ keySelector: 'key', valueSelector: 'value' })  // { Draft: 1, Review: 2, Published: 3 }
```

---

## 实例属性（README 明确列出）

| 属性 | 类型 | 说明 |
|-----|------|------|
| `EnumName.Key` | 值本身 | 直接访问就是 value，不需要 `.value`！ |
| `EnumName.keys` | `string[]` | 所有 key 名 |
| `EnumName.values` | `(string\|number)[]` | 所有 value |
| `EnumName.labels` | `string[]` | 所有 label（安装 i18n plugin 后自动翻译） |
| `EnumName.items` | `EnumItem[]` | 所有项的数组 |
| `EnumName.named` | `object` | 按 key 名访问 item，如 `named.Draft` |
| `EnumName.meta` | `object` | 按扩展字段聚合值，如 `{ color: ['default', 'success'] }` |

---

## 实例方法（README 明确列出）

| 方法 | 说明 |
|-----|------|
| `EnumName.label(keyOrValue)` | 通过 key 或 value 获取 label |
| `EnumName.key(value)` | 通过 value 获取 key 名 |
| `EnumName.item(keyOrValue)` | 通过 key 或 value 获取单个 item |
| `EnumName.has(keyOrValue)` | 判断 key 或 value 是否存在 |
| `EnumName.findBy(field, value)` | 按任意字段查找 item |
| `EnumName.toList({ valueField, labelField })` | 转为 UI 下拉框用的列表 |
| `EnumName.toMap({ keySelector, valueSelector })` | 转为 Map |

---

## 实例 Getter（源码中有）

| Getter | 类型 | 说明 |
|--------|------|------|
| `EnumName.name` | `string \| undefined` | 枚举集合名称 |
| `EnumName.valueType` | - | 值类型 |
| `EnumName.keyType` | - | key 类型 |
| `EnumName.rawType` | - | 原始类型 |

---

## 静态方法（在 Enum 上）

| 方法 | 说明 |
|-----|------|
| `Enum.install(plugin, options?)` | 安装插件（如 i18n） |
| `Enum.extends(obj)` | 扩展枚举方法（项目用它添加通用方法） |
| `Enum.isEnum(value)` | 判断是否是枚举实例 |
| `Enum.localize` | 获取/设置全局本地化函数 |
| `Enum.config` | 全局配置 |

---

## 全局访问：`Vue.prototype.$enums`

Memocast 在 `boot/globalGlobals.js` 中将所有业务 enum **统一挂载到 Vue 原型**（复数语义：一个对象里多个 enum 实例的集合）：

```javascript
// src/boot/globalGlobals.js（节选）
import 'src/utils/enum/index.js'
import {
  NoteOrderTypeEnum,
  CalendarDateBasisEnum,
  AiAssistantProviderEnum,
  CloudSyncProviderEnum,
  SettingsTabEnum,
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum,
  RuneCategoryEnum,
  EchoCategoryEnum
} from 'src/utils/enum/index.js'

Vue.prototype.$enums = {
  NoteOrderTypeEnum,
  CalendarDateBasisEnum,
  AiAssistantProviderEnum,
  CloudSyncProviderEnum,
  SettingsTabEnum,
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum,
  RuneCategoryEnum,
  EchoCategoryEnum,
}
```

这样**任何 .vue 模板中**都可以直接通过 `$enums.XxxEnum` 访问，**无需 import，也无需 mixin**：

```html
<!-- ✅ 模板直接用 $enums，不需要 import，不需要 mixin -->
<SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Language" ...>
  ...
</SettingsSectionContent>
```

```javascript
// ✅ JS 中通过 this.$enums 访问
computed: {
  subTabOptions () {
    return this.$enums.GeneralSubEnum.items.map(c => ({
      value: c.value,
      label: this.$t(c.label),
      icon: c.icon
    }))
  }
}
```

> **设计原因**：避免每个组件都写 `import { XxxEnum } from 'src/utils/enum'` + 在 `export default` 中把 XxxEnum 挂在实例上。新增 enum 后只需在 `boot/globalGlobals.js` 的 `$enums` 对象里加一行即可。
>
> **命名说明**：用复数 `$enums` 而非 `$enum` 是为了语义清晰——对象里装的是"多个 enum 实例的集合"，而不是"一个 enum"。

> **boot 文件分工**：
> - `boot/globalGlobals.js`：挂 `$enums` / `$utils` / `$lodash` / `$cloudfns`（运行时命名空间）
> - `boot/i18n.js`：初始化 vue-i18n 并把 `Enum.localize` 指向 `i18n.t`（让 enum-plus 的 label 自动翻译）

---

## 在 Memocast 中的正确用法

### 1. 直接访问值（不需要 .value）

```javascript
// ✅ 正确
subTab: GeneralSubEnum.Language          // → 'language'
category: RuneCategoryEnum.General      // → 'general'

// ❌ 错误
subTab: GeneralSubEnum.Language.value   // → undefined
category: RuneCategoryEnum.General.value // → undefined
```

### 2. 生成下拉选项

```javascript
// ✅ 用 items.map（README 原生用法）
categoryOptions () {
  return EchoCategoryEnum.items.map(c => ({
    value: c.value,
    label: this.$t(c.label)
  }))
}

// ✅ 或者用 toList
categoryOptions () {
  return EchoCategoryEnum.toList({ valueField: 'value', labelField: 'label' })
}
```

### 3. 校验值是否存在

```javascript
// ✅ 用 has 方法
if (!RuneCategoryEnum.has(rawValue)) {
  return RuneCategoryEnum.General  // fallback
}
```

### 4. 按字段查找

```javascript
// ✅ 用 findBy 方法
const item = StatusEnum.findBy('color', 'success')
```

### 5. 访问自定义扩展字段

```javascript
const item = StatusEnum.item(1)
// item = { key: 'Draft', value: 1, label: 'Draft', color: 'default', raw: {...}, ... }

// ✅ 扩展字段直接挂在 item 上
item.color  // 'default'

// ✅ 也可以通过 .raw 访问（raw = 原始定义对象）
item.raw.color  // 'default'
```

---

## 禁止的反模式

| 反模式 | 说明 |
|-------|------|
| `EnumName.Key.value` | ✗ enum-plus 直接访问就是值！ |
| 虚构方法 | 只用 README 明确列出的方法 |

## 常见问题

### Q: 自定义字段怎么访问？

```javascript
// 每个 item（EnumItemClass 实例）包含定义时的所有字段
const item = StatusEnum.item(1)
// item = { key: 'Draft', value: 1, label: 'Draft', color: 'default', raw: {...}, ... }

// ✅ 扩展字段直接挂在 item 上
item.color  // 'default'

// ✅ 也可以通过 .raw 访问
item.raw.color  // 'default'
```

---

## 相关文件结构

```
src/utils/enum/
├── index.js                     # 统一导出
├── enumSetup.js                 # Enum.extends() 扩展方法
├── settingsTabEnum.js           # 设置面板 Tab（含嵌套 subEnum）
├── noteOrderTypeEnum.js         # 笔记排序
├── calendarDateBasisEnum.js     # 日历日期基准
└── runeEchoCategoriesEnum.js   # 符文/回响分类

src/utils/const/
└── runeEchoCategoryLogic.js     # 业务规则 helper
```

---

## 扫描 enum 并挂到 `$enums`（require.context 写法）

**当前状态**：`boot/globalGlobals.js` 用的是**直接 import + 显式列举**写法（见上节）。下面给出的是**等价的 require.context 写法**，供未来重构或参考。

**目标**：新增 `src/utils/enum/<Xxx>Enum.js` 后，无需改 `boot/globalGlobals.js` 即可在所有组件用 `$enums.XxxEnum`。

Quasar v1 + webpack 用 `require.context` 实现：

```javascript
// src/boot/globalGlobals.js（重构后示意）
const enumContext = require.context('src/utils/enum/', false, /^[a-z]\w*Enum\.js$/)
const enumMap = {}
enumContext.keys().forEach(key => {
  // key 形如 './noteOrderTypeEnum.js'
  const mod = enumContext(key)
  Object.keys(mod).forEach(exportName => {
    if (exportName === 'default') return
    const val = mod[exportName]
    // 只挑 enum-plus Enum 实例（带 .items）
    if (val && typeof val === 'object' && val.items) {
      enumMap[exportName] = val
    }
  })
})
Vue.prototype.$enums = enumMap
```

> **正则必须用 `/^[a-z]\w*Enum\.js$/`，不能用 `/[A-Z]\w+Enum\.js$/`**：
> - 项目文件名约定是**小驼峰**（camelCase），如 `noteOrderTypeEnum.js` / `settingsTabEnum.js`。
> - `/[A-Z]\w+Enum\.js$/` 要求**首字母大写**（PascalCase），会**全部漏掉**当前的 camelCase 文件。
> - 同理 `$utils` 的正则也要用 `/^[a-z]\w*Util\.js$/`，否则会漏掉 `emptyUtil.js` / `treeUtil.js` / `dateUtil.js` 等。
>
> **回归验证脚本**（v2026-07-29 起已迁入 Jest 29）：
>
> | Jest 套件 | 作用 |
> |---|---|
> | `tests/unit/boot/enum-util-regex.test.js` | 直接打 regex 命中情况，便于肉眼对比 |
> | `tests/unit/boot/enum-boot-smoke.test.js` | 扫 `src/utils/enum/` 实际目录，校验新正则能否命中全部 6 个 enum 文件 |
> | `tests/unit/boot/util-boot-smoke.test.js` | 扫 `src/utils/util/` 实际目录，校验新正则能否命中全部 5 个 util 文件 + 模拟 buildNameSpacedMap |
>
> 重写 boot 扫描逻辑前**必须**先跑 `yarn verify:boot` 确认正则不会漏文件。

> **当前 `boot/globalGlobals.js` 仍然走显式 import**（更稳，避免扫描漏文件、新增 enum 需同步改两处）。`$cloudfns` 当前**已经**用 `require.context` + `/[A-Z]\w+CloudFn\.js$/`，但 `src/cloudfns/` 暂未填充任何文件，等真有 cloud function 文件落地时**必须**先按上面的命名约定调整正则（或重命名为 PascalCase 保持正则兼容）。

---

## 扩展阅读

- npm: https://www.npmjs.com/package/enum-plus
- GitHub: https://github.com/shijistar/enum-plus
