# TODO-Skill 管理机制

> 创建日期: 2026-07-04
> 关联 TODO: `TODO-回响与符文-现状-202607.md`（回响 / 符文体系现状，合并自 echo 改动 / 收口 / 多符文渲染 / rune demo 4 份）
> 关联 TODO: `TODO-存储机制切换-202607.md`（runes 表 schema）

---

## 0. 背景与定位

Skill（技能模板）是继 Rune（可执行 Vue 组件符文）、Echo（可点击高亮回响）之后，第三种**段落级 Markdown 占位元素**。它的核心特征：

- **不是可执行组件**：skill 是纯文本片段，没有 Vue 渲染生命周期。
- **有占位填空**：模板内含若干 `__BLANK__` 关键词，渲染端用 `▢` 缺口显示，用户点击后弹层填词，最终只替换对应位置的纯文本。
- **与 Rune/Echo 共用分类体系**：skill 与 rune 都接受 `RUNE_CATEGORIES`（33 个行业 + 通用），让用户按行业归档「客户回访 / 病历 / 法律函 / 简历……」类模板。

为什么用 Skill 而不复用 Rune：
- Rune 是可执行 Vue 组件，安全沙箱代价大（`evalRuneScript` + `compileTemplateToFunctions`），纯文本模板走这条路得不偿失。
- Skill 不需要 SFC 渲染管线，不挂载 Vue 实例，**零运行时风险**，只有 markdown-level 占位 + 字符串替换。

---

## 1. 存储设计

### 1.1 表结构：复用 runes + skill_type 列

不在 SQLite 新建表，而是复用 `runes` 并加 `skill_type` 字段（`'rune' | 'skill'`）。

```sql
CREATE TABLE IF NOT EXISTS runes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "desc" TEXT,
  color TEXT DEFAULT '#7E57C2',
  icon TEXT DEFAULT 'auto_awesome',
  template TEXT,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  skill_type TEXT DEFAULT 'rune',  -- 新增
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runes_skill_type ON runes(skill_type);
```

兼容旧库（与现有 category/sort_order 同模式）：

```sql
ALTER TABLE runes ADD COLUMN skill_type TEXT DEFAULT 'rune';
```

### 1.2 默认种子：仅 rune 命中

种子判定改为 `WHERE id LIKE 'rune-%' OR skill_type = 'rune'`，skill 记录不进入默认 6 条；用户首次启动时只看到 Rune 模板。

### 1.3 同步

skill 走与 rune 完全相同的 `SyncService` 链路（GUID 映射、dirty 字段、备份/恢复），不需要额外适配。如未来希望 skill 不跨端同步，参考 echoes 中 `isBuiltinEcho` 过滤模式即可。

---

## 2. Markdown 占位格式

Skill 段落写入 MD 时，用自定义 div 容器包裹。**关键约束**：容器只含纯文本与 `__BLANK__`，绝不与 `<div data-rune-name>` / `<span class="ag-echo-anno-token">` 嵌套。

```html
<div data-skill-name="客户回访模板" data-skill-id="sk-uuid" data-skill-node-id="sk-node-uuid">
您好 __BLANK__ 先生/女士：
您的订单 __BLANK__ 已发货，预计 __BLANK__ 送达。
</div>
```

字段说明：

| 属性 | 用途 |
|---|---|
| `data-skill-name` | 展示用模板名（可重复） |
| `data-skill-id` | 模板定义 id（指向 runes 表） |
| `data-skill-node-id` | 实例 id（每次插入生成新 uuid，允许同一模板多实例） |

---

## 3. 渲染机制（点击 ▢ → 填词 → 纯文本替换）

### 3.1 渲染组件：`SkillPlaceholderHost.vue`

放于 `src/components/ui/editor/skill/SkillPlaceholderHost.vue`。

- props：`skill / nodeId / value / onValueChange`
- 把内部文本用 `/__BLANK__/g` 切分，渲染为：纯文本段 + `<span class="skill-blank" @click="onBlankClick(idx)">▢</span>`
- 点击 `▢` 通过 `appBus.$emit(appEvents.SKILL_EVENTS.fillBlank, { skillId, nodeId, blankIndex, currentValue })`
- 通过 `__memocastMuya.skillRendererCtor = SkillPlaceholderHost` 注入 Muya（仿 `enableRuneVueRenderer`）

### 3.2 填词算法（`Muya.vue` 内新增 `fillSkillBlank`）

