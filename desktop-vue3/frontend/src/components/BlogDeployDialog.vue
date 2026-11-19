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
import { buildBlog, cancelBlogBuild, exportBlog, onBlogProgress, pickDirectory } from '@/services/blog';
import type { BlogBuildProgress, BlogExportOutput } from '@/services/blog';

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
}

async function saveConfig(): Promise<void> {
  await appStore.setPref(STORAGE_KEY, { ...form });
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
    ElMessage.success(t('blog.buildDone'));
  } finally {
    building.value = false;
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
.blog-progress { max-height: 180px; overflow-y: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: #0f172a08; padding: 8px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; }
.blog-progress-line { white-space: pre-wrap; word-break: break-all; }
.blog-progress-line.is-err { color: var(--el-color-danger); }
.blog-result-dist { word-break: break-all; }

.blog-result { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 14px; background: var(--el-fill-color-lighter); }
.blog-result-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.blog-result ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.8; }
.blog-result-gap { color: var(--el-text-color-secondary); }
</style>
