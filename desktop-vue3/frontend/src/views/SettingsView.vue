<template>
  <div class="settings-page" @click.self="goBack">
    <div class="settings-dialog" role="dialog" aria-modal="true" :aria-label="t('settings.title')">
      <header class="settings-dialog-toolbar">
        <span class="settings-dialog-title">{{ t('settings.title') }}</span>
        <el-button text class="settings-dialog-close" :title="t('action.close')" @click="goBack">
          <el-icon><Close /></el-icon>
        </el-button>
      </header>

      <div class="settings-dialog-body">
        <aside class="settings-nav">
          <button
            v-for="item in settingsGroups"
            :key="item.value"
            type="button"
            class="settings-nav-btn"
            :class="{ active: groupTab === item.value }"
            @click="groupTab = item.value"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ t(item.label) }}</span>
          </button>
        </aside>
        <div class="settings-dialog-sep" aria-hidden="true" />
        <main class="settings-dialog-panels">
          <NoteImportDialog v-model="noteImportVisible" />

    <el-card v-if="tabMounted('general')" v-show="groupTab === 'general'" class="settings-card" shadow="never">
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

    <el-card v-if="tabMounted('general')" v-show="groupTab === 'general'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.skin') }}</span>
        </div>
      </template>
      <SkinPickerCard />
    </el-card>

    <CustomThemeCard v-if="tabMounted('general')" v-show="groupTab === 'general'" />

    <el-card v-if="tabMounted('general')" v-show="groupTab === 'general'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.cdnInjectTitle') }}</span>
        </div>
      </template>
      <SettingsCdnDepsCard />
    </el-card>

    <el-card v-if="tabMounted('general')" v-show="groupTab === 'general'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.profile') }}</span>
        </div>
      </template>
      <SettingsProfileCard />
    </el-card>

    <el-card v-if="tabMounted('server')" v-show="groupTab === 'server'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.cloudServer') }}</span>
        </div>
      </template>
      <SettingsServerPanel />
    </el-card>

    <el-card v-if="tabMounted('cloudFn')" v-show="groupTab === 'cloudFn'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.cloudFnConfig') }}</span>
        </div>
      </template>
      <SettingsCloudFnPanel />
    </el-card>

    <el-card v-if="tabMounted('editor')" v-show="groupTab === 'editor'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.editorGroup') }}</span>
        </div>
      </template>
      <EditorPrefsCard />
    </el-card>

    <el-card v-if="tabMounted('editor')" v-show="groupTab === 'editor'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('editorParsing') }}</span>
        </div>
      </template>
      <ParsingSettingsCard />
    </el-card>

    <el-card v-if="tabMounted('editor')" v-show="groupTab === 'editor'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('noteTemplate') }}</span>
        </div>
      </template>
      <NoteTemplateCard />
    </el-card>

    <el-card v-if="tabMounted('database')" v-show="groupTab === 'database'" class="settings-card" shadow="never">
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
        <el-button plain @click="noteImportVisible = true">
          <el-icon><DocumentAdd /></el-icon>
          {{ t('notes.importNotes') }}
        </el-button>
        <el-button :loading="dbBusy" @click="handleBackup">
          <el-icon><Download /></el-icon>
          {{ t('settings.dbBackup') }}
        </el-button>
        <el-button :disabled="dbBusy" @click="handleRestorePick">
          <el-icon><RefreshLeft /></el-icon>
          {{ t('settings.dbRestore') }}
        </el-button>
        <el-button text @click="handleOpenFolder">
          <el-icon><FolderOpened /></el-icon>
          {{ t('settings.dbOpenFolder') }}
        </el-button>
      </div>

      <div class="backup-list">
        <div class="integrity-head">
          <span>{{ t('settings.dbBackupList') }}</span>
          <el-button text size="small" :loading="backupBusy" @click="loadBackups">
            {{ t('settings.dbBackupRefresh') }}
          </el-button>
        </div>
        <el-table v-if="backups.length > 0" :data="backups" size="small" class="backup-table">
          <el-table-column prop="name" :label="t('settings.dbBackupName')" min-width="220" />
          <el-table-column :label="t('settings.dbBackupSize')" width="110">
            <template #default="{ row }">{{ formatBytes(row.sizeBytes) }}</template>
          </el-table-column>
          <el-table-column :label="t('settings.dbBackupTime')" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column :label="t('settings.dbBackupKind')" width="110">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ row.kind }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column width="90" align="right">
            <template #default="{ row }">
              <el-button text size="small" type="warning" :disabled="dbBusy" @click="handleRestoreRow(row)">
                {{ t('settings.dbRestore') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <p v-else class="integrity-meta">{{ t('settings.dbBackupEmpty') }}</p>
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

    <el-card v-if="tabMounted('database')" v-show="groupTab === 'database'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.localFiles') }}</span>
        </div>
      </template>
      <div class="maintenance-list">
        <div class="maintenance-row">
          <div class="maintenance-copy">
            <span class="maintenance-title">{{ t('settings.openLogFiles') }}</span>
            <span class="maintenance-hint">{{ t('settings.openLogHint') }}</span>
          </div>
          <el-button text circle :title="t('settings.openLogFiles')" @click="handleOpenLog">
            <el-icon><Document /></el-icon>
          </el-button>
        </div>
        <div class="maintenance-row">
          <div class="maintenance-copy">
            <span class="maintenance-title">{{ t('settings.openSqliteFile') }}</span>
            <span class="maintenance-hint">{{ t('settings.openSqliteHint') }}</span>
          </div>
          <el-button text circle :title="t('settings.openSqliteFile')" @click="handleOpenSqlite">
            <el-icon><Coin /></el-icon>
          </el-button>
        </div>
      </div>
    </el-card>

    <el-card v-if="tabMounted('database')" v-show="groupTab === 'database'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.resetSection') }}</span>
        </div>
      </template>
      <div class="maintenance-list">
        <div class="maintenance-row">
          <div class="maintenance-copy">
            <span class="maintenance-title">{{ t('settings.resetSqlite') }}</span>
            <span class="maintenance-hint">{{ t('settings.resetSqliteHint') }}</span>
          </div>
          <el-button class="reset-action reset-danger" plain :loading="resetBusy" @click="handleResetDatabase">
            <el-icon><Delete /></el-icon>
            {{ t('settings.resetSqlite') }}
          </el-button>
        </div>
        <div class="maintenance-row">
          <div class="maintenance-copy">
            <span class="maintenance-title">{{ t('settings.resetRunes') }}</span>
            <span class="maintenance-hint">{{ t('settings.resetRunesHint') }}</span>
          </div>
          <el-button class="reset-action reset-runes" plain :loading="resetBusy" @click="handleResetRunes">
            <el-icon><MagicStick /></el-icon>
            {{ t('settings.resetRunes') }}
          </el-button>
        </div>
        <div class="maintenance-row">
          <div class="maintenance-copy">
            <span class="maintenance-title">{{ t('settings.resetEchoes') }}</span>
            <span class="maintenance-hint">{{ t('settings.resetEchoesHint') }}</span>
          </div>
          <el-button class="reset-action reset-echoes" plain :loading="resetBusy" @click="handleResetEchoes">
            <el-icon><Bell /></el-icon>
            {{ t('settings.resetEchoes') }}
          </el-button>
        </div>
      </div>
    </el-card>

    <el-card v-if="tabMounted('database')" v-show="groupTab === 'database'" class="settings-card" shadow="never">
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

    <el-card v-if="tabMounted('library')" v-show="groupTab === 'library'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('library.management') }}</span>
        </div>
      </template>

      <el-tabs v-model="libraryTab">
        <el-tab-pane :label="t('library.runesTab')" name="runes">
          <LibraryManagePanel v-if="libraryTab === 'runes'" kind="rune" @changed="onLibraryChanged" />
        </el-tab-pane>
        <el-tab-pane :label="t('library.echoesTab')" name="echoes">
          <LibraryManagePanel v-if="libraryTab === 'echoes'" kind="echo" @changed="onLibraryChanged" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-card v-if="tabMounted('remoteComps')" v-show="groupTab === 'remoteComps'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('settings.remoteComps') }}</span>
        </div>
      </template>
      <SettingsMeltSourcesCard />
    </el-card>

    <el-card v-if="tabMounted('ai')" v-show="groupTab === 'ai'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('aiEntry') }}</span>
        </div>
      </template>
      <el-form label-width="110px" label-position="left">
        <el-form-item :label="t('aiAssistantProviderLabel')">
          <el-select v-model="aiProvider" class="ai-provider-select" @change="saveAiProvider">
            <el-option
              v-for="item in AiAssistantProviderEnum.items"
              :key="item.value"
              :label="t(item.label)"
              :value="item.value"
            />
          </el-select>
          <span class="pref-hint">{{ t('aiAssistantEntryHint') }}</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="tabMounted('ai')" v-show="groupTab === 'ai'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('aiModel') }}</span>
        </div>
      </template>
      <AiModelsCard />
    </el-card>

    <el-card v-if="tabMounted('ai')" v-show="groupTab === 'ai'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('aiSkill') }}</span>
        </div>
      </template>
      <AiSkillsCard />
    </el-card>

    <el-card v-if="tabMounted('ai')" v-show="groupTab === 'ai'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('aiTagTitle') }}</span>
        </div>
      </template>
      <TagsManageCard />
    </el-card>

    <el-card v-if="tabMounted('ai')" v-show="groupTab === 'ai'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('aiAutoTagTitle') }}</span>
        </div>
      </template>
      <AutoTagCard />
    </el-card>

    <el-card v-if="tabMounted('apps')" v-show="groupTab === 'apps'" class="settings-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('microApps.title') }}</span>
        </div>
      </template>
      <MicroAppsCard />
    </el-card>

    <el-card v-if="tabMounted('about')" v-show="groupTab === 'about'" class="settings-card" shadow="never">
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

      <div class="update-row">
        <el-button size="small" :loading="updateChecking" @click="handleCheckUpdate">
          {{ t('update.check') }}
        </el-button>
      </div>
    </el-card>

    <UpdateDialog v-model="updateVisible" />
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Bell,
  Close,
  Cloudy,
  Coin,
  Collection,
  Cpu,
  Delete,
  Document,
  DocumentAdd,
  EditPen,
  Grid,
  InfoFilled,
  MagicStick,
  Setting,
  Link,
  Download,
  FolderOpened,
  Refresh,
  RefreshLeft,
  Upload,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, markRaw, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AiAssistantProviderEnum, AppLocaleEnum, AppThemeEnum, BootStatusEnum, type AiAssistantProvider } from '@shared/enums/app';
import type {
  BackupEntry,
  DatabaseStatus,
  IntegrityReport,
  PendingSyncSummary,
} from '@shared/types/domain';
import EditorPrefsCard from '@/components/EditorPrefsCard.vue';
import NoteTemplateCard from '@/components/NoteTemplateCard.vue';
import ParsingSettingsCard from '@/components/ParsingSettingsCard.vue';
import AiModelsCard from '@/components/AiModelsCard.vue';
import AiSkillsCard from '@/components/AiSkillsCard.vue';
import TagsManageCard from '@/components/TagsManageCard.vue';
import AutoTagCard from '@/components/AutoTagCard.vue';
import SkinPickerCard from '@/components/SkinPickerCard.vue';
import CustomThemeCard from '@/components/CustomThemeCard.vue';
import MicroAppsCard from '@/components/MicroAppsCard.vue';
import { useAppStore, type AppTheme } from '@/stores/app';
import { useLibraryStore } from '@/stores/library';
import { useNotesStore } from '@/stores/notes';
import LibraryManagePanel from '@/components/LibraryManagePanel.vue';
import SettingsCdnDepsCard from '@/components/settings/SettingsCdnDepsCard.vue';
import SettingsProfileCard from '@/components/settings/SettingsProfileCard.vue';
import SettingsServerPanel from '@/components/settings/SettingsServerPanel.vue';
import SettingsCloudFnPanel from '@/components/settings/SettingsCloudFnPanel.vue';
import SettingsMeltSourcesCard from '@/components/settings/SettingsMeltSourcesCard.vue';
import NoteImportDialog from '@/components/NoteImportDialog.vue';
import UpdateDialog from '@/components/UpdateDialog.vue';
import type { AppLocale } from '@/i18n';
import {
  backupDatabase,
  getDatabaseStatus,
  importLegacyDatabase,
  getPendingSync,
  openDatabaseFolder,
  openLogFile,
  openSqliteFile,
  resetBuiltinEchoes,
  resetBuiltinRunes,
  resetDatabase,
  runDiagnostics,
  syncTagIndex,
  listBackups,
  restoreDatabase,
} from '@/services/ipc';

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const notesStore = useNotesStore();
const libraryStore = useLibraryStore();

const storedAiProvider = localStorage.getItem('coolma.aiProvider') ?? '';
const aiProvider = ref<AiAssistantProvider>(
  AiAssistantProviderEnum.has(storedAiProvider)
    ? storedAiProvider as AiAssistantProvider
    : AiAssistantProviderEnum.Builtin,
);

function saveAiProvider(value: AiAssistantProvider): void {
  localStorage.setItem('coolma.aiProvider', value);
}

const noteImportVisible = ref(false);
const updateVisible = ref(false);
const updateChecking = ref(false);
const groupTab = ref<'general' | 'editor' | 'database' | 'library' | 'ai' | 'apps' | 'server' | 'cloudFn' | 'remoteComps' | 'about'>('general');
const visitedTabs = ref(new Set<string>(['general']));
const dbLoaded = ref(false);

function tabMounted(tab: string): boolean {
  return groupTab.value === tab || visitedTabs.value.has(tab);
}

const settingsGroups = [
  { value: 'general', label: 'settings.groupGeneral', icon: markRaw(Setting) },
  { value: 'editor', label: 'settings.groupEditor', icon: markRaw(EditPen) },
  { value: 'database', label: 'settings.groupDatabase', icon: markRaw(Coin) },
  { value: 'library', label: 'settings.groupLibrary', icon: markRaw(Collection) },
  { value: 'remoteComps', label: 'settings.groupRemoteComps', icon: markRaw(Link) },
  { value: 'ai', label: 'settings.groupAi', icon: markRaw(MagicStick) },
  { value: 'apps', label: 'settings.groupApps', icon: markRaw(Grid) },
  { value: 'server', label: 'settings.groupServer', icon: markRaw(Cloudy) },
  { value: 'cloudFn', label: 'settings.groupCloudFn', icon: markRaw(Cpu) },
  { value: 'about', label: 'settings.groupAbout', icon: markRaw(InfoFilled) },
] as const;
const libraryTab = ref<'runes' | 'echoes'>('runes');

function onLibraryChanged(): void {
  // 管理面板增删改后，@ 快捷面板的缓存由 store 内部刷新，这里无需额外动作
}

const appInfo = computed(() => appStore.appInfo);
const themeOptions = AppThemeEnum.items;
const localeOptions = AppLocaleEnum.items;

const dbStatus = ref<DatabaseStatus | null>(null);
const dbLoading = ref(false);
const dbBusy = ref(false);
const resetBusy = ref(false);

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
  void router.replace('/');
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

async function handleCheckUpdate(): Promise<void> {
  updateChecking.value = true;
  const { checkUpdate } = await import('@/services/updater');
  const result = await checkUpdate();
  updateChecking.value = false;
  if (result.ok === false) {
    ElMessage.warning(result.error.message);
  }
  updateVisible.value = true;
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
    await loadBackups();
  } else {
    ElMessage.error(result.error.message);
  }
}

