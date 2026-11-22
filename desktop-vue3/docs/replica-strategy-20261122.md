# desktop-vue3 长期对齐方案（vue2 → vue3）

> 定位：`desktop-vue3` 是长期主应用，不推翻新架子；以 `desktop-vue2` 为视觉与交互基线，按组件逐步同源移植。
> 本文只定规则、顺序和验收口径，不追求一次性重写到位。

---

## 0. 先回答那个疑问：为什么 Tauri 版“很到位”，v3 反而不像

一句话：**Tauri 版不是复刻，是换壳；v3 不是换壳，是重写。**

| 项目 | 来源 | UI 层实际情况 |
|---|---|---|
| `desktop-vue2` | 原版 | Vue 2.7 + Quasar 1 + Ant Design Vue 1.7 + Element UI 2.15 |
| `desktop-vue2-tauri` | 从 `desktop-vue2` 派生 | 仍是 Vue 2.7 / Quasar 1 / 原编辑器；`src` 只有 29 个文件差异，`Index.vue`、`CalendarPanel.vue`、`HeaderLeftGroup.vue`、`NoteList.vue` 等关键 UI 文件一致 |
| `desktop-vue3` | 基于 `electron-egg` TypeScript 模板复刻 | Vue 3.5 + Vite + Pinia + Element Plus；`HomeView`、`IndexSidebar`、`CalendarPanel` 等是重新实现的结构，原 84 个 `.vue`，现在 64 个 |

所以：

- Tauri 版看起来到位，是因为它直接继承了原版的 DOM、CSS、组件结构和交互，只把 Electron 的壳换成了 Tauri，并补了 `$q.electron` 同形桥。
- v3 看起来不像，不是 Vue 3 不适合复刻，而是“升级”被做成了“从新模板重做 UI”。壳同样是 Electron，不代表前端源码同源；换发动机不等于车身一样。
- Electron 这个共同点只能保证窗口、进程、IPC 这类壳能力，**保不了 DOM 结构、组件库皮肤、间距、字号、滚动条和交互手感**。

结论：后续不再讨论“Vue3 能不能复刻”，只讨论“哪些 v2 源码可以原样搬、哪些必须适配”。

---

## 1. 总路线：保留新架子，组件同源移植

### 1.1 不动的东西

- 继续用 `desktop-vue3` 的 Vite + TypeScript + Pinia + electron-egg 架构。
- 继续用三套组件库并存，不回退到单一库。
- 继续按批次交付，不搞一次性全量重写。

### 1.2 移植公式

```text
v2 模板/样式原样搬
  → 脚本改 Composition API
  → 状态接 Pinia
  → 组件库按 v2 原家族映射
  → 真实页面截图 + DOM 尺寸差分
  → 达标才提交
```

核心原则：**先像，再快；先复用，再抽象。**
能照抄的模板和 CSS 不重画，能保留的 class 不改名，能沿用的 DOM 层级不压平。

---

## 2. P0：先把布局合同改回 v2

### 2.1 v2 的真实结构

```text
q-page.flex
└─ q-splitter（左右，单位 px）
   ├─ before：左栏
   │  └─ q-splitter（上下，horizontal，单位 px）
   │     ├─ before：CategoryTreePanel 或 CalendarPanel
   │     └─ after：NoteList
   └─ after：编辑器区（Muya / Monaco / Illustration + 底部 action bar）
```

关键参数：

- 外层左栏默认 `580px`，最小 `300px`。
- 左栏内部上块默认 `240px`，最小 `120px`。
- 左栏内部在 `categoryTreeVisible === false` 时禁用，`NoteList` 占满左栏。
- `paneLayoutMode` 三态：`0 = 树 + 列表`，`1 = 仅列表`，`2 = 仅编辑器`。

### 2.2 v3 当前结构

```text
Splitpanes
├─ Pane：IndexSidebar
├─ Pane：NoteListPane
└─ Pane：EditorPane
```

