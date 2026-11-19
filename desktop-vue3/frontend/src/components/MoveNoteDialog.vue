<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('notes.moveTitle')"
    width="420px"
    append-to-body
    @update:model-value="close"
  >
    <div class="move-body">
      <div class="move-current">
        {{ t('notes.moveCurrent') }}: <strong>{{ folderLabel(current) }}</strong>
      </div>

      <el-radio-group v-model="selected" class="folder-list">
        <el-radio v-for="folder in folderOptions" :key="folder" :value="folder" class="folder-option">
          {{ folderLabel(folder) }}
        </el-radio>
      </el-radio-group>

      <el-input
        v-model="newFolder"
        class="new-folder"
        :placeholder="t('notes.moveNewFolderPlaceholder')"
        clearable
      >
        <template #prefix>{{ t('notes.moveNewFolder') }}</template>
      </el-input>
    </div>

    <template #footer>
      <el-button size="small" @click="close">{{ t('action.cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="pending" @click="confirm">
        {{ t('action.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: boolean;
  current: string;
  folders: string[];
  pending?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'confirm', category: string): void;
}>();

const { t } = useI18n();
const selected = ref('/');
const newFolder = ref('');

const folderOptions = computed(() => {
  const set = new Set<string>(props.folders);
  set.add('/');
  return Array.from(set).sort((left, right) => left.localeCompare(right));
});

function folderLabel(category: string): string {
  const parts = category.split('/').filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : t('notes.rootFolder');
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      selected.value = props.current || '/';
      newFolder.value = '';
    }
  },
);

function close(): void {
  emit('update:modelValue', false);
}

function confirm(): void {
  const target = newFolder.value.trim() || selected.value || '/';
  emit('confirm', target.startsWith('/') ? target : `/${target}`);
}
</script>

<style scoped>
.move-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.move-current {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}

.folder-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
}

.folder-option {
  margin-right: 0;
  height: 28px;
}

.new-folder :deep(.el-input__prefix) {
  color: var(--el-text-color-placeholder, #a8abb2);
  font-size: 12px;
}
</style>
