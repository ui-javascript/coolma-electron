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
        <div v-if="cloudSyncProvider !== 'wiznote'" class="sync-state">
          <el-icon class="sync-icon"><Cloudy /></el-icon>
          <div class="sync-title">{{ t('settings.syncCustomFnNotReady') }}</div>
          <div class="field-hint">{{ t('settings.syncCustomFnNotReadyHint') }}</div>
        </div>

        <div v-else-if="!status.loggedIn" class="sync-login">
          <div class="sync-title">{{ t('settings.cloudSyncNotLoggedIn') }}</div>
          <div class="field-hint">{{ t('settings.cloudSyncNotLoggedInHint') }}</div>
          <el-form label-width="86px" class="sync-form">
            <el-form-item label="账号">
              <el-input v-model="loginForm.userId" spellcheck="false" autocomplete="username" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="loginForm.password" type="password" show-password autocomplete="current-password" />
            </el-form-item>
            <el-form-item :label="t('settings.syncServerUrl')">
              <el-input v-model="loginForm.baseUrl" placeholder="https://as.wiz.cn" spellcheck="false" />
            </el-form-item>
            <el-form-item label="">
              <el-checkbox v-model="loginForm.rememberPassword">{{ t('settings.syncRememberPassword') }}</el-checkbox>
            </el-form-item>
          </el-form>
          <el-alert v-if="syncError" type="error" :closable="false" :title="syncError" class="sync-error" />
          <el-button type="primary" :loading="busy" @click="doLogin">{{ t('settings.syncLogin') }}</el-button>
        </div>

        <div v-else class="sync-logged">
          <div class="sync-account">
            <div>
              <div class="sync-title">{{ status.displayName || status.email || status.kbGuid }}</div>
              <div class="field-hint">{{ status.kbServer }}</div>
            </div>
            <el-button text type="danger" :disabled="busy" @click="doLogout">{{ t('settings.syncLogout') }}</el-button>
          </div>
          <div class="sync-stats">
            <span>{{ t('settings.getPendingSync') }}: {{ pending }}</span>
            <span>{{ t('settings.syncLastTime') }}: {{ lastSyncText }}</span>
          </div>
          <div class="sync-actions">
            <el-button type="primary" plain :loading="busy" @click="doPull">{{ t('settings.syncPull') }}</el-button>
            <el-button type="primary" :loading="busy" @click="doPush">{{ t('settings.syncPush') }}</el-button>
            <el-button :disabled="busy" @click="doCategories">{{ t('settings.syncCategories') }}</el-button>
          </div>
          <el-alert v-if="syncError" type="error" :closable="false" :title="syncError" class="sync-error" />
          <el-alert v-if="syncMessage" type="success" :closable="false" :title="syncMessage" class="sync-error" />
          <ul v-if="categories.length" class="sync-categories">
            <li v-for="item in categories.slice(0, 20)" :key="item.category">{{ item.category }}</li>
          </ul>
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
          <div class="image-actions">
            <el-button size="small" plain @click="imageDialogVisible = true">{{ t('settings.imageConfigure') }}</el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
    <ImageUploadServiceDialog v-model="imageDialogVisible" />
    <SyncOfflinePromptDialog v-model="offlineVisible" @synced="loadPending" />
  </div>
</template>

