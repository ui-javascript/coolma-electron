<template>
  <el-dialog
    v-model="visible"
    :title="t('login.title')"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    append-to-body
    class="login-dialog"
  >
    <el-form label-position="top" @submit.prevent="doLogin">
      <el-form-item :label="t('login.username')">
        <el-input v-model="form.userId" spellcheck="false" autocomplete="username" autofocus />
      </el-form-item>
      <el-form-item :label="t('login.password')">
        <el-input v-model="form.password" type="password" show-password autocomplete="current-password" />
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="enableSelfHostServer">{{ t('login.selfHostEnable') }}</el-checkbox>
      </el-form-item>
      <el-form-item v-if="enableSelfHostServer" :label="t('login.selfHostServer')">
        <el-input v-model="form.baseUrl" placeholder="https://as.wiz.cn" spellcheck="false" />
        <div class="field-hint">{{ t('login.selfHostHint') }}</div>
      </el-form-item>

      <div class="login-toggles">
        <el-checkbox v-model="rememberPassword">{{ t('login.rememberPassword') }}</el-checkbox>
        <el-checkbox v-model="autoLogin">{{ t('login.autoLogin') }}</el-checkbox>
      </div>

      <el-alert v-if="error" type="error" :closable="false" :title="error" class="login-error" />

      <div class="login-actions">
        <el-button type="primary" native-type="submit" :loading="busy">{{ t('login.signIn') }}</el-button>
        <el-button :disabled="busy" @click="signUp">{{ t('login.signUp') }}</el-button>
        <el-button text :disabled="busy" @click="skip">{{ t('login.skipLogin') }}</el-button>
      </div>
    </el-form>
  </el-dialog>

  <SyncOfflinePromptDialog v-model="offlineVisible" @synced="afterSynced" />
</template>

<script setup lang="ts">
/**
 * 全局登录弹窗（复刻 vue2 components/login/LoginDialog.vue）。
 *
 * 主进程 `sync.autoLogin` 用上次记住的密码自动登录，密码不会回传渲染层；
 * 这里只负责手动登录、开关项持久化、注册外链和跳过登录。
 */
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import { getPendingSync } from '@/services/ipc';
import { getSyncStatus, syncLogin } from '@/services/sync';
import { openExternal } from '@/services/cloudfn';
import { DEFAULT_LOGIN_BASE, isValidServerUrl, normalizeServerUrl, resolveSignupUrl } from '@/utils/loginRules';
import SyncOfflinePromptDialog from '@/components/SyncOfflinePromptDialog.vue';

const KEY = {
  autoLogin: 'setting/client/autoLogin',
  rememberPassword: 'setting/client/rememberPassword',
  selfHost: 'setting/client/enableSelfHostServer',
  server: 'setting/client/selfHostServer',
  loginUserId: 'setting/client/loginUserId',
};

const props = withDefaults(defineProps<{ modelValue: boolean }>(), { modelValue: false });
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'success'): void;
  (e: 'skip'): void;
}>();

const { t } = useI18n();
const appStore = useAppStore();
const notesStore = useNotesStore();
const busy = ref(false);
const error = ref('');
const offlineVisible = ref(false);
const pending = ref(0);
const enableSelfHostServer = ref(false);
const rememberPassword = ref(true);
const autoLogin = ref(false);
const form = reactive({ userId: '', password: '', baseUrl: DEFAULT_LOGIN_BASE });
let ready = false;

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

async function prepare(): Promise<void> {
  await appStore.loadPrefs();
  const prefs = appStore.prefs;
  enableSelfHostServer.value = Boolean(prefs[KEY.selfHost]);
  rememberPassword.value = prefs[KEY.rememberPassword] !== false;
  autoLogin.value = Boolean(prefs[KEY.autoLogin]);
  form.userId = String(prefs[KEY.loginUserId] ?? '');
  form.baseUrl = String(prefs[KEY.server] ?? DEFAULT_LOGIN_BASE);
  error.value = '';
  try {
    const status = await getSyncStatus();
    if (status.ok) {
      form.userId = status.data.email || form.userId;
      form.baseUrl = status.data.baseUrl || form.baseUrl;
    }
  } catch {
    // 状态读取失败不阻塞手动登录
  }
  ready = true;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void prepare();
    }
  },
  { immediate: true },
);

watch(enableSelfHostServer, (value) => {
  if (ready) {
    void appStore.setPref(KEY.selfHost, value);
  }
});
watch(rememberPassword, (value) => {
  if (ready) {
    void appStore.setPref(KEY.rememberPassword, value);
  }
});
watch(autoLogin, (value) => {
  if (!ready) {
    return;
  }
  void appStore.setPref(KEY.autoLogin, value);
});

async function persistForm(): Promise<void> {
  await appStore.setPref(KEY.autoLogin, autoLogin.value);
  await appStore.setPref(KEY.rememberPassword, rememberPassword.value);
  await appStore.setPref(KEY.selfHost, enableSelfHostServer.value);
  await appStore.setPref(KEY.server, normalizeServerUrl(form.baseUrl));
  await appStore.setPref(KEY.loginUserId, form.userId);
}

async function doLogin(): Promise<void> {
  if (busy.value) {
    return;
  }
  if (!form.userId.trim() || !form.password) {
    error.value = t('login.needCredentials');
    return;
  }
  if (enableSelfHostServer.value && !isValidServerUrl(form.baseUrl)) {
    error.value = t('login.invalidServer');
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const result = await syncLogin({
      userId: form.userId.trim(),
      password: form.password,
      baseUrl: enableSelfHostServer.value ? normalizeServerUrl(form.baseUrl) : undefined,
      rememberPassword: rememberPassword.value,
    });
    if (!result.ok) {
      error.value = t('login.loginFailed', { message: result.error.message });
      return;
    }
    await persistForm();
    await notesStore.loadAll?.();
    const pendingResult = await getPendingSync();
    if (pendingResult.ok) {
      pending.value = pendingResult.data.summary.total ?? 0;
    }
    visible.value = false;
    emit('success');
    if (pending.value > 0) {
      offlineVisible.value = true;
    }
  } finally {
    busy.value = false;
  }
}

async function signUp(): Promise<void> {
  const result = await openExternal(resolveSignupUrl(form.baseUrl, enableSelfHostServer.value));
  if (!result.ok) {
    error.value = result.error.message;
  }
}

function skip(): void {
  visible.value = false;
  emit('skip');
}

async function afterSynced(): Promise<void> {
  await notesStore.loadAll?.();
  const result = await getPendingSync();
  if (result.ok) {
    pending.value = result.data.summary.total ?? 0;
  }
}
</script>

<style scoped>
.login-toggles {
  display: flex;
  gap: 18px;
  margin: 4px 0 12px;
}

.login-error {
  margin-bottom: 12px;
}

.login-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.login-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}
</style>
