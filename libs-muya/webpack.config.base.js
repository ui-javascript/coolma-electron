'use strict'

// muya webpack 配置工厂 —— 不被 webpack 直接 require，仅作为模块工厂
// 供 webpack.config.js / webpack.core.config.js 通过 require('./webpack.config.base.js') 复用

process.env.BABEL_ENV = 'renderer'

const path = require('path')

// 浏览器 i18n stub 和桌面应用分别位于仓库的不同目录。
const WORKSPACE_ROOT = path.resolve(__dirname, '..')
const DESKTOP_ROOT = path.join(WORKSPACE_ROOT, 'desktop-vue2')

/**
 * 把所有动态 import() 产生的 async chunks 合并到主入口 chunk，输出单个 CDN-friendly UMD 文件。
 */
class MergeAsyncChunksIntoMainPlugin {
  apply (compiler) {
    compiler.hooks.thisCompilation.tap('MergeAsyncChunksIntoMainPlugin', (compilation) => {
      compilation.hooks.optimizeChunks.tap('MergeAsyncChunksIntoMainPlugin', () => {
        const mainChunk = Array.from(compilation.chunks).find((c) => c.canBeInitial())
        if (!mainChunk) return

        const chunkGraph = compilation.chunkGraph

        for (const chunk of Array.from(compilation.chunks)) {
          if (chunk === mainChunk) continue
          for (const module of chunkGraph.getChunkModules(chunk)) {
            chunkGraph.connectChunkAndModule(mainChunk, module)
          }
          compilation.chunks.delete(chunk)
        }
      })
    })
  }
}

/**
 * 工厂：根据 variant 生成完整版或 core 版的 webpack 配置。
 *
 * - 'full'（默认）：index.min.js —— 含 katex / mermaid / flowchart / vega-embed / prism 200+ 语言
 * - 'core'        ：index.core.min.js —— 上述 heavy deps 标 externals，运行时通过 CDN 注入
 */
function buildConfig (variant) {
  const isCore = variant === 'core'

  // core 版把这些 heavy 包标记为 externals，期望运行时通过全局变量拿到
  const externals = {
    jquery: 'jQuery',
    vue: 'Vue'
  }

  if (isCore) {
    externals.katex = { commonjs: 'katex', commonjs2: 'katex', amd: 'katex', root: 'katex' }
    externals.mermaid = { commonjs: 'mermaid', commonjs2: 'mermaid', amd: 'mermaid', root: 'mermaid' }
    externals['flowchart.js'] = { commonjs: 'flowchart', commonjs2: 'flowchart', amd: 'flowchart', root: 'flowchart' }
    externals['vega-embed'] = { commonjs: 'vegaEmbed', commonjs2: 'vegaEmbed', amd: 'vegaEmbed', root: 'vegaEmbed' }
    externals['prismjs/components/prism-markup'] = 'window.Prism'
    externals['prismjs/components/prism-css'] = 'window.Prism'
    externals['prismjs/components/prism-clike'] = 'window.Prism'
    externals['prismjs/components/prism-javascript'] = 'window.Prism'
    externals['prismjs/plugins/keep-markup/prism-keep-markup'] = 'window.Prism'
  }

  return {
    mode: process.env.NODE_ENV || 'development',
    devtool: process.env.NODE_ENV === 'production' ? false : 'eval-cheap-module-source-map',
    entry: {
      renderer: path.join(__dirname, './lib/index.js')
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          use: 'babel-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            { loader: 'css-loader', options: { importLoaders: 1 } },
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  ident: 'postcss',
                  plugins: () => [
                    require('postcss-preset-env')({ stage: 0 })
                  ]
                }
              }
            }
          ]
        },
        {
          test: /\.html$/,
          use: 'vue-html-loader'
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/,
          type: 'asset/inline'
        },
        {
          test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
          type: 'asset/inline'
        },
        {
          test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
          type: 'asset/inline'
        }
      ]
    },
    output: {
      filename: isCore ? 'index.core.min.js' : 'index.min.js',
      libraryTarget: 'umd',
      library: 'Muya',
      path: path.join(__dirname, './dist'),
      globalObject: 'this'
    },
    resolve: {
      extensions: ['.js', '.vue', '.json', '.css', '.node'],
      alias: {
        'boot/i18n': path.join(WORKSPACE_ROOT, '_plugins/coolma-muya-demo/src/boot/i18n.js'),
        'src/components/echo/echoCore': path.join(DESKTOP_ROOT, 'src/components/echo/echoCore.js'),
        'src/utils': path.join(DESKTOP_ROOT, 'src/utils'),
        'src/i18n$': path.join(DESKTOP_ROOT, 'src/i18n/index.js'),
        'components/common/bus': path.join(DESKTOP_ROOT, 'src/components/common/bus.js')
      },
      fallback: {
        path: false,
        fs: false,
        crypto: false,
        os: false
      }
    },
    optimization: {
      runtimeChunk: false,
      splitChunks: false,
      concatenateModules: true,
      minimize: true,
      usedExports: true,
      sideEffects: false
    },
    plugins: [
      new MergeAsyncChunksIntoMainPlugin()
    ],
    externals
  }
}

module.exports = { buildConfig }
