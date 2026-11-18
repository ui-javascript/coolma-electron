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
}
