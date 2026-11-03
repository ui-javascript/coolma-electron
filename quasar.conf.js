/*
 * This file runs in a Node context (it's NOT transpiled by Babel), so use only
 * the ES6 features that are supported by your Node version. https://node.green/
 */

// Configuration for your app
// https://quasar.dev/quasar-cli/quasar-conf-js
/* eslint-env node */

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
      'electron-clipboard',
      'jxgraph',
      'rune-deps',
      'hel-micro-renderer',
      'cdn-deps',
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
      // 不要等到 yarn build 报错再回头补。
      transpileDependencies: [/vega.*/, /@quasar.*/, /coolma-muya.*/, /quill/, 'htmlparser2', 'parse5', 'cheerio', /monaco.*/, 'sql.js', /reveal\.js.*/, /portkey-ai/, /openai/, 'consola', 'enum-plus', /vue-layerx.*/],

      // rtl: false, // https://quasar.dev/options/rtl-support
      // preloadChunks: true,
      // showProgress: false,
      // gzip: true,
      // analyze: true,

      // Options below are automatically set depending on the env, set them if you want to override
      // extractCSS: false,

      // https://quasar.dev/quasar-cli/handling-webpack
      extendWebpack (cfg) {
        // ESLint is run separately via `npm run lint`.
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
            'wordPartSearch',
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
      port: 8080,
      open: true,
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
    animations: ['fadeIn', 'fadeOut'],

    // https://quasar.dev/quasar-cli/developing-ssr/configuring-ssr
    ssr: {
      pwa: false
    },

    // https://quasar.dev/quasar-cli/developing-pwa/configuring-pwa
    pwa: {
      workboxPluginMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
      workboxOptions: {}, // only for GenerateSW
      manifest: {
        name: 'Quasar App',
        short_name: 'Quasar App',
        description: 'A Quasar Framework app',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#027be3',
        icons: [
          {
            src: 'icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-256x256.png',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    },

    // Full list of options: https://quasar.dev/quasar-cli/developing-cordova-apps/configuring-cordova
    cordova: {
      // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://quasar.dev/quasar-cli/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true
    },

    // Full list of options: https://quasar.dev/quasar-cli/developing-electron-apps/configuring-electron
    electron: {
      bundler: 'builder', // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        productName: 'coolma',
        mac: {
          target: [{
            arch: 'universal',
            target: 'dmg'
          }]
        }

        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',

        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        appId: 'cn.coolma.app',
        // ─── 跳过原生模块 Electron target 重新编译 ───
        // bufferutil / utf-8-validate / cpu-features 均为 optionalDependencies，
        // 不需要为 Electron 版本的 Node 重新编译，跳过可避免 Windows 下无 Visual Studio 而报错
        npmRebuild: false,

        // ─── 第二轮优化：Electron 构建优化 ───

        // 禁用不必要的功能以减小体积
        electronDownload: {
          mirror: 'https://npmmirror.com/mirrors/electron/'
        },
        publish: {
          provider: 'github',
          releaseType: 'draft'
        },

        // ─── 打包完成后裁剪 Electron 多余模块 ───
        afterPack: './scripts/after-pack.js',

        // ─── 7z 极限压缩配置 ───
        // 底层调用 7z，最高压缩级别 + BCJ2 过滤器（对可执行文件效果显著）
        // 使用 yarn build-7z 或 yarn build-publish-7z 来触发极限压缩
        compression: 'maximum',

        // ─── 压缩 asar 包 ───
        // asarUnpack 用于将大体积模块解压到外部，避免双重压缩并提升运行时性能
        // 这些模块包含二进制文件、worker 文件或特殊格式，不适合打包进 asar
        asar: true,
        // asarUnpack: [
        //   '**/node_modules/{monaco-editor,echarts,mermaid,vega*,markmap*,katex,@quasar/extras}/**/*',
        //   '**/node_modules/sql.js/**/*',
        //   '**/node_modules/electron-updater/**/*',
        //   '**/node_modules/electron-log/**/*',
        //   '**/node_modules/electron-store/**/*',
        //   '**/node_modules/@electron/**/*'
        // ],

        // ─── 打包文件过滤 ───
        //
        // ⚠️ 基准目录：electron-builder 的 files 相对的是 Quasar 的 appDir
        //    （= dist/electron/UnPackaged），**不是仓库根目录**。
        //    所以 '_plugins/**/*'、'dist/**/*'、'public/**/*' 这类规则在本项目全是空规则，
        //    必须写成 UnPackaged 下的相对路径（例如 box-im/**/*）。
        //
        // ⚠️ node_modules 特殊规则：electron-builder 处理 node_modules 时**只取 files 里
        //    以 '!' 开头的排除模式**，正向模式会被忽略。
        //    所以「保留 node_modules 里的某个文件」只能用排除式写法（把不要的排掉）。
        files: [
          '**/*',
          './package.json',

          // ─── ① 应用层：空目录 / 安装期无用文件 ───
          '!box-im/**/*',                    // wujie 子应用已下线，UnPackaged/box-im 为空目录
          '!**/.npmrc',                      // 安装期不需要 registry 配置
          '!**/.yarnrc',
          '!**/yarn.lock',
          '!**/package-lock.json',

          // ─── ② node_modules/sql.js：只保留 wasm 版（-22MB）───
          //    package.json main = dist/sql-wasm.js，运行时只会加载 sql-wasm.js + sql-wasm.wasm；
          //    dist 下的 asm 版 / debug 版 / browser 版 / zip 变体主进程永远用不到。
          '!node_modules/sql.js/dist/*sql-asm*.js',
          '!node_modules/sql.js/dist/*browser*',
          '!node_modules/sql.js/dist/*debug*',
          '!node_modules/sql.js/dist/*.zip',

          // ─── ③ node_modules：已打进 bundle 的冗余副本（-19MB）───
          //    证据：UnPackaged/js/vendor.js 内含 quasar / openai / moment / moment-timezone /
          //          cron-parser 的真实代码；UnPackaged/electron-main.js 内含 openai / lodash。
          //    这些包在 node_modules 里的副本只是 yarn install --production 顺手装进去的，运行时用不到。
          '!node_modules/quasar/**/*',           // 渲染进程 bundle 已含（-8.8MB）
          '!node_modules/openai/**/*',           // portkey-ai 的依赖，已打进 bundle（-3.7MB）
          '!node_modules/portkey-ai/**/*',       // 同上（-0.6MB）
          '!node_modules/moment/**/*',           // ant-design-vue / cron-parser 用，已打进 bundle（-2.9MB）
          '!node_modules/moment-timezone/**/*',  // 同上（-1.8MB）
          '!node_modules/lodash/**/*',           // 主进程 + 渲染进程均已打进 bundle（-1.3MB）
          '!node_modules/node-schedule/**/*',    // 渲染进程 ScheduleHandler 用，已打进 bundle
          '!node_modules/cron-parser/**/*',      // node-schedule 的依赖，已打进 bundle

          // ─── ④ node_modules：可选原生加速器（optionalDependencies，缺失也不影响功能）（-1MB）───
          //    ssh2: try { require('cpu-features') } catch {}
          //    ws:   try { require('bufferutil') } catch {}
          '!node_modules/bufferutil/**/*',
          '!node_modules/utf-8-validate/**/*',
          '!node_modules/cpu-features/**/*',
          '!node_modules/nan/**/*',

          // ─── ⑤ 必须保留的运行时依赖（别在这里排除）───
          //    主进程 webpack externals：sql.js、consola、mime、electron-log、electron-unhandled、
          //      electron-updater、electron-util、electron-window-state
          //    原生模块：@hfelix/electron-localshortcut、ssh2
          //    运行时编译 rune SFC：@vue/compiler-sfc（+ @babel/parser、@babel/types、postcss、source-map）
          //    配置持久化：electron-store

          // ─── ⑥ 开发期工具链（正常不会出现在 production 依赖树里，保留为兜底）───
          '!node_modules/@babel/core/**/*',
          '!node_modules/@babel/preset-*/**/*',
          '!node_modules/@babel/plugin-*/**/*',
          '!node_modules/@babel/register/**/*',
          '!node_modules/webpack/**/*',
          '!node_modules/terser*/**/*',
          '!node_modules/eslint*/**/*',
          '!node_modules/prettier*/**/*',
          '!node_modules/.bin/**/*',
          '!node_modules/@types/**/*',

          // ─── ⑦ 通用清理：测试 / 文档 / 类型 / sourcemap ───
          '!node_modules/**/test/**/*',
          '!node_modules/**/tests/**/*',
          '!node_modules/**/docs/**/*',
          '!node_modules/**/example*/**/*',
          '!node_modules/**/readme*',
          '!node_modules/**/changelog*',
          '!node_modules/**/license*',
          '!node_modules/**/HISTORY*',
          '!node_modules/**/.github/**/*',
          '!node_modules/**/*.d.ts',
          '!node_modules/**/*.md',
          '!node_modules/**/*.map',
          '!node_modules/**/*.yml',
          '!node_modules/**/*.yaml',
          '!node_modules/**/*.txt',
          '!node_modules/**/*.AUTHORS',
          '!node_modules/**/*.CONTRIBUTING',
          '!node_modules/**/*.TODO',
          '!node_modules/**/*.LICENSE',
          '!node_modules/**/*.CHANGELOG',
          '!node_modules/**/*.HISTORY',
          '!node_modules/**/*.spec.js',
          '!node_modules/**/*.test.js',
          '!node_modules/**/*.spec.ts',
          '!node_modules/**/*.test.ts',
          '!node_modules/**/*.min.js',           // 已压缩产物，运行时不用（已核对：无生产依赖以其为入口）
          '!node_modules/**/*.min.css',
          '!node_modules/**/package-lock.json',
          '!node_modules/**/pnpm-lock.yaml',
          '!node_modules/**/coverage/**/*',
          '!node_modules/**/nyc_output/**/*',
          '!node_modules/**/.cache/**/*',
          '!node_modules/**/.temp/**/*',
          '!node_modules/**/tmp/**/*',
          '!node_modules/**/.git/**/*',
          '!node_modules/**/.svn/**/*',
          '!node_modules/**/.hg/**/*',
          '!node_modules/**/.idea/**/*',
          '!node_modules/**/.github/workflows/**/*',
          '!node_modules/**/.travis.yml',
          '!node_modules/**/.circleci/**/*',
          '!node_modules/**/Jenkinsfile',
          '!node_modules/**/.gitlab-ci.yml'
        ],

        mac: {
          target: [
            'dmg',
            'zip'
          ],
          // eslint-disable-next-line no-template-curly-in-string
          artifactName: 'Coolma-${version}-${arch}-mac.${ext}'
        },

        win: {
          target: [
            'nsis',
            'zip'
          ],
          legalTrademarks: 'Coolma'
        },

        nsis: {
          // eslint-disable-next-line no-template-curly-in-string
          artifactName: 'Coolma-${version}-${arch}-win.${ext}',
          perMachine: false,
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          // 使用 zip 压缩格式减小安装包体积
          // useZip: true
        },

        linux: {
          target: [
            'AppImage',
            'deb',
            'rpm'
          ],
          vendor: 'Coolma',
          // eslint-disable-next-line no-template-curly-in-string
          artifactName: 'Coolma-${version}-${arch}-linux.${ext}'
        }
      },

      // More info: https://quasar.dev/quasar-cli/developing-electron-apps/node-integration
      nodeIntegration: true,

      extendWebpack (cfg) {
        // do something with Electron main process Webpack cfg
        // chainWebpack also available besides this extendWebpack
        cfg.externals = {
          mime: 'commonjs mime',
          electron: 'commonjs electron',
          'electron-util': 'commonjs electron-util',
          'electron-log': 'commonjs electron-log',
          'electron-unhandled': 'commonjs electron-unhandled',
          'electron-updater': 'commonjs electron-updater',
          'electron-window-state': 'commonjs electron-window-state',
          'sql.js': 'commonjs sql.js',
          consola: 'commonjs consola',
          // 把 @vue/compiler-sfc 整体作为外部模块：webpack 不去分析它的内部 require()，
          // 运行时由 Node 从 node_modules 加载。避免 @vue/compiler-sfc 静态引用
          // 几十个可选模板/样式引擎（pug/jade/handlebars/stylus/less/...）导致构建失败。
          '@vue/compiler-sfc': 'commonjs @vue/compiler-sfc'
        }

        // 使用 babel-loader 转译 openai 和 portkey-ai
        const openaiRule = {
          test: /\.m?js$/,
          include: [
            /node_modules[/\\]openai/,
            /node_modules[/\\]portkey-ai/
          ],
          type: 'javascript/auto',
          use: {
            loader: require.resolve('babel-loader'),
            options: {
              presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
              plugins: [
                '@babel/plugin-transform-optional-chaining',
                '@babel/plugin-transform-nullish-coalescing-operator'
              ],
              cacheDirectory: false
            }
          }
        }
        cfg.module.rules.push(openaiRule)

        // 使用 babel-loader 转译 sql.js
        cfg.module.rules.push({
          test: /\.js$/,
          include: /node_modules[/\\]sql\.js/,
          use: {
            loader: require.resolve('babel-loader'),
            options: {
              presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
            }
          }
        })
      }
    }
  }
}
