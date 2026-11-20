<template>
  <el-dialog v-model="visible" :title="t('blog.title')" width="640px" append-to-body>
    <el-alert type="info" :closable="false" show-icon class="blog-hint" :title="t('blog.scopeHint')" />

    <el-form label-width="110px" class="blog-form">
      <el-form-item :label="t('blog.blogDir')">
        <div class="blog-dir-row">
          <el-input v-model="form.blogDir" :placeholder="t('blog.blogDirPlaceholder')" spellcheck="false" />
          <el-button @click="chooseDir">{{ t('blog.choose') }}</el-button>
        </div>
        <div class="field-hint">{{ t('blog.blogDirHint') }}</div>
      </el-form-item>
      <el-form-item :label="t('blog.category')">
        <el-input :model-value="category || t('blog.allNotes')" disabled />
        <div class="field-hint">{{ t('blog.categoryHint') }}</div>
      </el-form-item>
      <el-form-item :label="t('blog.theme')">
        <el-select v-model="form.theme" class="blog-theme">
          <el-option value="default" label="default" />
          <el-option value="vdoing" label="vdoing" />
          <el-option value="hope" label="hope" />
          <el-option value="reco" label="reco" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('blog.includeCi')">
        <el-checkbox v-model="form.includeCi">{{ t('blog.includeCiLabel') }}</el-checkbox>
        <div class="field-hint">{{ t('blog.includeCiHint') }}</div>
      </el-form-item>
    </el-form>

    <div class="blog-build-bar">
      <el-select v-model="packageManager" class="blog-pm" :disabled="building">
        <el-option value="npm" label="npm" />
        <el-option value="pnpm" label="pnpm" />
        <el-option value="yarn" label="yarn" />
      </el-select>
      <el-button type="primary" plain :loading="building" :disabled="!lastResult" @click="runBuild">{{ t('blog.build') }}</el-button>
      <el-button v-if="building" type="danger" plain @click="stopBuild">{{ t('blog.cancelBuild') }}</el-button>
      <span class="field-hint">{{ t('blog.buildHint') }}</span>
    </div>

    <el-collapse class="blog-sftp">
      <el-collapse-item name="sftp">
        <template #title>
          <span class="blog-github-title">{{ t('blog.sftpTitle') }}</span>
        </template>
        <div class="field-hint blog-github-hint">{{ t('blog.sftpHint') }}</div>
        <el-form label-width="96px" class="github-form">
          <el-form-item label="enable">
            <el-checkbox v-model="sftp.enabled">{{ t('blog.sftpEnabled') }}</el-checkbox>
          </el-form-item>
        </el-form>
        <el-form v-if="sftp.enabled" label-width="96px" class="github-form">
          <el-form-item label="host"><el-input v-model="sftp.host" spellcheck="false" placeholder="example.com" /></el-form-item>
          <el-form-item label="port"><el-input-number v-model="sftp.port" :min="1" :max="65535" controls-position="right" /></el-form-item>
          <el-form-item label="username"><el-input v-model="sftp.username" spellcheck="false" /></el-form-item>
          <el-form-item label="auth">
            <el-radio-group v-model="sftp.authType">
              <el-radio value="password">{{ t('blog.sftpAuthPassword') }}</el-radio>
              <el-radio value="key">{{ t('blog.sftpAuthKey') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="sftp.authType === 'password'" label="password">
            <el-input v-model="sftp.password" type="password" show-password spellcheck="false" />
          </el-form-item>
          <template v-else>
            <el-form-item label="key">
              <div class="blog-dir-row">
                <el-input v-model="sftp.privateKeyPath" spellcheck="false" placeholder="~/.ssh/id_rsa" />
                <el-button @click="chooseKeyFile">{{ t('blog.sftpChooseKey') }}</el-button>
              </div>
            </el-form-item>
            <el-form-item label="passphrase">
              <el-input v-model="sftp.passphrase" type="password" show-password spellcheck="false" />
            </el-form-item>
          </template>
          <el-form-item label="remotePath">
            <el-input v-model="sftp.remotePath" spellcheck="false" placeholder="/var/www/blog" />
          </el-form-item>
          <el-form-item label="backup">
            <el-checkbox v-model="sftp.backupEnabled">{{ t('blog.sftpBackup') }}</el-checkbox>
          </el-form-item>
        </el-form>
        <div v-if="sftp.enabled" class="blog-build-bar">
          <el-button :loading="testing" @click="runSftpTest">{{ t('blog.sftpTest') }}</el-button>
          <el-button v-if="uploading" type="danger" plain @click="stopSftp">{{ t('blog.sftpCancel') }}</el-button>
          <span class="field-hint">{{ t('blog.sftpAutoUploadHint') }}</span>
        </div>
      </el-collapse-item>
    </el-collapse>

    <el-collapse class="blog-github">
      <el-collapse-item name="github">
        <template #title>
          <span class="blog-github-title">{{ t('blog.githubTitle') }}</span>
        </template>
        <div class="field-hint blog-github-hint">{{ t('blog.githubHint') }}</div>
        <el-form label-width="96px" class="github-form">
          <el-form-item label="owner"><el-input v-model="github.owner" spellcheck="false" /></el-form-item>
          <el-form-item label="repo"><el-input v-model="github.repo" spellcheck="false" /></el-form-item>
          <el-form-item label="workflow"><el-input v-model="github.workflowId" spellcheck="false" placeholder="blog-build.yml" /></el-form-item>
          <el-form-item label="branch"><el-input v-model="github.branch" spellcheck="false" placeholder="main" /></el-form-item>
          <el-form-item label="token">
            <el-input v-model="github.token" type="password" show-password spellcheck="false" />
          </el-form-item>
        </el-form>
        <div class="blog-build-bar">
          <el-button type="primary" plain :loading="dispatching" @click="runDispatch">{{ t('blog.githubDispatch') }}</el-button>
          <span class="field-hint">{{ t('blog.githubTokenHint') }}</span>
        </div>
      </el-collapse-item>
    </el-collapse>

    <div v-if="progress.length" class="blog-progress">
      <div v-for="(line, index) in progress" :key="index" class="blog-progress-line" :class="{ 'is-err': line.stream === 'stderr' }">{{ line.message }}</div>
    </div>

    <div v-if="lastResult" class="blog-result">
      <div class="blog-result-title">{{ t('blog.resultTitle') }}</div>
      <ul>
        <li>{{ t('blog.resultFiles', { count: lastResult.writtenFiles }) }}</li>
        <li>{{ t('blog.resultShortlinks', { count: lastResult.shortlinkCount }) }}</li>
        <li v-if="lastResult.workflows.written.length">{{ t('blog.resultWorkflows', { names: lastResult.workflows.written.join(', ') }) }}</li>
        <li v-if="lastResult.workflows.skipped.length">{{ t('blog.resultSkipped', { names: lastResult.workflows.skipped.join(', ') }) }}</li>
        <li v-if="distDir" class="blog-result-dist">{{ t('blog.distDir', { dir: distDir }) }}</li>
        <li class="blog-result-gap">{{ t('blog.buildGap') }}</li>
      </ul>
    </div>

    <template #footer>
      <el-button :disabled="exporting" @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" :loading="exporting" @click="runExport">{{ t('blog.export') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 博客部署（P0 第 10 项，本地一半）。
 *
 * 已接：选 vuepress 源目录 → 把当前分类（或全部）笔记写成 `_posts/<shortlink>.md`、
 * sidebar.json、README、`.vuepress/{shortlink-map,id-mappings,seq-manifest}.json`、
 * 分类 README，可选写三份 GitHub Actions workflow。
 *
 * 没接：vue2 `blog-deploy-handler` 的 Node 探测、装依赖、vuepress build、
 * GitHub workflow_dispatch、SFTP 上传。界面上明说，不假装部署成功。
 */
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useAppStore } from '@/stores/app';
import {
  buildBlog,
  cancelBlogBuild,
  cancelBlogSftp,
  dispatchBlogGithub,
  exportBlog,
  onBlogProgress,
  pickDirectory,
  pickFile,
  testBlogSftp,
  uploadBlogSftp,
} from '@/services/blog';
import type { BlogBuildProgress, BlogExportOutput, BlogSftpConfig } from '@/services/blog';

const props = defineProps<{
  modelValue: boolean;
  category?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const { t } = useI18n();
const appStore = useAppStore();
const STORAGE_KEY = 'setting/blog/config';

const form = reactive<{ blogDir: string; theme: 'default' | 'vdoing' | 'hope' | 'reco'; includeCi: boolean }>({
  blogDir: '',
  theme: 'default',
  includeCi: false,
});
const exporting = ref(false);
const building = ref(false);
const packageManager = ref<'npm' | 'pnpm' | 'yarn'>('npm');
const progress = ref<BlogBuildProgress[]>([]);
const distDir = ref('');
let offProgress: (() => void) | null = null;
const GITHUB_KEY = 'setting/blog/github';
const SFTP_KEY = 'setting/blog/sftp';
const github = reactive({ owner: 'ui-javascript', repo: 'coolma-electron', workflowId: 'blog-build.yml', branch: 'main', token: '' });
const dispatching = ref(false);
const testing = ref(false);
const uploading = ref(false);
const sftp = reactive<Required<BlogSftpConfig>>({
  enabled: false,
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKeyPath: '',
  passphrase: '',
  remotePath: '',
  backupEnabled: true,
});
const lastResult = ref<BlogExportOutput | null>(null);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void loadConfig();
      offProgress?.();
      offProgress = onBlogProgress((event) => {
        progress.value.push(event);
        if (progress.value.length > 80) {
          progress.value.splice(0, progress.value.length - 80);
        }
        if (event.stage === 'done') {
          distDir.value = event.message;
          building.value = false;
        }
        if (event.stage === 'error' || event.stage === 'cancelled') {
          building.value = false;
        }
      });
    } else {
      offProgress?.();
      offProgress = null;
    }
  },
);