问题不是“三栏不好看”，而是它**误读了 v2 的 `cyclePaneLayout`**：

- v2 的 `paneLayoutMode = 0` 是“左栏内部上下分割”，不是“侧栏 + 列表 + 编辑器三栏”。
- v3 把树和列表拆成两个并列 Pane，导致列表宽度从 v2 的 580px 变成约 27% 屏宽，笔记项、标题、时间、标签全部被压窄。
- 用户对原版最熟悉的“左边上面文件夹、下面笔记列表，右边整块编辑器”被拆掉了，这是当前最大的视觉断层。

### 2.3 目标结构

`HomeView.vue` 的外层改回 `q-splitter`，直接复用现有 `IndexSidebar` 和 `NoteListPane`，不需要新造组件：

```vue
<q-splitter
  v-model="leftWidth"
  unit="px"
  :limits="[300, Infinity]"
  separator-class="custom-splitter"
  before-class="overflow-hidden"
  after-class="hide-scrollbar editor-splitter-after"
>
  <template #before>
    <q-splitter
      v-model="leftTopHeight"
      horizontal
      unit="px"
      :limits="[120, Infinity]"
      :disable="layoutMode !== 0"
      separator-class="custom-splitter"
    >
      <template #before>
        <IndexSidebar v-if="layoutMode === 0" class="full-height" />
      </template>
      <template #after>
        <NoteListPane v-if="layoutMode !== 2" class="full-height" />
      </template>
    </q-splitter>
  </template>

  <template #after>
    <EditorPane class="full-height" />
  </template>
</q-splitter>
```

落地时注意：

- Quasar 2 的 `QSplitter` 与 Quasar 1 的 API 基本同形：`modelValue`、`unit`、`limits`、`horizontal`、`disable`、`before-class`、`after-class`、`separator-class` 都在。布局层可以近乎照搬 v2 `Index.vue`。
- 废弃 `splitpanes` 的百分比尺寸；v2 是 px 语义，改成百分比会让窗口缩放时比例漂移。
- `paneLayoutMode = 1` 时，内层上块高度要像 v2 一样归 `0`，并保持 `disable`，让 `NoteListPane` 真正占满左栏；不能只隐藏树、还留着 240px 的空槽。
- `paneLayoutMode = 2` 时，整个外层 `before` 不渲染，编辑器占满。
- `paneLayout.ts` 从“三栏宽度”改成“外层左栏宽度 + 左栏上块高度”，存储键建议：
  - `coolma.splitterWidth`，默认 `580`
  - `coolma.leftInnerSplitterHeight`，默认 `240`
  - 旧的 `coolma.paneSizes` 百分比数据直接丢弃，不做兼容换算。
- `paneVisibility` 语义保留，但渲染位置改到左栏内部：`0` 显示树、`1` 隐藏树但列表占满、`2` 整个左栏隐藏。
- 窗口 resize 时按 v2 的收口逻辑处理：左栏宽度不得小于 300；窗口过窄时优先保编辑器，左栏回落到可用宽度。

### 2.4 验收

- 1440×900 下，左栏外宽 `580px`，左栏上块 `240px`，误差 ≤ 2px。
- 切到 `paneLayoutMode = 1`，树消失，列表占满左栏，宽度仍是 580px 左右。
- 切到 `paneLayoutMode = 2`，左栏整体消失，编辑器占满。
- 拖拽后刷新页面，宽度/高度恢复；旧百分比数据不会把布局撑坏。

---

## 3. 三库不是“混搭”，是还原原版

v2 本身就是三库并存，不是 v3 新发明的方案：

| 家族 | v2 版本 | v3 版本 | 用途 |
|---|---|---|---|
| Quasar | `^1.0.0` | `2.35.5` | 布局、滚动、列表、下拉、Tooltip、Dialog、Notify、Loading |
| Ant Design Vue | `^1.7.8` | `4.2.6` | 日历、日期选择、空态、部分表单/选择器 |
| Element UI | `^2.15.14` | Element Plus `2.14.8` | 设置页、部分弹窗、表单、表格 |
| form-create | `@form-create/ant-design-vue`、`@form-create/element-ui` | 按需接 Vue3 版 | Echo 动态表单 |

