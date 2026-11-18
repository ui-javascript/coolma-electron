# 笔记布局详细设计参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充，基于当前 coolma 本地代码整理，用于快速定位布局、面板状态、顶部交互和编辑区容器的真实实现。

## 当前布局主入口

### 页面装配入口

当前主布局的真实页面装配关系为：

```text
src/router/routes.js
└── layouts/MainLayout.vue
    └── pages/Index.vue
```

其中：

- `src/layouts/MainLayout.vue`：应用外层布局容器
- `src/pages/Index.vue`：三栏布局、编辑区、抽屉、浮动按钮栏的真实主入口
- `src/components/Header.vue`：顶部交互入口

## Index.vue 当前真实结构

`src/pages/Index.vue` 负责：

- 主分割器：左侧面板 vs 编辑器区
- 内部分割器：分类/日历 vs 笔记列表
- 编辑器模式切换：Muya / Monaco
- 右下浮动操作栏
- 大纲抽屉挂载
- 加载态、导入弹窗、MarkMap 弹窗等附属 UI

布局主骨架可概括为：

```text
Index.vue
├── q-splitter（主分割器）
│   ├── before：左侧区域
│   │   └── q-splitter（内部分割器）
│   │       ├── before：CategoryTreePanel / CalendarPanel
│   │       └── after：NoteList
│   └── after：编辑器区域
│       ├── Muya / Monaco
│       ├── Illustration
│       ├── editor-action-bar
│       └── NoteOutlineDrawer
```

## 当前关键状态来源

### 1. 页面局部状态（Index.vue）

在 `src/pages/Index.vue` 中维护：

- `splitterWidthValue`
- `splitterLimits`
- `leftInnerSplitterValue`
- `leftInnerSplitterLimits`
- `isSourceMode`
- `isMindmapMode`
- `isOutlineShow`
- `editorNoteActionsExpanded`

这些状态主要用于即时布局控制和编辑器区域显示。

### 2. Vuex client 状态（持久化布局状态）

在 `src/store/client/state.js` 中当前重点字段为：

```javascript
{
  paneLayoutMode: 0,
  categoryTreeVisible: true,
  noteListVisible: true,
  enablePreviewEditor: true,
  splitterWidth: 580,
  sidebarTreeType: 'category',
  calendarSelectedDate: '',
  calendarDateBasis: 'modified',
  leftInnerSplitterRatio: 280,
  syncStatus: {
    isSyncing: false,
    lastSyncTime: null,
    total: 0,
    synced: 0,
    pending: 0
  }
}
```

### 3. client actions 当前布局控制方式

`src/store/client/actions.js` 中当前关键布局动作：

- `cyclePaneLayout()`：在 3 种布局模式间循环切换
- `expandFullPaneLayout()`：恢复三栏全展开模式
- `toggleChanged()`：更新单个 client state 并持久化
- `updateStateAndStore()`：批量更新 client state 并持久化

## 当前布局模式真实语义

### paneLayoutMode

当前仍是 3 种模式：

| 值 | 语义 |
|----|------|
| `0` | 三栏模式：分类区 + 笔记列表 + 编辑器 |
| `1` | 双栏模式：隐藏分类区，保留列表 + 编辑器 |
| `2` | 单栏模式：仅编辑器 |

### 模式切换逻辑

在 `client/actions.js` 中：

```javascript
cyclePaneLayout ({ state, dispatch }) {
  const next = (state.paneLayoutMode + 1) % 3
  dispatch('updateStateAndStore', {
    paneLayoutMode: next,
    noteListVisible: next !== 2,
    categoryTreeVisible: next === 0
  })
}
```

这意味着：

- 切到 `2` 时，笔记列表隐藏
- 只有 `0` 时，分类树显示

## Header.vue 当前真实职责

`src/components/layout/Header.vue` 已经不是简单的静态头部，而是布局与同步的重要交互入口。

当前主要负责：

### 左侧交互

- 通过模式下拉框切换工作区视图（`sidebarTreeType`）：
  - `Idx神引`：文件夹模式（`category`，默认）
  - `Core超脱`：Tag 模式（`tag`）
  - `Arch终极`：日历模式（`calendar`）
- 打开搜索

### 右侧交互

- 推送同步按钮（push）
- 拉取恢复按钮（pull）
- 布局循环切换按钮（`switchViewHandler -> cyclePaneLayout()`）
- 换肤
- IM 抽屉
- 设置弹窗
- 头像登录/登出
- Windows 窗口控制

### 与布局强相关的方法

当前值得优先关注的方法：

- `handleModeChange()`（`components/layout/HeaderLeftGroup.vue`，模式下拉框统一入口）
- `switchViewHandler()`

它们会联动：

- `sidebarTreeType`
- `calendarSelectedDate`
- `noteListVisible`
- `paneLayoutMode`
- `expandFullPaneLayout()`

补充细节：
- 切到 Tag 模式时会触发 `refreshTagNotesCount()`，因此换的不只是 UI，也可能刷新 tag 计数。
- 切到日历模式时会先把 `calendarSelectedDate` 设为当天，再切换视图并刷新列表。

## sidebarTreeType 的当前语义

当前左侧区域不是单一“分类树”，而是由 `sidebarTreeType` 控制显示：

| 值 | 左侧 before 区显示 |
|----|-------------------|
| `category` | `CategoryTreePanel` |
| `tag` | `CategoryTreePanel`（标签模式） |
| `calendar` | `CalendarPanel` |

