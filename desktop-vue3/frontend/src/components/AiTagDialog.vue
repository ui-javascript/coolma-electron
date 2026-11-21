<template>
  <el-dialog
    v-model="visible"
    :title="t('aiTag.title')"
    width="520px"
    append-to-body
    destroy-on-close
    @closed="reset"
  >
    <div class="ai-tag-note">{{ title || t('aiHelper.untitled') }}</div>
    <div v-if="existingTags.length" class="ai-tag-existing">
      <span class="ai-tag-label">{{ t('aiTag.existing') }}</span>
      <el-tag v-for="name in existingTags" :key="name" size="small" effect="plain">{{ name }}</el-tag>
    </div>
    <div v-if="busy" class="ai-tag-status">{{ t('aiTag.generating') }}</div>
    <div v-else-if="error" class="ai-tag-error">{{ error }}</div>
    <div v-else-if="suggested.length" class="ai-tag-result">
      <div class="ai-tag-label">{{ t('aiTag.suggested') }}</div>
      <el-checkbox-group v-model="selected" class="ai-tag-checks">
        <el-checkbox v-for="name in suggested" :key="name" :value="name">{{ name }}</el-checkbox>
      </el-checkbox-group>
    </div>
    <div v-else class="ai-tag-status">{{ t('aiTag.empty') }}</div>
    <template #footer>
      <el-button :disabled="busy" @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button :loading="busy" @click="generate">{{ t('aiTag.retry') }}</el-button>
      <el-button type="primary" :disabled="busy || selected.length === 0" @click="apply">
        {{ t('aiTag.apply') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { aiChat, type AiChatMessage } from '@/services/ipc';
import {
  DEFAULT_MAX_TOKENS,
  buildAutoTagMessages,
  parseTagNames,
} from '@/utils/autotag';

const props = defineProps<{
  modelValue: boolean;
  noteId?: number | null;
  title?: string;
  content?: string;
  /** 当前笔记已有的标签。 */
  existingTags: string[];
  /** 全库标签，给 prompt 优先复用，避免另造同义词。 */
  knownTags: string[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'apply', names: string[]): void;
}>();

const { t } = useI18n();
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const busy = ref(false);
const error = ref('');
const suggested = ref<string[]>([]);
const selected = ref<string[]>([]);

watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      void generate();
    }
  },
);

function reset(): void {
  busy.value = false;
  error.value = '';
  suggested.value = [];
  selected.value = [];
}

async function generate(): Promise<void> {
  if (busy.value || !props.noteId) {
    return;
  }
  const body = String(props.content ?? '').trim();
  if (!body) {
    error.value = t('aiTag.emptyContent');
    return;
  }
  busy.value = true;
  error.value = '';
  suggested.value = [];
  selected.value = [];
  try {
    const messages = buildAutoTagMessages({
      title: props.title,
      content: body,
      existingTagNames: props.knownTags,
      maxTags: 3,
    }) as AiChatMessage[];
    const result = await aiChat({ messages, temperature: 0.2, maxTokens: DEFAULT_MAX_TOKENS });
    if (!result.ok) {
      error.value = result.error.message || t('aiTag.failed');
      return;
    }
    const names = parseTagNames(result.data.content, { maxTags: 3 });
    suggested.value = names;
    selected.value = names;
    if (names.length === 0) {
      error.value = result.data.truncated ? t('aiTag.truncated') : '';
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('aiTag.failed');
  } finally {
    busy.value = false;
  }
}

function apply(): void {
  if (selected.value.length) {
    emit('apply', selected.value);
  }
}
</script>

<style scoped>
.ai-tag-note {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}
.ai-tag-existing {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
}
.ai-tag-label {
  margin-right: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ai-tag-result {
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.ai-tag-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 8px;
}
.ai-tag-status {
  padding: 18px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.ai-tag-error {
  padding: 12px 0;
  font-size: 13px;
  color: var(--el-color-danger);
}
</style>