### 3.1 选库规则

**看 v2 这个位置原来用谁，就用同家族的新版本。**

- 原 `q-*` → Quasar 2 同名组件；没有同名 API 时写本地适配器，不换家族。
- 原 `a-*` → Ant Design Vue 4；slot 写法按 v4 调整。
- 原 `el-*` → Element Plus；class 和 CSS 变量按 EP 规则映射。
- 原自定义 DOM/CSS → 原样保留，不为了“统一”硬套组件库。

### 3.2 首批映射重点

| 区域 | v2 原实现 | v3 对齐做法 |
|---|---|---|
| 主布局 | `q-splitter` + `q-page` | Quasar 2 `q-splitter`，px 语义照搬 |
| 顶栏 | `q-bar` + `HeaderLeftGroup` / `HeaderRightGroup` | `q-bar` + 拆左右组，保留皮肤 class |
| 文件夹树 | Quasar 列表/滚动 + 自定义 | 以 v2 模板为准，Quasar 2 同名组件优先 |
| 日历 | `a-calendar` + `q-scroll-area` | Ant 4 `a-calendar`，v4 slot/事件适配 |
| 笔记列表 | `q-scroll-area`、`q-pull-to-refresh`、`q-list`、`q-item`、`q-card`，空态 `a-empty` | 原结构照搬，Quasar 2 + Ant 4 |
| 设置页 | Element UI 表单/弹窗 | Element Plus，保留 v2 字段与分区 |
| 编辑器 | Muya / Monaco / Illustration | 保留 v3 编辑器内核，外层 chrome 和 action bar 按 v2 移植 |

### 3.3 禁止项

- 不把 Ant 的日历外面套一圈 Element Plus 按钮，除非 v2 本来就这么干。
- 不因为“Element Plus 更熟”就把 v2 的 Quasar 列表改成 `el-table`。
- 不为了统一而重命名 v2 的 class；class 是样式锚点，改名等于重新对样式。
- 不在一个控件里同时塞两套库的弹层体系，`z-index`、点击外部关闭、动画时长都会打架。

---

## 4. 样式保真协议

样式对齐分四层，顺序不能反：

1. **全局 token**：字体、背景、主题色、滚动条、窗口安全区。
2. **布局几何**：栏宽、块高、最小尺寸、分隔条。
3. **组件皮肤**：按钮、列表项、日历、弹窗、输入框的圆角/边框/阴影/间距。
4. **内容排版**：标题字号、正文行高、标签、时间、空态文案。

### 4.1 先搬这四份 CSS

| 文件 | 行数 | 处理方式 |
|---|---|---|
| `desktop-vue2/src/assets/css/style.css` | 全局基线 | 拆成 `legacy-base.css`，保留滚动条 5px、`body` 字体、`overflow:hidden`、`--win-edge-safe`、拖拽区排除 |
| `desktop-vue2/src/assets/css/muya.css` | 66 | 变量原样搬到编辑器根节点，保留 `--titleBarHeight`、`--editorAreaWidth`、`--themeColor*`、`--editorColor*` |
| `desktop-vue2/src/assets/css/element-theme.css` | 693 | 先原样引入看差异，再按 Element Plus 的 DOM/变量差异打补丁，不手写重画 |
| `desktop-vue2/src/assets/css/rune.css` | 273 | 原样引入；v3 目前没有这份 Echo/符文运行时样式，属于直接缺口 |

引入顺序建议：

```text
组件库基础样式
  → legacy-base.css（v2 全局基线）
  → element-theme.css（Element Plus 适配层）
  → rune.css（Echo 运行时）
  → 业务局部样式
```

`legacy-base.css` 尽量只做“原版基线”，不要在里面写新组件的业务样式；新组件样式留在各自 SFC，避免又形成一坨全局覆盖。

