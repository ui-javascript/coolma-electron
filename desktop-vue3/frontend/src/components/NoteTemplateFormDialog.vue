<template>
  <el-dialog :model-value="modelValue" :title="title" width="520px" @update:model-value="close">
    <el-form label-width="72px">
      <el-form-item :label="t('noteTemplateName')">
        <el-input v-model="name" maxlength="100" show-word-limit />
      </el-form-item>
      <el-form-item :label="t('noteTemplateDesc')">
        <el-input v-model="desc" maxlength="500" />
      </el-form-item>
      <el-form-item :label="t('noteTemplateContent')">
        <el-input v-model="content" type="textarea" :rows="10" class="content-input" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close(false)">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" @click="submit">{{ t('action.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { NoteTemplate, NoteTemplateInput } from '@/services/ipc';
import { randomUUID } from '@/utils/id';

const props = defineProps<{
  modelValue: boolean;
  value: NoteTemplate | null;
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
  props.value ? t('noteTemplateEdit') : t('noteTemplateAdd'),
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
.content-input :deep(textarea) {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
</style>
