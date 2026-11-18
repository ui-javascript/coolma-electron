<template>
  <div ref="host" class="libs-muya-host" :class="`libs-muya-theme-${theme}`" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Muya from './core/index.js';
import type { MuyaOptions } from './core/index.js';
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
  change: [payload: { markdown: string; wordCount?: number }];
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

  editor = new Muya(mount, {
    ...props.options,
    markdown: props.modelValue,
    mode: props.readonly ? 'preview' : 'normal',
  });
  const instance = editor;

  instance.on('change', (payload: { markdown: string; wordCount?: number }) => {
    if (!applyingExternalValue) {
      emit('update:modelValue', payload.markdown);
    }
    emit('change', payload);
  });

  instance.on('selectionChange', (payload: unknown) => {
    emit('selectionChange', payload);
  });

  for (const plugin of props.plugins) {
    const dispose = plugin.install({ editor: instance, container: host.value });
    if (typeof dispose === 'function') {
      pluginDisposers.push(dispose);
    }
  }

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

onBeforeUnmount(() => {
  for (const dispose of pluginDisposers.splice(0)) {
    try {
      dispose();
    } catch (error) {
      console.warn('[libs-muya] plugin dispose failed:', error);
    }
  }
  try {
    editor?.destroy();
  } catch (error) {
    console.warn('[libs-muya] editor destroy failed:', error);
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
