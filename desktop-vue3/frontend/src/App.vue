<template>
  <div class="app-frame" :class="{ 'has-window-controls': hasControls }">
    <router-view />
    <WindowControls />
    <LoginDialog
      v-model="loginDialogState.visible"
      @success="notifyLoginSuccess"
      @skip="closeLoginDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import WindowControls from '@/components/WindowControls.vue';
import LoginDialog from '@/components/LoginDialog.vue';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import { useSyncStore } from '@/stores/sync';
import { hasIpc } from '@/services/ipc';
import { installBusDialogs } from '@/services/busDialogEntries';
import { closeLoginDialog, loginDialogState, notifyLoginSuccess } from '@/services/loginDialog';
import { getSyncStatus, syncAutoLogin } from '@/services/sync';
import { loadCdnDeps } from '@/utils/cdnDeps';

const hasControls = hasIpc();
const appStore = useAppStore();
const notesStore = useNotesStore();
const syncStore = useSyncStore();

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
    syncStore.startAutoUpload();
    void bootstrapLogin();
  }
});

onBeforeUnmount(() => {
  syncStore.stopAutoUpload();
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
