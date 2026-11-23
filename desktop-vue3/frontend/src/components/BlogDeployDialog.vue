<template>
  <el-dialog
    v-model="visible"
    width="520px"
    top="15vh"
    append-to-body
    :show-close="false"
    class="blog-deploy-dialog"
  >
    <div class="blog-deploy-toolbar">
      <el-icon class="blog-deploy-toolbar-icon"><UploadFilled /></el-icon>
      <span class="blog-deploy-toolbar-title">{{ t('blog.configTitle') }}</span>
      <button class="blog-deploy-close" type="button" @click="visible = false">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="blog-deploy-content">
      <section class="config-section">
        <div class="config-label">{{ t('blog.sourceDir') }} <span class="required">*</span></div>
        <div class="blog-dir-row">
          <el-input
            v-model="form.blogDir"
            size="small"
            :placeholder="t('blog.chooseDir')"
            spellcheck="false"
          />
          <el-button type="primary" @click="chooseDir">
            <el-icon><FolderOpened /></el-icon>
            <span>{{ t('blog.chooseDir') }}</span>
          </el-button>
        </div>
      </section>

      <section class="config-section">
        <div class="config-label">{{ t('blog.themeLabel') }}</div>
        <el-radio-group v-model="form.theme" size="small" class="segmented theme-toggle">
          <el-radio-button value="default">{{ t('blog.themeDefault') }}</el-radio-button>
          <el-radio-button value="vdoing">{{ t('blog.themeVdoing') }}</el-radio-button>
          <el-radio-button value="hope">{{ t('blog.themeHope') }}</el-radio-button>
          <el-radio-button value="reco">{{ t('blog.themeReco') }}</el-radio-button>
        </el-radio-group>
        <div class="field-hint">{{ t('blog.themeHint') }}</div>
      </section>

      <section class="config-section">
        <div class="config-label">{{ t('blog.baseLabel') }}</div>
        <el-input
          v-model="form.base"
          size="small"
          :placeholder="t('blog.basePathPlaceholder')"
          spellcheck="false"
        />
        <div class="field-hint">{{ t('blog.basePathHint') }}</div>
      </section>

      <section class="config-section">
        <div class="config-label">{{ t('blog.packageLabel') }}</div>
        <el-radio-group v-model="form.packageManager" size="small" class="segmented package-manager-toggle">
          <el-radio-button value="npm">npm</el-radio-button>
          <el-radio-button value="yarn">yarn</el-radio-button>
          <el-radio-button value="pnpm">pnpm</el-radio-button>
        </el-radio-group>
        <div class="field-hint">{{ t('blog.packageHint') }}</div>
      </section>

      <section class="config-section">
        <div class="config-label">{{ t('blog.commandLabel') }}</div>
        <el-input
          v-model="form.customBuildCommand"
          size="small"
          :placeholder="t('blog.commandPlaceholder')"
          spellcheck="false"
        />
        <div class="field-hint">{{ t('blog.commandHint') }}</div>
      </section>

      <div class="deploy-separator" />

      <el-tabs v-model="activeDeployTab" class="deploy-tabs">
        <el-tab-pane name="github">
          <template #label>
            <span class="deploy-tab-label"><el-icon><Link /></el-icon>{{ t('blog.tabGithub') }}</span>
          </template>
          <el-form label-position="top" size="small" class="deploy-form">
            <el-form-item :label="t('blog.repoLabel')">
              <el-input v-model="repoSlug" placeholder="owner/repo" spellcheck="false" />
            </el-form-item>
            <el-form-item :label="t('blog.workflowLabel')">
              <el-input v-model="github.workflowId" placeholder="deploy.yml" spellcheck="false" />
            </el-form-item>
            <el-form-item :label="t('blog.branchLabel')">
              <el-input v-model="github.branch" placeholder="main" spellcheck="false" />
            </el-form-item>
            <el-form-item :label="t('blog.tokenLabel')">
              <el-input v-model="github.token" :type="showToken ? 'text' : 'password'" spellcheck="false">
                <template #suffix>
                  <el-icon class="password-eye" @click="showToken = !showToken">
                    <View v-if="!showToken" />
                    <Hide v-else />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
          </el-form>
          <div class="field-hint token-hint">
            {{ t('blog.tokenHint') }}
            <button class="text-link" type="button" @click="openGithubTokenGuide">{{ t('blog.tokenGuide') }}</button>
          </div>
        </el-tab-pane>

        <el-tab-pane name="ci">
          <template #label>
            <span class="deploy-tab-label"><el-icon><Tools /></el-icon>{{ t('blog.tabCi') }}</span>
          </template>
          <div class="field-hint ci-hint">{{ t('blog.ciHint') }}</div>
          <el-button
            text
            type="primary"
            :disabled="!form.blogDir.trim()"
            :loading="exporting"
            @click="exportCI"
          >
            <el-icon><Tools /></el-icon>
            <span>{{ t('blog.ciButton') }}</span>
          </el-button>
        </el-tab-pane>

        <el-tab-pane name="sftp">
          <template #label>
            <span class="deploy-tab-label"><el-icon><Cloudy /></el-icon>{{ t('blog.tabSftp') }}</span>
          </template>
          <div class="sftp-toggle-row">
            <el-switch v-model="sftp.enabled" />
            <span>{{ t('blog.sftpEnable') }}</span>
          </div>

          <template v-if="sftp.enabled">
            <div class="sftp-host-row">
              <div class="sftp-col">
                <div class="sftp-mini-label">{{ t('blog.sftpHost') }}</div>
                <el-input v-model="sftp.host" size="small" placeholder="example.com" spellcheck="false" />
              </div>
              <div class="sftp-col sftp-port-col">
                <div class="sftp-mini-label">{{ t('blog.sftpPort') }}</div>
                <el-input-number v-model="sftp.port" size="small" :min="1" :max="65535" controls-position="right" />
              </div>
            </div>

            <div class="sftp-field">
              <div class="sftp-mini-label">{{ t('blog.sftpUser') }}</div>
              <el-input v-model="sftp.username" size="small" spellcheck="false" />
            </div>

            <div class="config-label sub-label">{{ t('blog.sftpAuth') }}</div>
            <el-radio-group v-model="sftp.authType" size="small" class="segmented auth-toggle">
              <el-radio-button value="password">{{ t('blog.sftpAuthPassword') }}</el-radio-button>
              <el-radio-button value="key">{{ t('blog.sftpKey') }}</el-radio-button>
            </el-radio-group>

            <div v-if="sftp.authType === 'password'" class="sftp-field">
              <div class="sftp-mini-label">{{ t('blog.sftpPassword') }}</div>
              <el-input v-model="sftp.password" size="small" :type="showSftpPassword ? 'text' : 'password'" spellcheck="false">
                <template #suffix>
                  <el-icon class="password-eye" @click="showSftpPassword = !showSftpPassword">
                    <View v-if="!showSftpPassword" />
                    <Hide v-else />
                  </el-icon>
                </template>
              </el-input>
            </div>
            <template v-else>
              <div class="sftp-field">
                <div class="sftp-mini-label">{{ t('blog.sftpKeyPath') }}</div>
                <div class="blog-dir-row">
                  <el-input
                    v-model="sftp.privateKeyPath"
                    size="small"
                    readonly
                    spellcheck="false"
                  />
                  <el-button type="primary" @click="chooseKeyFile">
                    <el-icon><FolderOpened /></el-icon>
                    <span>{{ t('blog.sftpKeyChoose') }}</span>
                  </el-button>
                </div>
              </div>
              <div class="sftp-field">
                <div class="sftp-mini-label">{{ t('blog.sftpPassphrase') }}</div>
                <el-input v-model="sftp.passphrase" size="small" type="password" show-password spellcheck="false" />
              </div>
            </template>

            <div class="sftp-field">
              <div class="sftp-mini-label">{{ t('blog.sftpRemote') }}</div>
              <el-input v-model="sftp.remotePath" size="small" placeholder="/var/www/blog" spellcheck="false" />
            </div>

            <div class="sftp-toggle-row">
              <el-switch v-model="sftp.backupEnabled" />
              <span>{{ t('blog.sftpBackup') }}</span>
            </div>

            <el-button text type="primary" :loading="testing" @click="runSftpTest">
              <el-icon><Connection /></el-icon>
              <span>{{ t('blog.sftpTest') }}</span>
            </el-button>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div v-if="progress.length" class="blog-progress">
        <div class="blog-progress-title">
          <span>{{ t('blog.buildProgress') }}</span>
          <el-button v-if="building" text type="danger" size="small" @click="stopBuild">{{ t('blog.cancelBuild') }}</el-button>
        </div>
        <div
          v-for="(line, index) in progress"
          :key="index"
          class="blog-progress-line"
          :class="{ 'is-err': line.stream === 'stderr' }"
        >{{ line.message }}</div>
      </div>

      <div v-if="buildEnv" class="blog-env">
        <div class="blog-env-title">{{ t('blog.envTitle') }}</div>
        <span>{{ t('blog.envNode', { version: buildEnv.nodeVersion }) }}</span>
        <span>{{ t('blog.envTheme', { theme: buildEnv.theme }) }}</span>
        <span>{{ t(`blog.envPackage${buildEnv.packageStatus === 'created' ? 'Created' : buildEnv.packageStatus === 'updated' ? 'Updated' : 'Kept'}`) }}</span>
        <span>{{ t(`blog.envConfig${buildEnv.configStatus === 'created' ? 'Created' : buildEnv.configStatus === 'updated' ? 'Updated' : buildEnv.configStatus === 'base-updated' ? 'BaseUpdated' : 'Kept'}`) }}</span>
        <span>{{ buildEnv.installed ? t('blog.envInstalled') : t('blog.envReused') }}</span>
      </div>

      <div v-if="lastResult" class="blog-result">
        <div class="blog-result-title">{{ t('blog.resultTitle') }}</div>
        <ul>
          <li>{{ t('blog.resultFiles', { count: lastResult.writtenFiles, skipped: lastResult.skippedFiles ?? 0 }) }}</li>
          <li>{{ t('blog.resultShortlinks', { count: lastResult.shortlinkCount }) }}</li>
          <li v-if="lastResult.workflows.written.length">{{ t('blog.resultWorkflows', { names: lastResult.workflows.written.join(', ') }) }}</li>
          <li v-if="lastResult.workflows.skipped.length">{{ t('blog.resultSkipped', { names: lastResult.workflows.skipped.join(', ') }) }}</li>
          <li v-if="distDir" class="blog-result-dist">{{ t('blog.distDir', { dir: distDir }) }}</li>
          <li class="blog-result-gap">{{ t('blog.buildGap') }}</li>
        </ul>
      </div>
    </div>

    <template #footer>
      <div class="blog-deploy-actions">
        <el-button text class="cancel-button" :disabled="deploying" @click="visible = false">
          {{ t('blog.cancel') }}
        </el-button>
        <el-button
          text
          type="primary"
          :disabled="!form.blogDir.trim() || deploying"
          :loading="savingConfig"
          @click="saveOnly"
        >
          {{ t('blog.save') }}
        </el-button>
        <el-button
          type="primary"
          :disabled="!form.blogDir.trim() || building || dispatching || exporting"
          :loading="deploying"
          @click="saveAndDeploy"
        >
          <el-icon><Promotion /></el-icon>
          <span>{{ t('blog.saveDeploy') }}</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 博客部署（P0 第 10 项，本地一半）。
 *
 * 已接：选 vuepress 源目录 → 把当前分类（或全部）笔记写成 `_posts/<shortlink>.md`、
 * sidebar.json、README、`.vuepress/{shortlink-map,id-mappings,seq-manifest}.json`、
 * 分类 README，可选写三份 GitHub Actions workflow；构建前自动检查 Node.js、
 * 生成/修复 package.json 与 .vuepress/config.js、写 sidebar/nav builders、
 * 缺依赖时安装，再跑 build 脚本。GitHub workflow_dispatch 与 SFTP 上传也已接。
 */
