<template>
  <el-dialog v-model="visible" :title="t('settings.offlineFound')" width="440px" append-to-body>
    <div class="offline-body">
      <div class="offline-head">
        <el-icon class="offline-icon"><Cloudy /></el-icon>
        <div>
          <div class="offline-title">{{ t('settings.offlineFoundHint', { count: summary.total }) }}</div>
          <div class="offline-sub">{{ t('settings.offlineDetail', { create: summary.create, update: summary.update, delete: summary.delete }) }}</div>
        </div>
      </div>
      <div class="offline-rule">
        <el-icon><InfoFilled /></el-icon>
        <span>{{ t('settings.offlineMergeRule') }}</span>
      </div>
    </div>
    <template #footer>
      <el-button :disabled="busy" @click="visible = false">{{ t('settings.offlineSkip') }}</el-button>
      <el-button type="primary" :loading="busy" :disabled="summary.total === 0 || busy" @click="syncNow">
        {{ busy ? t('settings.offlineSyncing') : t('settings.offlineSyncNow') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 离线待同步提示（复刻 vue2 sync/syncOfflinePromptDialog 的提示语义）。
 * vue2 是「登录后发现本地有离线笔记 → 顶部卡片问要不要立即同步」；这里「立即同步」
 * 直接调 v3 推送引擎，按 500 一批把队列推空，不再绕去设置页。
 */
import { ElMessage } from 'element-plus';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Cloudy, InfoFilled } from '@element-plus/icons-vue';
import { getPendingSync } from '@/services/ipc';
import { syncPush } from '@/services/sync';

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (event: 'synced'): void }>();
const { t } = useI18n();
const summary = ref({ total: 0, create: 0, update: 0, delete: 0 });
const busy = ref(false);

async function loadSummary(): Promise<void> {
  const result = await getPendingSync();
  if (result.ok) {
    summary.value = result.data.summary;
  }
}

onMounted(loadSummary);

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
.offline-body { display: flex; flex-direction: column; gap: 12px; }
.offline-head { display: flex; align-items: center; gap: 10px; }
.offline-icon { font-size: 28px; color: var(--el-color-primary); }
.offline-title { font-size: 14px; font-weight: 600; }
.offline-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.offline-rule { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-text-color-secondary); padding: 8px; border-radius: 6px; background: var(--el-fill-color-light, #f5f7fa); }
</style>
