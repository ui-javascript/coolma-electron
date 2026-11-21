<template>
  <el-dialog
    v-model="visible"
    width="500px"
    top="15vh"
    append-to-body
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="update-dialog"
  >
    <div class="update-toolbar">
      <el-icon class="update-toolbar-icon"><Refresh /></el-icon>
      <span class="update-toolbar-title">{{ t('update.title') }}</span>
      <button type="button" class="update-close" :title="t('action.close')" @click="visible = false">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="update-body">
      <div class="update-lines">
        <p>{{ t('update.size') }} {{ transferredText }}/{{ totalText }}</p>
        <p>{{ t('update.speed') }} {{ speedText }}</p>
      </div>

      <div class="update-progress">
        <div class="update-progress-fill" :style="{ width: `${progressValue}%` }" />
        <span class="update-progress-badge">{{ progressLabel }}</span>
      </div>

      <p v-if="message" class="update-message" :class="{ 'is-error': errorState }">{{ message }}</p>
    </div>

    <template #footer>
      <div class="update-footer">
        <el-button text class="update-action" @click="visible = false">{{ t('update.hide') }}</el-button>
        <el-button
          v-if="available && !downloaded"
          text
          class="update-action"
          :loading="downloading"
          @click="startDownload"
        >
          {{ t('update.download') }}
        </el-button>
        <el-button text class="update-action" :disabled="!downloaded" @click="install">
          {{ t('update.install') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 检查更新 / 下载进度（复刻 vue2 update/UpdateDialog）。
 * 事件来自主进程 electron-updater：checking / available / not-available / progress / downloaded / error。
 * 未打包（开发模式）或没配 publish 源时，错误原文展示，不吞。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Close, Refresh } from '@element-plus/icons-vue';
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

const progressValue = computed(() => Math.min(100, Math.max(0, Number(progress.value) || 0)));
const progressLabel = computed(() => `${progressValue.value.toFixed(2)}%`);

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
.update-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 4px 8px 2px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.update-toolbar-icon {
  color: var(--el-color-primary);
  font-size: 21px;
}

.update-toolbar-title {
  flex: 1;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 700;
}

.update-close {
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

.update-close:hover {
  background: var(--el-fill-color);
}

.update-body {
  padding: 16px;
}

.update-lines {
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.update-lines p {
  margin: 0 0 4px;
}

.update-progress {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 35px;
  overflow: hidden;
  border-radius: 17.5px;
  background: var(--el-fill-color-light);
}

.update-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 17.5px;
  background: var(--el-color-primary);
  transition: width 0.2s ease;
}

.update-progress-badge {
  position: relative;
  z-index: 1;
  padding: 1px 7px;
  border-radius: 10px;
  background: #fff;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.update-message {
  margin: 10px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.update-message.is-error {
  color: var(--el-color-danger);
}

.update-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.update-action {
  color: var(--el-color-primary);
}
</style>