import { computed, reactive, ref, watch } from 'vue';
import { Cloudy, Close, Connection, FolderOpened, Hide, Link, Promotion, Tools, UploadFilled, View } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAppStore } from '@/stores/app';
import { openExternal } from '@/services/cloudfn';
import {
  buildBlog,
  cancelBlogBuild,
  dispatchBlogGithub,
  exportBlog,
  exportBlogCi,
  onBlogProgress,
  pickDirectory,
  pickFile,
  testBlogSftp,
  uploadBlogSftp,
} from '@/services/blog';
import type { BlogBuildEnv, BlogBuildProgress, BlogExportOutput, BlogSftpConfig, BlogTheme } from '@/services/blog';

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

type BlogPackageManager = 'npm' | 'pnpm' | 'yarn';

const form = reactive<{
  blogDir: string;
  theme: BlogTheme;
  base: string;
  packageManager: BlogPackageManager;
  customBuildCommand: string;
}>({
  blogDir: '',
  theme: 'default',
  base: './',
  packageManager: 'npm',
  customBuildCommand: 'npm run build',
});
const activeDeployTab = ref<'github' | 'ci' | 'sftp'>('github');
const exporting = ref(false);
const building = ref(false);
const savingConfig = ref(false);
const deploying = ref(false);
const showToken = ref(false);
const showSftpPassword = ref(false);
const progress = ref<BlogBuildProgress[]>([]);
const distDir = ref('');
const buildEnv = ref<BlogBuildEnv | null>(null);
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