```js
fillSkillBlank ({ skillId, nodeId, blankIndex, currentValue }) {
  const md = this.contentEditor.getMarkdown()
  const re = new RegExp(
    `(<div\\s+[^>]*data-skill-id="${escapeRegExp(skillId)}"[^>]*data-skill-node-id="${escapeRegExp(nodeId)}"[^>]*>)([\\s\\S]*?)(</div>)`
  )
  const match = md.match(re)
  if (!match) return false
  let count = 0
  const replaced = match[2].replace(/__BLANK__/g, (m) => {
    if (count === blankIndex) { count++; return currentValue || '' }
    count++
    return m
  })
  const nextMd = md.replace(re, `$1${replaced}$3`)
  if (nextMd === md) return false
  const cursor = this.contentEditor.getCursor()
  this.contentEditor.setMarkdown(nextMd, cursor)
  return true
}
```

**为什么不破坏 rune/echo**：

1. 正则限定 `data-skill-id` + `data-skill-node-id` 双锚点，只命中 skill div。
2. div 内部只切 `__BLANK__` 字面量，不会跨元素。
3. rune div 的 `data-rune-name` / echo span 的 `ag-echo-anno-token` class 不在替换目标中。

### 3.3 与现有 rune/echo 占位的边界

| 占位类型 | 触发元素 | 替换策略 | 是否可执行 |
|---|---|---|---|
| Rune | 点击 `.rune-card` → RunePreviewRenderer | 不替换 MD，由 Vue 组件渲染 | ✅ |
| Echo | 点击 `.ag-echo-anno-token` → 弹层编辑 payload | 正则替换 echo `@name{attrs}()` 语法 | ❌ |
| Skill | 点击 `▢` → SkillBlankFillDialog | 正则替换 skill div 内的 `__BLANK__` | ❌ |

---

## 4. UI 层

所有弹层遵循 workspace `vue-dialog-component` 规则：独立 `.vue` 文件，只通过 `value / onOk / onCancel / data` props 通信，业务页面不持有弹层内部状态。

### 4.1 弹层清单（全部放 `src/components/ui/dialog/`）

| 文件 | 职责 |
|---|---|
| `SkillFormDialog.vue` | 新增/编辑 skill 模板（名称 / 分类 / 行业 / 图标 / 颜色 / 含 `__BLANK__` 的正文） |
| `SkillPickerDialog.vue` | 选 skill 插入到 Muya：左侧 RUNE_CATEGORIES 分类列 + 右侧模板列表 |
| `SkillBlankFillDialog.vue` | 点击 `▢` 时弹出的单输入框 |

### 4.2 SkillFormDialog.vue

- 字段：`name / desc / category / icon / color / template`
- `category` 下拉数据源：`RUNE_CATEGORIES`（`src/constants/runeEchoCategories.js`）
- `template` 用 Monaco 编辑器（复用 `RuneFormDialog` 的接入方式）
- 顶部「占位符工具栏」按钮：点击在光标处插入 `__BLANK__`，下方实时显示 `__BLANK__` 数量徽章
- 提交：`store.dispatch('saveSkill', payload)` → emit `submit` + `input(false)`

### 4.3 SkillPickerDialog.vue

- 仿 `RuneTemplatePicker` 的两层联动改为独立 q-dialog：
  - 左列：`RUNE_CATEGORIES` 全部分类（i18nKey），分组统计每个分类下 skill 数量
  - 右列：当前分类下模板列表（卡片含名称、描述、`__BLANK__` 数量徽章）
- 选中后 emit `pick({ skill })`，由调用方执行 `insertSkillHandler`

### 4.4 SkillBlankFillDialog.vue

- 单 q-input + 「插入」+「取消」按钮
- 监听 `appBus.$on(appEvents.SKILL_EVENTS.fillBlank, ...)` 打开
- 提交后 emit `filled(value)` 并 emit `input(false)`
- 父组件（Muya 顶层或 layout）监听 `filled` → 调 `fillSkillBlank`

### 4.5 入口接入

- **Muya 顶部工具栏**：新增按钮，图标 `auto_stories`，label `$t('skill')`，点击 emit `EDIT_SHORTCUT_CALL.openSkillPicker`
- **quickInsert `/` 面板**：在 `quickInsertProvider` 内新增 `skillItems`，合并出第三个 section `skillSectionTitle`

---

## 5. 数据层与 IPC

### 5.1 IPC handlers（紧跟 `db:saveRunes` 之后）

