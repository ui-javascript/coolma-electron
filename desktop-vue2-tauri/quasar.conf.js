/*
 * This file runs in a Node context (it's NOT transpiled by Babel), so use only
 * the ES6 features that are supported by your Node version. https://node.green/
 */

// Configuration for your app
// https://quasar.dev/quasar-cli/quasar-conf-js
/* eslint-env node */
const path = require('path')

module.exports = function (/* ctx */) {
  return {
    // https://quasar.dev/quasar-cli/supporting-ts
    supportTS: false,

    // https://quasar.dev/quasar-cli/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://quasar.dev/quasar-cli/boot-files
    boot: [
      'monaco-env',
      'vue-warn-filter',
      'i18n',
      'globalGlobals',
      'request',
      'element-ui',
      'form-create-element',
      'antd',
      'form-create-antd',
      'jxgraph',
      'rune-deps',
      'hel-micro-renderer',
      'cdn-deps',
      'tauri-clipboard',
      'tauri-desktop',
      'microapp-builtins'
    ],

    // https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-css
    css: [
      { path: '~/src/assets/css/style.css' }
    ],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v5',
      // 'fontawesome-v5',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
      'material-icons-outlined'
    ],

    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-build
    build: {
      vueRouterMode: 'hash', // available values: 'hash', 'history'

      distDir: 'dist/spa',
      publicPath: '/',
      transpile: true,

      // Add dependencies for transpiling with Babel (Array of string/regex)
      // (from node_modules, which are by default not transpiled).
      // Applies only if "transpile" is set to true.
      //
      // 规则：任何发布到 node_modules 的依赖，只要满足以下任一条件就必须加入此列表：
      //   1. package.json 声明了 "type": "module"（即纯 ESM 包，未提供兼容 CJS 的产物）
      //   2. 入口产物（dist/*.js / src/*.ts）含 import/export 语法且未做 5 级降级（>= ES2015）
      //   3. 在 Vue 2.7 + webpack 4 环境下运行时会抛
      //      "Unexpected token export" / "Cannot use import statement outside a module"
      //   4. 使用了顶层 await、可选链等 webpack 4 + acorn 默认不支持的语法
      //   5. 依赖自身需要 polyfill 或运行时代码注入（如 process.env 注入）
      // 新增依赖时请先 Read node_modules/<pkg>/package.json + 入口文件确认是否满足上述条件，
      // 不要等到 pnpm build 报错再回头补。
      transpileDependencies: [/vega.*/, /@quasar.*/, /libs-muya-vue2.*/, /quill/, 'htmlparser2', 'parse5', 'cheerio', /monaco.*/, 'sql.js', /reveal\.js.*/, /portkey-ai/, /openai/, 'consola', 'enum-plus', /@tauri-apps[/\\]api/, /@tauri-apps[/\\]plugin-dialog/, /@tauri-apps[/\\]plugin-updater/, /vue-layerx.*/],

      // rtl: false, // https://quasar.dev/options/rtl-support
      // preloadChunks: true,
      // showProgress: false,
      // gzip: true,
      // analyze: true,

      // Options below are automatically set depending on the env, set them if you want to override
      // extractCSS: false,

      // https://quasar.dev/quasar-cli/handling-webpack
      extendWebpack (cfg) {
        // pnpm resolves each package through its real dependency directory.
        cfg.resolve.symlinks = true
        cfg.resolve.alias['electron$'] = path.resolve(__dirname, 'src/desktop/bridge.js')
        cfg.resolve.alias['electron-store$'] = path.resolve(__dirname, 'src/desktop/PreferenceStore.js')
        cfg.resolve.alias['fs-extra$'] = path.resolve(__dirname, 'src/desktop/unavailableFs.js')
        cfg.module.rules.push({ test: /\.wasm$/, type: 'javascript/auto', use: [{ loader: 'file-loader', options: { name: 'wasm/[name].[hash:8].[ext]' } }] })
        const cliModules = path.resolve(path.dirname(require.resolve('@quasar/app/package.json')), '../..')
        cfg.resolve.modules.push(cliModules)
        cfg.resolveLoader.modules.unshift(cliModules)

        // ESLint is run separately via `pnpm lint`.
        // eslint-loader v4 is incompatible with eslint v8 (removed getFormatter API),
        // so it has been removed from the webpack build pipeline.

        // 使用 babel-loader 转译 openai 和 portkey-ai
        cfg.module.rules.push({
          test: /\.m?js$/,
          include: [
            /node_modules[/\\]openai/,
            /node_modules[/\\]portkey-ai/,
            /node_modules[/\\]consola/
          ],
          type: 'javascript/auto',
          use: {
            loader: require.resolve('babel-loader'),
            options: {
              presets: [['@babel/preset-env', { targets: { chrome: '70' } }]],
              plugins: [
                '@babel/plugin-transform-optional-chaining',
                '@babel/plugin-transform-nullish-coalescing-operator',
                '@babel/plugin-transform-class-properties'
              ],
              cacheDirectory: false
            }
          }
        })

        // Monaco editor: bundle the workers required by every language used in the app
        const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin')
        cfg.plugins.push(new MonacoWebpackPlugin({
          // JavaScript uses Monaco's TypeScript language service and shares its worker
          languages: ['markdown', 'yaml', 'json', 'html', 'css', 'typescript'],
          features: [
            // ─── 核心功能（必需）─
            'bracketMatching',
            'clipboard',
            'codeAction',
            'codelens',
            'colorDetector',
            'comment',
            'contextmenu',
            'cursorUndo',
            'find',
            'folding',
            'fontZoom',
            'format',
            'gotoLine',
            'hover',
            'indentation',
            'linesOperations',
            'links',
            'multicursor',
            // 'parameterHints',
            'quickCommand',
            'quickOutline',
            'referenceSearch',
            'rename',
            'smartSelect',
            'snippets',
            'suggest',
            'toggleTabFocusMode',
            'transpose',
            'wordHighlighter',
            'wordOperations',
            'wordPartOperations',
            'wordPartSearch'
            // ─── 已移除的功能（节省体积）─
            // 'inPlaceReplace'        - 内联替换（不常用）
            // 'unusualFileTabbing'    - 特殊文件缩进（不常用）
            // 'viewportSemanticColoring' - 视口语义着色（性能消耗大）
          ]
        }))
      }
    },

    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-devServer
    devServer: {
      https: false,
      host: '127.0.0.1',
      port: 1420,
      open: false,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8888',
          changeOrigin: true,
          ws: false,
          pathRewrite: {
            '^/api': ''
          }
        }
      }
    },

    // https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-framework
    framework: {
      iconSet: 'material-icons', // Quasar icon set
      lang: 'en-us', // Quasar language pack
      config: {
        dark: 'auto'
      },

      // Possible values for "importStrategy":
      // * 'auto' - (DEFAULT) Auto-import needed Quasar components & directives
      // * 'all'  - Manually specify what to import
      importStrategy: 'auto',

      // For special cases outside of where "auto" importStrategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: [
        'Notify',
        'Dialog',
        'BottomSheet',
        'Loading'
      ]
    },

    // animations: 'all', // --- includes all animations
    // https://quasar.dev/options/animations
    animations: ['fadeIn', 'fadeOut']
  }
}
