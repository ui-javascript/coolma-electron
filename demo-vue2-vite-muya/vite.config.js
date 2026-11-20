import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import path from 'path'
import { createRequire } from 'module'

// === 缺失依赖 stub：让 demo 最小可用 ===
// 详细说明见 stubs/<package>/*.js。
//   - 单文件包（prismjs / unsplash-js / ...）直接 alias 到 stubs/<pkg>.js
//   - 带子路径的包（prismjs/themes/prism.css、html-tags/void、popper.js/dist/esm/popper）
//     走 stubs/<pkg>/ 子目录 stub（package.json + index.js 等），vite 沿用
//     node_modules 风格解析即可命中 sub-import。
//
// alias 的 $1 保留 sub-path：例如
//   import 'github-markdown-css/github-markdown.css'
// 命中  find: /^github-markdown-css(\/.*)?$/
// 替换为 `${stubDir}/github-markdown-css$1`（即 .../github-markdown-css/github-markdown.css）
// 后续由 vite/Node 解析到 stubs/github-markdown-css/github-markdown.css.js（vite 自动加 .js）。
const stubDir = path.resolve(__dirname, './stubs')
const resolve = createRequire(path.resolve(__dirname, 'package.json')).resolve

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // Memocast path stubs for standalone use
      { find: 'boot/i18n', replacement: path.resolve(__dirname, './src/boot/i18n.js') },
      { find: 'src/components/echo/echoCore', replacement: path.resolve(__dirname, './src/components/echo/echoCore.js') },
      // libs-muya-vue2 lib (精确匹配，防止 /lib -> /lib/lib)
      { find: /^libs-muya-vue2\/lib$/, replacement: path.resolve(__dirname, '../libs-muya-vue2/lib') },
      // lib 内部 CSS：demo 不调用 exportHtml()，导出 HTML 时不会用到这些样式表。
      // 走真 CSS 在 vite 下没有 default export（仅副作用注入），而 lib 代码
      // `import xxx from 'xxx.css'` 期望拿到 CSS 字符串嵌入 HTML。所以 demo
      // 端把这两个具体文件 stub 成空字符串，与 github-markdown-css / prism.css 同套路。
      // 注：alias resolve 阶段拿到的 importee 是原始的相对路径字符串
      // (如 '../assets/styles/exportStyle.css')，不是 resolve 后的 @fs 绝对路径，
      // 所以必须用 importee 字符串本身作为 find。
      { find: '../assets/styles/exportStyle.css', replacement: path.resolve(__dirname, './stubs/coolma-muya/lib/assets/styles/exportStyle.css.js') },
      { find: '../assets/styles/headerFooterStyle.css', replacement: path.resolve(__dirname, './stubs/coolma-muya/lib/assets/styles/headerFooterStyle.css.js') },
      { find: /^libs-muya-vue2\/themes\/default\.css$/, replacement: path.resolve(__dirname, '../libs-muya-vue2/themes/default.css') },
      // exportHtml.js 需要 CSS 字符串，Vite 用 ?inline 提供默认导出。
      { find: /^prismjs\/themes\/prism\.css$/, replacement: `${resolve('prismjs/themes/prism.css')}?inline` },
      { find: /^katex\/dist\/katex\.css$/, replacement: `${resolve('katex/dist/katex.css')}?inline` },
      // === stub：单文件 + 带子路径 ===
      // 注：file-icons-js 和 prismjs 已是 libs-muya-vue2 的直接依赖
      // (file-icons-js@1.0.3 + prismjs@1.30.0，lib 自身依赖)。
      // demo 从本地 libs-muya-vue2 读取源码和依赖。
      { find: /^unsplash-js(\/.*)?$/, replacement: `${stubDir}/unsplash-js$1` },
      { find: /^github-markdown-css(\/.*)?$/, replacement: `${stubDir}/github-markdown-css$1` },
      { find: /^turndown(\/.*)?$/, replacement: `${stubDir}/turndown$1` },
      { find: /^webfontloader(\/.*)?$/, replacement: `${stubDir}/webfontloader$1` },
      { find: /^execall(\/.*)?$/, replacement: `${stubDir}/execall$1` },
      { find: /^dompurify(\/.*)?$/, replacement: `${stubDir}/dompurify$1` },
      { find: /^element-resize-detector(\/.*)?$/, replacement: `${stubDir}/element-resize-detector$1` },
      { find: /^popper\.js(\/.*)?$/, replacement: `${stubDir}/popper.js$1` },
      { find: /^html-tags(\/.*)?$/, replacement: `${stubDir}/html-tags$1` },
      // sequence-diagram-snap.js 引到的 UMD 包 `require('eve')` 会撞 esbuild prebundle
      { find: /^\.\/snap\.svg-min(\.js)?$/, replacement: `${stubDir}/snap-svg.js` }
    ]
  },
  // 确保 esbuild 等预构建工具正确处理 libs-muya-vue2
  optimizeDeps: {
    // demo 模式：禁依赖发现。Muya lib 内部有大量 UMD 风格的 deps（snap.svg-min.js、
    // katex.css、eve、flowchart.js、mermaid、vega-embed 等），esbuild prebundle 在
    // 静态扫描阶段会强行解析它们的 require('eve')/import 字符串并撞到未装的依赖，
    // 导致 dev server 启动失败。
    // 设置 noDiscovery:true 后：
    //   - dev 模式下 vite 只对 optimizeDeps.include 列出的 entry 做 prebundle；
    //   - 其它依赖按需 transform/serve，由 alias 把缺失依赖 stub 替换为空导出，
    //     运行时不调用即可；
    //   - 生产 build 的 prebundle 由 Rollup 自行处理（不影响 dev）。
    noDiscovery: true,
    include: ['katex', 'vue', 'vue-i18n', 'file-icons-js', 'prismjs'],
    // 不让 vite 把上面这些 stub 包误识别为预构建对象
    exclude: [
      'unsplash-js',
      'github-markdown-css',
      'turndown',
      'webfontloader',
      'execall',
      'dompurify',
      'element-resize-detector',
      'popper.js',
      'html-tags',
      'eve',
      'flowchart.js',
      'mermaid',
      'vega-embed',
      'katex/dist/katex.css'
    ]
  },
  server: {
    port: 5174,
    strictPort: true,
    // 关闭预 transform：Muya lib 内部静态 import 了一批 demo 没装的依赖
    // (snap.svg-min / prismjs CSS / popper.js sub-path / katex css 等)，
    // vite pre-transform 阶段 esbuild 直接读文件做 scan，绕开 vite 的
    // resolve.alias（alias 只在浏览器侧 import-analysis 生效）。
    // 关闭预 transform 后，dev 模式按需 transform/serve，请求进来时
    // 才会走 vite:resolve alias 命中 stub。
    preTransformRequests: false
  }
})
