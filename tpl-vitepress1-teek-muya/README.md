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

后续接入 Muya 时，在本包添加 `libs-muya: workspace:*`，通过 `defineTeekConfig` 的 `markdown.config` 注册适配插件。插件在构建时调用可独立运行的 Muya AST 解析和渲染入口，并保留 Teek 的 Markdown 扩展。当前 `libs-muya` 的编辑器入口依赖 Vue 2，接入时需要将解析和渲染与编辑器运行时分开。
