const path = require('path')

// libs-muya 契约：消费方提供 boot/i18n 单例（见 shims/boot-i18n.js）
// 引擎还残留两个 app 级依赖，按 demo-vue2-vite-muya 的先例用 alias 兜：
//  - src/components/echo/echoCore → 桌面端 barrel，这里只复用其纯 JS 的 echoPropsParser
//  - mermaid / vega-embed → webpack4 解析不了其 ESM 产物，demo 不画图，stub 掉
const bootI18nAlias = {
  // The editor runs in the browser; do not bundle turndown's Node/jsdom branch for SSR.
  'turndown$': require.resolve('turndown/lib/turndown.browser.es.js', { paths: [path.dirname(require.resolve('libs-muya/package.json'))] }),
  'boot/i18n': path.resolve(__dirname, './shims/boot-i18n.js'),
  'src/components/echo/echoCore': path.resolve(__dirname, './shims/echo-core-shim.js'),
  // 注意：webpack4 alias 是按对象键序做前缀匹配，长键必须排在短键前面
  'mermaid/dist/mermaid.esm.min.mjs': path.resolve(__dirname, './shims/empty.js'),
  mermaid: path.resolve(__dirname, './shims/empty.js'),
  'vega-embed': path.resolve(__dirname, './shims/empty.js'),
  'vega-lite': path.resolve(__dirname, './shims/empty.js'),
  vega: path.resolve(__dirname, './shims/empty.js'),
  'flowchart.js': path.resolve(__dirname, './shims/empty.js'),
  // turndown 只在无 DOMParser 的 Node 环境才调用 domino（demo 是 ClientOnly，永不触达）
  '@mixmark-io/domino': path.resolve(__dirname, './shims/empty.js'),
}

module.exports = {
  title: 'Muya 文档模板',
  description: '基于 VuePress 和 Vdoing 的 Markdown 站点',
  locales: {
    '/': { lang: 'zh-CN' }
  },
  theme: 'vdoing',
  plugins: [
    ['@vuepress/medium-zoom', { selector: '.theme-vdoing-content img:not(.no-zoom)' }],
    ['vuepress-plugin-code-copy', { staticIcon: true }],
    'demo-block',
    'flowchart'
  ],
  markdown: {
    lineNumbers: true,
    extendMarkdown(md) {
      md.use(require('markdown-it-footnote'))
        .use(require('markdown-it-deflist'))
        .use(require('markdown-it-mark'))
        .use(require('markdown-it-sub'))
        .use(require('markdown-it-sup'))
        .use(require('markdown-it-task-lists'))
        .use(require('markdown-it-texmath'), {
          engine: require('katex'),
          delimiters: 'dollars',
          katexOptions: { trust: false, throwOnError: false }
        })
    }
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '示例库', link: '/guide/' },
      {
        text: '文档索引',
        items: [
          { text: '分类', link: '/categories/' },
          { text: '标签', link: '/tags/' },
          { text: '归档', link: '/archives/' }
        ]
      }
    ],
    sidebar: {
      '/guide/': [
        '',
        'markdown.html',
        'technical.html',
        'theme.html',
        'muya-fixture.html'
      ]
    }
  }
,
  configureWebpack: {
    resolve: {
      alias: bootI18nAlias
    }
  }
}
