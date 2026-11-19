<template>
  <div class="library-panel">
    <div class="category-tabs">
      <button
        v-for="tab in categoryTabs"
        :key="tab.value"
        type="button"
        class="category-tab"
        :class="{ active: tab.value === activeCategory }"
        @click="activeCategory = tab.value"
      >
        {{ t(tab.label) }}
        <span class="tab-count">{{ tab.count }}</span>
      </button>
    </div>
    <div class="library-head">
      <span class="library-title">
        {{ kind === 'rune' ? t('library.runesTitle') : t('library.echoesTitle') }}
        <el-tag size="small" effect="plain">{{ categoryItems.length }}</el-tag>
      </span>
      <div v-if="selectionMode" class="library-actions">
        <el-button size="small" :disabled="deleting" @click="exitSelection">{{ t('action.cancel') }}</el-button>
        <el-button size="small" type="danger" plain :loading="deleting" :disabled="!selectedCards.length" @click="askRemove(selectedCards, true)">
          {{ t('library.deleteSelected', { count: selectedCards.length }) }}
        </el-button>
      </div>
      <div v-else-if="!builtinCategory" class="library-actions">
        <el-button size="small" plain @click="importVisible = true">
          {{ t('pack.import') }}
        </el-button>
        <el-button size="small" plain :disabled="!customCards.length" @click="exportVisible = true">
          {{ t('library.exportCategory') }}
        </el-button>
        <el-button size="small" type="danger" plain :disabled="!customCards.length || sorting" @click="selectionMode = true">
          {{ t('library.batchDelete') }}
        </el-button>
        <el-button size="small" type="primary" plain @click="openCreate">
          <el-icon><Plus /></el-icon>
          {{ t('library.add') }}
        </el-button>
      </div>
    </div>

    <p class="library-hint">{{ t(builtinCategory ? 'library.builtinHint' : selectionMode ? 'library.selectionHint' : 'library.dragHint') }}</p>

    <div class="library-grid">
      <div
        v-for="(item, index) in categoryItems"
        :key="item.id"
        class="library-card"
        :class="{ 'is-selected': selectedIds.has(item.id), 'is-builtin': isBuiltinLibraryCard(item.id) }"
        :draggable="!selectionMode && !sorting && !deleting && !isBuiltinLibraryCard(item.id)"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent
        @drop="onDrop(index)"
        @dragend="dragIndex = -1"
        @click="onCardClick(item)"
      >
        <el-checkbox
          v-if="selectionMode && !isBuiltinLibraryCard(item.id)"
          :model-value="selectedIds.has(item.id)"
          :aria-label="item.name"
          :disabled="deleting"
          @click.stop
          @change="toggleSelected(item.id)"
        />
        <span class="card-avatar" :style="{ background: item.color || '#909399' }">{{ initialOf(item.name) }}</span>
        <div class="card-body">
          <div class="card-heading">
            <span class="card-name">{{ item.name }}</span>
            <el-tag v-if="isBuiltinLibraryCard(item.id)" size="small" effect="plain">{{ t('library.builtinBadge') }}</el-tag>
          </div>
          <span class="card-desc">{{ item.desc || '—' }}</span>
        </div>
        <div v-if="!selectionMode" class="card-ops">
          <el-button text size="small" :aria-label="t(isBuiltinLibraryCard(item.id) && production ? 'library.viewCard' : 'library.editCard')" @click.stop="openEdit(item)">
            <el-icon v-if="isBuiltinLibraryCard(item.id) && production"><View /></el-icon>
            <el-icon v-else><Edit /></el-icon>
          </el-button>
          <el-button v-if="!isBuiltinLibraryCard(item.id)" text size="small" type="danger"
            :aria-label="t('action.delete')" :disabled="sorting || deleting" @click.stop="askRemove([item])">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <p v-if="categoryItems.length === 0" class="library-empty">{{ t(builtinCategory ? 'library.noBuiltins' : 'library.empty') }}</p>

    <LibraryFormDialog
      v-model="formVisible"
      :kind="kind"
      :editing="editing"
      :initial-category="activeCategory"
      :readonly="production && Boolean(editing && isBuiltinLibraryCard(editing.id))"
      @saved="emit('changed')"
    />

    <PackImportDialog v-model="importVisible" :kind="packKind" :initial-category="activeCategory" @imported="onImported" />
    <packExportDialog v-model="exportVisible" :kind="packKind" :cards="customCards" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Edit, Plus, View } from '@element-plus/icons-vue';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import { isBuiltinLibraryCard } from '@shared/types/libraryCard';
