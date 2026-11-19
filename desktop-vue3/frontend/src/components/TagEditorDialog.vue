<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('notes.tagsTitle')"
    width="420px"
    append-to-body
    @update:model-value="close"
  >
    <el-select
      v-model="selected"
      multiple
      filterable
      allow-create
      default-first-option
      :reserve-keyword="false"
      class="tag-select"
      :placeholder="t('notes.tagsPlaceholder')"
    >
      <el-option v-for="tag in options" :key="tag.id" :label="tag.name" :value="tag.name" />
    </el-select>

    <template #footer>
      <el-button size="small" @click="close">{{ t('action.cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="pending" @click="confirm">
        {{ t('action.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: boolean;
  value: string[];
  options: Array<{ id: number; name: string }>;
  pending?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'confirm', tags: string[]): void;
}>();

const { t } = useI18n();
const selected = ref<string[]>([]);

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      selected.value = [...props.value];
    }
  },
);

function close(): void {
  emit('update:modelValue', false);
}

function confirm(): void {
  const unique = Array.from(new Set(selected.value.map((tag) => tag.trim()).filter(Boolean)));
  emit('confirm', unique);
}
</script>

<style scoped>
.tag-select {
  width: 100%;
}
</style>
