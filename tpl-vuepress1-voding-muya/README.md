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

后续接入 Muya 时，在本包声明 `libs-muya-vue2: workspace:*`，用 VuePress 1 的 `extendMarkdown` 钩子注册本地 markdown-it 插件。由插件识别需要 Muya 处理的语法，再调用适合构建环境的 AST 解析和渲染入口；普通 Markdown 继续走 VuePress 和 Vdoing 的现有流程。本模板目前没有接入 Muya。
