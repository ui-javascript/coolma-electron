# 编辑器正文块级对齐（2026-11-22）

对照：`desktop-vue2/src/assets/css/muya.css`、`desktop-vue3/.../libs-muya-vue3/src/themes/default.css`。
验收：1123×748 浏览器；同一篇 Markdown 覆盖标题、段落、行内样式、引用、列表、任务列表、代码块、表格、图片、Mermaid。

## 根因

v3 启动时按 CDN 依赖注入 `https://luo0412.github.io/cdn/layui/css/layui.css`。该文件是跨域样式，里面有：

```css
blockquote,body,button,dd,div,dl,dt,form,h1,h2,h3,h4,h5,h6,input,li,ol,p,pre,td,textarea,th,ul
  { margin:0; padding:0; }
li { list-style:none; }
```

它排在 Muya 主题之后，清掉了：

- 标题的 1rem 上下间距、段落的 0.5em 间距；
- 引用的 30px 内边距和左侧 2px 主题色竖线；
- `ul/ol` 的 30px 缩进和 `li` 的 disc / decimal 项目符号。

同时 v3 没有移植 v2 的 `muya.css` 变量，`--editorColor50`、`--themeColor`、`--codeBlockBgColor`、`--tableBorderColor` 等全部未定义，导致引用色、代码块底色、表格边框失效。

另有一个布局问题：`.editor-context-host` 不是 flex 子项，Muya 的 `height:100%` 没有父高度参照，长文把宿主撑到 1204px，内部滚动条失效，外层只能裁切。

## 本轮改动

1. 在 `.libs-muya-host.libs-muya-theme-light` 上补齐 v2 `muya.css` 的编辑器变量；同时补一组深色变量。
2. 新增 `#ag-editor-id` 作用域的块级恢复规则，抵抗 layui 全局 reset：
   - 标题 `margin:1rem 0`；
   - `p/blockquote/ul/ol/dl` `margin:.5em 0`；
   - 引用 `padding:0 30px`、左侧 2px 主题色竖线；
   - `ul/ol` `padding-left:30px`；
   - `li.ag-bullet-list-item` disc，`li.ag-order-list-item` decimal。
3. `.editor-context-host` 改为 `display:flex; flex:1; min-height:0; overflow:hidden`，`.muya-editor` 补 `width/height:100%`，恢复 Muya 内部滚动。

## 验证结果

- 标题上下间距 16px，段落上下间距 8px。
- 引用左侧 2px 蓝色竖线，文字色 `rgba(0,0,0,.5)`。
- 无序列表为 disc，有序列表为 decimal，缩进 30px；任务列表保持圆形复选框。
- 代码块底色 `rgba(0,0,0,.03)`、边框与 v2 变量一致；表格边框 `#9e9e9e`。
- 640×240 图片可完整渲染；3×3 表格完整；Mermaid 三节点图可渲染。
- 长文正文高度 1429px，Muya 滚动容器 699px，`scrollTop` 最大 730，滚动正常。
- 证据：`docs/editor-blocks-20261122.png`；临时截图 `/tmp/bu-shot-18i4kgb8.png`（前）、`/tmp/bu-shot-c3mjthm6.png`、`/tmp/bu-shot-od2z7zh1.png`（后）。

## 说明

v2 也全局注入同一份 layui.css，因此 v2 实际运行时同样会被这条 reset 影响。v3 这次在 `#ag-editor-id` 内恢复的是 Muya 主题的设计值，不是继续继承 CDN reset 的破坏结果。若后续要求“连 v2 的这个 bug 也一模一样复刻”，需要单独回退这组块级规则。
