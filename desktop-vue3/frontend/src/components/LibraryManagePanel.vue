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
        <el-tag size="small" effect="plain">{{ items.length }}</el-tag>
      </span>
      <div class="library-actions">
        <el-button size="small" plain @click="importVisible = true">
          {{ t('pack.import') }}
        </el-button>
        <el-button size="small" plain @click="exportPack">{{ t('pack.export') }}</el-button>
        <el-button size="small" type="primary" plain @click="openCreate">
          <el-icon><Plus /></el-icon>
          {{ t('library.add') }}
        </el-button>
      </div>
    </div>

    <p class="library-hint">{{ t('library.dragHint') }}</p>

    <div class="library-grid">
      <div
        v-for="(item, index) in categoryItems"
        :key="item.id"
        class="library-card"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover.prevent
        @drop="onDrop(index)"
        @dragend="dragIndex = -1"
        @click="openEdit(item)"
      >
        <span class="card-avatar" :style="{ background: item.color || '#909399' }">{{ initialOf(item.name) }}</span>
        <div class="card-body">
          <span class="card-name">{{ item.name }}</span>
          <span class="card-desc">{{ item.desc || '—' }}</span>
        </div>
        <div class="card-ops">
          <el-button text size="small" @click.stop="openEdit(item)">
            <el-icon><Edit /></el-icon>
          </el-button>
          <el-button text size="small" type="danger" @click.stop="askRemove(item)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <p v-if="categoryItems.length === 0" class="library-empty">{{ t('library.empty') }}</p>

    <LibraryFormDialog
      v-model="formVisible"
      :kind="kind"
      :editing="editing"
      @saved="emit('changed')"
    />

    <PackImportDialog v-model="importVisible" :kind="props.kind === 'rune' ? 'runes' : 'echoes'" @imported="onImported" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import { useLibraryStore } from '@/stores/library';
import { EchoCategoryEnum, RuneCategoryEnum, resolveLibraryCategory } from '@shared/enums/library';
import LibraryFormDialog from './LibraryFormDialog.vue';
import PackImportDialog from './PackImportDialog.vue';
import { buildPack } from '@/services/pack';
import { exportPackFile } from '@/services/ipc';

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

/** 卡片首字：中文取首字、英文取首字母大写（对齐 vue2 runeCard 的图标兜底）。 */
function initialOf(name: string): string {
  const first = Array.from(String(name || '').trim())[0];
  if (!first) {
    return '符';
  }
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

function onImported(): void {
  void libraryStore.load();
}

/** 导出当前 kind 的全部自定义卡为 Pack v1 JSON（对齐 vue2 buildEchoPack/buildRunePack：不导内置与审计字段）。 */
async function exportPack(): Promise<void> {
  const list = (props.kind === 'rune' ? libraryStore.runes : libraryStore.echoes) as Array<Record<string, unknown>>;
  const kind: 'runes' | 'echoes' = props.kind === 'rune' ? 'runes' : 'echoes';
  const content = buildPack(kind, list);
  const fileName = `coolma-${kind}-pack-${new Date().toISOString().slice(0, 10)}.json`;
  const result = await exportPackFile(fileName, content);
  if (result.ok && result.data) {
    ElMessage.success(t('pack.exported', { path: result.data }));
  }
}

const categoryEnum = computed(() => (props.kind === 'rune' ? RuneCategoryEnum : EchoCategoryEnum));

/** 分类 Tab：默认分类恒第一，其余按卡片数降序（对齐 vue2 categoryOptions 排序）。 */
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

const formVisible = ref(false);
const editing = ref<RuneCard | EchoCard | null>(null);
const dragIndex = ref(-1);
let sortTimer: ReturnType<typeof setTimeout> | null = null;

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function openEdit(item: RuneCard | EchoCard): void {
  editing.value = item;
  formVisible.value = true;
}

async function askRemove(item: RuneCard | EchoCard): Promise<void> {
  try {
    await ElMessageBox.confirm(t('library.deleteConfirm', { name: item.name }), t('action.delete'), {
      type: 'warning',
      confirmButtonText: t('action.delete'),
      cancelButtonText: t('action.cancel'),
    });
  } catch {
    return;
  }
  const ok = props.kind === 'rune'
    ? await libraryStore.deleteRuneCard(item.id)
    : await libraryStore.deleteEchoCard(item.id);
  if (!ok) {
    ElMessage.error(libraryStore.error || t('library.deleteFailed'));
    return;
  }
  ElMessage.success(t('library.deleteSuccess'));
  emit('changed');
}

/** 拖拽排序：松手后按新顺序重写 sort_order，批量保存（200ms 防抖，避免连续拖拽疯狂写库）。 */
function onDragStart(index: number): void {
  dragIndex.value = index;
}

async function onDrop(index: number): Promise<void> {
  const from = dragIndex.value;
  dragIndex.value = -1;
  if (from < 0 || from === index) {
    return;
  }
  // 分类过滤视图里拖拽：换算成「全列表」中的位置再移动，
  // 然后全量重编号 0..n-1，保证跨分类的全局顺序不被打乱
  const dragged = categoryItems.value[from];
  const target = categoryItems.value[index];
  const full = [...items.value];
  const draggedGlobal = full.findIndex((item) => item.id === dragged.id);
  const targetGlobal = full.findIndex((item) => item.id === target.id);
  if (draggedGlobal < 0 || targetGlobal < 0) {
    return;
  }
  const next = [...full];
  const [moved] = next.splice(draggedGlobal, 1);
  const adjustedTarget = next.findIndex((item) => item.id === target.id);
  next.splice(adjustedTarget, 0, moved);
  // 先改内存让 UI 立即生效，再防抖落库
  if (props.kind === 'rune') {
    libraryStore.runes = next as RuneCard[];
  } else {
    libraryStore.echoes = next as EchoCard[];
  }

  if (sortTimer) {
    clearTimeout(sortTimer);
  }
  sortTimer = setTimeout(async () => {
    const payloads = next.map((item, order) => ({
      id: item.id,
      name: item.name,
      desc: item.desc,
      color: item.color,
      icon: item.icon,
      category: item.category,
      sortOrder: order,
      ...(props.kind === 'rune'
        ? { template: (item as RuneCard).template, inheritFromPrevious: (item as RuneCard).inheritFromPrevious }
        : { annoSource: (item as EchoCard).annoSource, renderType: (item as EchoCard).renderType }),
    }));
    const ok = props.kind === 'rune'
      ? await libraryStore.saveRuneOrder(payloads as never)
      : await libraryStore.saveEchoOrder(payloads as never);
    if (!ok) {
      ElMessage.error(libraryStore.error || t('library.sortFailed'));
      await libraryStore.load(true);
    }
  }, 200);
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
  cursor: grab;
}

.library-card { cursor: pointer; }

.library-card:hover {
  border-color: var(--el-color-primary-light-5);
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
