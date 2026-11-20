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

/** 光标读写（对齐 vue2 Monaco.vue：line/column 1-based 并做限幅，防 Illegal value 抛错）。 */
function getCursor(): { lineNumber: number; column: number } {
  const position = editor?.getPosition();
  if (!position) {
    return { lineNumber: 1, column: 1 };
  }
  return {
    lineNumber: Math.max(1, Number(position.lineNumber) || 1),
    column: Math.max(1, Number(position.column) || 1),
  };
}

function setCursor(position: { lineNumber?: number; column?: number } | null | undefined): void {
  if (!editor) {
    return;
  }
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const lineCount = model.getLineCount();
  const rawLine = Number(position?.lineNumber);
  const rawColumn = Number(position?.column);
  const lineNumber = Number.isFinite(rawLine) && rawLine >= 1 && rawLine <= lineCount
    ? Math.floor(rawLine)
    : 1;
  const maxColumn = model.getLineMaxColumn(lineNumber);
  const column = Number.isFinite(rawColumn) && rawColumn >= 1 && rawColumn <= maxColumn
    ? Math.floor(rawColumn)
    : 1;
  editor.setPosition({ lineNumber, column });
  editor.revealPositionInCenterIfOutsideViewport({ lineNumber, column });
  editor.focus();
}

/**
 * 把整段文本追加到 Monaco 末尾（对齐 vue2 Monaco.insertAiTextHandler）。
 * 末行非空时先补一个换行，避免 AI 段粘在最后一行；光标落到新增段尾。
 */
function appendText(text: string): boolean {
  if (!editor || !text) {
    return false;
  }
  const model = editor.getModel();
  if (!model) {
    return false;
  }
  const lineCount = model.getLineCount();
  const lastLineMaxColumn = model.getLineMaxColumn(lineCount);
  const lastRange = {
    startLineNumber: lineCount,
    startColumn: lastLineMaxColumn,
    endLineNumber: lineCount,
    endColumn: lastLineMaxColumn,
  };
  const lastLineText = model.getLineContent(lineCount) || '';
  const padding = lastLineText.length === 0 ? '' : '\n';
  const insertText = `${padding}${text}`;
  editor.executeEdits('insert-ai-text', [{ range: lastRange, text: insertText, forceMoveMarkers: true }]);

  const insertedLineCount = (insertText.match(/\n/g) || []).length;
  const finalLineNumber = lineCount + insertedLineCount;
  const finalColumn = insertedLineCount === 0
    ? lastLineMaxColumn + insertText.length
    : model.getLineMaxColumn(finalLineNumber);
  editor.setPosition({ lineNumber: finalLineNumber, column: finalColumn });
  editor.revealLine(finalLineNumber);
  editor.focus();
  return true;
}

defineExpose({ getCursor, setCursor, appendText });
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
