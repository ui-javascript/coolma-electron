<template>
  <el-dialog
    v-model="visible"
    :title="t('search.title')"
    width="640px"
    top="12vh"
    append-to-body
    class="search-dialog"
    @open="focusInput"
  >
    <el-select
      ref="selectRef"
      v-model="selected"
      filterable
      remote
      reserve-keyword
      :remote-method="handleQuery"
      :loading="loading"
      :placeholder="t('search.dialogPlaceholder')"
      class="search-dialog-select"
      popper-class="search-dialog-popper"
      @change="onSelect"
    >
      <el-option v-for="item in results" :key="item.id" :label="item.title || t('notes.untitled')" :value="item.id">
        <div class="search-hit">
          <div class="search-hit-head">
            <span class="search-hit-title">{{ item.title || t('notes.untitled') }}</span>
            <span v-if="item.category" class="search-hit-cat">{{ item.category === 'inbox' ? t('notes.rootFolder') : item.category }}</span>
          </div>
          <div class="search-hit-excerpt">{{ snippet(item.excerpt) }}</div>
        </div>
      </el-option>
      <template #empty>
        <div class="search-empty">{{ query ? t('search.noResult') : t('search.emptyHint') }}</div>
      </template>
    </el-select>
    <div class="search-dialog-tip">{{ t('search.tip') }}</div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 全库搜索（复刻 vue2 SearchDialog）：输入即查，命中标题 / 正文，选中后跳转笔记。
 * vue2 是 q-select + NoteItem 气泡；vue3 用 el-select remote，结果里带摘要片段。
 */
import { nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { listNotes } from '@/services/ipc';
import { highlightSnippet } from '@/utils/search';

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (event: 'select', id: number): void }>();

const { t } = useI18n();
const results = ref<Array<{ id: number; title: string; excerpt: string; category: string }>>([]);
const loading = ref(false);
const query = ref('');
const selected = ref<number | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

function handleQuery(value: string): void {
  query.value = value;
  if (timer) {
    clearTimeout(timer);
  }
  if (!value.trim()) {
    results.value = [];
    return;
  }
  loading.value = true;
  // vue2 是 input-debounce 500ms，这里保持同样的手感
  timer = setTimeout(async () => {
    const result = await listNotes({ query: value.trim(), limit: 50 });
    loading.value = false;
    if (result.ok === false) {
      results.value = [];
      return;
    }
    results.value = result.data.items.map((note) => ({
      id: note.id,
      title: note.title,
      excerpt: note.excerpt,
      category: note.category,
    }));
  }, 500);
}

function snippet(text: string): string {
  return highlightSnippet(text ?? '', query.value, 80);
}

function onSelect(id: number): void {
  if (typeof id !== 'number') {
    return;
  }
  emit('select', id);
  visible.value = false;
  selected.value = null;
  query.value = '';
  results.value = [];
}

function focusInput(): void {
  void nextTick(() => {
    const input = (document.querySelector('.search-dialog-select input') as HTMLInputElement | null) ?? null;
    input?.focus();
  });
}
</script>

<style scoped>
.search-dialog-select {
  width: 100%;
}

.search-hit {
  padding: 6px 0;
}

.search-hit-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-hit-title {
  font-weight: 600;
}

.search-hit-cat {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.search-hit-excerpt {
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.search-dialog-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
