// const fs = require('fs')
const TerserPlugin = require('terser-webpack-plugin');
const { defineConfig } = require('@vue/cli-service')
const isProd = process.env.NODE_ENV === 'production'

module.exports = defineConfig({
  lintOnSave: !isProd,
  // outputDir: '../public/box-im',
  // publicPath: isProd ? '/box-im/' : '/',
  publicPath: process.env.PUBLIC_PATH || './',
  productionSourceMap: false,
	devServer: {
    port: 18080,
    allowedHosts: 'all',
    // host: '0.0.0.0',
    client: {
      overlay: false, // 禁用浏览器中的错误覆盖层
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      // 明确允许的请求头列表
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      // 允许的 HTTP 方法
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
		proxy: {
			'/api': {
				// target: process.env.VUE_APP_BASE_API,
        target: 'https://www.boxim.online/api',
				changeOrigin: true,
				ws: false,
				pathRewrite: {
					'^/api': ''
				},
        secure: false,
        headers: {
          'Access-Control-Allow-Origin': '*',
          // 明确允许的请求头列表
          'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
          // 允许的 HTTP 方法
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        },
			},
      '/im': {
        // 目标地址 (注意：这里写 wss 协议)
        target: 'wss://www.boxim.online',
        // 必须开启：启用 WebSocket 代理
        ws: true,
        // 必须开启：允许跨域
        changeOrigin: true,
        // 目标是 https/wss，建议开启
        secure: true,
        // 路径重写 (这里 /im 直接代理到目标的 /im，无需重写)
        pathRewrite: {
          '^/im': '/im'
        }
      }
		}
	},
  configureWebpack: config => {
    config.optimization.minimizer.push(
      new TerserPlugin({
        terserOptions: {
          compress: {
            // drop_console: true, // 移除console
            drop_debugger: true, // 移除debugger
            pure_funcs: ['console.log'], // 移除特定函数调用
          },
          output: {
            comments: false, // 移除注释
          },
        },
        parallel: true, // 并行压缩
        extractComments: false, // 不提取注释到单独文件
      }),

    )

  },

});
