<template>
  <a-config-provider :locale="antdLocale" :theme="antdThemeConfig">
    <div class="app-frame" :class="{ 'has-window-controls': hasControls }">
      <router-view />
      <WindowControls :skin="appStore.skin" />
      <LoginDialog
        v-model="loginDialogState.visible"
        @success="notifyLoginSuccess"
        @skip="closeLoginDialog"
      />
      <UpdateDialog v-model="updateVisible" />
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import WindowControls from '@/components/WindowControls.vue';
import LoginDialog from '@/components/LoginDialog.vue';
import UpdateDialog from '@/components/UpdateDialog.vue';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import { useSyncStore } from '@/stores/sync';
import { hasIpc, getWindowState } from '@/services/ipc';
import antdZhCN from 'ant-design-vue/es/locale/zh_CN';
import { theme as antdTheme } from 'ant-design-vue';
import { useQuasar } from 'quasar';
import { AppThemeEnum } from '@shared/enums/app';
import { installBusDialogs } from '@/services/busDialogEntries';
import { closeLoginDialog, loginDialogState, notifyLoginSuccess } from '@/services/loginDialog';
import { getSyncStatus, syncAutoLogin } from '@/services/sync';
import { checkUpdate, downloadUpdate, onUpdaterEvent } from '@/services/updater';
import { loadCdnDeps } from '@/utils/cdnDeps';

const hasControls = hasIpc();
const antdLocale = antdZhCN;
const appStore = useAppStore();
const antdThemeConfig = computed(() => ({
  algorithm: appStore.theme === AppThemeEnum.Dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
}));
const $q = useQuasar();
// Quasar 组件靠 body--dark 走暗色变量；应用主题在 html 上，必须同步过去。
watch(
  () => appStore.theme,
  (theme) => $q.dark.set(theme === AppThemeEnum.Dark),
  { immediate: true },
);
const notesStore = useNotesStore();
const syncStore = useSyncStore();
const router = useRouter();
const { t } = useI18n();
const updateVisible = ref(false);
let updatePrompted = false;
let windowFrameTimer: ReturnType<typeof setTimeout> | undefined;

/** 无边框窗口：标记 body，并跟随最大化状态切换边缘安全区。 */
async function syncWindowFrame(): Promise<void> {
  const result = await getWindowState();
  if (result.ok) {
    document.body.classList.toggle('is-maximized', result.data.maximized);
  }
}

function scheduleWindowFrame(): void {
  if (windowFrameTimer) {
    clearTimeout(windowFrameTimer);
  }
  windowFrameTimer = setTimeout(() => {
    void syncWindowFrame();
  }, 80);
}

function updaterVersion(info: unknown): string {
  if (info && typeof info === 'object' && 'version' in info) {
    return String((info as { version?: unknown }).version || '');
  }
  return '';
}

/**
 * 启动自动检查（对齐 vue2 App.vue 的 checkUpdate）。
 * 开发模式 / 未配 publish 源的错误不打扰用户；手动检查仍在设置页暴露原文。
 */
async function bootstrapUpdate(): Promise<void> {
  await checkUpdate();
}

/** 发现新版本：先确认，再打开全局进度弹窗并开始下载；设置页手动检查不重复弹。 */
async function promptUpdate(info: unknown): Promise<void> {
  if (updatePrompted || router.currentRoute.value.path === '/settings') {
    return;
  }
  updatePrompted = true;
  const version = updaterVersion(info);
  try {
    await ElMessageBox.confirm(
      version
        ? t('update.autoPrompt', { version })
        : t('update.autoPromptNoVersion'),
      t('update.title'),
      {
        type: 'info',
        confirmButtonText: t('update.download'),
        cancelButtonText: t('update.later'),
      },
    );
  } catch {
    return;
  }

  updateVisible.value = true;
  const result = await downloadUpdate();
  if (result.ok === false) {
    ElMessage.error(result.error.message);
  }
}

const stopUpdater = onUpdaterEvent((event) => {
  if (event.type === 'available') {
    void promptUpdate(event.info);
  }
});

/**
 * 对齐 vue2 Header mounted：只有「没开自动登录且未登录」才启动弹登录框。
 * 开了 autoLogin 时用主进程记住的密码免密登录，失败不弹窗，照旧读本地数据。
 */
async function bootstrapLogin(): Promise<void> {
  if (!hasIpc()) {
    return;
  }
  await appStore.loadPrefs();
  if (appStore.prefs['setting/client/autoLogin'] === true) {
    const auto = await syncAutoLogin();
    if (auto.ok && auto.data?.loggedIn) {
      await notesStore.loadAll();
      notifyLoginSuccess();
    }
    return;
  }
  const status = await getSyncStatus();
  if (status.ok && status.data.loggedIn) {
    return;
  }
  loginDialogState.visible = true;
}

onMounted(() => {
  installBusDialogs();
  document.getElementById('loadingPage')?.remove();
  // 对齐 vue2 boot/cdn-deps.js：DOM 就绪后异步注入，不阻塞首屏。
  void loadCdnDeps();
  if (hasIpc()) {
    document.body.classList.add('win-frameless');
    void syncWindowFrame();
    window.addEventListener('resize', scheduleWindowFrame);
    syncStore.startAutoUpload();
    void bootstrapLogin();
    // 对齐 vue2 App.vue mounted 的 checkUpdate()；只在有 preload 的桌面端触发。
    void bootstrapUpdate();
  }
});

onBeforeUnmount(() => {
  if (windowFrameTimer) {
    clearTimeout(windowFrameTimer);
  }
  window.removeEventListener('resize', scheduleWindowFrame);
  document.body.classList.remove('win-frameless', 'is-maximized');
  syncStore.stopAutoUpload();
  stopUpdater();
});

watch(
  () => loginDialogState.successTick,
  () => {
    syncStore.setLoggedIn(true);
    void syncStore.autoUploadTick();
  },
);

watch(
  () => loginDialogState.logoutTick,
  () => syncStore.setLoggedIn(false),
);
</script>