```js
ipcMain.handle('db:getSkills', async () => {
  return execToObjects(
    "SELECT * FROM runes WHERE skill_type='skill' ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC"
  )
})

ipcMain.handle('db:saveSkill', async (event, skill) => {
  // 同 saveRune 流程，强制 skill_type='skill'
  // 同名校验沿用 RUNE_DUPLICATE_NAME 错误码
})

ipcMain.handle('db:saveSkills', async (event, skills) => { /* 批量 */ })
ipcMain.handle('db:deleteSkill', async (event, id) => {
  // WHERE id = ? AND skill_type = 'skill'
})
```

### 5.2 DatabaseClient（`src/utils/DatabaseClient.js`）

```js
const skills = {
  async getAll () { return await invoke('db:getSkills') },
  async save (skill) { return await invoke('db:saveSkill', skill) },
  async saveMany (items) { return await invoke('db:saveSkills', items) },
  async remove (id) { return await invoke('db:deleteSkill', id) }
}
// DatabaseClient.skills = skills
```

### 5.3 Store（`src/store/client/actions.js`）

```js
async loadSkills ({ commit }) {
  const skills = await DatabaseClient.skills.getAll()
  if (Array.isArray(skills)) commit(types.TOGGLE_CHANGED, { key: 'skillCards', value: skills })
},
async saveSkill (_, skill) { return await DatabaseClient.skills.save(skill) },
async deleteSkill (_, id) { return await DatabaseClient.skills.remove(id) },
async saveSkills (_, skills) { return await DatabaseClient.skills.saveMany(skills) }
```

state / getters 同步加 `skillCards`（参考 `runeCards`）。

### 5.4 i18n

- 新增：`skillSectionTitle / skillCardAdd / skillCardEdit / skillCardName / skillCardDesc / skillPlaceholderHint / skillBlankClickHint / skillBlankCount / skill / skillConfirm`
- `runeCategoryXxx` 33 个 key 已存在，直接复用，无需新增

---

## 6. 关键代码定位速查

| 关注点 | 文件 / 行号 |
|---|---|
| Runes 表 CREATE TABLE | `src-electron/main-process/electron-main.js:610` |
| rune IPC | `src-electron/main-process/electron-main.js:2105` 起 |
| DatabaseClient.runes | `src/utils/DatabaseClient.js:299` |
| store loadRunes/saveRune | `src/store/client/actions.js:110` 起 |
| RUNE_CATEGORIES 33 个行业分类 | `src/constants/runeEchoCategories.js:9` |
| rune-category-templates | `src/components/ui/dialog/rune-category-templates.js` |
| RuneFormDialog | `src/components/ui/dialog/RuneFormDialog.vue` |
| RuneTemplatePicker | `src/components/ui/dialog/RuneTemplatePicker.vue` |
| Muya quickInsertProvider | `src/components/ui/editor/Muya.vue:948` 起 |
| 现有"正则 → setMarkdown"模式 | `src/components/ui/editor/Muya.vue:608` 起 |
| rune placeholder 正则 | `src/components/ui/editor/Muya.vue:111-112` |

---

## 7. 风险与边界

- **DB 迁移**：旧库 `ALTER TABLE` 失败必须被 `try/catch` 吞掉（与 category/sort_order 模式一致）。
- **占位符唯一性**：skill div 内允许多个 `__BLANK__`，按出现顺序索引；用户编辑后空白数量可能变化，下次填词以当前文本里的顺序为准。
- **跳过 rune/echo**：双锚点正则 + 限定 `<div data-skill-...>` 容器确保互不干扰；如果用户手改 MD 把 `__BLANK__` 写在普通段落里，渲染端不做特殊处理（按字面输出），仅 skill 容器内才点击可填。
- **同步**：skill 与 rune 走同一套 `runes` 表，同步逻辑自动覆盖。
- **导入 markdown**：旧的 `importMarkdown` 路径如遇到非 skill div 内的 `__BLANK__` 字面量，原样保留（不删除），避免误伤。

---

## 8. 验收清单

1. DB 升级后旧库不报错，新表 `skill_type` 列 + 索引就位。
2. 在 SkillFormDialog 里能选 33 个行业分类并保存 skill。
3. SkillPickerDialog 按分类列出 skill，选中后 MD 中出现 `<div data-skill-...>` 容器，内部含 `__BLANK__`。
4. 渲染层把 `__BLANK__` 显示为 `▢` 缺口；点击弹出 SkillBlankFillDialog。
5. 输入值后该容器内的对应 `__BLANK__` 被替换为用户文本，**`data-rune-name` div / `ag-echo-anno-token` span / 普通段落文本完全不动**。
6. quickInsert `/` 面板与工具栏按钮都能打开 SkillPickerDialog。
7. skill 与 rune / echo 在同一笔记中并存时，互不破坏。