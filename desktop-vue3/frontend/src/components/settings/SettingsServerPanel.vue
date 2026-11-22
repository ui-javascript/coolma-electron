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
            <el-radio v-for="item in CloudSyncProviderEnum.items" :key="item.value" :value="item.value">
              {{ t(item.label) }}
            </el-radio>
          </el-radio-group>
        </div>
        <el-divider />
        <div v-if="cloudSyncProvider !== CloudSyncProviderEnum.WizNote" class="sync-state">
          <el-icon class="sync-icon"><Cloudy /></el-icon>
          <div class="sync-title">{{ t('settings.syncCustomFnNotReady') }}</div>
          <div class="field-hint">{{ t('settings.syncCustomFnNotReadyHint') }}</div>
        </div>

        <div v-else-if="!status.loggedIn" class="sync-login">
          <el-icon class="sync-icon"><Cloudy /></el-icon>
          <div class="sync-title">{{ t('settings.cloudSyncNotLoggedIn') }}</div>
          <div class="field-hint">{{ t('settings.cloudSyncNotLoggedInHint') }}</div>
          <el-button type="primary" class="sync-login-btn" @click="openLoginDialog">
            {{ t('settings.syncLogin') }}
          </el-button>
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
            <span>{{ t('settings.getPendingSync') }}: {{ syncStore.pendingTotal }}</span>
            <span>{{ t('settings.syncLastTime') }}: {{ lastSyncText }}</span>
          </div>
          <div class="sync-actions">
            <el-button
              type="primary"
              plain
              :loading="syncStore.busyKind === 'pull'"
              :disabled="busy && syncStore.busyKind !== 'pull'"
              @click="doPull"
            >{{ t('settings.syncPull') }}</el-button>
            <el-button
              type="primary"
              :loading="syncStore.busyKind === 'push'"
              :disabled="busy && syncStore.busyKind !== 'push'"
              @click="doPush"
            >{{ t('settings.syncPush') }}</el-button>
            <el-button :disabled="busy" @click="doCategories">{{ t('settings.syncCategories') }}</el-button>
            <el-button
              v-if="syncStore.conflicts.length"
              type="warning"
              plain
              :disabled="busy"
              @click="conflictVisible = true"
            >{{ t('settings.syncConflictButton', { count: syncStore.conflicts.length }) }}</el-button>
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
    <SyncConflictDialog v-model="conflictVisible" />
  </div>
</template>

