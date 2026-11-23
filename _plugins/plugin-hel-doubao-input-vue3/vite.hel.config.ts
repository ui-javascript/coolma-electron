import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';

/** 远程组件产物：单一 IIFE + 单份 CSS，Vue 由宿主提供。 */
export default defineConfig({
  plugins: [vue(), UnoCSS()],
  build: {
    outDir: 'hel_dist/assets',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/hel.ts'),
      formats: ['iife'],
      name: 'PluginHelDoubaoInputVue3',
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
        assetFileNames: 'style[extname]',
      },
    },
  },
});
