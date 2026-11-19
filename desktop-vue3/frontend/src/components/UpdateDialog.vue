<template>
  <el-dialog v-model="visible" :title="t('update.title')" width="440px" append-to-body :close-on-click-modal="false">
    <div class="update-body">
      <div class="update-line">{{ t('update.size') }}: {{ transferredText }} / {{ totalText }}</div>
      <div class="update-line">{{ t('update.speed') }}: {{ speedText }}</div>
      <el-progress :percentage="Math.min(100, Math.round(progress))" :stroke-width="18" class="update-progress" />
      <el-alert v-if="message" :type="errorState ? 'error' : 'info'" :closable="false" :title="message" />
    </div>
    <template #footer>
      <el-button @click="visible = false">{{ t('update.hide') }}</el-button>
      <el-button v-if="available && !downloaded" type="primary" :loading="downloading" @click="startDownload">
        {{ t('update.download') }}
      </el-button>
      <el-button v-if="downloaded" type="danger" @click="install">{{ t('update.install') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 检查更新 / 下载进度（复刻 vue2 update/UpdateDialog）。
 * 事件来自主进程 electron-updater：checking / available / not-available / progress / downloaded / error。
 * 未打包（开发模式）或没配 publish 源时，错误原文展示，不吞。
 */
import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { onUpdaterEvent, type UpdaterEvent } from '@/services/updater';

const visible = defineModel<boolean>({ default: false });
const { t } = useI18n();
const progress = ref(0);
const available = ref(false);
const downloaded = ref(false);
const downloading = ref(false);
const message = ref('');
const errorState = ref(false);
const speedText = ref('—');
const transferredText = ref('0 B');
const totalText = ref('0 B');

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const stop = onUpdaterEvent((event: UpdaterEvent) => {
  switch (event.type) {
    case 'checking':
      message.value = t('update.checking');
      errorState.value = false;
      break;
    case 'available':
      available.value = true;
      message.value = t('update.available');
      errorState.value = false;
      break;
    case 'not-available':
      available.value = false;
      message.value = t('update.notAvailable');
      errorState.value = false;
      break;
    case 'progress':
      progress.value = event.percent;
      speedText.value = `${formatBytes(event.bytesPerSecond)}/s`;
      transferredText.value = formatBytes(event.transferred);
      totalText.value = formatBytes(event.total);
      break;
    case 'downloaded':
      downloaded.value = true;
      downloading.value = false;
      progress.value = 100;
      message.value = t('update.downloaded');
      errorState.value = false;
      break;
    case 'error':
      errorState.value = true;
      downloading.value = false;
      message.value = event.message;
      break;
    default:
      break;
  }
});

async function startDownload(): Promise<void> {
  downloading.value = true;
  const { downloadUpdate } = await import('@/services/updater');
  const result = await downloadUpdate();
  if (result.ok === false) {
    errorState.value = true;
    message.value = result.error.message;
    downloading.value = false;
  }
}

async function install(): Promise<void> {
  const { installUpdate } = await import('@/services/updater');
  const result = await installUpdate();
  if (result.ok === false) {
    ElMessage.error(result.error.message);
  }
}

onBeforeUnmount(() => stop());
</script>

<style scoped>
.update-body { display: flex; flex-direction: column; gap: 10px; }
.update-line { font-size: 13px; color: var(--el-text-color-secondary); }
.update-progress { margin-top: 4px; }
</style>