import { useLibraryStore } from '@/stores/library';
import { EchoCategoryEnum, RuneCategoryEnum, resolveLibraryCategory } from '@shared/enums/library';
import LibraryFormDialog from './LibraryFormDialog.vue';
import PackImportDialog from './PackImportDialog.vue';
import packExportDialog from './packExportDialog.vue';

/**
 * 符文/回响管理：卡片网格 + 拖拽排序 + 编辑/删除。
 * 对齐 vue2 SettingsRunePanel / SettingsEchoPanel 的核心操作面（拖拽用原生 HTML5 DnD，与 vue2 同款）。
 */
const props = defineProps<{
  kind: 'rune' | 'echo';
}>();

const emit = defineEmits<{
  (event: 'changed'): void;
}>();

const { t } = useI18n();
const libraryStore = useLibraryStore();

const items = computed(() => (props.kind === 'rune' ? libraryStore.runes : libraryStore.echoes) as Array<RuneCard | EchoCard>);

/** 当前分类（默认 general / marker，与 vue2 面板一致）。 */
const activeCategory = ref(resolveLibraryCategory(props.kind, ''));
const importVisible = ref(false);
const exportVisible = ref(false);
const packKind = computed(() => props.kind === 'rune' ? 'runes' : 'echoes');
const builtinCategory = computed(() => props.kind === 'echo' && activeCategory.value === EchoCategoryEnum.Builtin);
const production = import.meta.env.PROD;