<script setup lang="ts">
/**
 * 云服务设置（复刻 vue2 SettingsServerPanel）：同步策略 / 同步方式 / 图片上传服务。
 *
 * 登录、拉取、推送、目录接口都已接真实为知；本地待同步条数来自 `controller/sync/pending`。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { Cloudy } from '@element-plus/icons-vue';
import { CloudSyncProviderEnum, type CloudSyncProvider } from '@shared/enums/app';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import { useSyncStore } from '@/stores/sync';
import { getSyncCategories, getSyncStatus, syncLogout } from '@/services/sync';
import { loginDialogState, notifyLogout, openLoginDialog } from '@/services/loginDialog';
import type { SyncCategory, SyncStatus } from '@/services/sync';
import ImageUploadServiceDialog from '@/components/ImageUploadServiceDialog.vue';
import SyncConflictDialog from '@/components/SyncConflictDialog.vue';

const KEYS = {
  strategy: 'setting/server/cloudSyncStrategy',
  provider: 'setting/server/cloudSyncProvider',
  image: 'setting/server/imageUploadService',
};

const { t } = useI18n();
const appStore = useAppStore();
const notesStore = useNotesStore();
const syncStore = useSyncStore();
const subTab = ref<'sync' | 'image'>('sync');
const cloudSyncStrategy = ref('onlineFirst');
const cloudSyncProvider = ref<CloudSyncProvider>(CloudSyncProviderEnum.WizNote);
const imageUploadService = ref('none');
const imageDialogVisible = ref(false);
const conflictVisible = ref(false);
const status = ref<SyncStatus>({ baseUrl: '', kbGuid: '', kbServer: '', email: '', displayName: '', userGuid: '', loggedIn: false });
const actionBusy = ref(false);
const syncError = ref('');
const syncMessage = ref('');
const categories = ref<SyncCategory[]>([]);
const loaded = ref(false);
const busy = computed(() => syncStore.isSyncing || actionBusy.value);

function bindPrefs(): void {
  const prefs = appStore.prefs;
  cloudSyncStrategy.value = String(prefs[KEYS.strategy] ?? 'onlineFirst');
  const provider = String(prefs[KEYS.provider] ?? CloudSyncProviderEnum.WizNote);
  cloudSyncProvider.value = CloudSyncProviderEnum.has(provider)
    ? provider as CloudSyncProvider
    : CloudSyncProviderEnum.WizNote;
  imageUploadService.value = String(prefs[KEYS.image] ?? 'none');
  loaded.value = true;
}

async function loadPending(): Promise<void> {
  await syncStore.refreshPending();
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
    syncStore.setLoggedIn(result.data.loggedIn);
    if (result.data.loggedIn) await syncStore.refreshConflicts();
    syncStore.lastSyncAt = result.data.lastSyncAt;
  } else {
    syncStore.setLoggedIn(false);
  }
}

watch(
  () => loginDialogState.successTick,
  async () => {
    await refreshStatus();
    const categoryResult = await getSyncCategories();
    if (categoryResult.ok) {
      categories.value = categoryResult.data;
    }
    await notesStore.loadAll();
    await loadPending();
    syncMessage.value = t('settings.syncLoginDone');
  },
);

async function doLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('login.logoutHint'), t('login.logout'), {
      type: 'warning',
      confirmButtonText: t('login.logout'),
      cancelButtonText: t('action.cancel'),
    });
  } catch {
    return;
  }
  actionBusy.value = true;
  syncError.value = '';
  syncMessage.value = '';
  try {
    const result = await syncLogout();
    if (result.ok) {
      status.value = result.data;
      categories.value = [];
      syncStore.setLoggedIn(false);
      // 照 vue2 登出：笔记仍在本地，只是解除账号归属；列表与待同步数要重读。
      await notesStore.loadAll?.();
      await loadPending();
      notifyLogout();
    }
  } finally {
    actionBusy.value = false;
  }
}

async function afterSyncResult(conflictCount: number): Promise<void> {
  const total = await syncStore.refreshConflicts();
  if (conflictCount > 0 || total > 0) conflictVisible.value = true;
}

async function doPull(): Promise<void> {
  actionBusy.value = true;
  syncError.value = '';
  syncMessage.value = '';
  try {
    const result = await syncStore.pull();
    if (!result) {
      syncError.value = syncStore.lastError;
      return;
    }
    syncMessage.value = t('settings.syncPullDone', { imported: result.imported, skipped: result.skipped, backfilled: result.backfilled, failed: result.failed });
    await afterSyncResult(result.conflicts);
    if (result.errors.length) {
      syncError.value = result.errors.join('\n');
    }
    await refreshStatus();
  } finally {
    actionBusy.value = false;
  }
}

async function doPush(): Promise<void> {
  actionBusy.value = true;
  syncError.value = '';
  syncMessage.value = '';
  try {
    const result = await syncStore.push(50);
    if (!result) {
      syncError.value = syncStore.lastError;
      return;
    }
    syncMessage.value = t('settings.syncPushDone', { pushed: result.pushed, created: result.created, failed: result.failed });
    await afterSyncResult(result.conflicts);
    if (result.errors.length) {
      syncError.value = result.errors.join('\n');
    }
    await refreshStatus();
  } finally {
    actionBusy.value = false;
  }
}

async function doCategories(): Promise<void> {
  actionBusy.value = true;
  syncError.value = '';
  try {
    const result = await getSyncCategories();
    if (result.ok) {
      categories.value = result.data;
      await notesStore.loadAll();
    } else {
      syncError.value = result.error.message;
    }
  } finally {
    actionBusy.value = false;
  }
}

onMounted(async () => {
  await appStore.loadPrefs();
  bindPrefs();
  await refreshStatus();
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
.sync-login, .sync-logged { padding: 10px 0 4px; }
.sync-login { text-align: center; }
.sync-login-btn { margin-top: 12px; }
.sync-account { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.sync-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.sync-error { margin-top: 10px; white-space: pre-wrap; }
.sync-categories { margin: 10px 0 0; padding-left: 18px; font-size: 12px; color: var(--el-text-color-secondary); max-height: 160px; overflow-y: auto; }
.sync-stats { display: flex; justify-content: center; gap: 16px; font-size: 12px; color: var(--el-text-color-secondary); margin-top: 12px; }
</style>
