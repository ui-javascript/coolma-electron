<template>
  <div class="server-panel">
    <el-tabs v-model="subTab">
      <el-tab-pane :label="t('settings.serverSync')" name="sync">
        <div class="field-block">
          <div class="field-title">{{ t('settings.cloudSyncStrategy') }}</div>
          <div class="field-hint">{{ t('settings.cloudSyncStrategyHint') }}</div>
          <el-radio-group v-model="cloudSyncStrategy">
            <el-radio value="pureOnline">{{ t('settings.strategyPureOnline') }}</el-radio>
            <el-radio value="onlineFirst">{{ t('settings.strategyOnlineFirst') }}</el-radio>
            <el-radio value="offlineFirst">{{ t('settings.strategyOfflineFirst') }}</el-radio>
          </el-radio-group>
        </div>
        <el-divider />
        <div class="field-block">
          <div class="field-title">{{ t('settings.cloudSyncProvider') }}</div>
          <div class="field-hint">{{ t('settings.cloudSyncProviderHint') }}</div>
          <el-radio-group v-model="cloudSyncProvider">
            <el-radio value="wiznote">{{ t('settings.providerWiznote') }}</el-radio>
            <el-radio value="customFn">{{ t('settings.providerCustomFn') }}</el-radio>
          </el-radio-group>
        </div>
        <el-divider />
        <div class="sync-state">
          <el-icon class="sync-icon"><Cloudy /></el-icon>
          <div class="sync-title">{{ t('settings.cloudSyncNotLoggedIn') }}</div>
          <div class="field-hint">{{ t('settings.cloudSyncNotLoggedInHint') }}</div>
          <div class="sync-stats">
            <span>{{ t('settings.getPendingSync') }}: {{ pending }}</span>
            <span>{{ t('settings.syncStatus') }}: {{ t('settings.never') }}</span>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane :label="t('settings.serverImage')" name="image">
        <div class="field-block">
          <div class="field-title">{{ t('settings.imageUploadService') }}</div>
          <el-select v-model="imageUploadService" class="service-select">
            <el-option value="wizOfficialImageUploadService" :label="t('settings.imageServiceWiz')" />
            <el-option value="picgoServer" :label="t('settings.imageServicePicgo')" />
            <el-option value="none" :label="t('settings.imageServiceNone')" />
          </el-select>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
/**
 * 云服务设置（复刻 vue2 SettingsServerPanel）：同步策略 / 同步方式 / 图片上传服务。
 *
 * 如实报备：vue3 主进程还没有云同步引擎（只有 `controller/sync/pending` 本地队列快照），
 * 所以这里不画「已登录、上次同步、推送/拉取」的假界面；只保留策略选择 + 未登录说明 +
 * 本地待同步条数（pending 是真实数据）。
 */
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Cloudy } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';
import { getPendingSync } from '@/services/ipc';

const KEYS = {
  strategy: 'setting/server/cloudSyncStrategy',
  provider: 'setting/server/cloudSyncProvider',
  image: 'setting/server/imageUploadService',
};

const { t } = useI18n();
const appStore = useAppStore();
const subTab = ref<'sync' | 'image'>('sync');
const cloudSyncStrategy = ref('onlineFirst');
const cloudSyncProvider = ref('wiznote');
const imageUploadService = ref('none');
const pending = ref(0);
const loaded = ref(false);

function bindPrefs(): void {
  const prefs = appStore.prefs;
  cloudSyncStrategy.value = String(prefs[KEYS.strategy] ?? 'onlineFirst');
  cloudSyncProvider.value = String(prefs[KEYS.provider] ?? 'wiznote');
  imageUploadService.value = String(prefs[KEYS.image] ?? 'none');
  loaded.value = true;
}

async function loadPending(): Promise<void> {
  const result = await getPendingSync();
  if (result.ok) {
    pending.value = result.data.summary.total ?? 0;
  }
}

watch(cloudSyncStrategy, (value) => loaded.value && void appStore.setPref(KEYS.strategy, value));
watch(cloudSyncProvider, (value) => loaded.value && void appStore.setPref(KEYS.provider, value));
watch(imageUploadService, (value) => loaded.value && void appStore.setPref(KEYS.image, value));

onMounted(async () => {
  await appStore.loadPrefs();
  bindPrefs();
  await loadPending();
});
</script>

<style scoped>
.field-block { padding: 4px 0 8px; }
.field-title { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
.field-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.service-select { width: 260px; }
.sync-state { text-align: center; padding: 24px 0; }
.sync-icon { font-size: 32px; color: var(--el-text-color-secondary); }
.sync-title { font-size: 14px; font-weight: 600; margin: 8px 0 4px; }
.sync-stats { display: flex; justify-content: center; gap: 16px; font-size: 12px; color: var(--el-text-color-secondary); margin-top: 12px; }
</style>
