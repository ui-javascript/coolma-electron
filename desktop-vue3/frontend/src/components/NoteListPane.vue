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
      <div class="notes-toolbar-actions">
        <el-button size="small" plain :loading="refreshing" :title="t('notes.refresh')" @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
          {{ t('notes.refresh') }}
        </el-button>
        <el-button type="primary" size="small" :loading="creating" @click="emit('create-note')">
          <el-icon><Plus /></el-icon>
          {{ t('action.newNote') }}
        </el-button>
      </div>
    </div>

    <div v-if="selectedIds.length > 0" class="batch-bar">
      <span class="batch-count">{{ t('board.selected', { count: selectedIds.length }) }}</span>
      <div class="batch-actions">
        <el-button size="small" plain @click="emit('batch-move')">
          <el-icon><FolderOpened /></el-icon>
          {{ t('board.move') }}
        </el-button>
        <el-button size="small" plain @click="emit('batch-export')">
          <el-icon><Download /></el-icon>
          {{ t('board.export') }}
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

    <div
      v-loading="loading"
      class="note-list"
      :class="{ dense: props.dense }"
      @touchstart="onPullStart"
      @touchmove="onPullMove"
      @touchend="onPullEnd"
      @touchcancel="resetPull"
    >
      <div
        v-if="pullDistance > 0"
        class="pull-hint"
        :class="{ ready: pullDistance >= PULL_THRESHOLD }"
        :style="{ height: `${pullDistance}px` }"
      >
        <span>{{ pullDistance >= PULL_THRESHOLD ? t('notes.releaseRefresh') : t('notes.pullRefresh') }}</span>
      </div>
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
          <el-icon class="note-file-icon"><component :is="fileIcon(note.title)" /></el-icon>
          <span class="note-title">{{ note.title }}</span>
          <el-icon
            v-if="note.dirty === 1"
            class="note-sync-icon"
            :title="t('notes.pendingSync')"
          >
            <Upload />
          </el-icon>
          <button
            type="button"
            class="note-more"
            :title="t('notes.actions')"
            @click.stop="emit('open-menu', note, $event)"
          >
            <el-icon><MoreFilled /></el-icon>
          </button>
        </div>
        <p v-if="!props.dense" class="note-excerpt">{{ note.excerpt }}</p>
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
import {
  Delete,
  Document,
  Download,
  Files,
  FolderOpened,
  Monitor,
  MoreFilled,
  Notebook,
  Plus,
  Refresh,
  Search,
  Tickets,
  Upload,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NoteSummary } from '@shared/types/domain';
import { extraTagCount, formatNoteDate, primaryTag } from '@/utils/note';

const props = defineProps<{
  dense?: boolean;
  notes: NoteSummary[];
  activeId: number | null;
  selectedIds: number[];
  loading: boolean;
  refreshing?: boolean;
  creating: boolean;
  keyword: string;
  filterLabel: string;
  total: number;
  batchPending: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:keyword', value: string): void;
  (event: 'update:selected', value: number[]): void;
  (event: 'batch-export'): void;
  (event: 'select', id: number): void;
  (event: 'open-menu', note: NoteSummary, native: MouseEvent): void;
  (event: 'create-note'): void;
  (event: 'refresh'): void;
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

/** 文件类型图标，对齐 vue2 NoteItem 的 fileIcon 映射。 */
function fileIcon(title: string): Component {
  const lower = title.toLowerCase();
  if (lower.endsWith('.md')) return Document;
  if (lower.endsWith('.txt')) return Tickets;
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return Monitor;
  if (lower.endsWith('.pdf')) return Files;
  return Notebook;
}

function clearSelection(): void {
  anchorId.value = null;
  commitSelection([]);
}

const PULL_THRESHOLD = 56;
const pullStartY = ref<number | null>(null);
const pullDistance = ref(0);

function onPullStart(event: TouchEvent): void {
  const element = event.currentTarget as HTMLElement | null;
  if (!element || element.scrollTop > 0 || props.refreshing) {
    pullStartY.value = null;
    return;
  }
  pullStartY.value = event.touches[0]?.clientY ?? null;
}

function onPullMove(event: TouchEvent): void {
  if (pullStartY.value === null) {
    return;
  }
  const delta = (event.touches[0]?.clientY ?? 0) - pullStartY.value;
  if (delta <= 0) {
    pullDistance.value = 0;
    return;
  }
  // 0.5 阻尼，拖到 112px 左右到阈值上限 90px
  pullDistance.value = Math.min(90, delta * 0.5);
}

function onPullEnd(): void {
  if (pullDistance.value >= PULL_THRESHOLD && !props.refreshing) {
    emit('refresh');
  }
  resetPull();
}

function resetPull(): void {
  pullStartY.value = null;
  pullDistance.value = 0;
}
</script>

<style scoped>
/* 紧凑列表模式（vue2 noteListDenseMode） */
.note-list.dense .note-item {
  padding: 6px 12px;
}

.note-list.dense .note-item-head {
  margin-bottom: 0;
}

.note-file-icon {
  flex: 0 0 auto;
  color: var(--coolma-muted);
  font-size: 14px;
}

.note-sync-icon {
  flex: 0 0 auto;
  color: var(--coolma-primary);
  font-size: 12px;
}

.notes-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.note-list {
  position: relative;
}

.pull-hint {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  color: var(--coolma-muted);
  font-size: 11px;
  transition: height 0.08s linear;
}

.pull-hint.ready {
  color: var(--coolma-primary);
}
</style>
