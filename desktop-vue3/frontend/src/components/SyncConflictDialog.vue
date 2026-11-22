<template>
  <el-dialog v-model="visible" width="760px" top="8vh" append-to-body class="sync-conflict-dialog">
    <template #header>
      <div class="conflict-head">
        <span class="conflict-title">{{ t('settings.syncConflictTitle') }}</span>
        <span class="conflict-count">{{ syncStore.conflicts.length }}</span>
      </div>
    </template>

    <div class="conflict-hint">{{ t('settings.syncConflictHint') }}</div>

    <div v-if="!syncStore.conflicts.length" class="conflict-empty">{{ t('settings.syncConflictEmpty') }}</div>

    <template v-else>
      <div class="conflict-toolbar">
        <el-checkbox :model-value="allSelected" :indeterminate="someSelected" @change="toggleAll">
          {{ t('settings.syncConflictSelectAll') }}
        </el-checkbox>
        <div class="conflict-toolbar-actions">
          <el-button size="small" :disabled="!selected.size" @click="applySelected('local')">
            {{ t('settings.syncConflictKeepLocal') }}
          </el-button>
          <el-button size="small" type="primary" :disabled="!selected.size" @click="applySelected('remote')">
            {{ t('settings.syncConflictUseRemote') }}
          </el-button>
          <el-button size="small" :disabled="!selected.size" @click="applySelected('skip')">
            {{ t('settings.syncConflictSkip') }}
          </el-button>
        </div>
      </div>

      <div class="conflict-list">
        <div v-for="item in syncStore.conflicts" :key="item.noteId" class="conflict-item">
          <div class="conflict-item-head">
            <el-checkbox :model-value="selected.has(item.noteId)" @change="toggleOne(item.noteId)" />
            <span class="conflict-item-title">{{ item.localTitle || item.title || `#${item.noteId}` }}</span>
            <el-tag size="small" effect="plain">
              {{ item.direction === 'pull' ? t('settings.syncConflictDirectionPull') : t('settings.syncConflictDirectionPush') }}
            </el-tag>
          </div>
          <div class="conflict-columns">
            <div class="conflict-col">
              <div class="conflict-col-label">{{ t('settings.syncConflictLocal') }}</div>
              <pre class="conflict-pre">{{ item.localContent }}</pre>
            </div>
            <div class="conflict-col">
              <div class="conflict-col-label">{{ t('settings.syncConflictRemote') }}</div>
              <pre class="conflict-pre">{{ item.remoteContent }}</pre>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="conflict-footer">
        <span v-if="message" class="conflict-message">{{ message }}</span>
        <el-button @click="visible = false">{{ t('action.close') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSyncStore } from '@/stores/sync';
import type { SyncConflictResolution } from '@shared/types/domain';

const visible = defineModel<boolean>({ default: false });
const { t } = useI18n();
const syncStore = useSyncStore();
const selected = ref<Set<number>>(new Set());
const message = ref('');

const allSelected = computed(
  () => syncStore.conflicts.length > 0 && selected.value.size === syncStore.conflicts.length,
);
const someSelected = computed(
  () => selected.value.size > 0 && selected.value.size < syncStore.conflicts.length,
);

watch(visible, async (open) => {
  if (!open) return;
  message.value = '';
  selected.value = new Set();
  await syncStore.refreshConflicts();
});

function toggleAll(value: boolean | string | number): void {
  selected.value = value ? new Set(syncStore.conflicts.map((item) => item.noteId)) : new Set();
}

function toggleOne(noteId: number): void {
  const next = new Set(selected.value);
  if (next.has(noteId)) next.delete(noteId);
  else next.add(noteId);
  selected.value = next;
}

async function apply(resolutions: Array<{ noteId: number; resolution: SyncConflictResolution }>): Promise<void> {
  const remaining = await syncStore.resolveConflicts(resolutions);
  message.value = t('settings.syncConflictDone', { resolved: resolutions.length, remaining });
  selected.value = new Set([...selected.value].filter((id) => syncStore.conflicts.some((item) => item.noteId === id)));
}

function applySelected(resolution: SyncConflictResolution): void {
  const resolutions = [...selected.value].map((noteId) => ({ noteId, resolution }));
  if (resolutions.length) void apply(resolutions);
}
</script>

<style scoped>
.conflict-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.conflict-title {
  font-size: 15px;
  font-weight: 600;
}
.conflict-count {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--el-fill-color);
  font-size: 12px;
}
.conflict-hint {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.conflict-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.conflict-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.conflict-toolbar-actions {
  display: flex;
  gap: 8px;
}
.conflict-list {
  max-height: 56vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.conflict-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
}
.conflict-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.conflict-item-title {
  flex: 1;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conflict-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}
.conflict-col-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.conflict-pre {
  margin: 0;
  padding: 6px 8px;
  max-height: 140px;
  overflow: auto;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.conflict-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.conflict-message {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
