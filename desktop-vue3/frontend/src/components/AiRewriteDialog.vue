<template>
  <el-dialog
    v-model="visible"
    :title="t('editor.aiRewrite')"
    width="560px"
    append-to-body
    destroy-on-close
    @closed="reset"
  >
    <div class="rewrite-block">
      <div class="rewrite-label">{{ t('editor.aiRewriteOrigin') }}</div>
      <div class="rewrite-origin">{{ text }}</div>
    </div>
    <el-input
      v-model="instruction"
      class="rewrite-instruction"
      :placeholder="t('editor.aiRewriteInstruction')"
      maxlength="200"
      clearable
    />
    <div class="rewrite-block">
      <div class="rewrite-label">{{ t('editor.aiRewriteResult') }}</div>
      <el-input
        v-model="result"
        type="textarea"
        :rows="8"
        :placeholder="busy ? t('editor.aiRewriteBusy') : t('editor.aiRewriteEmptyResult')"
        :disabled="busy"
      />
    </div>
    <div v-if="error" class="rewrite-error">{{ error }}</div>
    <template #footer>
      <el-button :disabled="busy" @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button :loading="busy" @click="generate">{{ t('editor.aiRewriteRetry') }}</el-button>
      <el-button type="primary" :disabled="busy || truncated || !result.trim()" @click="apply">
        {{ t('editor.aiRewriteApply') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { aiChat, type AiChatMessage } from '@/services/ipc';

const props = defineProps<{ modelValue: boolean; text: string }>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'apply', value: string): void;
}>();

const { t } = useI18n();
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const instruction = ref('');
const result = ref('');
const busy = ref(false);
const error = ref('');
const truncated = ref(false);

function reset(): void {
  instruction.value = '';
  result.value = '';
  busy.value = false;
  error.value = '';
  truncated.value = false;
}

async function generate(): Promise<void> {
  const source = String(props.text ?? '').trim();
  if (!source || busy.value) {
    return;
  }
  busy.value = true;
  error.value = '';
  result.value = '';
  truncated.value = false;
  const messages: AiChatMessage[] = [
    {
      role: 'system',
      content: '你是文本改写助手。只输出改写后的文本，不要解释、不要前后缀、不要代码块。保留原文的 Markdown 行内标记、链接和代码格式，不要新增无关内容。',
    },
    {
      role: 'user',
      content: [
        instruction.value.trim()
          ? `改写要求：${instruction.value.trim()}`
          : '改写要求：保持原意，让表达更通顺、准确、简洁。',
        '需要改写的原文：',
        source,
      ].join('\n\n'),
    },
  ];
  try {
    const response = await aiChat({ messages, maxTokens: 2048 });
    if (!response.ok) {
      error.value = response.error.message || t('editor.aiRewriteFailed');
      return;
    }
    result.value = String(response.data.content ?? '').trim();
    truncated.value = Boolean(response.data.truncated);
    if (truncated.value) {
      error.value = t('editor.aiRewriteTruncated');
    } else if (!result.value) {
      error.value = t('editor.aiRewriteFailed');
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('editor.aiRewriteFailed');
  } finally {
    busy.value = false;
  }
}

function apply(): void {
  const value = result.value.trim();
  if (value) {
    emit('apply', value);
  }
}
</script>

<style scoped>
.rewrite-block + .rewrite-instruction {
  margin-top: 12px;
}
.rewrite-instruction {
  margin-bottom: 12px;
}
.rewrite-label {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rewrite-origin {
  max-height: 120px;
  overflow: auto;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}
.rewrite-error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-danger);
}
</style>
