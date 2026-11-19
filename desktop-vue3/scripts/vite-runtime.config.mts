import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * 只用于「最小运行验证」的 SSR 打包配置：把 scripts/runtime-test.ts 打成可被 node 直接跑的包。
 * 依赖走 ssr.external（用真实 node_modules 的 CJS 语义，避免 esbuild 老版本的 ESM/CJS 互操作坑）。
 */
export default defineConfig({
  plugins: [vue()],
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: {
    alias: [
      // runtime-test 会直接引渲染层的 utils / services，需要补上前端那套 @ 别名
      { find: /^@\//, replacement: fileURLToPath(new URL('../frontend/src/', import.meta.url)) },
      { find: /^@shared\//, replacement: fileURLToPath(new URL('../electron/shared/', import.meta.url)) },
    ],
  },
  build: {
    ssr: true,
    outDir: fileURLToPath(new URL('.rt-dist', import.meta.url)),
    emptyOutDir: true,
    minify: false,
    target: 'node20',
    rollupOptions: {
      input: fileURLToPath(new URL('runtime-test.ts', import.meta.url)),
      external: ['jsdom'],
      output: {
        entryFileNames: 'rt.mjs',
        format: 'es',
      },
    },
  },
  ssr: {
    external: ['jsdom', 'snabbdom', 'snabbdom-to-html', 'katex', 'file-icons-js', 'unsplash-js', 'mermaid', 'vega', 'vega-embed', 'dompurify'],
  },
});