async function loadConfig(): Promise<void> {
  await appStore.loadPrefs();
  const saved = appStore.prefs[STORAGE_KEY] as { blogDir?: string; theme?: typeof form.theme; includeCi?: boolean } | undefined;
  if (saved?.blogDir) {
    form.blogDir = saved.blogDir;
  }
  if (saved?.theme) {
    form.theme = saved.theme;
  }
  form.includeCi = Boolean(saved?.includeCi);
  const savedGithub = appStore.prefs[GITHUB_KEY] as Partial<typeof github> | undefined;
  if (savedGithub) {
    Object.assign(github, savedGithub);
  }
  const savedSftp = appStore.prefs[SFTP_KEY] as Partial<typeof sftp> | undefined;
  if (savedSftp) {
    Object.assign(sftp, savedSftp);
  }
}

async function saveConfig(): Promise<void> {
  await appStore.setPref(STORAGE_KEY, { ...form });
}

async function saveSftpConfig(): Promise<void> {
  await appStore.setPref(SFTP_KEY, { ...sftp });
}

function sftpPayload(): BlogSftpConfig {
  return {
    enabled: sftp.enabled,
    host: sftp.host.trim(),
    port: Number(sftp.port) || 22,
    username: sftp.username.trim(),
    authType: sftp.authType,
    password: sftp.authType === 'password' ? sftp.password : undefined,
    privateKeyPath: sftp.authType === 'key' ? sftp.privateKeyPath.trim() : undefined,
    passphrase: sftp.authType === 'key' ? sftp.passphrase : undefined,
    remotePath: sftp.remotePath.trim(),
    backupEnabled: sftp.backupEnabled,
  };
}

