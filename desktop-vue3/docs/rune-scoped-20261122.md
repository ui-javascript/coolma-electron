# R-04 Rune SFC scoped 样式验收（2026-11-22）

## 1. 入口与数据

- 真实页面：`http://127.0.0.1:5173/`，视口 1123×748。
- 测试笔记：`id=996`，标题 `SFC scoped 验收`，分类 `/测试`。
- 测试符文：`id=rune-scope-test`，名称 `scoped验收`，模板：

```vue
<template>
  <div class="rune-scope-test">hello</div>
</template>

<script>
export default {}
</script>

<style lang="less" scoped>
.rune-scope-test { color: rgb(220, 30, 30); font-weight: 700; }
</style>
```

- 正文占位符：`<div data-rune-name="scoped验收" ...>mini</div>`，并追加一个正文对照节点 `<span class="rune-scope-test">`。

## 2. 修复前

- `style#rune-style-rune-scope-test` 原样注入：`.rune-scope-test { color: rgb(220, 30, 30); font-weight: 700; }`。
- 符文内部元素 computed color `rgb(220, 30, 30)`。
- 正文外部同名 class computed color 同样为 `rgb(220, 30, 30)`。
- 结论：scoped 没有生成任何作用域，样式直接泄漏到整页。

## 3. 修复后

- 生成的 scopeId：`data-v-1hjkmbz`（按 rune id 做 FNV-1a，稳定可复现）。
- 符文根节点带 `data-v-1hjkmbz`，`component.__scopeId` 同步设置。
- 注入样式变为：

```css
.rune-scope-test[data-v-1hjkmbz]{ color: rgb(220, 30, 30); font-weight: 700; }
```

- 符文内部：`color=rgb(220, 30, 30)`，`font-weight=700`。
- 正文外部同类名：`color=rgb(31, 35, 41)`，`font-weight=400`。
- 结论：内部命中、外部不命中，隔离成立。

对照图：`rune-scoped-20261122.png`（左修复前，右修复后，均 1123×748）。

## 4. 转换规则与测试

`libs-muya-rune-vue3/src/runeRenderer.ts` 新增：

- `STYLE_BLOCK_RE` 读取 `<style>` 属性与内容；只有出现 `scoped` 才生成 scopeId。
- `scopeSelector`：给每个选择器最后一个 compound 加 `[data-v-*]`，在伪类/伪元素前插入。
- `:deep()` / `::v-deep()`：头部加作用域，括号内保持全局命中，如 `.a :deep(.b)` → `.a[data-v] .b`。
- `:global()` 去壳；`:global` 不残留。
- `@media/@supports/@layer/@container/@document` 递归处理；`@keyframes/@font-face` 原样保留。
- `desktop-vue3/scripts/runtime-test.ts` 覆盖：逗号选择器、`:hover`、`::before`、后代组合、`:deep()`、`@keyframes`、`@media`、`:global`。

验证结果：

- `pnpm typecheck`：通过（含 frontend `vue-tsc`）。
- `pnpm test:runtime`：全部通过。
- `pnpm build-frontend`：成功，产物已更新到 `desktop-vue3/public/dist`。

## 5. 已知限制（与 v2 运行态一致）

- `lang="less|scss"` 不做预处理器编译：less/scss 块按扁平 CSS 注入。
- v2 的 `runeSfcRendererFactory.js` 同样只做 `parseComponent` + `compileToFunctions`，style 原文 `ensureRuneStyle` 注入（第 200 行），没有 less/sass 编译。
- 14 个内置模板全部 `lang="less" scoped`，样式块均为扁平规则，因此可正常渲染；真正依赖嵌套语法的自定义模板在 v2 与 v3 运行态都会失效。
- 本次不引入 `less`/`sass` 前端包，避免为运行态模板额外增加数百 KB；如未来要支持嵌套语法，应单独立项并评估按需加载。

## 6. 结论

R-04 的 scoped 缺口已修复：作用域选择器生成、`__scopeId` 注入、`:deep/:global` 与常用 at-rule 均有断言和真实页面证据。预处理器编译按 v2 运行态口径不纳入本项。
