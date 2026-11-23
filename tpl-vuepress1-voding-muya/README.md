# VuePress + Vdoing 文档模板

模板锁定 **VuePress 1.9.10（Vue 2）** 和 **vuepress-theme-vdoing 1.12.9**。Vdoing 使用 VuePress 1 的主题接口，不能直接装到 VuePress 2。

在仓库根目录执行：

```sh
pnpm install
pnpm --filter tpl-vuepress1-voding-muya dev
pnpm --filter tpl-vuepress1-voding-muya build
```

示例库覆盖 Vdoing 提示框、定理、折叠区、居中排版、卡片、分类 / 标签 / 归档页，以及脚注、定义列表、数学公式、流程图和 Vue Demo。代码块带行号与复制按钮，正文图片可放大查看。站点源码在 `docs/`，构建产物在本包的 `dist/`。

与 Teek 模板共用 `docs/guide/markdown.md` 和 `docs/guide/muya-fixture.md` 作为同源渲染对照；后者专门覆盖嵌套、转义和源码围栏。

## 符文 / 回响运行时（POC）

本模板已经接入 `libs-muya-vue2` 的实机编辑器（`docs/guide/muya-live.md`），并在 `docs/guide/rune-live.md` 跑通真正的符文组件：

- **本地 SFC 符文**：`vue-template-compiler` 在浏览器里拆 SFC、编模板、执行 `export default`，再 `Vue.extend` 成组件，输入可回写；
- **melt-js 远程符文**：`@melt-js/libs-core-vue2` 按 `hel-meta.json` 加载 `comps-vue2` 的 Vue2 组件，`bindVueRuntime` 绑定宿主 Vue；
- **SSR 双阶段**：构建期只输出静态卡片，`mounted` 之后才编译 / 拉远端，失败保留静态卡片并可重试。

运行时在 `docs/.vuepress/rune/`，全局注册在 `docs/.vuepress/enhanceApp.js`，Markdown 里直接用 `<RuneHost name="…" value="…" />` 和 `<EchoHost name="…" attrs="…" />`。

远端示例走 jsDelivr（GitHub Pages 的 `hel-meta.json` 不带 CORS 头，浏览器直接取会被拦）。真实站点应把远程产物放同域或 CORS 可控的 CDN，并加信任域名确认。

已知边界：SFC 的 `less/sass` 样式不编译；`<script>` 暂不支持 `import` / 具名 export；回响的 `afterRender`（依赖 jQuery 操作前一段文本）尚未接，当前只落可点锚点。

