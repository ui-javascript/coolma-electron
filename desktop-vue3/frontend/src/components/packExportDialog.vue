<template>
  <el-dialog
    v-model="visible"
    width="480px"
    append-to-body
    :show-close="false"
    class="pack-export-dialog"
    :before-close="closeWhenIdle"
  >
    <div class="pack-export-toolbar">
      <el-icon class="pack-export-toolbar-icon"><Download /></el-icon>
      <span class="pack-export-toolbar-title">
        {{ t(kind === 'runes' ? 'library.exportRunes' : 'library.exportEchoes') }}
      </span>
      <button type="button" class="pack-export-close" :title="t('action.close')" @click="requestClose">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="pack-export-body">
      <div class="pack-export-info">
        <el-icon class="pack-export-info-icon"><InfoFilled /></el-icon>
        <span>
          {{ t('library.exportPrefix') }}
          <strong>{{ cards.length }}</strong>
          {{ t(kind === 'runes' ? 'library.exportRuneSuffix' : 'library.exportEchoSuffix') }}
        </span>
      </div>

      <div v-if="cards.length > 0" class="pack-export-preview">
        <div class="pack-export-preview-title">{{ t('library.exportPreview') }}</div>
        <div class="pack-export-preview-list">
          <div v-for="card in cards.slice(0, previewLimit)" :key="card.id" class="pack-export-preview-item">
            <span class="card-dot" :style="{ color: card.color }">●</span>
            <span class="pack-export-preview-name">{{ card.name }}</span>
            <span class="pack-export-preview-category">({{ card.category }})</span>
          </div>
          <div v-if="cards.length > previewLimit" class="pack-export-preview-more">
            {{ t('library.exportMore', { count: cards.length - previewLimit }) }}
          </div>
        </div>
      </div>

      <div v-if="error" class="pack-export-error">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ error }}</span>
      </div>
    </div>

    <template #footer>
      <div class="pack-export-footer">
        <el-button text class="pack-export-cancel" :disabled="exporting" @click="requestClose">
          {{ t('action.cancel') }}
        </el-button>
        <el-button
          text
          class="pack-export-action"
          :loading="exporting"
          :disabled="!cards.length"
          @click="savePack"
        >
          <el-icon><Download /></el-icon>
          {{ t('pack.export') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { Close, Download, InfoFilled, WarningFilled } from '@element-plus/icons-vue';
import type { EchoCard, RuneCard } from '@shared/types/domain';
import { exportPackFile } from '@/services/ipc';
import { buildPack, type PackKind } from '@/services/pack';

const props = defineProps<{ kind: PackKind; cards: ReadonlyArray<RuneCard | EchoCard> }>();
const visible = defineModel<boolean>({ required: true });
const { t } = useI18n();
const previewLimit = 10;
const exporting = ref(false);
const error = ref('');


watch(visible, (open) => {
  if (open) {
    error.value = '';
  }
});

function closeWhenIdle(done: () => void): void {
  if (!exporting.value) {
    done();
  }
}

function requestClose(): void {
  if (!exporting.value) {
    visible.value = false;
  }
}

async function savePack(): Promise<void> {
  if (!props.cards.length || exporting.value) {
    return;
  }
  exporting.value = true;
  error.value = '';
  try {
    const content = buildPack(props.kind, props.cards);
    const fileName = `coolma-${props.kind}-pack-${new Date().toISOString().slice(0, 10)}.json`;
    const result = await exportPackFile(fileName, content);
    if (!result.ok) {
      error.value = result.error.message;
    } else if (result.data) {
      ElMessage.success(t('pack.exported', { path: result.data }));
      visible.value = false;
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.pack-export-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 4px 8px 4px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.pack-export-toolbar-icon {
  color: var(--el-color-primary);
  font-size: 20px;
}

.pack-export-toolbar-title {
  flex: 1;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 700;
}

.pack-export-close {
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

.pack-export-close:hover {
  background: var(--el-fill-color);
}

.pack-export-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}

.pack-export-info {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.pack-export-info-icon {
  color: var(--el-text-color-secondary);
  font-size: 16px;
}

.pack-export-info strong {
  color: #7e57c2;
}

.pack-export-preview {
  padding: 12px;
  border-radius: 6px;
  background: rgb(126 87 194 / 6%);
}

.pack-export-preview-title {
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.pack-export-preview-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.pack-export-preview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.card-dot {
  font-size: 10px;
  line-height: 1;
}

.pack-export-preview-name {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.pack-export-preview-category {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.pack-export-preview-more {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-style: italic;
}

.pack-export-error {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgb(244 67 54 / 8%);
  color: #c62828;
  font-size: 12px;
  line-height: 1.5;
}

.pack-export-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.pack-export-cancel {
  color: var(--el-text-color-primary);
}

.pack-export-action {
  color: var(--el-color-primary);
}
</style>
