<template>
  <div class="tags-manage">
    <div class="tags-toolbar">
      <el-button text size="small" @click="openCreate">
        <el-icon><Plus /></el-icon>
        <span>{{ t('aiTagCreate') }}</span>
      </el-button>
      <el-button text size="small" :loading="loading" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('aiTagRefresh') }}</span>
      </el-button>
      <el-button
        text
        size="small"
        type="warning"
        :disabled="loading || unusedCount === 0"
        @click="cleanupUnused"
      >
        {{ t('aiTagCleanupUnused') }}
      </el-button>
    </div>

    <div class="tags-filter">
      <el-input
        v-model="searchText"
        size="small"
        clearable
        :placeholder="t('aiTagSearchPlaceholder')"
        class="tags-search"
      />
      <el-radio-group v-model="filterMode" size="small">
        <el-radio-button value="all">{{ t('aiTagFilterAll') }}</el-radio-button>
        <el-radio-button value="used">{{ t('aiTagFilterUsed') }}</el-radio-button>
        <el-radio-button value="unused">{{ t('aiTagFilterUnused') }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="tags-stats">
      <span>{{ t('aiTagTotalStats', { total: rows.length, used: usedCount, unused: unusedCount }) }}</span>
      <span class="tags-stats-gap" />
      <template v-if="selectionMode">
        <span>{{ t('aiTagSelectedCount', { count: selected.length }) }}</span>
        <el-button text size="small" type="danger" :disabled="selected.length === 0" @click="batchDelete">
          {{ t('aiTagBatchDelete') }}
        </el-button>
        <el-button text size="small" @click="exitSelection">{{ t('aiTagCancelSelection') }}</el-button>
      </template>
      <el-button v-else text size="small" :disabled="rows.length === 0" @click="selectionMode = true">
        {{ t('aiTagBatchDelete') }}
      </el-button>
    </div>

    <div v-if="loading" class="tags-empty">{{ t('aiTagLoading') }}</div>
    <div v-else-if="rows.length === 0" class="tags-empty">
      {{ t('aiTagEmpty') }}
      <div class="tags-empty-hint">{{ t('aiTagEmptyHint') }}</div>
    </div>
    <div v-else-if="filtered.length === 0" class="tags-empty">{{ t('aiTagNoMatch') }}</div>
    <div v-else class="tags-list">
      <div v-for="tag in filtered" :key="tag.id" class="tags-row">
        <el-checkbox
          v-if="selectionMode"
          :model-value="selected.includes(tag.id)"
          @change="toggleSelect(tag.id)"
        />
        <span class="tags-dot" :style="{ backgroundColor: tag.color }" />
        <template v-if="editingId === tag.id">
          <el-input v-model="editingName" size="small" class="tags-rename-input" @keyup.enter="commitRename(tag)" />
          <el-button text size="small" type="success" :loading="renaming" @click="commitRename(tag)">✓</el-button>
          <el-button text size="small" @click="cancelRename">✕</el-button>
        </template>
        <template v-else>
          <span class="tags-name">{{ tag.name }}</span>
          <el-tag size="small" :type="tag.noteCount > 0 ? 'success' : 'info'" effect="plain">
            {{ t('aiTagNoteCount', { count: tag.noteCount }) }}
          </el-tag>
          <span class="tags-spacer" />
          <el-button text size="small" @click="startRename(tag)">{{ t('rename') }}</el-button>
          <el-button text size="small" type="danger" @click="removeOne(tag)">{{ t('delete') }}</el-button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { TagRecord } from '@shared/types/domain';
import {
  cleanupUnusedTags,
  createTag,
  listTags,
  removeTag,
  removeTags,
  renameTag,
} from '@/services/ipc';
import { normalizeTagName } from '@/utils/autotag';

/** 标签管理卡（复刻 vue2 SettingsAiTagPanel）：搜索 / 已用未用过滤 / 改名 / 删除 / 批量删 / 清理未使用。 */
const { t } = useI18n();

type FilterMode = 'all' | 'used' | 'unused';

const rows = ref<TagRecord[]>([]);
const loading = ref(false);
const searchText = ref('');
const filterMode = ref<FilterMode>('all');
const editingId = ref<number | null>(null);
const editingName = ref('');
const renaming = ref(false);
const selectionMode = ref(false);
const selected = ref<number[]>([]);

const usedCount = computed(() => rows.value.filter((tag) => tag.noteCount > 0).length);
const unusedCount = computed(() => rows.value.filter((tag) => tag.noteCount <= 0).length);

const filtered = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  return rows.value.filter((tag) => {
    if (filterMode.value === 'used' && tag.noteCount <= 0) {
      return false;
    }
    if (filterMode.value === 'unused' && tag.noteCount > 0) {
      return false;
    }
    return !keyword || tag.name.toLowerCase().includes(keyword);
  });
});

