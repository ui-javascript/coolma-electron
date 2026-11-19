<template>
  <section class="notes-pane">
    <div class="notes-toolbar">
      <div class="notes-toolbar-title">
        <el-checkbox
          class="select-all"
          :model-value="allSelected"
          :indeterminate="someSelected && !allSelected"
          :disabled="notes.length === 0"
          @change="toggleSelectAll"
        />
        <div>
          <h1>{{ t('notes.title') }}</h1>
          <p>{{ t('notes.count', { count: notes.length }) }} · {{ filterLabel }}</p>
        </div>
      </div>
      <el-button type="primary" size="small" :loading="creating" @click="emit('create-note')">
        <el-icon><Plus /></el-icon>
        {{ t('action.newNote') }}
      </el-button>
    </div>

    <div v-if="selectedIds.length > 0" class="batch-bar">
      <span class="batch-count">{{ t('board.selected', { count: selectedIds.length }) }}</span>
      <div class="batch-actions">
        <el-button size="small" plain @click="emit('batch-move')">
          <el-icon><FolderOpened /></el-icon>
          {{ t('board.move') }}
        </el-button>
        <el-button size="small" type="danger" plain :loading="batchPending" @click="emit('batch-delete')">
          <el-icon><Delete /></el-icon>
          {{ t('board.delete') }}
        </el-button>
        <el-button size="small" text @click="clearSelection">{{ t('board.clear') }}</el-button>
      </div>
    </div>

    <el-input v-model="keywordProxy" class="notes-search" :placeholder="t('search.placeholder')" clearable>
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>

    <div v-loading="loading" class="note-list">
      <div
        v-for="note in notes"
        :key="note.id"
        class="note-item"
        :class="{ active: note.id === activeId, selected: isSelected(note.id) }"
        role="button"
        tabindex="0"
        @click="handleItemClick(note, $event)"
        @keydown.enter.prevent="emit('select', note.id)"
        @contextmenu.prevent="emit('open-menu', note, $event)"
      >
        <div class="note-item-head">
          <el-checkbox
            class="note-check"
            :model-value="isSelected(note.id)"
            @click.stop
            @change="toggleSelect(note.id)"
          />
          <span class="note-title">{{ note.title }}</span>
          <button
            type="button"
            class="note-more"
            :title="t('notes.actions')"
            @click.stop="emit('open-menu', note, $event)"
          >
            <el-icon><MoreFilled /></el-icon>
          </button>
        </div>
        <p class="note-excerpt">{{ note.excerpt }}</p>
        <div class="note-meta">
          <span>{{ formatNoteDate(note, t) }}</span>
          <el-tag size="small" effect="plain">{{ primaryTag(note, t) }}</el-tag>
          <span v-if="extraTagCount(note) > 0" class="note-tag-extra">+{{ extraTagCount(note) }}</span>
        </div>
      </div>

      <el-empty
        v-if="!loading && notes.length === 0"
        :description="total === 0 ? t('notes.noNotes') : t('notes.empty')"
        :image-size="72"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { Delete, FolderOpened, MoreFilled, Plus, Search } from '@element-plus/icons-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NoteSummary } from '@shared/types/domain';
import { extraTagCount, formatNoteDate, primaryTag } from '@/utils/note';

const props = defineProps<{
  notes: NoteSummary[];
  activeId: number | null;
  selectedIds: number[];
  loading: boolean;
  creating: boolean;
  keyword: string;
  filterLabel: string;
  total: number;
  batchPending: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:keyword', value: string): void;
  (event: 'update:selected', value: number[]): void;
  (event: 'select', id: number): void;
  (event: 'open-menu', note: NoteSummary, native: MouseEvent): void;
  (event: 'create-note'): void;
  (event: 'batch-move'): void;
  (event: 'batch-delete'): void;
}>();

const { t } = useI18n();

/** Shift 连选的锚点只在本组件内维护，避免污染上层编排状态。 */
const anchorId = ref<number | null>(null);

const keywordProxy = computed({
  get: () => props.keyword,
  set: (value: string) => emit('update:keyword', value),
});

const allSelected = computed(
  () => props.notes.length > 0 && props.selectedIds.length === props.notes.length,
);
const someSelected = computed(() => props.selectedIds.length > 0);

function isSelected(id: number): boolean {
  return props.selectedIds.includes(id);
}

function commitSelection(next: number[]): void {
  emit('update:selected', next);
}

function toggleSelect(id: number): void {
  const next = props.selectedIds.includes(id)
    ? props.selectedIds.filter((item) => item !== id)
    : [...props.selectedIds, id];
  anchorId.value = id;
  commitSelection(next);
}

/** 行点击：Shift 连选、Ctrl/Cmd 点选、普通点击打开笔记。 */
function handleItemClick(note: NoteSummary, event: MouseEvent): void {
  if (event.shiftKey && anchorId.value !== null) {
    const ids = props.notes.map((item) => item.id);
    const from = ids.indexOf(anchorId.value);
    const to = ids.indexOf(note.id);
    if (from >= 0 && to >= 0) {
      const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
      commitSelection(Array.from(new Set([...props.selectedIds, ...range])));
      anchorId.value = note.id;
      return;
    }
  }
  if (event.ctrlKey || event.metaKey) {
    toggleSelect(note.id);
    return;
  }
  emit('select', note.id);
}

function toggleSelectAll(value: string | number | boolean): void {
  anchorId.value = null;
  commitSelection(value ? props.notes.map((note) => note.id) : []);
}

function clearSelection(): void {
  anchorId.value = null;
  commitSelection([]);
}
</script>