/** 卡片首字：中文取首字、英文取首字母大写（对齐 vue2 runeCard 的图标兜底）。 */
function initialOf(name: string): string {
  const first = Array.from(String(name || '').trim())[0];
  if (!first) {
    return '符';
  }
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

async function onImported(): Promise<void> {
  if (await libraryStore.load(true)) {
    emit('changed');
  } else {
    ElMessage.error(libraryStore.error);
  }
}

const categoryEnum = computed(() => (props.kind === 'rune' ? RuneCategoryEnum : EchoCategoryEnum));

/** 分类 Tab：符文固定「通用」在首位，回响固定「内置」在首位，其余按卡片数降序。 */
const categoryTabs = computed(() => {
  const list = categoryEnum.value.items as Array<{ value: string; label: string }>;
  const countOf = (value: string) =>
    items.value.filter((item) => resolveLibraryCategory(props.kind, item.category) === value).length;
  const rest = list.slice(1).map((category) => ({ ...category, count: countOf(category.value) }));
  rest.sort((a, b) => b.count - a.count);
  return [{ ...list[0], count: countOf(list[0].value) }, ...rest];
});

/** 当前分类下的卡片。 */
const categoryItems = computed(() =>
  items.value.filter((item) => resolveLibraryCategory(props.kind, item.category) === activeCategory.value),
);
const customCards = computed(() => categoryItems.value.filter((item) => !isBuiltinLibraryCard(item.id)));
const selectionMode = ref(false);
const selectedIds = ref(new Set<string>());
const selectedCards = computed(() => customCards.value.filter((item) => selectedIds.value.has(item.id)));
const deleting = ref(false);
const sorting = ref(false);

function exitSelection(): void {
  selectionMode.value = false;
  selectedIds.value.clear();
}

watch(activeCategory, () => {
  exitSelection();
  dragIndex.value = -1;
});

function toggleSelected(id: string): void {
  if (deleting.value || isBuiltinLibraryCard(id)) return;
  if (!selectedIds.value.delete(id)) selectedIds.value.add(id);
}

function onCardClick(item: RuneCard | EchoCard): void {
  if (selectionMode.value) toggleSelected(item.id);
  else openEdit(item);
}

const formVisible = ref(false);
const editing = ref<RuneCard | EchoCard | null>(null);
const dragIndex = ref(-1);

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function openEdit(item: RuneCard | EchoCard): void {
  editing.value = item;
  formVisible.value = true;
}

async function askRemove(cards: ReadonlyArray<RuneCard | EchoCard>, batch = false): Promise<void> {
  const targets = cards.filter((card) => !isBuiltinLibraryCard(card.id));
  if (!targets.length || deleting.value || sorting.value) return;
  deleting.value = true;
  try {
    try {
      await ElMessageBox.confirm(
        batch ? t('library.batchDeleteConfirm', { count: targets.length }) : t('library.deleteConfirm', { name: targets[0].name }),
        t(batch ? 'library.batchDelete' : 'action.delete'),
        { type: 'warning', confirmButtonText: t('action.delete'), cancelButtonText: t('action.cancel') },
      );
    } catch {
      return;
    }
    const { removed, error } = await libraryStore.deleteCards(props.kind, targets.map((card) => card.id));
    removed.forEach((id) => selectedIds.value.delete(id));
    if (removed.length < targets.length) {
      ElMessage.error(batch
        ? t('library.batchDeletePartial', { removed: removed.length, total: targets.length, reason: error || t('library.deleteFailed') })
        : error || t('library.deleteFailed'));
    } else {
      if (batch) exitSelection();
      ElMessage.success(t(batch ? 'library.batchDeleteSuccess' : 'library.deleteSuccess', { count: removed.length }));
    }
    if (removed.length) emit('changed');
  } finally {
    deleting.value = false;
  }
}

/** 拖拽结束时一次性保存顺序；保存期间不允许删除，避免旧排序数据重新写入已删卡片。 */
function onDragStart(event: DragEvent, index: number): void {
  const card = categoryItems.value[index];
  if (!card || selectionMode.value || sorting.value || deleting.value || isBuiltinLibraryCard(card.id)) {
    event.preventDefault();
    return;
  }
  dragIndex.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
}

async function onDrop(index: number): Promise<void> {
  const from = dragIndex.value;
  dragIndex.value = -1;
  if (from < 0 || from === index || selectionMode.value || sorting.value || deleting.value) {
    return;
  }
  // 分类过滤视图里拖拽：换算成「全列表」中的位置再移动，
  // 然后全量重编号 0..n-1，保证跨分类的全局顺序不被打乱
  const dragged = categoryItems.value[from];
  const target = categoryItems.value[index];
  if (!dragged || !target || isBuiltinLibraryCard(dragged.id)) return;
  const full = [...items.value];
  const draggedGlobal = full.findIndex((item) => item.id === dragged.id);
  const targetGlobal = full.findIndex((item) => item.id === target.id);
  if (draggedGlobal < 0 || targetGlobal < 0) {
    return;
  }
  const next = [...full];
  const [moved] = next.splice(draggedGlobal, 1);
  next.splice(targetGlobal, 0, moved);
  // 先改内存让 UI 立即生效，再批量落库。
  if (props.kind === 'rune') {
    libraryStore.runes = next as RuneCard[];
  } else {
    libraryStore.echoes = next as EchoCard[];
  }

  sorting.value = true;
  try {
    const ok = props.kind === 'rune'
      ? await libraryStore.saveRuneOrder((next as RuneCard[]).map((item, sortOrder) => ({ ...item, sortOrder })))
      : await libraryStore.saveEchoOrder((next as EchoCard[]).map((item, sortOrder) => ({ ...item, sortOrder })));
    if (!ok) {
      ElMessage.error(libraryStore.error || t('library.sortFailed'));
      await libraryStore.load(true);
    }
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : t('library.sortFailed'));
    await libraryStore.load(true);
  } finally {
    sorting.value = false;
  }
}
</script>

<style scoped>
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.category-tab {
  border: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-blank);
  border-radius: 14px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.category-tab:hover {
  border-color: var(--el-color-primary-light-5);
}

.category-tab.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.tab-count {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.category-tab.active .tab-count {
  color: var(--el-color-primary);
}

.library-panel {
  width: 100%;
}

.library-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}

.library-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.library-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0 10px;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
}

.library-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
}

.library-card[draggable='true'] { cursor: grab; }

.library-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.library-card.is-selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.library-card.is-builtin {
  background: var(--el-fill-color-light);
}

.card-heading {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  user-select: none;
}

.card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-ops {
  flex: none;
}

.library-empty {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 20px 0;
}
</style>