### 4.2 token 对齐

| Token | v2 值 | v3 目标 |
|---|---|---|
| `--titleBarHeight` | `32px` | 原样 |
| `--editorAreaWidth` | `90%` | 原样 |
| `--themeColor` | `rgba(64,158,255,1)` | 原样，皮肤切换沿用 `skin.ts` |
| Quasar primary | `#1976D2` | 映射到 Quasar brand |
| Quasar secondary | `#26A69A` | 映射 |
| Quasar accent | `#9C27B0` | 映射 |
| Quasar dark | `#35373e` | 映射 |
| positive / negative / info / warning | `#21BA45 / #C10015 / #31CCEC / #F2C037` | 原样 |
| 滚动条 | 宽高 `5px`，thumb 圆角 `10px` | 原样 |
| 正文字体 | `HarmonyOS Sans SC, Helvetica Neue, PingFang SC, ...` | 原样字体栈；缺字体时回落到 PingFang SC，不换成 Roboto/Inter |

Element Plus 映射时把 `--el-color-primary` 及其 light 梯度对到 `--themeColor*`；Ant 4 用 `ConfigProvider` 的 `colorPrimary` 对到同一个皮肤色。这样三套库的“主色”才是一条线，不会 Quasar 蓝、Ant 蓝、EP 蓝各一个。

### 4.3 顶栏和窗口细节

- v2 顶栏是 `q-bar`，不是自定义 `div`。v3 的 `HeaderBar` 可以保留外层逻辑，但视觉结构应向 `q-bar` 靠。
- v2 的 `q-electron-drag` / `q-electron-drag--exception` 是窗口拖拽区约定。Quasar 2 不再自带这套 class，需要在 `legacy-base.css` 补：
  - `.q-electron-drag { -webkit-app-region: drag; }`
  - 按钮、输入、弹层、抽屉统一 `-webkit-app-region: no-drag;`
- `--win-edge-safe: 8px` 要保留，否则 Windows 无边框窗口右下角的滚动条和关闭按钮会被系统 resize 热区抢点击。
- 顶栏高度 v2 没有显式写死，先实测 1440×900 下 `q-bar` 的 `getBoundingClientRect().height`，再决定 token；不要凭感觉写 48/56。

### 4.4 差分验收口径

同一台机器、同一窗口尺寸、同一份测试数据（建议 4 篇笔记：2 篇当天、2 篇其他日期），并排打开 v2 和 v3：

| 项目 | 口径 |
|---|---|
| 几何 | 关键块宽高误差 ≤ 2px |
| 颜色 | 背景、文字、主色、边框色取 computedStyle，要求一致 |
| 字体 | family、size、weight、line-height 一致；不允许 Roboto 混入 |
| 间距 | 列表项 padding、图标与文字 gap、弹窗内边距误差 ≤ 2px |
| 滚动条 | 宽度 5px，thumb 颜色和圆角一致 |
| 交互 | 悬停、选中、暗色、皮肤切换四种状态都要看 |

每次移植在 `docs/parity/` 下留一份测量记录：窗口尺寸、关键选择器、期望值、实际值、截图文件名。不要只留一句“已对齐”。

---

## 5. 分批移植顺序

### 批次 A：骨架（先做，做完再谈细节）

1. `HomeView` 布局改回 v2 的左右 + 左栏上下结构。
2. `paneLayout.ts` 从百分比改成 px，迁移旧存储。
3. `legacy-base.css` 接入，滚动条/字体/窗口安全区先对齐。
4. 顶栏拆 `HeaderLeftGroup` / `HeaderRightGroup`，恢复 `q-bar` 视觉和皮肤。
5. 左栏树/日历与 `NoteListPane` 的宽度、边框、分隔条对齐。

### 批次 B：高频可见组件