const backupBusy = ref(false);
const backups = ref<BackupEntry[]>([]);

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

async function loadBackups(): Promise<void> {
  backupBusy.value = true;
  const result = await listBackups();
  backupBusy.value = false;
  if (result.ok === false) {
    ElMessage.error(result.error.message);
    return;
  }
  backups.value = result.data;
}

/** 恢复是不可逆操作（有回滚点兜底），必须让用户确认一次。 */
async function confirmAndRestore(path: string | undefined, label: string): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    t('settings.dbRestoreConfirm', { name: label }),
    t('settings.dbRestore'),
    { type: 'warning', confirmButtonText: t('settings.dbRestoreConfirmOk'), cancelButtonText: t('settings.dbRestoreConfirmCancel') },
  ).catch(() => false);
  if (confirmed === false) {
    return;
  }
  dbBusy.value = true;
  const result = await restoreDatabase(path);
  dbBusy.value = false;
  if (result.ok === false) {
    ElMessage.error(result.error.message);
    return;
  }
  if (result.data === null) {
    return;
  }
  ElMessage.success(
    t('settings.dbRestoreSuccess', {
      notes: result.data.counts,
      schema: result.data.schemaVersion,
    }),
  );
  await Promise.all([loadDbStatus(), loadBackups(), runCheck()]);
}

