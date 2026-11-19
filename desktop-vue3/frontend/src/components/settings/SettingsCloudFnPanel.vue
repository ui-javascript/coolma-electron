<template>
  <div class="cloudfn-panel">
    <el-tabs v-model="subTab">
      <el-tab-pane :label="t('settings.cloudFnConfig')" name="config">
        <el-alert type="info" :closable="false" show-icon class="cloudfn-hint" :title="t('settings.cloudFnIntro')" />
        <el-form label-width="120px" class="cloudfn-form">
          <el-form-item :label="t('settings.cloudFnProvider')">
            <el-radio-group v-model="form.provider">
              <el-radio value="unicloud">{{ t('settings.cloudFnProviderUnicloud') }}</el-radio>
              <el-radio value="magicApi">{{ t('settings.cloudFnProviderMagicApi') }}</el-radio>
            </el-radio-group>
            <div class="field-hint">{{ t('settings.cloudFnProviderHint') }}</div>
          </el-form-item>
          <el-form-item :label="t('settings.cloudFnBaseUrl')">
            <el-input v-model="form.baseUrl" placeholder="https://" spellcheck="false" />
            <div class="field-hint">{{ t('settings.cloudFnBaseUrlHint') }}</div>
          </el-form-item>
          <template v-if="form.provider !== 'magicApi'">
            <el-form-item :label="t('settings.cloudFnAppId')">
              <el-input v-model="form.appId" spellcheck="false" />
              <div class="field-hint">{{ t('settings.cloudFnAppIdHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('settings.cloudFnPlatform')">
              <el-select v-model="form.platform" class="platform-select">
                <el-option value="h5" label="h5" />
                <el-option value="app" label="app" />
                <el-option value="mp-weixin" label="mp-weixin" />
              </el-select>
              <div class="field-hint">{{ t('settings.cloudFnPlatformHint') }}</div>
            </el-form-item>
          </template>
          <el-form-item :label="t('settings.cloudFnToken')">
            <el-input v-model="form.token" :type="showToken ? 'text' : 'password'" spellcheck="false">
              <template #append>
                <el-button text @click="showToken = !showToken">
                  <el-icon><View v-if="!showToken" /><Hide v-else /></el-icon>
                </el-button>
              </template>
            </el-input>
            <div class="field-hint">{{ t('settings.cloudFnTokenHint') }}</div>
          </el-form-item>
        </el-form>
        <div class="cloudfn-actions">
          <el-button type="primary" @click="save">{{ t('action.save') }}</el-button>
          <el-button :loading="testing" @click="testConnection">{{ t('settings.cloudFnTest') }}</el-button>
          <el-button :disabled="form.provider === 'magicApi'" @click="demoVisible = true">{{ t('settings.cloudFnDemo') }}</el-button>
          <el-button type="danger" plain @click="clearToken">{{ t('settings.cloudFnClearToken') }}</el-button>
        </div>
        <el-alert v-if="testResult" class="cloudfn-result" :type="testResult.ok ? 'success' : 'error'" :closable="false" :title="testResult.text" />
      </el-tab-pane>

      <el-tab-pane :label="t('settings.cloudFnNavigation')" name="navigation">
        <el-alert type="info" :closable="false" show-icon class="cloudfn-hint" :title="t('settings.navigationHint')" />
        <div class="cloudfn-nav">
          <el-button type="primary" plain @click="navVisible = true">{{ t('settings.openNavigation') }}</el-button>
        </div>
        <NavigationDialog v-model="navVisible" @go-config="subTab = 'config'" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="demoVisible" :title="t('settings.cloudFnDemoTitle')" width="560px" append-to-body>
      <p class="demo-text">{{ t('settings.cloudFnDemoHint') }}</p>
      <pre class="demo-code">{{ demoCode }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 云函数设置（复刻 vue2 SettingsCloudFnPanel + cloudFunctionConfigDialog）。
 * 存储键 `setting/cloudFn/config`。测试连接 = 对 baseUrl 发一次 GET/HEAD，
 * 只能证明域名可达，不代表鉴权可用（vue2 是真正打云函数，这里没有调用通道）。
 * 云应用示例弹窗（cloudBspAppDemoDialog）先只展示调用示例代码。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Hide, View } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';
import NavigationDialog from '@/components/NavigationDialog.vue';

const STORAGE_KEY = 'setting/cloudFn/config';
const { t } = useI18n();
const appStore = useAppStore();

const subTab = ref<'config' | 'navigation'>('config');
const navVisible = ref(false);
const showToken = ref(false);
const testing = ref(false);
const demoVisible = ref(false);
const testResult = ref<{ ok: boolean; text: string } | null>(null);

const form = reactive({
  provider: 'unicloud',
  baseUrl: '',
  appId: '',
  platform: 'h5',
  token: '',
});

const demoCode = computed(() => (form.provider === 'magicApi'
  ? `POST ${form.baseUrl || 'https://your-host'}/magic/web/script/your-script\nHeader: Magic-Request-Token: <token>`
  : `uniCloud.callFunction({\n  name: 'your-fn',\n  data: { /* payload */ }\n})\n// baseURL: ${form.baseUrl || 'https://your-space.bspapp.com'}\n// appId: ${form.appId || '<appId>'}`));

async function load(): Promise<void> {
  await appStore.loadPrefs();
  const stored = (appStore.prefs[STORAGE_KEY] ?? {}) as Record<string, unknown>;
  Object.assign(form, {
    provider: String(stored.provider ?? 'unicloud'),
    baseUrl: String(stored.baseUrl ?? ''),
    appId: String(stored.appId ?? ''),
    platform: String(stored.platform ?? 'h5'),
    token: String(stored.token ?? ''),
  });
}

async function save(): Promise<void> {
  if (form.baseUrl && !/^https?:\/\//i.test(form.baseUrl)) {
    ElMessage.error(t('settings.cloudFnUrlInvalid'));
    return;
  }
  await appStore.setPref(STORAGE_KEY, { ...form });
  ElMessage.success(t('settings.cloudFnSaved'));
}

async function testConnection(): Promise<void> {
  if (!form.baseUrl) {
    testResult.value = { ok: false, text: t('settings.cloudFnUrlRequired') };
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const response = await fetch(form.baseUrl, { method: 'HEAD' });
    testResult.value = { ok: response.ok, text: `${response.status} ${response.statusText || ''}`.trim() };
  } catch (error) {
    testResult.value = { ok: false, text: String((error as Error)?.message || error) };
  } finally {
    testing.value = false;
  }
}

function clearToken(): void {
  form.token = '';
  void save();
}

onMounted(load);
</script>

<style scoped>
.cloudfn-hint { margin-bottom: 12px; }
.cloudfn-form { max-width: 640px; }
.field-hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
.platform-select { width: 180px; }
.cloudfn-actions { display: flex; gap: 8px; margin-top: 4px; }
.cloudfn-result { margin-top: 12px; }
.cloudfn-nav { padding: 24px 0; text-align: center; }
.demo-text { font-size: 13px; color: var(--el-text-color-secondary); }
.demo-code { padding: 12px; background: var(--el-fill-color-light, #f5f7fa); border-radius: 6px; font-size: 12px; white-space: pre-wrap; }
</style>
