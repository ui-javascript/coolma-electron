# Rune props 链路（data-rune-prop-* / 自然属性 / SFC 默认值）

日期：2026-11-22
前置提交：`f445c02 feat(editor): 补齐 Rune 尺寸拖拽与宽高回写`

## 1. 缺口

v3 渲染层其实已经会读 `host.dataset` 并按 SFC `props` 声明传值，但**解析层没收**：

- `WHITELIST_ATTRIBUTES` 是精确数组，`data-rune-prop-*` 不在表内，`getAttributes()` 直接把属性丢掉；
- `getAttributes()` 里 `/width|height/.test(attr)` 会把 `data-rune-prop-max-width` 当尺寸洗成空串；
- 自然属性兜底（`maxHeight` → `max-height`）在 v3 完全没有；即使白名单放行 `title`，`max-width` 仍会丢；
- 没有按 v2 的系统属性黑名单排除 `class/style/contenteditable/hidden`。

结果：Markdown 里手写的 `data-rune-prop-*` 在 SFC 里拿不到，只能走 SFC default。

## 2. 改动

### 2.1 解析层

`libs-muya-vue3/src/core/parser/utils.js`：

- 新增 `isWhitelistedAttribute()`：精确白名单 + `^data-rune-prop-[a-z0-9-]+$` 前缀放行；
- `getAttributes()` 只在 `width/height/data-rune-width/data-rune-height` 四个精确键上做数字归一，不再误伤 `data-rune-prop-max-width` 这类自定义 prop。

### 2.2 采集层

`libs-muya-vue3/src/core/parser/render/index.js`：

- `collectRunePropsFromHost()` 三路取值：
  1. `host.dataset.runePropXxx`（`data-rune-prop-*`，最高优先级）；
  2. `data-raw` 原始标签里的自然属性（`maxHeight` → `max-height`）；原始标签不受解析白名单影响；
  3. 宿主真实属性兜底。
- 自然属性空值（`<div inherit-from-previous>`）按“存在即 true”归一，与 Vue 布尔属性一致；
- 系统属性黑名单：`class/style/contenteditable/hidden/spellcheck/draggable/tabindex` 及 `data-rune-*` 系统键不参与 prop 映射；
- 未写的 prop 不传，继续由 Vue 落 `props.default`。

## 3. 真实页面验收

1123×748，使用临时 SFC：

```html
<template>
  <div class="rune-props-test">title={{ title }} | flag={{ inheritFromPrevious }} | max={{ maxWidth }}</div>
</template>
<script>
export default {
  props: {
    title: { type: String, default: '默认标题' },
    inheritFromPrevious: { type: Boolean, default: false },
    maxWidth: { type: String, default: 'none' }
  }
}
</script>
```

| 场景 | Markdown | 实际渲染 |
|---|---|---|
| 显式三个 props | `data-rune-prop-title="来自 Markdown"`、`data-rune-prop-inherit-from-previous="1"`、`data-rune-prop-max-width="auto"` | `title=来自 Markdown \| flag=true \| max=auto` |
| 只传 title | 仅 `data-rune-prop-title="只传 title"` | `title=只传 title \| flag=false \| max=none` |
| 自然属性 | `title="自然属性" max-width="auto" inherit-from-previous` | `title=自然属性 \| flag=true \| max=auto` |
| 优先级 | `data-rune-prop-title="dataset 优先"` + `title="自然属性"`；`data-rune-prop-inherit-from-previous="0"` + `inherit-from-previous` | `title=dataset 优先 \| flag=false` |

`getMarkdown()` 复核：显式 props 原样保留在 Markdown 里，没有被序列化丢掉。

对照图：`docs/rune-props-20261122.png`（2×2，显式 / 默认 / 自然属性 / 优先级）。

## 4. 回归

- `pnpm typecheck` 通过；
- `pnpm test:runtime` 全量通过；新增断言：
  - `Rune 尺寸：解析白名单保留 width/height`
  - `Rune props：解析保留 data-rune-prop-*，不洗宽高值、不放行任意 data-*`
- `pnpm build-frontend` 通过。

## 5. 已知限制

- 本次只补“Markdown → SFC”的读取；还没有在 UI 里编辑 props 的回写弹窗。v2 有 `rewriteRunePlaceholderPropsByNodeId()`，v3 暂时没有对应入口。
- 字符串值不做类型转换：`maxHeight` 拿到的是 `'200'`，与 v2 采集契约一致，模板需要自己做 `Number()`。
- 自然属性依赖 `data-raw`，因此只在行内 raw HTML 通道有效；块级符文宿主走 dataset/属性通道，没有 `data-raw` 时不会兜底自然属性。
- `data-rune-prop-*` 只允许小写字母、数字、短横线；带下划线或大写的属性名不会放行。
