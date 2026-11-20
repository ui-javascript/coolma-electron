import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const devHost = '127.0.0.1';
const devPort = 8081;
const devAddress = `${devHost}:${devPort}`;

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  // CDN 依赖是用户在设置页里配的任意地址，运行时才注入；CSP 必须在文档加载时就放行
  // 远程脚本/样式/字体，否则生产包会被 script-src 'self' 全部挡掉。
  const remote = 'https: http:';
  const csp = isProduction
    ? `default-src 'self'; script-src 'self' ${remote}; style-src 'self' 'unsafe-inline' ${remote}; img-src 'self' data: blob: ${remote}; font-src 'self' data: ${remote}; connect-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'none'`
    : `default-src 'self'; script-src 'self' 'unsafe-eval' ${remote}; style-src 'self' 'unsafe-inline' ${remote}; img-src 'self' data: blob: ${remote}; font-src 'self' data: ${remote}; connect-src 'self' http://${devAddress} ws://${devAddress}`;

  return {
    base: './',
    define: {
      global: 'globalThis',
    },
    plugins: [
      vue(),
      {
        name: 'coolma-csp',
        transformIndexHtml(html) {
          return html.replace(
            '<!-- CSP_PLACEHOLDER -->',
            `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, '../electron/shared'),
        'echo-core': path.resolve(__dirname, '../../echo-core/src'),
        'rune-core': path.resolve(__dirname, '../../rune-core/src'),
      },
    },
    optimizeDeps: {
      exclude: ['libs-muya-v3'],
    },
    server: {
      host: devHost,
      port: devPort,
      strictPort: true,
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode !== 'production',
      minify: 'esbuild',
      chunkSizeWarningLimit: 1600,
    },
  };
});
