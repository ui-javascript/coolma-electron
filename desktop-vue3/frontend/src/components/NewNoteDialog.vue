<template>
  <el-dialog
    v-model="visible"
    :title="t('notes.createTitle')"
    width="500px"
    append-to-body
    class="new-note-dialog"
    @opened="focusTitle"
  >
    <div class="new-note-form">
      <div class="new-note-field">
        <label class="new-note-label">{{ t('noteTemplate') }}</label>
        <el-select
          v-model="templateId"
          class="new-note-control"
          :placeholder="t('noteTemplateEmptyOption')"
        >
          <el-option :value="''" :label="t('noteTemplateEmptyOption')" />
          <el-option
            v-for="tpl in templateOptions"
            :key="tpl.id"
            :value="tpl.id"
            :label="tpl.name"
          />
        </el-select>
      </div>
      <div class="new-note-field">
        <label class="new-note-label">{{ t('notes.titleLabel') }}</label>
        <el-input
          ref="titleInputRef"
          v-model="title"
          class="new-note-control"
          spellcheck="false"
          @keyup.enter="submit"
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" @click="submit">{{ t('action.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { InputInstance } from 'element-plus';
import { useNotesStore } from '@/stores/notes';
import { newNoteDefaults } from '@/utils/note';

/**
 * 新建笔记弹窗（复刻 vue2 addNoteHandler）：
 * 模板下拉置空模板于首位，标题预填「【分类】新笔记-YYYYMM.md」，打开即聚焦并全选标题。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean;
  category?: string;
  initialTemplateId?: string;
}>(), {
  category: '/',
  initialTemplateId: '',
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'submit', payload: { title: string; templateId?: string }): void;
}>();

const { t } = useI18n();
const notesStore = useNotesStore();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const templateId = ref('');
const title = ref('');
const titleInputRef = ref<InputInstance>();

/** 对齐 vue2 buildTemplateOptions：空模板另起，模板按 sortOrder、createdAt 升序。 */
const templateOptions = computed(() => {
  return notesStore.templates
    .filter((tpl) => tpl && tpl.id && String(tpl.name || '').trim())
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.createdAt || 0) - (b.createdAt || 0));
});

watch(() => props.modelValue, (open) => {
  if (!open) {
    return;
  }
  templateId.value = props.initialTemplateId || '';
  title.value = newNoteDefaults(props.category || '/', t).title;
  void notesStore.loadTemplates();
});

function focusTitle(): void {
  void nextTick(() => {
    const input = titleInputRef.value?.input;
    input?.focus();
    input?.select();
  });
}

function submit(): void {
  emit('submit', {
    title: title.value || t('notes.untitled'),
    ...(templateId.value ? { templateId: templateId.value } : {}),
  });
  visible.value = false;
}
</script>

<style scoped>
.new-note-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.new-note-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.new-note-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.new-note-control {
  width: 100%;
}
</style>

<style>
.new-note-dialog {
  width: 500px !important;
  max-width: 50vw;
  border-radius: 4px;
  font-weight: 600;
}
</style>
