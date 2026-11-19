<template>
  <div class="settings-page">
    <header class="settings-header">
      <el-button text class="back-button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        {{ t('action.back') }}
      </el-button>
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle') }}</p>
      </div>
    </header>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.appearance') }}</span>
          <el-tag effect="plain" size="small">P1</el-tag>
        </div>
      </template>

      <el-form label-position="left" label-width="150px">
        <el-form-item :label="t('settings.theme')">
          <el-radio-group v-model="theme">
            <el-radio-button v-for="item in themeOptions" :key="item.value" :value="item.value">
              {{ t(item.label) }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="t('settings.language')">
          <el-select v-model="locale" class="locale-select">
            <el-option
              v-for="item in localeOptions"
              :key="item.value"
              :label="t(item.label)"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.data') }}</span>
          <el-button text size="small" :loading="dbLoading" :title="t('settings.dbRefresh')" @click="loadDbStatus">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </template>

      <el-descriptions v-if="dbStatus" :column="2" border>
        <el-descriptions-item :label="t('settings.dbNotes')">{{ dbStatus.noteCount }}</el-descriptions-item>
        <el-descriptions-item :label="t('settings.dbTags')">{{ dbStatus.tagCount }}</el-descriptions-item>
        <el-descriptions-item :label="t('settings.dbRunes')">{{ dbStatus.runeCount }}</el-descriptions-item>
        <el-descriptions-item :label="t('settings.dbEchoes')">{{ dbStatus.echoCount }}</el-descriptions-item>
        <el-descriptions-item :label="t('settings.schemaVersion')">{{ dbStatus.schemaVersion }}</el-descriptions-item>
        <el-descriptions-item :label="t('settings.dbSize')">{{ formatBytes(dbStatus.sizeBytes) }}</el-descriptions-item>
        <el-descriptions-item :label="t('settings.dbPath')" :span="2">
          <span class="db-path">{{ dbStatus.path }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-alert v-else type="warning" :closable="false" show-icon :title="t('settings.dbUnavailable')" />

      <div class="data-actions">
        <el-button type="primary" plain :loading="dbBusy" @click="handleImport">
          <el-icon><Upload /></el-icon>
          {{ t('settings.dbImport') }}
        </el-button>
        <el-button :loading="dbBusy" @click="handleBackup">
          <el-icon><Download /></el-icon>
          {{ t('settings.dbBackup') }}
        </el-button>
        <el-button text @click="handleOpenFolder">
          <el-icon><FolderOpened /></el-icon>
          {{ t('settings.dbOpenFolder') }}
        </el-button>
      </div>

      <div v-if="syncSummary" class="sync-queue">
        <div class="integrity-head">
          <span>{{ t('settings.syncQueue') }}</span>
          <el-tag :type="syncSummary.total > 0 ? 'warning' : 'success'" effect="light" size="small">
            {{ syncSummary.total }}
          </el-tag>
        </div>
        <p class="integrity-meta">
          {{
            t('settings.syncQueueDetail', {
              create: syncSummary.create,
              update: syncSummary.update,
              delete: syncSummary.delete,
            })
          }}
        </p>
      </div>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.integrity') }}</span>
          <div class="integrity-actions">
            <el-button text size="small" :loading="tagSyncBusy" @click="handleSyncTagIndex">
              {{ t('settings.tagSyncIndex') }}
            </el-button>
            <el-button text size="small" :loading="integrityBusy" @click="runCheck">
              {{ t('settings.integrityRun') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="!integrity"
        type="info"
        :closable="false"
        show-icon
        :title="t('settings.integrityHint')"
      />

      <template v-else>
        <div class="integrity-summary">
          <el-tag :type="integrity.healthy ? 'success' : 'warning'" effect="light" size="small">
            {{
              integrity.healthy
                ? t('settings.integrityHealthy')
                : t('settings.integrityIssues', { count: issueCount })
            }}
          </el-tag>
          <span class="integrity-meta">
            {{
              t('settings.integrityStats', {
                notes: integrity.notes,
                tags: integrity.tags,
                links: integrity.noteTagLinks,
                pending: integrity.pendingSync,
              })
            }}
          </span>
        </div>

        <ul v-if="integrity.issues.length > 0" class="integrity-list">
          <li v-for="issue in integrity.issues" :key="issue.kind">
            <div class="integrity-head">
              <span>{{ issue.label }}</span>
              <el-tag size="small" effect="plain">{{ issue.count }}</el-tag>
            </div>
            <ul class="integrity-samples">
              <li v-for="sample in issue.samples" :key="sample">{{ sample }}</li>
            </ul>
          </li>
        </ul>
        <p v-else class="integrity-meta">{{ t('settings.integrityEmpty') }}</p>
        <p class="integrity-meta">{{ t('settings.tagSyncHint') }}</p>
      </template>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.about') }}</span>
          <span class="about-version">v{{ appInfo?.version ?? '0.1.0' }}</span>
        </div>
      </template>

      <el-descriptions :column="2" border>
        <el-descriptions-item :label="t('settings.appVersion')">
          {{ appInfo?.version ?? '0.1.0' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('settings.electron')">
          {{ appInfo?.electron ?? '—' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('settings.platform')">
          {{ appInfo ? `${appInfo.platform} / ${appInfo.arch}` : '—' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('settings.ipcStatus')">
          <el-tag :type="ipcStatusType" effect="light" size="small">{{ ipcStatusLabel }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        class="security-note"
        type="info"
        :closable="false"
        show-icon
        :title="t('settings.securityNote')"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  Download,
  FolderOpened,
  Refresh,
  Upload,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AppLocaleEnum, AppThemeEnum, BootStatusEnum } from '@shared/enums/app';
import type {
  DatabaseStatus,
  IntegrityReport,
  PendingSyncSummary,
} from '@shared/types/domain';
import { useAppStore, type AppTheme } from '@/stores/app';
import type { AppLocale } from '@/i18n';
import {
  backupDatabase,
  getDatabaseStatus,
  importLegacyDatabase,
  getPendingSync,
  openDatabaseFolder,
  runDiagnostics,
  syncTagIndex,
} from '@/services/ipc';

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();

const appInfo = computed(() => appStore.appInfo);
const themeOptions = AppThemeEnum.items;
const localeOptions = AppLocaleEnum.items;

const dbStatus = ref<DatabaseStatus | null>(null);
const dbLoading = ref(false);
const dbBusy = ref(false);

const syncSummary = ref<PendingSyncSummary | null>(null);
const integrity = ref<IntegrityReport | null>(null);
const integrityBusy = ref(false);
const issueCount = computed(() =>
  (integrity.value?.issues ?? []).reduce((sum, issue) => sum + issue.count, 0),
);

const theme = computed<AppTheme>({
  get: () => appStore.theme,
  set: (value) => appStore.setTheme(value),
});

const locale = computed<AppLocale>({
  get: () => appStore.locale,
  set: (value) => appStore.setLocale(value),
});

const ipcStatusType = computed<'success' | 'danger'>(() =>
  appStore.status === BootStatusEnum.Ready ? 'success' : 'danger',
);

const ipcStatusLabel = computed(() =>
  appStore.status === BootStatusEnum.Ready ? t('settings.connected') : t('settings.disconnected'),
);

function goBack(): void {
  void router.push('/');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function loadSyncQueue(): Promise<void> {
  const result = await getPendingSync();
  syncSummary.value = result.ok ? result.data.summary : null;
}

async function loadDbStatus(): Promise<void> {
  dbLoading.value = true;
  const result = await getDatabaseStatus();
  dbLoading.value = false;
  void loadSyncQueue();
  if (result.ok) {
    dbStatus.value = result.data;
  } else {
    dbStatus.value = null;
    ElMessage.error(result.error.message);
  }
}

async function handleImport(): Promise<void> {
  dbBusy.value = true;
  const result = await importLegacyDatabase();
  dbBusy.value = false;

  if (!result.ok) {
    ElMessage.error(result.error.message);
    return;
  }

  if (!result.data) {
    ElMessage.info(t('settings.dbImportCanceled'));
    return;
  }

  ElMessage.success(t('settings.dbImportSuccess', { notes: result.data.counts.notes }));
  await loadDbStatus();
}

async function handleBackup(): Promise<void> {
  dbBusy.value = true;
  const result = await backupDatabase();
  dbBusy.value = false;

  if (result.ok) {
    ElMessage.success(t('settings.dbBackupSuccess', { path: result.data.path }));
  } else {
    ElMessage.error(result.error.message);
  }
}

const tagSyncBusy = ref(false);

/**
 * 以 notes.tags 字符串为准重建标签索引（幂等）。
 * 不做反向修复：字符串是导出与同步的依据，索引坏了重建即可。
 */
async function handleSyncTagIndex(): Promise<void> {
  tagSyncBusy.value = true;
  const result = await syncTagIndex();
  tagSyncBusy.value = false;
  if (result.ok === false) {
    ElMessage.error(result.error.message);
    return;
  }
  ElMessage.success(
    t('settings.tagSyncDone', {
      notes: result.data.notes,
      links: result.data.links,
      added: result.data.tagsAdded,
    }),
  );
  await runCheck();
}

async function runCheck(): Promise<void> {
  integrityBusy.value = true;
  const result = await runDiagnostics();
  integrityBusy.value = false;
  if (result.ok) {
    integrity.value = result.data;
  } else {
    ElMessage.error(result.error.message);
  }
}

async function handleOpenFolder(): Promise<void> {
  const result = await openDatabaseFolder();
  if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

onMounted(() => {
  void appStore.init();
  void loadDbStatus();
});

</script>
