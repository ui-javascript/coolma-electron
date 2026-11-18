import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import katex from 'katex'
import deflist from 'markdown-it-deflist'
import footnote from 'markdown-it-footnote'
import mark from 'markdown-it-mark'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import texmath from 'markdown-it-texmath'
import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs'
import { defineTeekConfig } from 'vitepress-theme-teek/config'

const teek = defineTeekConfig({
  teekHome: true,
  vitePlugins: {
    sidebar: true,
    permalink: false
  },
  markdown: {
    config(md) {
      md.use(footnote)
        .use(deflist)
        .use(mark)
        .use(sub)
        .use(sup)
        .use(texmath, {
          engine: katex,
          delimiters: 'dollars',
          katexOptions: { trust: false, throwOnError: false }
        })
        .use(tabsMarkdownPlugin)
    }
  }
})

// The desktop workspace hoists Vue 2 to the root. Resolve Vue from VitePress so
// VitePress and Teek both compile against the Vue 3 runtime they require.
const vue3Runtime = createRequire(fileURLToPath(import.meta.resolve('vitepress')))
  .resolve('vue/dist/vue.runtime.esm-bundler.js')
const vue3ServerRenderer = createRequire(fileURLToPath(import.meta.resolve('vitepress')))
  .resolve('vue/server-renderer')

export default withMermaid(defineConfig({
  ...teek,
  title: 'Muya 文档模板',
  description: '基于 VitePress 和 Teek 的 Markdown 站点',
  lang: 'zh-CN',
  outDir: '../dist',
  ignoreDeadLinks: false,
  vite: {
    ...teek.vite,
    resolve: {
      ...teek.vite?.resolve,
      alias: [
        ...(teek.vite?.resolve?.alias || []),
        { find: /^vue$/, replacement: vue3Runtime },
        { find: 'vue/server-renderer', replacement: vue3ServerRenderer }
      ]
    },
    ssr: {
      ...teek.vite?.ssr,
      noExternal: ['vitepress-theme-teek', 'vue', '@vue/server-renderer']
    }
  },
  mermaid: { securityLevel: 'strict' },
  markdown: { ...teek.markdown, lineNumbers: true },
  themeConfig: {
    ...teek.themeConfig,
    nav: [
      { text: '首页', link: '/' },
      { text: '示例库', link: '/guide/' },
      { text: '归档', link: '/archives' }
    ],
    search: { provider: 'local' },
    sidebar: {
      '/guide/': [
        {
          text: '示例库',
          items: [
            { text: '示例索引', link: '/guide/' },
            { text: 'Markdown 语法', link: '/guide/markdown' },
            { text: '技术文档与图表', link: '/guide/technical' },
            { text: 'Teek 主题能力', link: '/guide/theme' },
            { text: 'Muya 对照样例', link: '/guide/muya-fixture' }
          ]
        }
      ]
    }
  }
}))