async function handleRestorePick(): Promise<void> {
  await confirmAndRestore(undefined, t('settings.dbRestorePickLabel'));
}

async function handleRestoreRow(row: BackupEntry): Promise<void> {
  await confirmAndRestore(row.path, row.name);
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

async function handleOpenLog(): Promise<void> {
  const result = await openLogFile();
  if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

async function handleOpenSqlite(): Promise<void> {
  const result = await openSqliteFile();
  if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

/** 二次确认的公共壳，取消返回 false，避免每处写一遍 catch。 */
async function confirmReset(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: t('action.confirm'),
      cancelButtonText: t('action.cancel'),
      type: 'warning',
    });
    return true;
  } catch {
    return false;
  }
}

async function handleResetDatabase(): Promise<void> {
  if (!(await confirmReset(t('settings.resetSqliteConfirm'), t('settings.resetSqlite')))) {
    return;
  }
  resetBusy.value = true;
  const result = await resetDatabase();
  resetBusy.value = false;
  if (result.ok && result.data.success) {
    ElMessage.success(t('settings.resetSqliteSuccess'));
    await Promise.all([loadDbStatus(), notesStore.refresh(), libraryStore.load(true)]);
  } else {
    ElMessage.error(result.ok ? t('settings.resetSqliteFailed') : result.error.message);
  }
}

