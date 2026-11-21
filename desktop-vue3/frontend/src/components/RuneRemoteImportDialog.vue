<template>
  <el-dialog
    :model-value="modelValue"
    width="520px"
    top="8vh"
    append-to-body
    :show-close="false"
    class="remote-import-dialog"
    @update:model-value="close"
  >
    <div class="remote-import-toolbar">
      <el-icon class="remote-import-toolbar-icon"><Download /></el-icon>
      <span class="remote-import-toolbar-title">{{ t('library.remoteRuneTitle') }}</span>
      <button type="button" class="remote-import-close" :title="t('action.close')" @click="close(false)">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="remote-import-body">
      <div class="remote-import-field">
        <div class="remote-import-label">{{ t('library.remoteRuneUrlLabel') }}</div>
        <el-input
          v-model="sourceUrl"
          size="small"
          :placeholder="t('library.remoteRuneUrlPlaceholder')"
          clearable
          spellcheck="false"
          @keyup.enter="submit"
        />
        <div class="remote-import-hint">{{ t('library.remoteRuneHint') }}</div>
      </div>

      <div class="remote-import-field">
        <div class="remote-import-label">{{ t('library.remoteRuneCategoryLabel') }}</div>
        <el-select
          v-model="category"
          size="small"
          clearable
          :placeholder="t('library.remoteRuneAuto')"
          class="remote-import-select"
        >
          <el-option v-for="item in categoryItems" :key="item.value" :label="t(item.label)" :value="item.value" />
        </el-select>
      </div>

      <div v-if="error" class="remote-import-error">
        <el-icon><CircleCloseFilled /></el-icon>
        <span>{{ error }}</span>
      </div>
    </div>

    <template #footer>
      <div class="remote-import-actions">
        <el-button text :disabled="importing" @click="close(false)">{{ t('action.cancel') }}</el-button>
        <el-button
          text
          type="primary"
          :loading="importing"
          :disabled="!sourceUrl.trim()"
          @click="submit"
        >
          {{ t('library.remoteRuneImport') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Close, CircleCloseFilled, Download } from '@element-plus/icons-vue';
import { fetchRemotePack, saveRune } from '@/services/ipc';
import { inferRemoteRuneMeta, REMOTE_RUNE_MAX_BYTES } from '@shared/runeRemote';
import { RuneCategoryEnum, resolveLibraryCategory } from '@shared/enums/library';
import type { RuneCard } from '@shared/types/domain';

const props = defineProps<{
  modelValue: boolean;
  initialCategory?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'imported', rune: RuneCard): void;
}>();

const { t } = useI18n();
const sourceUrl = ref('');
const category = ref('');
const importing = ref(false);
const error = ref('');

const categoryItems = computed(() => RuneCategoryEnum.items as Array<{ value: string; label: string }>);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      error.value = '';
      sourceUrl.value = '';
      category.value = resolveLibraryCategory('rune', props.initialCategory);
    }
  },
);

function close(value = false): void {
  if (!importing.value) {
    emit('update:modelValue', value);
  }
}

function remoteId(): string {
  return `rune_remote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function submit(): Promise<void> {
  const url = sourceUrl.value.trim();
  if (!url || importing.value) {
    return;
  }
  importing.value = true;
  error.value = '';
  try {
    const fetched = await fetchRemotePack(url);
    if (!fetched.ok) {
      error.value = t('library.remoteRuneFailed', { message: fetched.error.message });
      return;
    }
    const text = fetched.data.text;
    if (new TextEncoder().encode(text).byteLength > REMOTE_RUNE_MAX_BYTES) {
      error.value = t('library.remoteRuneTooLarge');
      return;
    }
    const meta = inferRemoteRuneMeta(text, fetched.data.finalUrl, category.value);
    const saved = await saveRune({
      id: remoteId(),
      name: meta.name.slice(0, 100),
      desc: meta.desc.slice(0, 2000),
      color: '#7E57C2',
      icon: 'cloud_download',
      template: text,
      category: resolveLibraryCategory('rune', meta.category),
      sortOrder: 9999,
      inheritFromPrevious: 0,
    });
    if (!saved.ok) {
      const message = saved.error.message.includes('RUNE_DUPLICATE_NAME')
        ? t('library.remoteRuneDuplicate', { name: meta.name })
        : saved.error.message;
      error.value = t('library.remoteRuneFailed', { message });
      return;
    }
    emit('imported', saved.data);
    ElMessage.success(t('library.remoteRuneDone', { name: saved.data.name }));
    emit('update:modelValue', false);
  } catch (caught) {
    error.value = t('library.remoteRuneFailed', {
      message: caught instanceof Error ? caught.message : String(caught),
    });
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.remote-import-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 4px 8px 4px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.remote-import-toolbar-icon {
  color: var(--el-color-primary);
  font-size: 21px;
}

.remote-import-toolbar-title {
  flex: 1;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-import-close {
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

.remote-import-close:hover {
  background: var(--el-fill-color);
}

.remote-import-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}

.remote-import-field {
  display: flex;
  flex-direction: column;
}

.remote-import-label {
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
}

.remote-import-hint {
  margin-top: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 11px;
  line-height: 1.5;
}

.remote-import-select {
  width: 100%;
}

.remote-import-error {
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

.remote-import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}
</style>
