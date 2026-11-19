<template>
  <div ref="host" class="source-editor" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AppTheme } from '@shared/enums/app';

/**
 * Monaco 源码编辑器（与 Muya 组成"双编辑器"）。
 *
 * 语义对齐 vue2 的 components/monaco/Monaco.vue：
 * - 同一篇笔记有两套编辑视图，靠模式切换（不是 diff 编辑器）；
 * - 只有"当前激活"的那个视图会把内容写回 v-model，避免双写；
 * - monaco 按需加载（动态 import），不进首屏包。
 */
const props = defineProps<{ modelValue: string; theme: AppTheme }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const host = ref<HTMLElement | null>(null);
let editor: any = null;
let monacoApi: any = null;
/** 内部写值（setValue / 切换笔记）时不要回抛 update，否则会形成双写。 */
let suppress = false;

const themeName = (theme: AppTheme) => (theme === 'dark' ? 'vs-dark' : 'vs');

onMounted(async () => {
  // 0.38 的 ESM 入口；worker 用 vite 的 ?worker 方式挂到 MonacoEnvironment
  monacoApi = await import('monaco-editor/esm/vs/editor/editor.api');
  const EditorWorker = (await import('monaco-editor/esm/vs/editor/editor.worker?worker')).default;
  (self as any).MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };

  editor = monacoApi.editor.create(host.value as HTMLElement, {
    value: props.modelValue,
    language: 'markdown',
    theme: themeName(props.theme),
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: 'on',
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
  });

  editor.onDidChangeModelContent(() => {
    if (suppress) {
      return;
    }
    emit('update:modelValue', editor.getValue());
  });
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor || value === editor.getValue()) {
      return;
    }
    suppress = true;
    editor.setValue(value);
    suppress = false;
  },
);

watch(
  () => props.theme,
  (theme) => {
    monacoApi?.editor.setTheme(themeName(theme));
  },
);

onBeforeUnmount(() => {
  editor?.dispose();
  editor = null;
});
</script>

<style scoped>
.source-editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
</style>
