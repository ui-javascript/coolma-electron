# R-02 四角真锚定：持久化偏移字段（2026-11-22）

## 1. 产品决策

用户明确要求“新增持久化字段”。本次给 Rune 增加：

- `data-rune-offset-x`
- `data-rune-offset-y`

字段为有符号整数像素，0 表示默认位置。`0` 不写进 Markdown，避免产生无意义属性。

这是对 v2 属性 ABI 的显式扩展。v2 不认识这两个字段，同一篇笔记在 v2 里会忽略偏移、回到文档流原位；v3 是长期主应用，接受这一差异。字段不影响符文内容、props 与宽高的既有语义。

## 2. 渲染语义

- 偏移作用于 `.ag-rune-placeholder-host` 的独立 CSS `translate` 属性，不写 `transform`。
- 不改变文档流高度：向左/上拖只移动视觉边界，后续正文不会被一起推走。
- 宽高仍写 `data-rune-width/height`，并继续驱动内层卡片铺满宿主。
- 解析白名单只放行这两个有符号整数字段；空串、小数、NaN 丢弃。
- 偏移为 0 时渲染为 `translate: ''`；宽高缺失时仍保持原行为。

## 3. 四角行为

初始宿主：`left=656.656`、`top=207.797`、`right=956.656`、`bottom=287.797`，宽 300、高 80。每角独立重置后真实鼠标拖拽：

| 控制点 | 拖动 | 结果矩形 | 宽高 | 写回字段 | 锚定结论 |
|---|---|---|---|---|---|
| 左上 | `-50 / -30` | left 605.656 / top 176.797 / right 956.656 / bottom 287.797 | 351×111 | `offset-x=-51`、`offset-y=-31` | 左、上跟手；右、下不动 |
| 右上 | `+50 / -30` | left 656.656 / top 176.797 / right 1004.656 / bottom 287.797 | 348×111 | `offset-y=-31` | 上、右跟手；左、下不动 |
| 左下 | `-50 / +30` | left 605.656 / top 207.797 / right 956.656 / bottom 316.797 | 351×109 | `offset-x=-51` | 左、下跟手；上、右不动 |
| 右下 | `+50 / +30` | left 656.656 / top 207.797 / right 1004.656 / bottom 316.797 | 348×109 | 无偏移 | 右、下跟手；左、上不动 |

实测宽高比请求值差 1–2px，是拖拽坐标归一化到 0–1000 后的取整误差，不是锚定公式偏差。

边界：

- 横向限制在编辑器可视区 `581–1123`，允许进入正文列两侧留白，但不能拖出编辑区。
- 正文列原来的 `max-width:100%` 已移除：实测右下拖到 448px 时视觉宽度就是 448（不再被 390.7px 夹住），避免“字段记 448、画面只有 390”。
- 上边界限制在编辑器可视内容区顶部 `y≈48.6`，防止上边拖出可视区后偏移被持久化、下次点不到。
- 下边界不限制；加高仍推动文档流，符合原有块级行为。

边界实测：从 `300×80` 左上角拖向 `(500,30)`，被夹到 left `580.7`、top `48.8`（容器 left 581、top 48.6，误差 ≤1px），没有把卡片拖出编辑区。

## 4. 持久化验证

- 松手后 `commitRuneResize` 走 `rewriteRunePlaceholderBoxByNodeId()`，一次写入宽、高与两个偏移。
- 写回后 `setMarkdown` 重渲染，宿主仍为拖后矩形，`data-rune-offset-x/y` 仍在 Markdown，控制点仍贴新四角。
- 把偏移拖回 0 时删除两个属性，不写 `data-rune-offset-x="0"`。
- props（`data-rune-prop-*`）、自然属性与其它 Rune 占位符不受影响。

## 5. 代码落点

- `libs-muya-vue3/src/core/parser/utils.js`：白名单放行偏移；有符号整数归一化。
- `libs-muya-vue3/src/core/parser/render/index.js`：`applyRuneHostGeometry()` 同时应用宽高与 `style.translate`；偏移不参与 SFC props。
- `desktop-vue3/frontend/src/editor/runePlaceholderAttrs.ts`：新增 `normalizeRuneOffset()` 与 `rewriteRunePlaceholderBoxByNodeId()`；旧尺寸函数保留为兼容包装。
- `desktop-vue3/frontend/src/editor/runeTransformer.ts`：四角按锚点计算宽高与偏移；记录拖动前的 `translate`/属性，提交失败时完整复原。
- `desktop-vue3/frontend/src/components/EditorPane.vue`：提交负载带 `offsetX/offsetY`。

## 6. 验证

- `pnpm typecheck`：通过。
- `pnpm test:runtime`：全部通过，新增 4 条区分旧实现的断言：
  - 负/正偏移写回，保留 props 与其它占位符；
  - 偏移归零删除属性；
  - 偏移归一化允许 0 与负数，拒绝空/NaN；
  - 解析白名单保留有符号偏移。
- `pnpm build-frontend`：通过，产物已更新到 `desktop-vue3/public/dist`。
- 真实页面 1123×748：四角逐项拖拽，矩形与字段如上表。

对照图：`rune-offsets-20261122.png`（2×2，四角各一张 1123×748，带控制点与偏移标签）。

## 7. 已知边界

- v2 会忽略偏移字段，同一篇笔记在 v2 中位置不同；这是本次拍板接受的 ABI 差异。
- 偏移是视觉位移，可能与相邻正文重叠；这是“四角真锚定”的直接代价，没有引入额外避让布局。
- 只覆盖鼠标拖拽；控制点没有键盘等价操作，沿用 v2 交互。
- 手动写入超大偏移仍可能把卡片移出可视区，解析层只校验整数，不做几何裁剪。
- 浏览器预览验收；Electron 真机仍按用户要求后置。

## 8. 结论

R-02 从“四角只改宽高、左上角固定”升级为真正的四角锚定：左/上拖动时对应边跟手，右/下边保持，偏移以 `data-rune-offset-x/y` 持久化并在重渲染后保持。v2 兼容差异已明确记录，不再以“v2 同源限制”作为未完成借口。