1. `NoteListPane` → 对齐 v2 `NoteList` 的 `q-list/q-item` 结构与 `NoteItem` 间距。
2. 文件夹树项高、展开箭头、选中态、右键菜单。
3. 日历卡片模式、月份头、日期格高度、笔记圆点。
4. 编辑器外层 chrome、底部 action bar、悬浮按钮组。
5. 搜索弹窗、标签弹窗、设置弹窗的首层视觉。

### 批次 C：低频但显眼的模块

1. Echo / 符文运行时样式（`rune.css`）。
2. 博客部署、导入导出、PPT/MindMap 预览。
3. 微应用抽屉、AI 抽屉、登录/实例弹窗。
4. 各类右键菜单、二次确认、空态和错误态。

### 批次 D：手感与边角

1. 快捷键、焦点顺序、禁用态、加载态。
2. 暗色/三套皮肤的全局回归。
3. 窗口 resize、最小尺寸、最大化/还原。
4. 长标题截断、超长列表滚动、空数据。

每批控制在 3–5 个组件，做完一批提交一批；不跨批混改，避免“这里像了、那里又退了”。

---

## 6. 单个组件的闭环流程

1. 读 v2 对应 SFC、它引用的子组件、相关 CSS、相关 store action。
2. 写一行行为合同：入口 → 动作 → 数据 → 可见结果 → 恢复路径。
3. 确认 v2 这个位置用的是 Quasar / Ant / Element / 自定义，定家族。
4. 原样搬模板和样式，先不改结构。
5. 脚本改 `setup`/Composition API，状态接 Pinia；只改生命周期，不改 DOM 层级。
6. 真实页面跑起来，和 v2 同尺寸截图，量关键 DOM。
7. `pnpm typecheck`、`pnpm build-frontend` 通过。
8. 只 `git add` 本组件相关路径，提交；推送前 `fetch` + `rebase`。

**完成定义：**
- 同尺寸截图下，关键几何和颜色达标。
- 交互四态（默认/悬停/选中/暗色）没有明显断层。
- 没有引入新的全局 `!important` 覆盖。
- 没有为了“看起来像”而伪造 DOM 语义。

---

## 7. 风险与反模式

| 风险 | 处理 |
|---|---|
| 并行 agent 同时改仓库 | 提交前核对 HEAD 与远端；只 add 指定路径；推送前 fetch/rebase；不假设工作区独占 |
| Quasar 2 的 body 默认样式覆盖 v2 基线 | 用 `html body` 提高优先级压回字体/行高/背景，集中在一处，不散落 |
| Ant 1 → 4 的 Calendar slot/事件变化 | 先看 v4 类型定义，再改 `dateCellRender` / `cellRender`，不照抄 v1 的 `slot-scope` |
| Element UI → Element Plus 的 class/变量差异 | 先原样引 `element-theme.css`，按实际 DOM 补差异，不重写 693 行 |
| 百分比布局导致窗口缩放漂移 | 布局层统一 px；只有内容区允许百分比 |
| 把“有组件、能点”当成对齐 | 必须有截图和 DOM 测量；没有测量记录不算完成 |
| 全局 CSS 越补越厚 | 新样式优先进 SFC；`legacy-base.css` 只放原版基线 |
| 三库事件/弹层层级打架 | 同一交互只用一套弹层体系；跨库只做视觉，不混行为 |

---

## 8. 接下来先做的三件事

1. **布局回滚**：`HomeView` 换成 `q-splitter` 双层结构，`paneLayout.ts` 改 px；这是所有样式对齐的前提。
2. **基线样式接入**：`legacy-base.css` + `muya.css` 变量 + `element-theme.css` + `rune.css`，先把字体、滚动条、背景、Element 皮肤拉回 v2。
3. **顶栏对齐**：拆左右组，恢复 `q-bar`、皮肤 class、拖拽区和窗口安全区；顶栏高度以实测为准。

这三件做完，v3 才会从“新模板套旧功能”回到“同一套界面的新内核”。之后再按批次 B/C/D 慢慢啃细节，不再出现大方向反复。