async function handleResetRunes(): Promise<void> {
  if (!(await confirmReset(t('settings.resetRunesConfirm'), t('settings.resetRunes')))) {
    return;
  }
  resetBusy.value = true;
  const result = await resetBuiltinRunes();
  resetBusy.value = false;
  if (result.ok && result.data.success) {
    ElMessage.success(
      t('settings.resetRunesSuccess', { count: result.data.count, custom: result.data.customKept }),
    );
    await libraryStore.load(true);
  } else {
    ElMessage.error(result.ok ? t('settings.resetRunesFailed') : result.error.message);
  }
}

async function handleResetEchoes(): Promise<void> {
  if (!(await confirmReset(t('settings.resetEchoesConfirm'), t('settings.resetEchoes')))) {
    return;
  }
  resetBusy.value = true;
  const result = await resetBuiltinEchoes();
  resetBusy.value = false;
  if (result.ok && result.data.success) {
    ElMessage.success(
      t('settings.resetEchoesSuccess', { count: result.data.count, custom: result.data.customKept }),
    );
    await libraryStore.load(true);
  } else {
    ElMessage.error(result.ok ? t('settings.resetEchoesFailed') : result.error.message);
  }
}

watch(groupTab, (tab) => {
  visitedTabs.value.add(tab);
  if (tab === 'database' && !dbLoaded.value) {
    dbLoaded.value = true;
    void loadBackups();
    void loadDbStatus();
  }
});

onMounted(() => {
  void appStore.init();
  if (!appStore.prefsLoaded) {
    void appStore.loadPrefs();
  }
});

</script>
