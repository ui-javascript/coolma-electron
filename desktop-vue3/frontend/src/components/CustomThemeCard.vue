<template>
  <el-card class="settings-card custom-theme-card" shadow="never">
    <template #header>
      <div class="card-heading">
        <span>{{ t('settings.customTheme') }}</span>
        <el-tag v-if="themes.length" size="small" effect="plain">{{ themes.length }}</el-tag>
      </div>
    </template>

    <div class="custom-theme-row">
      <el-select
        v-model="selected"
        class="custom-theme-select"
        size="default"
        clearable
        :disabled="!ipcReady"
        :loading="loading"
        :placeholder="t('settings.customThemeNone')"
        @change="handleChange"
      >
        <el-option
          v-for="item in themes"
          :key="item.fileName"
          :label="`${item.name}${item.dark ? t('settings.customThemeDarkSuffix') : ''}`"
          :value="item.name"
        />
      </el-select>

      <div class="custom-theme-actions">
        <el-tooltip :content="t('settings.customThemeHelp')" placement="top">
          <el-button circle text :aria-label="t('settings.customThemeHelp')" @click="openHelp">
            <el-icon><QuestionFilled /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="t('settings.customThemeRefresh')" placement="top">
          <el-button
            circle
            text
            :loading="loading"
            :disabled="!ipcReady"
            :aria-label="t('settings.customThemeRefresh')"
            @click="refreshList"
          >
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="t('settings.customThemeOpen')" placement="top">
          <el-button
            circle
            text
            :disabled="!ipcReady"
            :aria-label="t('settings.customThemeOpen')"
            @click="openFolder"
          >
            <el-icon><FolderOpened /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <p class="custom-theme-hint">{{ t('settings.customThemeHint') }}</p>
    <p v-if="!ipcReady" class="custom-theme-hint">{{ t('settings.customThemeDesktopOnly') }}</p>
    <p v-if="errorText" class="custom-theme-error">{{ errorText }}</p>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { FolderOpened, QuestionFilled, Refresh } from '@element-plus/icons-vue';
import {
  hasIpc,
  listCustomThemes,
  loadCustomTheme,
  openThemeFolder,
  refreshCustomThemes,
  type CustomThemeMeta,
} from '@/services/ipc';
import { openExternal } from '@/services/cloudfn';
import { useAppStore } from '@/stores/app';

/**
 * 自定义主题目录（复刻 vue2 General > Theme 的三按钮 + q-select）。
 *
 * 主题目录固定在 `userData/themes`，只识别 `*.light.css` / `*.dark.css`；
 * 页面里的下拉是主题名，右侧问号/刷新/打开目录与 vue2 完全同序。
 * 选中后整份 CSS 注入 `<head>`，`.dark.css` 同时把应用切到深色基线。
 */
const THEME_HELP_URL = 'https://www.tanknee.cn/Memocast/docs/tutorial-development/create-theme';

const { t } = useI18n();
const appStore = useAppStore();
const ipcReady = hasIpc();
const themes = ref<CustomThemeMeta[]>([]);
const selected = ref<string>(appStore.customTheme);
const loading = ref(false);
const errorText = ref('');

watch(
  () => appStore.customTheme,
  (value) => {
    selected.value = value;
  },
);

async function fetchThemes(refresh: boolean): Promise<void> {
  if (!ipcReady) {
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const result = refresh ? await refreshCustomThemes() : await listCustomThemes();
    if (result.ok) {
      themes.value = result.data ?? [];
    } else {
      errorText.value = result.error.message;
    }
  } catch (error) {
    errorText.value = String((error as Error)?.message || error);
  } finally {
    loading.value = false;
  }
}

async function handleChange(name: string | ''): Promise<void> {
  if (!name) {
    appStore.clearCustomTheme();
    ElMessage({ message: t('settings.customThemeCleared'), type: 'success' });
    return;
  }
  const result = await loadCustomTheme(name);
  if (!result.ok) {
    errorText.value = result.error.message;
    ElMessage({ message: t('settings.customThemeLoadFailed'), type: 'error' });
    return;
  }
  appStore.setCustomTheme(result.data.name, result.data.css, result.data.dark);
  ElMessage({ message: t('settings.customThemeSwitched', { name: result.data.name }), type: 'success' });
}

async function refreshList(): Promise<void> {
  await fetchThemes(true);
}

async function openFolder(): Promise<void> {
  const result = await openThemeFolder();
  if (!result.ok) {
    errorText.value = result.error.message;
  }
}

async function openHelp(): Promise<void> {
  if (!ipcReady) {
    window.open(THEME_HELP_URL, '_blank', 'noopener');
    return;
  }
  const result = await openExternal(THEME_HELP_URL);
  if (!result.ok) {
    errorText.value = result.error.message;
  }
}

onMounted(() => {
  void fetchThemes(false);
});
</script>

<style scoped>
.custom-theme-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.custom-theme-select {
  width: 260px;
}

.custom-theme-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.custom-theme-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.custom-theme-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.custom-theme-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-color-danger);
}
</style>
