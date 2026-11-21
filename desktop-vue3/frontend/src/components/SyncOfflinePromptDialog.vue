<template>
  <el-dialog
    v-model="visible"
    width="520px"
    top="24px"
    append-to-body
    class="offline-sync-dialog"
  >
    <template #header>
      <div class="offline-sync-header">
        <el-icon class="offline-sync-header-icon"><Cloudy /></el-icon>
        <div class="offline-sync-header-text">
          <div class="offline-sync-title">{{ t('settings.offlineFound') }}</div>
          <div class="offline-sync-sub">{{ t('settings.offlineFoundHint', { count: summary.total }) }}</div>
        </div>
      </div>
    </template>

    <div v-if="summary.total > 0" class="offline-sync-preview">
      <div class="offline-preview-list">
        <div v-for="note in previewNotes" :key="note.key" class="offline-preview-item">
          <el-icon class="offline-preview-icon"><Document /></el-icon>
          <span class="offline-preview-title">{{ note.title }}</span>
          <el-icon class="offline-preview-folder"><Folder /></el-icon>
          <span class="offline-preview-category">{{ note.category }}</span>
        </div>
        <div v-if="remaining > 0" class="offline-preview-more">
          {{ t('settings.offlineMore', { count: remaining }) }}
        </div>
      </div>
    </div>

    <div class="offline-sync-rule">
      <div class="offline-rule-header">
        <el-icon class="offline-rule-icon"><InfoFilled /></el-icon>
        <span>{{ t('settings.offlineMergeTitle') }}</span>
      </div>
      <div class="offline-rule-content">{{ t('settings.offlineMergeLocal') }}</div>
    </div>

    <template #footer>
      <div class="offline-sync-actions">
        <el-button text :disabled="busy" @click="visible = false">{{ t('settings.offlineSkip') }}</el-button>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="summary.total === 0 || busy"
          @click="syncNow"
        >
          <el-icon v-if="!busy" class="offline-sync-button-icon"><UploadFilled /></el-icon>
          {{ busy ? t('settings.offlineSyncing') : t('settings.offlineSyncNow') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 离线待同步提示（复刻 vue2 sync/syncOfflinePromptDialog 的提示语义）。
 * vue2 是「登录后发现本地有离线笔记 → 顶部卡片问要不要立即同步」；这里「立即同步」
 * 直接调 v3 推送引擎，按 500 一批把队列推空，不再绕去设置页。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Cloudy, Document, Folder, InfoFilled, UploadFilled } from '@element-plus/icons-vue';
import type { SyncLogEntry } from '@shared/types/domain';
import { getPendingSync } from '@/services/ipc';
import { syncPush } from '@/services/sync';
import { useNotesStore } from '@/stores/notes';
import { folderName } from '@/utils/note';

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (event: 'synced'): void }>();
const { t } = useI18n();
const notesStore = useNotesStore();
const summary = ref({ total: 0, create: 0, update: 0, delete: 0 });
const items = ref<SyncLogEntry[]>([]);
const busy = ref(false);

const previewNotes = computed(() =>
  items.value.slice(0, 5).map((item) => {
    const note = item.noteId == null
      ? null
      : notesStore.notes.find((candidate) => candidate.id === item.noteId) ?? null;
    return {
      key: item.id,
      title: note?.title || `#${item.noteId ?? '?'}`,
      category: folderName(note?.category || '/', t('notes.rootFolder')),
    };
  }),
);
const remaining = computed(() => Math.max(0, summary.value.total - previewNotes.value.length));

async function loadSummary(): Promise<void> {
  const result = await getPendingSync();
  if (result.ok) {
    summary.value = result.data.summary;
    items.value = result.data.items;
  }
}

onMounted(loadSummary);

watch(
  () => visible.value,
  (open) => {
    if (open) {
      void loadSummary();
    }
  },
);

async function syncNow(): Promise<void> {
  if (busy.value) {
    return;
  }
  busy.value = true;
  let pushed = 0;
  let created = 0;
  let failed = 0;
  const errors: string[] = [];
  try {
    // 单次 IPC 上限 500；循环到队列为空，推不动的条目立刻停，避免原地打转。
    for (let round = 0; round < 20; round += 1) {
      const result = await syncPush({ limit: 500 });
      if (result.ok === false) {
        throw new Error(result.error.message);
      }
      const progressed = result.data.pushed + result.data.created + (result.data.deleted ?? 0);
      pushed += result.data.pushed;
      created += result.data.created;
      failed = Math.max(failed, result.data.failed);
      errors.push(...result.data.errors);
      await loadSummary();
      if (summary.value.total === 0 || progressed === 0) {
        break;
      }
    }
    emit('synced');
    if (summary.value.total === 0) {
      ElMessage.success(t('settings.offlineSyncDone', { pushed, created, failed }));
      visible.value = false;
    } else {
      ElMessage.warning(
        t('settings.offlineSyncPartial', { rest: summary.value.total, failed: failed || errors.length }),
      );
    }
  } catch (error) {
    ElMessage.error(t('settings.offlineSyncFailed', { message: (error as Error).message }));
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.offline-sync-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-bottom: 1px solid #90caf9;
}

.offline-sync-header-icon {
  flex: none;
  color: var(--el-color-primary);
  font-size: 28px;
}

.offline-sync-header-text {
  min-width: 0;
}

.offline-sync-title {
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.offline-sync-sub {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.offline-sync-preview {
  padding: 12px 16px;
}

.offline-preview-list {
  max-height: 200px;
  overflow-y: auto;
}

.offline-preview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.offline-preview-item:hover {
  background: var(--el-fill-color-light);
}

.offline-preview-icon,
.offline-preview-folder {
  flex: none;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.offline-preview-title {
  flex: 1;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-preview-category {
  max-width: 80px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-preview-more {
  padding: 6px 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;
}

.offline-sync-rule {
  padding: 10px 16px;
  background: var(--el-fill-color-lighter, #fafafa);
  border-top: 1px solid var(--el-border-color-lighter, #eee);
  border-bottom: 1px solid var(--el-border-color-lighter, #eee);
}

.offline-rule-header {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.offline-rule-icon {
  color: var(--el-color-info);
  font-size: 16px;
}

.offline-rule-content {
  padding-left: 20px;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.offline-sync-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.offline-sync-button-icon {
  margin-right: 4px;
}
</style>