const repoSlug = ref('');
watch(repoSlug, (value) => {
  const [owner, ...rest] = value.split('/');
  github.owner = (owner || '').trim();
  github.repo = rest.join('/').trim();
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

watch(
  () => form.packageManager,
  (packageManager, previous) => {
    if (!previous || packageManager === previous) {
      return;
    }
    const prefixes: BlogPackageManager[] = ['npm', 'yarn', 'pnpm'];
    const currentPrefix = prefixes.find((item) => form.customBuildCommand.startsWith(`${item} run`));
    if (currentPrefix && currentPrefix !== packageManager) {
      form.customBuildCommand = `${packageManager}${form.customBuildCommand.slice(currentPrefix.length)}`;
    }
  },
);

async function loadConfig(): Promise<void> {
  await appStore.loadPrefs();
  const saved = appStore.prefs[STORAGE_KEY] as {
    blogDir?: string;
    theme?: BlogTheme;
    base?: string;
    packageManager?: BlogPackageManager;
    customBuildCommand?: string;
    includeCi?: boolean;
  } | undefined;
  form.blogDir = saved?.blogDir || '';
  form.theme = saved?.theme || 'default';
  form.base = typeof saved?.base === 'string' ? saved.base : './';
  form.packageManager = saved?.packageManager || 'npm';
  form.customBuildCommand = saved?.customBuildCommand || `${form.packageManager} run build`;
  const savedGithub = appStore.prefs[GITHUB_KEY] as Partial<typeof github> | undefined;
  if (savedGithub) {
    Object.assign(github, savedGithub);
  }
  repoSlug.value = github.owner && github.repo ? `${github.owner}/${github.repo}` : github.owner || github.repo;
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

async function saveAllConfig(): Promise<void> {
  await saveConfig();
  await saveSftpConfig();
  await appStore.setPref(GITHUB_KEY, { ...github });
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

async function showNodeGuide(): Promise<void> {
  const steps = [
    t('blog.nodeGuideStep1'),
    t('blog.nodeGuideStep2'),
    t('blog.nodeGuideStep3'),
  ];
  await ElMessageBox.alert(steps.join('\n'), t('blog.nodeGuideTitle'), {
    type: 'warning',
    confirmButtonText: t('action.confirm'),
  });
}

async function chooseDir(): Promise<void> {
  const result = await pickDirectory();
  if (result.ok && result.data) {
    form.blogDir = result.data;
  } else if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

function buildScriptName(): string | undefined {
  const command = form.customBuildCommand.trim();
  if (!command) {
    return undefined;
  }
  const matched = command.match(/^(?:npm|yarn|pnpm)(?:\s+run)?\s+([A-Za-z0-9:_-]+)/);
  return matched?.[1] || command;
}

async function runBuild(): Promise<void> {
  if (!form.blogDir.trim()) {
    ElMessage.warning(t('blog.needDir'));
    return;
  }
  building.value = true;
  progress.value = [];
  distDir.value = '';
  buildEnv.value = null;
  try {
    const result = await buildBlog({
      blogDir: form.blogDir.trim(),
      packageManager: form.packageManager,
      script: buildScriptName(),
      theme: form.theme,
      base: form.base.trim(),
    });
    if (!result.ok) {
      if (result.error.code === 'NODE_NOT_FOUND') {
        await showNodeGuide();
      } else {
        ElMessage.error(t('blog.buildFailed', { message: result.error.message }));
      }
      return;
    }
    buildEnv.value = result.data.env;
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

async function runExport(includeCi = true): Promise<void> {
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
      includeCi,
    });
    if (!result.ok) {
      ElMessage.error(t('blog.exportFailed', { message: result.error.message }));
      return;
    }
    lastResult.value = result.data;
    ElMessage.success(t('blog.exportDone', { count: result.data.writtenFiles, skipped: result.data.skippedFiles ?? 0 }));
  } finally {
    exporting.value = false;
  }
}

async function exportCI(): Promise<void> {
  if (!form.blogDir.trim()) {
    ElMessage.warning(t('blog.needDir'));
    return;
  }
  exporting.value = true;
  lastResult.value = null;
  try {
    await saveConfig();
    const result = await exportBlogCi(form.blogDir.trim());
    if (!result.ok) {
      ElMessage.error(t('blog.ciFailed', { message: result.error.message }));
      return;
    }
    ElMessage.success(t('blog.ciDone', { written: result.data.written.length, skipped: result.data.skipped.length }));
  } finally {
    exporting.value = false;
  }
}

async function saveOnly(): Promise<void> {
  if (!form.blogDir.trim()) {
    ElMessage.warning(t('blog.needDir'));
    return;
  }
  savingConfig.value = true;
  try {
    await saveAllConfig();
    ElMessage.success(t('blog.saved'));
    visible.value = false;
  } catch (error) {
    ElMessage.error(t('blog.saveFailed', { message: error instanceof Error ? error.message : String(error) }));
  } finally {
    savingConfig.value = false;
  }
}

async function saveAndDeploy(): Promise<void> {
  if (!form.blogDir.trim()) {
    ElMessage.warning(t('blog.needDir'));
    return;
  }
  deploying.value = true;
  try {
    await saveAllConfig();
    if (activeDeployTab.value === 'github') {
      await runDispatch();
    } else if (activeDeployTab.value === 'ci') {
      await runExport(true);
    } else {
      await runBuild();
    }
  } catch (error) {
    ElMessage.error(t('blog.saveFailed', { message: error instanceof Error ? error.message : String(error) }));
  } finally {
    deploying.value = false;
  }
}

async function openGithubTokenGuide(): Promise<void> {
  const url = 'https://github.com/settings/tokens/new?scopes=workflow&description=Coolma%20Blog%20Deploy';
  try {
    const result = await openExternal(url);
    if (result.ok) {
      return;
    }
  } catch {
    // Browser preview has no Electron bridge; fall through to a normal window.
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
</script>

<style scoped>
.blog-deploy-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 4px 8px 4px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.blog-deploy-toolbar-icon {
  color: var(--el-color-primary);
  font-size: 24px;
}

.blog-deploy-toolbar-title {
  flex: 1;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blog-deploy-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.blog-deploy-close:hover {
  background: var(--el-fill-color);
}

.blog-deploy-content {
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
}

.config-section {
  display: flex;
  flex-direction: column;
  margin-bottom: 4px;
}

.config-section + .config-section {
  margin-top: 16px;
  margin-bottom: 0;
}

.config-label {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

.config-label::before {
  width: 3px;
  height: 14px;
  margin-right: 6px;
  border-radius: 1px;
  background: var(--el-color-primary);
  content: '';
}

.config-label.sub-label {
  margin-top: 10px;
}

.required {
  margin-left: 2px;
  color: inherit;
}

.blog-dir-row {
  display: flex;
  width: 100%;
  gap: 8px;
}

.blog-dir-row .el-button {
  flex: none;
}

.field-hint {
  width: 100%;
  margin-top: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 11.5px;
  line-height: 1.55;
}

.segmented {
  display: flex;
  width: 100%;
}

.segmented :deep(.el-radio-button) {
  flex: 1;
}

.segmented :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
}

.segmented :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: 6px 0 0 6px;
}

.segmented :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 6px 6px 0;
}

.package-manager-toggle {
  width: 180px;
}

.deploy-separator {
  height: 1px;
  margin: 16px 0;
  background: var(--el-border-color-lighter);
}

.deploy-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.deploy-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.deploy-tabs :deep(.el-tabs__item) {
  height: 36px;
  padding: 0 12px;
  font-size: 12px;
  line-height: 36px;
}

.deploy-tabs :deep(.el-tabs__item:first-child) {
  padding-left: 6px;
}

.deploy-tabs :deep(.el-tabs__active-bar) {
  height: 2px;
}

.deploy-tabs :deep(.el-tabs__content) {
  padding-top: 12px;
  overflow: visible;
}

.deploy-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.deploy-tab-label .el-icon {
  font-size: 14px;
}

.deploy-form {
  padding-top: 0;
}

.deploy-form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.deploy-form :deep(.el-form-item__label) {
  margin-bottom: 2px;
  color: var(--el-text-color-secondary);
  font-size: 11.5px;
  line-height: 1.4;
}

.token-hint {
  margin-top: 2px;
}

.password-eye {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  cursor: pointer;
}

.password-eye:hover {
  color: var(--el-color-primary);
}

.token-hint code {
  padding: 1px 3px;
  border-radius: 2px;
  background: rgb(0 0 0 / 6%);
  font-size: 11px;
}

.text-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 11px;
  cursor: pointer;
}

.ci-hint {
  margin: 0 0 8px;
  line-height: 1.7;
}

.sftp-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.sftp-toggle-row:first-child {
  margin-top: 0;
}

.sftp-host-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.sftp-col {
  flex: 1;
  min-width: 0;
}

.sftp-port-col {
  flex: 0 0 108px;
  width: 108px;
}

.sftp-port-col :deep(.el-input__inner) {
  text-align: left;
}

.sftp-mini-label {
  margin-bottom: 2px;
  color: var(--el-text-color-secondary);
  font-size: 11.5px;
  line-height: 1.4;
}

.sftp-field {
  width: 100%;
  margin-top: 8px;
}

.auth-toggle {
  width: 220px;
}

.blog-progress {
  max-height: 180px;
  margin-top: 12px;
  padding: 8px 10px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: rgb(15 23 42 / 3%);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.blog-progress-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
  font-family: inherit;
  font-weight: 600;
}

.blog-progress-line {
  white-space: pre-wrap;
  word-break: break-all;
}

.blog-progress-line.is-err {
  color: var(--el-color-danger);
}

.blog-env {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 10px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  font-size: 12px;
  line-height: 1.6;
}

.blog-env-title {
  width: 100%;
  font-weight: 600;
}

.blog-env span {
  color: var(--el-text-color-regular);
}

.blog-result {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

.blog-result-title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}

.blog-result ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.8;
}

.blog-result-gap {
  color: var(--el-text-color-secondary);
}

.blog-result-dist {
  word-break: break-all;
}

.blog-deploy-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
}

.blog-deploy-actions .el-button {
  margin-left: 0;
  font-size: 13px;
}

.blog-deploy-actions .cancel-button {
  color: var(--el-text-color-regular);
}

html.dark .blog-progress {
  background: rgb(255 255 255 / 4%);
}

html.dark .password-eye {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  cursor: pointer;
}

.password-eye:hover {
  color: var(--el-color-primary);
}

.token-hint code {
  background: rgb(255 255 255 / 8%);
}
</style>
