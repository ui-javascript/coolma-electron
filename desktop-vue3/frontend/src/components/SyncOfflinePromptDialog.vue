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
      <el-button @click="visible = false">{{ t('settings.offlineSkip') }}</el-button>
      <el-button type="primary" :disabled="summary.total === 0" @click="goSettings">
        {{ t('settings.offlineGoSettings') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 离线待同步提示（复刻 vue2 sync/syncOfflinePromptDialog 的提示语义）。
 * vue2 是「登录后发现本地有离线笔记 → 顶部卡片问要不要立即同步」；
 * vue3 还没有云同步引擎，所以「立即同步」换成了「去设置看队列」，
 * 本地待同步条数来自真实 `controller/sync/pending`。
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Cloudy, InfoFilled } from '@element-plus/icons-vue';
import { getPendingSync } from '@/services/ipc';

const visible = defineModel<boolean>({ default: false });
const { t } = useI18n();
const router = useRouter();
const summary = ref({ total: 0, create: 0, update: 0, delete: 0 });

onMounted(async () => {
  const result = await getPendingSync();
  if (result.ok) {
    summary.value = result.data.summary;
  }
});

function goSettings(): void {
  visible.value = false;
  void router.push('/settings');
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
