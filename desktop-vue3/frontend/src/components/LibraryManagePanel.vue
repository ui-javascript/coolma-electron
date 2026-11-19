<template>
  <div class="library-panel">
    <div class="library-head">
      <span class="library-title">
        {{ kind === 'rune' ? t('library.runesTitle') : t('library.echoesTitle') }}
        <el-tag size="small" effect="plain">{{ items.length }}</el-tag>
      </span>
      <div class="library-actions">
        <el-button size="small" type="primary" plain @click="openCreate">
          <el-icon><Plus /></el-icon>
          {{ t('library.add') }}
        </el-button>
      </div>
    </div>

    <p class="library-hint">{{ t('library.dragHint') }}</p>

    <div class="library-grid">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="library-card"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover.prevent
        @drop="onDrop(index)"
        @dragend="dragIndex = -1"
      >
        <span class="card-dot" :style="{ background: item.color }" />
        <div class="card-body">
          <span class="card-name">{{ item.name }}</span>
          <span class="card-desc">{{ item.desc || '—' }}</span>
        </div>
        <div class="card-ops">
          <el-button text size="small" @click="openEdit(item)">
            <el-icon><Edit /></el-icon>
          </el-button>
          <el-button text size="small" type="danger" @click="askRemove(item)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <p v-if="items.length === 0" class="library-empty">{{ t('library.empty') }}</p>

    <LibraryFormDialog
      v-model="formVisible"
      :kind="kind"
      :editing="editing"
      @saved="emit('changed')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import { useLibraryStore } from '@/stores/library';
import LibraryFormDialog from './LibraryFormDialog.vue';

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
  const next = [...items.value];
  const [moved] = next.splice(from, 1);
  next.splice(index, 0, moved);
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

.library-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.card-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
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
