<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('notes.tag')"
    width="70vw"
    top="5vh"
    append-to-body
    class="tag-editor-dialog"
    @update:model-value="close"
  >
    <div class="tag-dialog-body">
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

      <div v-if="options.length" class="tag-chip-grid">
        <button
          v-for="tag in options"
          :key="tag.id"
          type="button"
          class="tag-chip"
          :class="{ active: selected.includes(tag.name) }"
          :style="{ background: chipColor(tag) }"
          @click="toggleTag(tag.name)"
        >
          <el-icon><PriceTag /></el-icon>
          <span>{{ tag.name }}</span>
          <el-icon v-if="selected.includes(tag.name)" class="tag-chip-check"><Check /></el-icon>
        </button>
      </div>
      <div v-else class="tag-dialog-empty">{{ t('notes.noTags') }}</div>
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
import { ref, watch } from 'vue';
import { Check, PriceTag } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: boolean;
  value: string[];
  options: Array<{ id: number; name: string; color?: string }>;
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

function toggleTag(name: string): void {
  const index = selected.value.indexOf(name);
  if (index >= 0) {
    selected.value.splice(index, 1);
  } else {
    selected.value.push(name);
  }
}

function chipColor(tag: { color?: string }): string {
  return tag.color && tag.color.trim() ? tag.color : '#409eff';
}

function close(): void {
  emit('update:modelValue', false);
}

function confirm(): void {
  const unique = Array.from(new Set(selected.value.map((tag) => tag.trim()).filter(Boolean)));
  emit('confirm', unique);
}
</script>

<style scoped>
.tag-dialog-body {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
  height: 58vh;
}

.tag-select {
  width: 100%;
  flex: 0 0 auto;
}

.tag-chip-grid {
  display: flex;
  align-content: flex-start;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
  overflow-y: auto;
  padding: 2px;
}

.tag-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 99px;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  opacity: 0.82;
  transition: opacity 0.15s, box-shadow 0.15s, transform 0.15s;
}

.tag-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-chip:hover {
  opacity: 1;
}

.tag-chip.active {
  box-shadow: 0 0 0 2px var(--coolma-panel), 0 0 0 3px color-mix(in srgb, var(--themeColor, #409eff) 55%, transparent);
  opacity: 1;
  transform: translateY(-1px);
}

.tag-chip-check {
  font-size: 13px;
}

.tag-dialog-empty {
  flex: 1;
  padding: 20px 4px;
  color: var(--coolma-muted);
  font-size: 13px;
}
</style>

<style>
.tag-editor-dialog {
  display: flex;
  height: 70vh;
  flex-direction: column;
  border-radius: 4px;
}

.tag-editor-dialog .el-dialog__title {
  font-size: 16px;
  font-weight: 700;
}

.tag-editor-dialog .el-dialog__body {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
</style>
