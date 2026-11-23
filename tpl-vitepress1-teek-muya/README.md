# VitePress + Teek 文档模板

Teek 是这个模板中与 Vdoing 对应的 VitePress 主题。模板锁定 **VitePress 1.6.4（Vue 3）** 和 **vitepress-theme-teek 1.6.3**；Teek 声明的 VitePress 版本范围是 `^1.6.4`。

在仓库根目录执行：

```sh
pnpm install
pnpm --filter tpl-vitepress1-teek-muya dev
pnpm --filter tpl-vitepress1-teek-muya build
pnpm --filter tpl-vitepress1-teek-muya preview
```

示例库覆盖 Teek 博客首页、文章目录与归档、导航 / 分享 / 图文卡片和交互式 Vue Demo，以及代码组、标签页、Mermaid 图表、KaTeX 公式和脚注。站点源码在 `docs/`，构建产物在本包的 `dist/`。

与 Vdoing 模板共用 `docs/guide/markdown.md` 和 `docs/guide/muya-fixture.md` 作为同源渲染对照；后者专门覆盖嵌套、转义和源码围栏。

## 符文 / 回响运行时（POC）

`docs/guide/rune-live.md` 在 VitePress 里跑真正的符文组件：

- 本地 SFC 符文复用 `libs-muya-rune-vue3` 的 `createRuneRendererCtor`（`@vue/compiler-dom` 编译 + `createApp` 挂载）；
- melt-js 符文复用同包的 `createMeltRuneRendererCtor`，从 `comps-vue3` 的 `hel-meta.json` 加载 Vue3 远程组件；
- SSR 构建期只输出静态卡片，`mounted` 之后才动态导入运行时并加载远端，失败保留卡片可重试。

扩展方式：在 `docs/.vitepress/theme/index.ts` 注册 `RuneHost` / `EchoHost`，Markdown 里写 `<RuneHost name="…" value="…" />`。和 VuePress 1.x 模板共用同一套 Markdown 语法与导出产物。

已知边界：回响 `afterRender` 未接（当前只落锚点）；VuePress 2 宿主尚未单独验证（组件接口与 VitePress 相同）。

