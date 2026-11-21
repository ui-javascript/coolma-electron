<template>
  <div
    ref="host"
    class="libs-muya-host"
    :class="`libs-muya-theme-${theme}`"
    @beforeinput.capture="guardEdit"
    @paste.capture="guardEdit"
    @cut.capture="guardEdit"
    @drop.capture="guardEdit"
    @keydown.capture="guardEdit"
    @click.capture="guardEdit"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Muya, { installDefaultUiPlugins } from './core/index.js';
import type { MuyaChangePayload, MuyaOptions, MuyaSelectionSnapshot } from './core/index.js';
import type { MuyaPlugin } from './plugin';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    theme?: 'light' | 'dark';
    readonly?: boolean;
    plugins?: MuyaPlugin[];
    options?: MuyaOptions;
  }>(),
  {
    modelValue: '',
    theme: 'light',
    readonly: false,
    plugins: () => [],
    options: () => ({}),
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [payload: MuyaChangePayload];
  selectionChange: [payload: unknown];
  ready: [editor: Muya];
}>();

const host = ref<HTMLElement>();
let editor: Muya | null = null;
let applyingExternalValue = false;
const pluginDisposers: Array<() => void> = [];

function applyReadonly(): void {
  const editable = host.value?.querySelector('[contenteditable]');
  editable?.setAttribute('contenteditable', props.readonly ? 'false' : 'true');
  if (props.readonly) {
    editor?.hideAllFloatTools();
  }
}

function guardEdit(event: Event): void {
  if (!props.readonly) {
    return;
  }
  if (event instanceof KeyboardEvent && !['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key)) {
    return;
  }
  if (event.type === 'click' && !(event.target instanceof Element &&
    event.target.closest('.ag-task-list-item-checkbox, .ag-tool-table, .ag-image-icon-delete, .ag-image-icon-close, .ag-container-icon'))) {
    return;
  }
  event.stopPropagation();
  if (!(event instanceof KeyboardEvent && event.key === 'Tab')) {
    event.preventDefault();
  }
}

function disposePlugins(): void {
  for (const dispose of pluginDisposers.splice(0)) {
    try {
      dispose();
    } catch (error) {
      console.warn('[libs-muya-vue3] plugin dispose failed:', error);
    }
  }
}

function installPlugins(instance: Muya): void {
  if (!host.value) {
    return;
  }
  for (const plugin of props.plugins ?? []) {
    const dispose = plugin.install({ editor: instance, container: host.value });
    if (typeof dispose === 'function') {
      pluginDisposers.push(dispose);
    }
  }
}

onMounted(() => {
  if (!host.value) {
    return;
  }

  // Muya replaces its mount element, so keep a stable host owned by Vue and
  // mount into a disposable child. Unmounting the host then removes the editor.
  const mount = document.createElement('div');
  mount.className = 'libs-muya-mount';
  host.value.appendChild(mount);

  // 必做：先注册整套 UI 插件（@ 面板、代码块选择器等都挂在这里），否则编辑器只有内容没有交互层。
  installDefaultUiPlugins();

  editor = new Muya(mount, {
    ...props.options,
    markdown: props.modelValue,
    mode: props.readonly ? 'preview' : 'normal',
  });
  const instance = editor;

  instance.on('change', (payload: MuyaChangePayload) => {
    if (!applyingExternalValue) {
      emit('update:modelValue', payload.markdown);
    }
    emit('change', payload);
  });

  instance.on('selectionChange', (payload: unknown) => {
    emit('selectionChange', payload);
  });

  installPlugins(instance);

  applyReadonly();
  emit('ready', instance);
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor) {
      return;
    }
    if (editor.getMarkdown() === value) {
      return;
    }
    applyingExternalValue = true;
    editor.setMarkdown(value);
    nextTick(() => {
      applyingExternalValue = false;
    });
  },
);

watch(
  () => props.readonly,
  () => applyReadonly(),
);

// 插件依赖的数据（符文/回响卡片）是异步从库里读的，挂载时可能还是空的。
// props.plugins 一变就整体重装：先 dispose 旧实例，再装新的，编辑器本身不重建。
watch(
  () => props.plugins,
  () => {
    if (!editor) {
      return;
    }
    disposePlugins();
    installPlugins(editor);
    applyReadonly();
  },
);

onBeforeUnmount(() => {
  disposePlugins();
  try {
    editor?.destroy();
  } catch (error) {
    console.warn('[libs-muya-vue3] editor destroy failed:', error);
  } finally {
    editor = null;
    host.value?.replaceChildren();
  }
});

defineExpose({
  getEditor: () => editor,
  focus: () => editor?.focus(),
  blur: () => editor?.blur(),
  getMarkdown: () => editor?.getMarkdown() ?? '',
  setMarkdown: (value: string) => editor?.setMarkdown(value),
  /** 光标读写（引擎 core 已有 getCursor/setCursor，这里只做对外暴露） */
  getCursor: () => editor?.getCursor() ?? null,
  setCursor: (cursor: unknown) => editor?.setCursor(cursor),
  /** AI 划词改写：选区快照不依赖 DOM Selection，弹窗抢焦点后仍可替换。 */
  captureSelection: () => editor?.getSelectionInfo() ?? null,
  replaceSelectionSnapshot: (snapshot: MuyaSelectionSnapshot, replacement: string) =>
    editor?.replaceSelectionSnapshot(snapshot, replacement) === true,
  /** 带光标的重载：切换笔记/源码模式时用 markdown + cursor 一次性落位 */
  setMarkdownWithCursor: (value: string, cursor: unknown) => editor?.setMarkdown(value, cursor, false),
});
</script>

<style>
.libs-muya-host {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.libs-muya-mount {
  height: 100%;
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.libs-muya-host [contenteditable] {
  height: 100%;
  outline: none;
}

.libs-muya-theme-dark {
  --themeColor: #6f9dff;
  --themeColor60: rgb(111 157 255 / 60%);
  color: var(--coolma-text, #e8ebf1);
}

.libs-muya-theme-light {
  --themeColor: #2563eb;
  --themeColor60: rgb(37 99 235 / 60%);
}
</style>
