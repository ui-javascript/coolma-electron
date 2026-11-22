# Rune 卡片与运行时样式接入（2026-11-22）

## 结论

Rune 在 v3 里终于具备三层可见结果：

1. 内置/自定义符文 SFC 的 `<style>` 会注入 `document.head`，卡片不再是无内边距、无边框、无底色的裸文本。
2. 未匹配到模板的符文会回退为紫底占位卡片，不再把一个 0 高度空 host 留在正文里，也不会抛 `vm.$mount is not a function`。
3. 符文原始 HTML 的包裹标签（`<div data-rune-name=...>` / `</div>`）在卡片两侧隐藏，正文只呈现卡片。

运行时效果样式 `rune.css` 已随 `main.ts` 接入，但本批尚未逐项触发成长、碎裂、天空步道等动画做视觉验收。

## 根因

- v3 `libs-muya-rune-vue3/src/runeRenderer.ts` 只编译 SFC 的 `<template>` 和 `<script>`，直接丢弃 `<style>`；v2 `runeSfcRendererFactory.js` 会把 style 写进 `document.head`。所以 v3 里符文卡片只有内容，没有 padding、边框、背景、字号。
- v3 的 `StateRender.mountRuneVueHosts` 在模板缺失时构造了一个 `template: ''` 的假 rune，仍然 `new RuneRenderer(...)`。返回对象没有 `$mount`，于是 `TypeError: vm.$mount is not a function`，host 又在前面被清空，最终只剩 0 高度空节点。
  - 该方法在 `libs-muya-vue3/src/core/parser/render/index.js` 中重复定义两次（约 641 行与 825 行），后者带日志且实际生效。只在第一处加保护不会改变运行路径。
- 符文原文由 Muya 拆成 `span.ag-html-tag.ag-output-remove` + `span.ag-rune-placeholder-host` + `span.ag-html-tag.ag-output-remove`。v2 源码同样没有 `ag-output-remove` 的隐藏规则，但卡片把节点完整表达后，标签再露出来就是噪音。

## 改动

### 1. 运行时效果样式

- 新增 `desktop-vue3/frontend/src/styles/rune.css`，从 `desktop-vue2/src/assets/css/rune.css` 复制 273 行，4 处 `body.body--dark` 改为 `html.dark`。
- `desktop-vue3/frontend/src/main.ts` 在 `styles/index.css` 之后 `import './styles/rune.css'`。

### 2. Rune 卡片壳

`desktop-vue3/frontend/src/styles/index.css` 末尾新增：

- `.ag-rune-placeholder-host`：block、6px 上下外边距、最大宽度 100%；带 `data-rune-width/height` 时子元素铺满。
- `.muya-rune-vue-host`：block、宽度 100%。
- `.ag-rune-placeholder-card / .ag-rune-vue-card`：flex、56px 最小高、`12px 14px` 内边距、紫边、紫色渐变、12px 圆角、阴影、`white-space: normal`。
- `.ag-rune-placeholder-title/desc`、`.rune-renderer-loading/empty/error` 与转圈动画。
- 隐藏符文/回响宿主两侧的 `span.ag-html-tag.ag-output-remove`。

`white-space: normal` 是必须的：Muya 正文是 `pre-wrap`，占位卡模板字符串里的换行和缩进会被当成真实行，卡片一度被撑到 146px 高。

### 3. SFC 样式注入

`libs-muya-rune-vue3/src/runeRenderer.ts` 新增 `ensureRuneStyle(rune, css)`：

- 从 SFC 抽 `<style>` 内容；
- 按 `rune-style-${id || name || default}` 写入或更新 `document.head`；
- 在 `createRuneRendererCtor` 里对 `section(source, 'style')` 调用。

### 4. 无模板/编译失败回退

`libs-muya-vue3/src/core/parser/render/index.js`：

- 两处 `mountRuneVueHosts` 在 `matchedRune` 为空或 `template` 为空时销毁旧 vm、清 `runeVmMap`、补占位卡并 return。
- 真正挂载前用 `try/catch` 包住 `new RuneRenderer(...)`，并检查 `typeof vm.$mount === 'function'`；仍不满足时同样写占位卡，不再抛异常。
- `createRunePlaceholderMarkup` 输出改为单行 HTML，避免 `pre-wrap` 把模板缩进算成可见文本。

## 复验

环境：`http://127.0.0.1:5173/#/`，1123×748；注入假笔记 id 999，直接 `ed.setMarkdown`。

### 未匹配符文

Markdown：

```html
<div data-rune-name="未知符卡" data-rune-id="missing" data-rune-node-id="n14" data-rune-value=""></div>
```

结果：

- 不抛异常；
- `.ag-rune-placeholder-card` 存在，`390.6875×56`，位置 `x=656.65625, y=159.390625`；
- 标题文本 `未知符卡`；
- 卡片边框 `rgba(126, 87, 194, 0.18)`，背景为紫色渐变；
- 两侧 raw html 标签计算值 `display: none`。

### 匹配符文 + SFC style

测试符文 `id='rune-test'`、`name='测试符卡'`，模板：

```html
<template><div class="rune-rtx"><div class="rune-rtx__text">{{ value }}</div></div></template>
<script>export default { props: { value: { type: String, default: "空" } } }</script>
<style scoped>
.rune-rtx { padding: 8px 12px; border: 1px solid #7E57C2; border-radius: 8px; background: #F3E5F5; }
.rune-rtx__text { color: #4A148C; font-size: 13px; }
</style>
```

结果：

- `#rune-style-rune-test` 存在 `head` 中；
- `.rune-rtx` 存在，`390.6875×38.796875`；
- `padding: 8px 12px`；
- `background-color: rgb(243, 229, 245)`；
- 文本色 `rgb(74, 20, 140)`；
- 文本内容 `hello`。

对照图：`docs/rune-cards-20261122.png`（左：未知符文占位卡；右：SFC 卡片 + 注入样式）。

## 已知限制

- `<style lang="less|scss">` 直接原样写入 `head`，不做预处理。含 Less 嵌套或变量时浏览器不会解析，需要后续接对应预处理器或改成纯 CSS。
- `<style scoped>` 不做选择器改写，与 v2 行为一致；多个符文若用同名 class 会互相污染，依赖作者自行加前缀。
- 段落左侧仍显示 Muya 的 `ag-front-icon` 段落图标（截图里的 “T”），这是编辑器块图标，不是 raw html 标签，未在本批移除。
- `mountRuneVueHosts` 的重复定义仍在，本批只在两条路径都加了保护；合并重复方法应单独做，避免影响其他渲染分支。
- `rune.css` 的成长、碎裂、天空步道、双生花等运行时动画尚未逐项视觉验收。