`Index.vue` 中当前判断是：

- `sidebarTreeType !== 'calendar'` → 渲染 `CategoryTreePanel`
- `sidebarTreeType === 'calendar'` → 渲染 `CalendarPanel`

## NoteList 当前与布局的耦合点

`src/components/NoteList.vue` 当前会读取：

- `sidebarTreeType`
- `calendarSelectedDate`

当 `sidebarTreeType === 'calendar'` 时：

- 列表使用 `calendarSelectedDate` 生成当前分类语义
- 列表内容不再只是普通 category 视图

这说明左侧视图切换会直接影响列表查询语义，而不只是 UI 显隐。

## CategoryTreePanel 当前与布局的耦合点

`src/components/CategoryTreePanel.vue` 当前会：

- 读取 `sidebarTreeType`
- 在点击节点后调用 `expandFullPaneLayout()`
- 与 tag / category 两种模式共用同一组件

这说明当前“分类树面板”其实也是标签树面板的承载体，不能再按单一 category tree 理解。

## CalendarPanel 当前与布局的耦合点

`src/components/CalendarPanel.vue` 当前会：

- 使用 `a-calendar` 作为主日历组件（卡片模式，而非全屏日历）
- 读取 `calendarSelectedDate`
- 读取 `calendarDateBasis`
- 读取 `noteOrderType`
- 修改 `calendarSelectedDate`
- 修改 `calendarDateBasis`
- 触发 `getCategoryNotes()` 刷新列表
- 触发 `fetchCalendarNoteDates()` 刷新当月“有笔记日期”标记

这说明当前日历视图已经是一个真正的数据筛选入口，不是纯展示组件；它不仅影响日期过滤，还影响列表排序与当月打点显示。

## 分割器当前真实行为

### 主分割器

`Index.vue` 中：

- `splitterWidthValue`
- `splitterLimits`
- `splitterWidth`

联动规则：

- `noteListVisible = false` → `splitterLimits = [0, Infinity]`，宽度置 0
- `noteListVisible = true` → 恢复最小宽度与已保存宽度

### 内部分割器

`Index.vue` 中：

- `leftInnerSplitterValue`
- `leftInnerSplitterLimits`
- `leftInnerSplitterRatio`

联动规则：

- `categoryTreeVisible = false` → `leftInnerSplitterLimits = [0, Infinity]`，高度置 0
- `categoryTreeVisible = true` → 恢复最小高度与已保存高度

## 编辑器区域当前真实结构

编辑器区当前由以下几层组成：

- `editor-wrapper`
- `editor-stage`
- Muya / Monaco
- `Illustration`
- `editor-action-bar`
- `NoteOutlineDrawer`
- `Loading`
- `MarkMapDialog`

### 浮动操作栏

`editor-action-bar` 当前比旧文档更复杂：

- 使用 `editor-action-bar-inner--reversed`
- 支持展开式创建笔记 / 导入子操作
- 包含源码模式切换、锁定、统计、目录、保存、分享、链接等按钮
- 会受 `isOutlineShow`、`editorNoteActionsExpanded`、`dataLoaded` 等状态控制

这意味着它已经不是简单的“固定按钮栏”，而是与编辑器状态深度联动的操作容器。

## 大纲抽屉当前真实挂载方式

当前不是简单静态组件，而是：

- 在 `Index.vue` 中通过 `ref='outlineDrawer'` 挂载
- 由浮动按钮触发 `this.$refs.outlineDrawer.show`
- 与 `isOutlineShow` 状态联动

因此大纲功能需要同时检查：

- `Index.vue`
- `components/ui/NoteOutlineDrawer.vue`
- 浮动栏按钮逻辑

## 样式系统当前关注点

优先关注：

- `src/css/style.css`
- `Index.vue` 内局部样式
- `.editor-action-bar`
- `.editor-action-bar-inner--reversed`
- `.body--dark .editor-action-bar`
- `.custom-splitter`

尤其注意：

- 当前浮动按钮区域有针对 `.fab-icon` 的特殊覆盖
- 暗色模式对编辑区与浮动栏有额外处理
- splitter hover 态与宽度反馈直接影响交互感知

## 当前容易过时的旧认知

以下内容不应再原样沿用为事实：

- Header 只有单个“同步按钮”
- Calendar 只是一个简单侧边面板，不影响列表数据
- Sidebar 是布局主入口
- 浮动按钮栏只是固定的一组静态按钮
- CategoryTreePanel 只处理分类，不处理标签模式

## 推荐排查顺序

### 布局模式切换异常

1. `src/components/Header.vue`
2. `src/store/client/actions.js`
3. `src/store/client/state.js`
4. `src/pages/Index.vue`

### 左侧分类 / 标签 / 日历切换异常

1. `src/components/Header.vue`
2. `src/components/CategoryTreePanel.vue`
3. `src/components/CalendarPanel.vue`
4. `src/components/NoteList.vue`
5. `src/store/server/actions.js`

### 分割器宽度 / 高度异常

1. `src/pages/Index.vue`
2. `src/store/client/state.js`
3. `src/store/client/actions.js`

### 编辑区浮动按钮或大纲异常

1. `src/pages/Index.vue`
2. `src/components/ui/NoteOutlineDrawer.vue`
3. `src/components/ui/editor/Muya.vue`
4. `src/components/ui/editor/Monaco.vue`