<script setup lang="ts">
/**
 * 云服务设置（复刻 vue2 SettingsServerPanel）：同步策略 / 同步方式 / 图片上传服务。
 *
 * 登录、拉取、推送、目录接口都已接真实为知；本地待同步条数来自 `controller/sync/pending`。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Cloudy } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import { getPendingSync } from '@/services/ipc';
import { getSyncCategories, getSyncStatus, syncLogin, syncLogout, syncPull, syncPush } from '@/services/sync';
import type { SyncCategory, SyncStatus } from '@/services/sync';
import ImageUploadServiceDialog from '@/components/ImageUploadServiceDialog.vue';
import SyncOfflinePromptDialog from '@/components/SyncOfflinePromptDialog.vue';

const KEYS = {
  strategy: 'setting/server/cloudSyncStrategy',
  provider: 'setting/server/cloudSyncProvider',
  image: 'setting/server/imageUploadService',
};

const { t } = useI18n();
const appStore = useAppStore();
const notesStore = useNotesStore();
const subTab = ref<'sync' | 'image'>('sync');
const cloudSyncStrategy = ref('onlineFirst');
const cloudSyncProvider = ref('wiznote');
const imageUploadService = ref('none');
const pending = ref(0);
const imageDialogVisible = ref(false);
const offlineVisible = ref(false);
const status = ref<SyncStatus>({ baseUrl: '', kbGuid: '', kbServer: '', email: '', displayName: '', userGuid: '', loggedIn: false });
const loginForm = reactive({ userId: '', password: '', baseUrl: 'https://as.wiz.cn', rememberPassword: false });
const busy = ref(false);
const syncError = ref('');
const syncMessage = ref('');
const categories = ref<SyncCategory[]>([]);
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

const lastSyncText = computed(() => {
  if (!status.value.lastSyncAt) {
    return t('settings.never');
  }
  return new Date(status.value.lastSyncAt).toLocaleString();
});

async function refreshStatus(): Promise<void> {
  const result = await getSyncStatus();
  if (result.ok) {
    status.value = result.data;
  }
}

async function doLogin(): Promise<void> {
  if (!loginForm.userId || !loginForm.password) {
    syncError.value = t('settings.syncNeedCredentials');
    return;
  }
  busy.value = true;
  syncError.value = '';
  syncMessage.value = '';
  try {
    const result = await syncLogin({ ...loginForm });
    if (!result.ok) {
      syncError.value = result.error.message;
      return;
    }
    status.value = result.data;
    syncMessage.value = t('settings.syncLoginDone');
    // 照 vue2 登录后动作：拉云端目录、刷新本地笔记列表，再看待推队列。
    const categoryResult = await getSyncCategories();
    if (categoryResult.ok) {
      categories.value = categoryResult.data;
    }
    await notesStore.loadAll?.();
    await loadPending();
    // 对齐 vue2：登录成功后本地若还有待推队列，立刻弹「立即同步」。
    if (pending.value > 0) {
      offlineVisible.value = true;
    }
  } finally {
    busy.value = false;
  }
}

async function doLogout(): Promise<void> {
  busy.value = true;
  syncError.value = '';
  syncMessage.value = '';
  try {
    const result = await syncLogout();
    if (result.ok) {
      status.value = result.data;
      categories.value = [];
      // 照 vue2 登出：笔记仍在本地，只是解除账号归属；列表与待同步数要重读。
      await notesStore.loadAll?.();
      await loadPending();
      offlineVisible.value = false;
    }
  } finally {
    busy.value = false;
  }
}

async function doPull(): Promise<void> {
  busy.value = true;
  syncError.value = '';
  syncMessage.value = '';
  try {
    const result = await syncPull();
    if (!result.ok) {
      syncError.value = result.error.message;
      return;
    }
    syncMessage.value = t('settings.syncPullDone', { imported: result.data.imported, skipped: result.data.skipped, backfilled: result.data.backfilled, failed: result.data.failed });
    if (result.data.errors.length) {
      syncError.value = result.data.errors.join('\n');
    }
    await refreshStatus();
    await loadPending();
    await notesStore.loadAll?.();
  } finally {
    busy.value = false;
  }
}

async function doPush(): Promise<void> {
  busy.value = true;
  syncError.value = '';
  syncMessage.value = '';
  try {
    const result = await syncPush({ limit: 50 });
    if (!result.ok) {
      syncError.value = result.error.message;
      return;
    }
    syncMessage.value = t('settings.syncPushDone', { pushed: result.data.pushed, created: result.data.created, failed: result.data.failed });
    if (result.data.errors.length) {
      syncError.value = result.data.errors.join('\n');
    }
    await refreshStatus();
    await loadPending();
  } finally {
    busy.value = false;
  }
}

async function doCategories(): Promise<void> {
  busy.value = true;
  syncError.value = '';
  try {
    const result = await getSyncCategories();
    if (result.ok) {
      categories.value = result.data;
    } else {
      syncError.value = result.error.message;
    }
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await appStore.loadPrefs();
  bindPrefs();
  await loadPending();
  await refreshStatus();
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
.sync-login, .sync-logged { padding: 10px 0 4px; }
.sync-form { max-width: 420px; margin: 10px auto 6px; }
.sync-account { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.sync-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.sync-error { margin-top: 10px; white-space: pre-wrap; }
.sync-categories { margin: 10px 0 0; padding-left: 18px; font-size: 12px; color: var(--el-text-color-secondary); max-height: 160px; overflow-y: auto; }
.sync-stats { display: flex; justify-content: center; gap: 16px; font-size: 12px; color: var(--el-text-color-secondary); margin-top: 12px; }
</style>
