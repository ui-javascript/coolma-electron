---
name: note-layout-design
description: Memocast 笔记应用 UI 布局设计指南。用于分析、修改或扩展 Memocast 的界面布局，包括三栏布局、分割器、响应式设计、主题系统和组件层级结构。遇到三栏/双栏/单栏切换、分割器、侧栏显隐、分类/标签/日历区域切换、浮动操作栏、大纲抽屉、编辑区容器，或布局样式联动问题时应自动使用。
---

# 笔记布局设计

## 整体布局架构

### 三栏式经典布局

```
┌──────────────────────────────────────────────────────────────────┐
│                         Header (6.5vh)                           │
├─────────────┬──────────────┬─────────────────────────────────────┤
│   分类树    │   笔记列表   │           编辑器区域                  │
│   面板      │              │                                     │
│ (category)   │  (NoteList)  │    [Muya / Monaco 编辑器]            │
│             │              │                                     │
│   标签树    │              │                                     │
│   (tag)     │              │                                     │
│             │              │                                     │
│   日历      │              │                                     │
│ (calendar)  │              │                                     │
│             │              │                                     │
├─────────────┴──────────────┴─────────────────────────────────────┤
│                     Floating Action Bar (右下角固定)              │
└──────────────────────────────────────────────────────────────────┘
```

## 面板布局模式

支持三种布局模式：

| 模式值 | 模式名称 | 左侧面板 | 中间面板 | 右侧面板 |
|--------|----------|----------|----------|----------|
| 0 | 三栏模式 | 分类树/标签树/日历 | 笔记列表 | 编辑器 |
| 1 | 双栏模式 | 隐藏 | 笔记列表 | 编辑器 |
| 2 | 单栏模式 | 隐藏 | 隐藏 | 编辑器 |

```javascript
// 切换布局
paneLayoutMode: 0,           // 当前模式
categoryTreeVisible: true,    // 分类树可见性
noteListVisible: true,        // 笔记列表可见性
```

## 组件层级结构

```
App.vue
├── MainLayout.vue (Q-Layout)
│   ├── Header.vue (Q-Header)
│   │   ├── 左侧图标组
│   │   ├── 中间标题区
│   │   └── 右侧图标组
│   └── Q-Page-Container
│       └── Index.vue (Q-Page)
│           ├── Q-Splitter (主分割器)
│           │   ├── Before (左侧面板)
│           │   │   └── Q-Splitter (内部分割器)
│           │   │       ├── Before (分类树/日历)
│           │   │       └── After (笔记列表)
│           │   └── After (编辑器区域)
│           │       ├── Editor-Stage
│           │       └── Editor-Action-Bar
│           └── NoteOutlineDrawer (大纲抽屉)
```

## 分割器配置

### 主分割器

```javascript
splitterWidthValue: 580,          // 当前宽度 (px)
splitterLimits: [300, Infinity],  // 最小/最大限制
```

### 内部分割器

```javascript
leftInnerSplitterValue: 240,             // 运行时高度 (px), 由 v-show 流程动态写入
leftInnerSplitterRatio: 280,            // 状态层偏好值 (px), 分类树重新可见时回填
leftInnerSplitterLimits: [120, Infinity],
```

> 说明：`Value` 是 UI 当前值（隐藏时归 0），`Ratio` 是用户在显示态下保存的偏好；切换显隐时由 Vuex action 互相同步这两个字段。

### 分割器控制逻辑

```javascript
noteListVisible: function (val) {
  if (!val) {
    this.splitterLimits = [0, Infinity]
    this.splitterWidthValue = 0
  } else {
    this.splitterLimits = [300, Infinity]
    this.splitterWidthValue = this.splitterWidth || 580
  }
}

categoryTreeVisible: function (val) {
  if (!val) {
    this.leftInnerSplitterLimits = [0, Infinity]
    this.leftInnerSplitterValue = 0
  } else {
    this.leftInnerSplitterLimits = [120, Infinity]
    this.leftInnerSplitterValue = this.leftInnerSplitterRatio || 240
  }
}
```

## 编辑器区域

### 双引擎支持

| 编辑器 | 组件 | 用途 |
|--------|------|------|
| **Muya** | `Muya.vue` | 所见即所得 Markdown 编辑 |
| **Monaco** | `Monaco.vue` | 源码模式编辑 |

```vue
<div v-show='!isSourceMode && dataLoaded'>
  <Muya ref='muya' :active='!isSourceMode && dataLoaded' :data='tempNoteData' />
</div>
<Monaco ref='monaco' v-if='dataLoaded' :active='isSourceMode' :data='tempNoteData' v-show='isSourceMode' />
```

### 编辑器容器样式

```css
.editor-wrapper {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.editor-stage {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}
```

## 浮动操作按钮栏

编辑器右下角固定位置：

```css
.editor-action-bar {
  position: fixed;
  bottom: 12px;
  right: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: fit-content;
  z-index: 6000;
  padding: 4px 2px;
  background: rgba(240, 240, 240, 0.88);
  border-radius: 10px;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.1);
}
```

