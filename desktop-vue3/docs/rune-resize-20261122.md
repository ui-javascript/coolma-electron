# Rune 尺寸拖拽缩放（vue2 RuneTransformer 移植）

日期：2026-11-22
提交基线：`1cb2f40 fix(ui): 修正 @ 面板自定义图标裁切与文末 Mermaid 遮挡`

## 1. 缺口

vue2 点击 Rune 卡片会显示四角控制点，拖动后把尺寸写回占位符 Markdown：

```html
<div data-rune-name="..." data-rune-id="..." data-rune-node-id="..." data-rune-width="391" data-rune-height="226">...</div>
```

v3 之前完全没有 `RuneTransformer`，卡片只能按内容自适应，无法改宽高。排查时还发现两处引擎侧断点：

1. `getAttributes()` 的 `WHITELIST_ATTRIBUTES` 只放行了 4 个符文键，`data-rune-width` / `data-rune-height` 在解析阶段就被丢弃；
2. 行内 raw HTML 通道只把 4 个符文键搬进 `dataset`，宽高留在普通 `attrs` 上；`applyRuneHostSize()` 只读 `dataset.runeWidth/runeHeight`，即使属性没被丢也不会应用。

所以本次不是单纯搬一个拖拽器，必须同时补齐「解析 → 渲染 → 拖拽 → 回写」四段。

## 2. 落地内容

### 2.1 纯函数：尺寸回写

新增 `frontend/src/editor/runePlaceholderAttrs.ts`，移植 vue2 `runePlaceholderAttrs.js` 的尺寸子集：

- `rewriteRunePlaceholderSizeByNodeId(markdown, nodeId, { width, height })`
- 只改命中 `data-rune-node-id` 的开标签；
- 已存在的 `data-rune-width/height` 原位替换，缺失则追加；
- 其它属性（`data-rune-value`、`data-rune-prop-*`、自然属性、class）原样保留；
- 非法宽高（0、负数、非数字）不改 Markdown；
- 找不到 nodeId 时原样返回，不抛错。

### 2.2 RuneTransformer

新增 `frontend/src/editor/runeTransformer.ts`：

- 点击 `.ag-rune-placeholder-host` 显示 4 个 fixed 控制点；
- 拖动期间只改 host 的 `style.width/height`，并同步 `dataset.runeWidth/runeHeight`，让内层卡片靠现有 `[data-rune-width] > *` 规则铺满；
- 松手调用应用层 `onCommit({ nodeId, width, height })`；
- 最小尺寸 `80×40`，宽度上限取宿主父容器的内容边界；
- 点击 SFC 内部的按钮 / 输入框 / `contenteditable` / HTML `<a>` 时不抢事件；
- 只读态 `canEdit=false` 时不显示控制点；切源码模式、锁定时主动 `hide()`；
- 编辑区滚动、窗口 resize 时重新贴齐控制点；
- 只有真正拖动过才提交，单纯点控制点不会写入尺寸；
- 提交失败时恢复拖动前的 DOM 尺寸，避免界面与 Markdown 脱节。

### 2.3 EditorPane 接线

- `MuyaEditor` 的 `ready` 事件里创建 transformer，重复 ready 先销毁旧实例；
- `onCommit` 读取当前 Markdown，调用尺寸回写函数，再用 `setMarkdownWithCursor` 落回；
- `onBeforeUnmount` 销毁监听与浮层；
- 进入源码模式、锁定、切笔记时隐藏控制点。

### 2.4 样式

新增 `frontend/src/styles/rune-transformer.css`，移植 vue2 `runeTransformer.css`：

- 14px 圆形控制点、主题蓝填充、2px 编辑器底色描边、阴影；
- `nwse-resize` / `nesw-resize` 光标；
- host `max-width:100%; overflow:hidden`；
- 浮层挂在 `body`，拿不到 `.libs-muya-host` 的变量，补本地 `--themeColor/--editorBgColor` 回退。

### 2.5 引擎修正

`libs-muya-vue3/src/core/parser/utils.js`：

- `WHITELIST_ATTRIBUTES` 放行 `data-rune-width`、`data-rune-height`。

`libs-muya-vue3/src/core/parser/render/index.js`：

- `applyRuneHostSize()` 同时读 `dataset.runeWidth` 和 `host.getAttribute('data-rune-width')`，block/inline 两种宿主统一生效。

## 3. 真实页面验收

窗口：1123×748，Vite 5173，未知符卡 `rune-drag-1`。

| 动作 | host 矩形 | 属性 / Markdown |
|---|---|---|
| 初始 | 390.6875×56 | 无 width/height |
| 右下角向下拖 | 390.6875×226 | `data-rune-width="391" data-rune-height="226"` |
| 再向左上缩 | 263×156 | `data-rune-width="263" data-rune-height="156"` |
| 拖到极小 | 80×40 | `data-rune-width="80" data-rune-height="40"` |
| 松手后 | 控制点 0 个 | Markdown 与 DOM 一致 |

宽度实测 390.6875 而不是 391，是宿主 `max-width:100%` 被正文内容列（390.6875px）钳住；属性仍保留拖动结果 391。高度不受此限制。

最终代码复核（临时探针已删除）：`window.__runeTransformer === undefined`，点击后控制点 4 个，拖拽后 host 高 216、`data-rune-width="391" data-rune-height="216"`，控制点归零。

对照图：`docs/rune-resize-20261122.png`（左：初始；中：放大；右：最小 80×40）。

## 4. 回归

- `pnpm typecheck` 通过；
- `pnpm test:runtime` 通过，新增 4 条尺寸回写断言 + 1 条解析白名单断言；
- `pnpm build-frontend` 通过。

## 5. 已知限制

- 只实测右下角控制点；左上/左下/右上沿用 vue2 的同一套宽高公式，未逐一手动验收。
- 宽度不能超过正文内容列，因为 v3 的 Rune host 在段落内容里，保留 `max-width:100%`；要与 vue2 完全一致需要确认 v2 的 `.ag-html-preview` 实际宽度。
- 左/上控制点按 vue2 公式只改宽高，不移动 host 的左上角；块级元素仍在原左边界，视觉上从右侧收缩。本次按原版保留，未自行改交互。
- `data-rune-prop-*` 仍不在解析白名单，SFC props 的持久化另有缺口，不在本次范围。
- `libs-muya-vue3` 属于 workspace 源码，改动不会触发热更新；必须重启 Vite 才能加载解析/渲染修正。

## 6. 后续更新（2026-11-22）

本文记录的是最初尺寸子集。随后 R-02 已新增 `data-rune-offset-x/y`，四角改为真锚定；宽度边界改为编辑器可视区，宿主 `max-width:100%` 已移除（`rune-offsets-20261122.md`）。文中“左/上控制点只改宽高”“宽度不能超过正文列”“提交走 `setMarkdownWithCursor`”等描述均以新文档为准。`data-rune-prop-*` 白名单缺口已在 R-01 修复，不再属于未完成项。
