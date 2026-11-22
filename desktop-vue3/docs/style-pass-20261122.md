# 其他样式问题推进（2026-11-22）

本轮处理两处可见样式缺口：@ 快捷插入面板的自定义图标裁切，以及文末 Mermaid/流程图被浮动操作栏遮挡。

## 1. @ 面板自定义图标裁切

### 现象

笔记、符文、回响三类 provider 的图标都是 64×64 SVG 字块，但面板里只显示左上角一小块，字符也偏小：

- 容器 28×28；
- `i.icon` 仍按 Muya 原规则 16×16、`opacity:.5`；
- 自定义图标的 inline style 只写了 `background: url(...)`，`background-size` 被 shorthand 重置为 auto，64×64 图像被 16×16 容器裁切。

### 改动

`desktop-vue3/frontend/src/styles/index.css` 针对 `data-label` 前缀为 `note:` / `rune:` / `echo:` 的 item：

- `i.icon` 改为 24×24；
- `background-size: 100% 100%`、`background-position: center`、`background-repeat: no-repeat`，并加 `!important` 压过 inline shorthand；
- 常态 `opacity: .92`，暗色 `opacity: 1`；
- `border-radius: 4px`。

内置 Vega/流程图/Mermaid 等 line icon 不受影响，仍维持 v2 的 16×16。

### 复验

1123×748、文件夹视图、假笔记 id 999：

| 类型 | DOM | 尺寸 | background-size | opacity |
|---|---|---|---|---|
| 笔记 | `note:999` | 24×24 | 100% 100% | 0.92 |
| 回响 | `echo:echo-test` | 24×24 | 100% 100% | 0.92 |
| 符文 | `rune:rune-test` | 24×24 | 100% 100% | 0.92 |

截图：`docs/at-panel-icons-20261122.png`（左：修复前 16×16 裁切；右：修复后 24×24 完整字块）。

## 2. 文末 Mermaid 被底部操作栏遮挡

### 现象

`figure.ag-active.ag-container-block` 里的 `.ag-container-preview` 在激活态是：

```css
position: absolute;
top: calc(100% + 20px);
```

它不参与文档流。图在文末时，滚动高度只算到源码块，预览层向下延伸，滚到底会被底部浮动操作栏压住；截图里“结束”节点正好落在操作栏下面。

### 改动

`desktop-vue3/frontend/src/styles/index.css` 只对编辑器最后一个容器块：

```css
#ag-editor-id > figure.ag-active.ag-container-block:last-child > div.ag-container-preview {
  position: static;
  top: auto;
  left: auto;
  transform: none;
  margin: 20px auto 0;
}
```

- 文末容器块的预览改为文档流内，自己撑出滚动高度；
- 中间位置的容器块仍保留 v2 的 absolute 浮层行为，不影响阅读中的临时预览。

### 复验

同一份 18 行正文 + 末尾 Mermaid：

- 修复前：`scrollHeight 1093`、`maxScroll 394`，SVG 底部 `740.47`，操作栏顶部 `688`，重叠约 52px；
- 修复后：`scrollHeight 1225`、`maxScroll 526`，滚到底 SVG 底部 `608.47`，操作栏顶部 `688`，完整露出；
- 图块 `figure` 高度由 `106` 增至 `389.375`，说明预览已参与布局。

截图：`docs/mermaid-bottom-20261122.png`（左：结束节点被操作栏压住；右：完整露出）。

## 顺带复验、未改代码

- **任务列表**：`li.ag-task-list-item > input[type=checkbox]` 仍走 Muya 圆形勾选样式，未出现 Quasar 方框；未选中 12×12 外圈灰、选中蓝底白勾，正常。
- **引用块**：`blockquote` 计算值 `padding: 0 30px`，左边条由 `::before` 在 `left:15px` 绘制，颜色 `rgba(0,0,0,.5)`，正常。
- **表格**：三列、`--tableBorderColor` 边框正常。
- **@ 面板布局**：宽度 380、最大高度 280、6 列，直接沿用 Muya quickInsert CSS；本轮只改自定义图标，不动分组/列数。

## 仍未处理

- 外链图片在 Muya 内仍可能落 `ag-image-fail`，属于资源加载链路问题，不是本轮样式修复范围。
- 容器块在文末且激活时，预览不再浮在源码上，而是顺序排列；这是为保证底部可达性做的有意偏离。
- 中间位置的容器块仍保持 absolute 预览，长图在中间激活时可能覆盖后续正文，这是 v2 原行为。