### 功能按钮（从下到上）

- 创建笔记 / 创建分类
- 导入笔记
- 源码模式切换
- 锁定模式
- 统计信息
- 大纲导航
- 保存笔记
- 分享导出
- 复制链接

## 左侧面板设计

### 分类树面板 (`CategoryTreePanel`)

支持三种视图：

| 视图类型 | 组件 | 特点 |
|----------|------|------|
| 分类树 | `el-tree` | 树形层级结构 |
| 标签视图 | ECharts Treemap（由 `CategoryTreePanel.vue` 承载） | 面积矩形图，不是树节点 |
| 日历视图 | `CalendarPanel.vue` + `a-calendar` | 日期筛选入口，会影响列表查询 |

### 标签矩形树图

标签视图不是树控件，而是 `CategoryTreePanel.vue` 中基于 ECharts 实现的 treemap：

```javascript
function calculateTagTreeMapData(tags, tagNotesCount) {
  const top20Count = Math.ceil(total * 0.2)
  // 前 20% 高频标签获得更大面积
  if (index < top20Count) {
    value = base * (1.8 + 1.5 * rankFactor)
  } else {
    value = base
  }
}
```

这意味着：
- `sidebarTreeType === 'tag'` 时，左侧不是 `el-tree`，而是矩形面积图
- 标签点击会更新当前分类语义，并调用 `expandFullPaneLayout()`
- 标签数量展示依赖 `getTagNoteCount()` 聚合结果，不是静态标签列表

## 笔记列表设计

### NoteList 组件

```vue
<q-scroll-area class="fit note-list-scroll">
  <q-pull-to-refresh @refresh="refreshNoteListHandler">
    <q-list>
      <q-item v-for="(note, index) in displayNotes" :key="index">
        <NoteItem :data="note" :dense="noteListDenseMode"/>
      </q-item>
    </q-list>
  </q-pull-to-refresh>
</q-scroll-area>
```

### NoteItem 笔记项

```vue
<q-card flat class='note-card'>
  <div class='note-item-title'>
    <q-icon :name="fileIcon" />
    <span v-html='title'></span>
    <q-icon v-if="syncStatus !== 'synced'" :name="syncStatusIcon" />
  </div>
  <div class='note-item-summary' v-html='summary'></div>
  <div class='note-item-summary'>
    <span><q-icon name='category' /> {{ category }}</span>
    <span><q-icon name='timer' /> {{ modifiedDate }}</span>
  </div>
</q-card>
```

## 主题系统

### CSS 变量

```css
body {
  --backgroundColor: #ffffff;
  --editorBgColor: #ffffff;
  --editorColor: #333333;
  --themeColor: #21b56f;
  --themeColor10: rgba(33, 181, 111, 0.1);
  --floatBorderColor: #e0e0e0;
  --floatHoverColor: #f5f5f5;
  --iconColor: #666666;
  --scrollBarBgColor: #f0f0f0;
  --activeItemBgColor: #e8f5e9;
}
```

### 分割器样式

```css
.q-splitter.q-splitter--vertical > .q-splitter__separator.custom-splitter {
  background-color: #dfe3ea !important;
  transition: background-color 0.15s ease, width 0.15s ease;
}

.q-splitter.q-splitter--vertical > .q-splitter__separator.custom-splitter:hover {
  background-color: var(--themeColor) !important;
  width: 3px !important;
}
```

### 明暗主题

```css
.body--dark .editor-action-bar {
  background: rgba(55, 55, 55, 0.88);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}
```

## Vuex Store 状态

```javascript
// src/store/client/state.js
{
  paneLayoutMode: 0,           // 面板布局模式
  categoryTreeVisible: true,    // 分类树可见性
  noteListVisible: true,        // 笔记列表可见性
  sidebarTreeType: 'category', // 侧边栏类型
  splitterWidth: 580,           // 主分割器宽度
  leftInnerSplitterRatio: 280,  // 内部分割器比例
  darkMode: false,              // 暗色模式
  theme: 'Default-Light'        // 编辑器主题
}
```

## 相关文件索引

| 文件 | 用途 |
|------|------|
| `src/pages/Index.vue` | 主页面布局 |
| `src/layouts/MainLayout.vue` | 布局容器 |
| `src/components/Header.vue` | 顶部导航栏 |
| `src/components/CategoryTreePanel.vue` | 分类树面板 |
| `src/components/NoteList.vue` | 笔记列表 |
| `src/components/ui/NoteItem.vue` | 笔记项组件 |
| `src/components/ui/editor/Muya.vue` | 编辑器封装 |
| `src/components/ui/NoteOutlineDrawer.vue` | 大纲抽屉 |
| `src/store/client/state.js` | 布局状态 |
| `src/css/style.css` | 全局样式 |

## 扩展阅读

详细设计文档见 [reference.md](reference.md)