function sftpReady(): boolean {
  if (!sftp.enabled || !sftp.host.trim() || !sftp.username.trim() || !sftp.remotePath.trim()) {
    return false;
  }
  return sftp.authType === 'password' ? Boolean(sftp.password) : Boolean(sftp.privateKeyPath.trim());
}

async function chooseKeyFile(): Promise<void> {
  const result = await pickFile();
  if (result.ok && result.data) {
    sftp.privateKeyPath = result.data;
    await saveSftpConfig();
  } else if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

async function runSftpTest(): Promise<void> {
  if (!sftpReady()) {
    ElMessage.warning(t('blog.sftpNeedFields'));
    return;
  }
  testing.value = true;
  try {
    await saveSftpConfig();
    const result = await testBlogSftp(sftpPayload());
    if (!result.ok) {
      ElMessage.error(t('blog.sftpTestFailed', { message: result.error.message }));
      return;
    }
    ElMessage.success(t('blog.sftpTestOk'));
  } finally {
    testing.value = false;
  }
}

async function runSftpUpload(): Promise<boolean> {
  if (!sftpReady()) {
    ElMessage.warning(t('blog.sftpNeedFields'));
    return false;
  }
  if (!distDir.value) {
    ElMessage.warning(t('blog.sftpNeedDist'));
    return false;
  }
  uploading.value = true;
  try {
    await saveSftpConfig();
    const result = await uploadBlogSftp({ localDir: distDir.value, config: sftpPayload() });
    if (!result.ok) {
      ElMessage.error(t('blog.sftpFailed', { message: result.error.message }));
      return false;
    }
    if (result.data.backupPath) {
      ElMessage.success(t('blog.sftpDoneBackup', { uploaded: result.data.uploaded, total: result.data.total, path: result.data.backupPath }));
    } else {
      ElMessage.success(t('blog.sftpDone', { uploaded: result.data.uploaded, total: result.data.total }));
    }
    return true;
  } finally {
    uploading.value = false;
  }
}

async function stopSftp(): Promise<void> {
  const result = await cancelBlogSftp();
  if (!result.ok) {
    ElMessage.error(result.error.message);
  }
  uploading.value = false;
}

async function chooseDir(): Promise<void> {
  const result = await pickDirectory();
  if (result.ok && result.data) {
    form.blogDir = result.data;
    await saveConfig();
  } else if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

async function runBuild(): Promise<void> {
  if (!form.blogDir.trim()) {
    ElMessage.warning(t('blog.needDir'));
    return;
  }
  building.value = true;
  progress.value = [];
  distDir.value = '';
  try {
    const result = await buildBlog({ blogDir: form.blogDir.trim(), packageManager: packageManager.value });
    if (!result.ok) {
      ElMessage.error(t('blog.buildFailed', { message: result.error.message }));
      return;
    }
    if (result.data.distDir) {
      distDir.value = result.data.distDir;
    }
    if (sftp.enabled && !(await runSftpUpload())) {
      return;
    }
    ElMessage.success(t('blog.buildDone'));
  } finally {
    building.value = false;
  }
}

async function runDispatch(): Promise<void> {
  if (!github.owner || !github.repo || !github.token) {
    ElMessage.warning(t('blog.githubNeedFields'));
    return;
  }
  dispatching.value = true;
  try {
    await appStore.setPref(GITHUB_KEY, { ...github });
    const result = await dispatchBlogGithub({ ...github });
    if (!result.ok) {
      ElMessage.error(t('blog.githubFailed', { message: result.error.message }));
      return;
    }
    ElMessage.success(t('blog.githubDone'));
  } finally {
    dispatching.value = false;
  }
}

async function stopBuild(): Promise<void> {
  const result = await cancelBlogBuild();
  if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

async function runExport(): Promise<void> {
  if (!form.blogDir.trim()) {
    ElMessage.warning(t('blog.needDir'));
    return;
  }
  exporting.value = true;
  lastResult.value = null;
  try {
    await saveConfig();
    const result = await exportBlog({
      blogDir: form.blogDir.trim(),
      category: props.category || '',
      theme: form.theme,
      includeCi: form.includeCi,
    });
    if (!result.ok) {
      ElMessage.error(t('blog.exportFailed', { message: result.error.message }));
      return;
    }
    lastResult.value = result.data;
    ElMessage.success(t('blog.exportDone', { count: result.data.writtenFiles }));
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.blog-hint { margin-bottom: 14px; }
.blog-form { margin-bottom: 6px; }
.blog-dir-row { display: flex; gap: 8px; width: 100%; }
.blog-theme { width: 160px; }
.field-hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; width: 100%; }
.blog-build-bar { display: flex; align-items: center; gap: 8px; margin: 4px 0 10px; flex-wrap: wrap; }
.blog-pm { width: 110px; }
.blog-sftp,
.blog-github { margin: 4px 0 10px; }
.blog-github-title { font-size: 13px; font-weight: 600; }
.blog-github-hint { margin-bottom: 8px; }
.github-form :deep(.el-form-item) { margin-bottom: 8px; }

.blog-progress { max-height: 180px; overflow-y: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: #0f172a08; padding: 8px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; }
.blog-progress-line { white-space: pre-wrap; word-break: break-all; }
.blog-progress-line.is-err { color: var(--el-color-danger); }
.blog-result-dist { word-break: break-all; }

.blog-result { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 14px; background: var(--el-fill-color-lighter); }
.blog-result-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.blog-result ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.8; }
.blog-result-gap { color: var(--el-text-color-secondary); }
</style>