onMounted(refresh);

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const result = await listTags();
    rows.value = result.ok ? result.data : [];
    selected.value = [];
    cancelRename();
  } finally {
    loading.value = false;
  }
}

function existsName(name: string, exceptId?: number): boolean {
  const key = name.trim().toLowerCase();
  return rows.value.some((tag) => tag.id !== exceptId && tag.name.toLowerCase() === key);
}

async function openCreate(): Promise<void> {
  let value = '';
  try {
    const result = await ElMessageBox.prompt(t('aiTagNamePlaceholder'), t('aiTagCreateTitle'), {
      inputPattern: /\S/,
      inputErrorMessage: t('aiTagNameRequired'),
      inputValidator: (input: string) => (normalizeTagName(input) ? true : t('aiTagNameRequired')),
    });
    value = result.value;
  } catch {
    return;
  }
  const name = normalizeTagName(value);
  if (!name) {
    ElMessage.warning(t('aiTagNameRequired'));
    return;
  }
  if (existsName(name)) {
    ElMessage.warning(t('tagExisted'));
    return;
  }
  const created = await createTag(name);
  if (!created.ok) {
    ElMessage.error(t('createTagFailed'));
    return;
  }
  await refresh();
  ElMessage.success(t('aiTagCreated', { name }));
}

function startRename(tag: TagRecord): void {
  editingId.value = tag.id;
  editingName.value = tag.name;
}

function cancelRename(): void {
  editingId.value = null;
  editingName.value = '';
}

async function commitRename(tag: TagRecord): Promise<void> {
  if (renaming.value) {
    return;
  }
  const name = normalizeTagName(editingName.value);
  if (!name) {
    ElMessage.warning(t('aiTagNameRequired'));
    return;
  }
  if (name === tag.name) {
    cancelRename();
    return;
  }
  if (existsName(name, tag.id)) {
    ElMessage.warning(t('tagExisted'));
    return;
  }
  renaming.value = true;
  try {
    const result = await renameTag(tag.id, name);
    if (!result.ok) {
      ElMessage.error(t('aiTagRenameFailed'));
      return;
    }
    if (!result.data.success) {
      ElMessage.error(result.data.code === 'TAG_DUPLICATE_NAME' ? t('tagExisted') : t('aiTagRenameFailed'));
      return;
    }
    cancelRename();
    await refresh();
    ElMessage.success(t('aiTagRenamed'));
  } finally {
    renaming.value = false;
  }
}

async function removeOne(tag: TagRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('aiTagDeleteConfirm', { name: tag.name, count: tag.noteCount }),
      t('aiTagDelete'),
      { type: 'warning' },
    );
  } catch {
    return;
  }
  const result = await removeTag(tag.id);
  if (!result.ok || !result.data.deleted) {
    ElMessage.error(t('aiTagDeleteFailed'));
    return;
  }
  await refresh();
  ElMessage.success(t('aiTagDeletedCount', { count: 1 }));
}

function toggleSelect(id: number): void {
  const index = selected.value.indexOf(id);
  if (index >= 0) {
    selected.value.splice(index, 1);
  } else {
    selected.value.push(id);
  }
}

function exitSelection(): void {
  selectionMode.value = false;
  selected.value = [];
}

async function batchDelete(): Promise<void> {
  if (selected.value.length === 0) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      t('aiTagBatchDeleteConfirm', { count: selected.value.length }),
      t('aiTagBatchDelete'),
      { type: 'warning' },
    );
  } catch {
    return;
  }
  const result = await removeTags(selected.value);
  const deleted = result.ok ? result.data.deleted : 0;
  exitSelection();
  await refresh();
  if (deleted > 0) {
    ElMessage.success(t('aiTagDeletedCount', { count: deleted }));
  } else {
    ElMessage.error(t('aiTagDeleteFailed'));
  }
}

async function cleanupUnused(): Promise<void> {
  if (unusedCount.value === 0) {
    ElMessage.info(t('aiTagCleanupNone'));
    return;
  }
  try {
    await ElMessageBox.confirm(
      t('aiTagCleanupConfirm', { count: unusedCount.value }),
      t('aiTagCleanupUnused'),
      { type: 'warning' },
    );
  } catch {
    return;
  }
  const result = await cleanupUnusedTags();
  const deleted = result.ok ? result.data.deleted : 0;
  await refresh();
  ElMessage.success(t('aiTagDeletedCount', { count: deleted }));
}
</script>

<style scoped>
.tags-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.tags-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.tags-search {
  flex: 1;
  min-width: 140px;
}

.tags-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
}

.tags-stats-gap {
  flex: 1;
}

.tags-list {
  margin-top: 4px;
}

.tags-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.tags-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tags-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tags-rename-input {
  max-width: 220px;
}

.tags-spacer {
  flex: 1;
}

.tags-empty {
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tags-empty-hint {
  margin-top: 4px;
  color: var(--el-text-color-placeholder);
}
</style>
