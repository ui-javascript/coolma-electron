<template>
  <el-dialog
    :model-value="modelValue"
    width="560px"
    top="10vh"
    class="note-template-form-dialog"
    @update:model-value="close"
  >
    <template #header>
      <div class="note-template-form-title">
        <el-icon class="note-template-form-icon"><Document /></el-icon>
        <span>{{ title }}</span>
      </div>
    </template>
    <div class="note-template-form-body">
      <div class="note-template-form-grid">
        <div class="note-template-field">
          <div class="note-template-label">{{ t('noteTemplateName') }}</div>
          <el-input
            v-model="name"
            maxlength="100"
            :placeholder="t('noteTemplateNamePlaceholder')"
            class="note-template-input"
            :disabled="readonly"
          />
        </div>
        <div class="note-template-field">
          <div class="note-template-label">{{ t('noteTemplateDesc') }}</div>
          <el-input
            v-model="desc"
            maxlength="500"
            :placeholder="t('noteTemplateDescPlaceholder')"
            class="note-template-input"
            :disabled="readonly"
          />
        </div>
        <div class="note-template-field note-template-field--content">
          <div class="note-template-label">{{ t('noteTemplateContent') }}</div>
          <el-input
            v-model="content"
            type="textarea"
            :rows="8"
            :placeholder="t('noteTemplateContentPlaceholder')"
            class="content-input"
            :disabled="readonly"
          />
          <div class="note-template-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>{{ t('noteTemplateContentHint') }}</span>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="note-template-form-footer">
        <el-button text @click="close(false)">{{ readonly ? t('action.close') : t('action.cancel') }}</el-button>
        <el-button v-if="!readonly" text class="note-template-save" @click="submit">{{ t('action.save') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Document, InfoFilled } from '@element-plus/icons-vue';
import type { NoteTemplate, NoteTemplateInput } from '@/services/ipc';
import { randomUUID } from '@/utils/id';

const props = defineProps<{
  modelValue: boolean;
  value: NoteTemplate | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'submit', value: NoteTemplateInput): void;
}>();

const { t } = useI18n();

const name = ref('');
const desc = ref('');
const content = ref('');

const title = computed(() =>
  props.readonly
    ? t('noteTemplateViewTitle')
    : props.value
      ? t('noteTemplateEdit')
      : t('noteTemplateAdd'),
);

watch(
  () => [props.modelValue, props.value] as const,
  ([visible, tpl]) => {
    if (!visible) {
      return;
    }
    name.value = tpl?.name ?? '';
    desc.value = tpl?.desc ?? '';
    content.value = tpl?.content ?? '';
  },
  { immediate: true },
);

function close(visible: boolean): void {
  emit('update:modelValue', visible);
}

function submit(): void {
  if (!name.value.trim()) {
    ElMessage.warning(t('noteTemplateNameRequired'));
    return;
  }
  emit('submit', {
    id: props.value?.id ?? `tpl-${randomUUID()}`,
    name: name.value.trim(),
    desc: desc.value,
    content: content.value,
    sortOrder: props.value?.sortOrder ?? 0,
  });
}
</script>

<style scoped>
.note-template-form-grid {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 16px;
}

.note-template-field {
  min-width: 0;
}

.note-template-field--content {
  grid-column: 1 / -1;
}

.note-template-label {
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.note-template-input {
  width: 100%;
}

.note-template-input :deep(.el-input__wrapper) {
  min-height: 36px;
}

.note-template-input :deep(.el-input__inner) {
  font-size: 13px;
}

.content-input :deep(textarea) {
  min-height: 220px !important;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
}

.note-template-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.note-template-hint .el-icon {
  flex: none;
}

.note-template-form-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.note-template-form-icon {
  color: #f57c00;
  font-size: 18px;
}

.note-template-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.note-template-save {
  color: #f57c00;
}
</style>
