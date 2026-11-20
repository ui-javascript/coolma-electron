<template>
  <div class="ai-panel">
    <div ref="scrollRef" class="ai-messages">
      <div v-if="messages.length === 0" class="ai-welcome">
        <div class="ai-welcome-title">{{ t('aiHelper.welcomeTitle') }}</div>
        <div class="ai-welcome-desc">{{ t('aiHelper.welcomeDesc') }}</div>
        <div class="ai-welcome-hint">
          {{ hasNote ? t('aiHelper.contextOn', { title: noteTitle }) : t('aiHelper.contextOff') }}
        </div>
      </div>
      <div
        v-for="message in messages"
        :key="message.id"
        class="ai-message"
        :class="`is-${message.role}`"
      >
        <div class="ai-message-label">{{ message.role === 'user' ? t('aiHelper.you') : t('aiHelper.assistant') }}</div>
        <div class="ai-bubble">
          <span v-if="message.status === 'pending' && !message.content" class="ai-thinking">{{ t('aiHelper.thinking') }}</span>
          <pre v-else class="ai-text">{{ message.content }}</pre>
        </div>
        <div
          v-if="message.role === 'assistant' && message.status !== 'pending' && message.content && hasNote"
          class="ai-message-actions"
        >
          <el-button
            text
            size="small"
            :loading="applyingMessageId === message.id"
            :disabled="applyingMessageId !== null && applyingMessageId !== message.id"
            @click="applyToNote(message)"
          >
            {{ t('aiHelper.applyToNote') }}
          </el-button>
        </div>
      </div>
      <div v-if="error" class="ai-error">{{ error }}</div>
    </div>

    <div class="ai-composer">
      <el-input
        v-model="draft"
        type="textarea"
        :rows="3"
        resize="none"
        :placeholder="t('aiHelper.placeholder')"
        @keydown.enter.exact.prevent="send"
      />
      <div class="ai-composer-actions">
        <el-button text size="small" :disabled="busy" @click="clear">{{ t('aiHelper.clear') }}</el-button>
        <el-button type="primary" size="small" :loading="busy" :disabled="!draft.trim() || busy" @click="send">
          {{ t('aiHelper.send') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AI 助手对话面板（复刻 vue2 AiHelperBusDialog / AiHelperDrawer 的对话主体）。
 *
 * 缩水报备：
 *  - vue2 用 element-plus-x 的欢迎卡与流式渲染（SSE 逐字回显）；vue3 主进程
 *    `controller/ai/chat` 目前是非流式（一次性回 finishReason + content），
 *    所以这里一次性追加整段回复，不做逐字动画。
 *  - vue2 有「选择模型 / 技能调用 / 插入到笔记」等动作，本批只做「围绕当前笔记问答」。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { emitAiInsert } from '@/editor/aiInsert';
import { aiChat } from '@/services/ipc';
import { useNotesStore } from '@/stores/notes';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  status?: 'pending';
}

const props = defineProps<{ noteId?: number | null }>();
const { t } = useI18n();
const notesStore = useNotesStore();

const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const busy = ref(false);
const error = ref('');
const applyingMessageId = ref<number | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
let seq = 0;

const activeNote = computed(() => notesStore.activeNote);
const hasNote = computed(() => Boolean(activeNote.value && props.noteId !== null));
const noteTitle = computed(() => activeNote.value?.title || t('aiHelper.untitled'));

watch(
  () => messages.value.length,
  () => {
    void nextTick(() => {
      scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'smooth' });
    });
  },
);

function contextMessages(): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const list: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: t('aiHelper.systemPrompt'),
    },
  ];
  if (activeNote.value && hasNote.value) {
    const content = String(activeNote.value.content ?? '').slice(0, 4000);
    list.push({
      role: 'system',
      content: `当前笔记《${activeNote.value.title || t('aiHelper.untitled')}》正文如下：\n${content}`,
    });
  }
  messages.value.forEach((message) => {
    if (message.content) {
      list.push({ role: message.role, content: message.content });
    }
  });
  return list;
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value) {
    return;
  }
  error.value = '';
  seq += 1;
  const userMessage: ChatMessage = { id: seq, role: 'user', content: text };
  messages.value.push(userMessage);
  draft.value = '';
  busy.value = true;

  seq += 1;
  const assistantMessage: ChatMessage = { id: seq, role: 'assistant', content: '', status: 'pending' };
  messages.value.push(assistantMessage);

  const result = await aiChat({ messages: contextMessages() });
  busy.value = false;
  if (result.ok === false) {
    error.value = result.error.message;
    messages.value.pop();
    messages.value.pop();
    return;
  }
  assistantMessage.content = result.data.content;
  assistantMessage.status = undefined;
}

/** 对齐 vue2 applyToCurrentNote：把整段回复追加到当前编辑器末尾，不覆盖原文。 */
function applyToNote(message: ChatMessage): void {
  if (message.role !== 'assistant') {
    return;
  }
  if (!hasNote.value) {
    ElMessage.warning(t('aiHelper.applyNoNote'));
    return;
  }
  const text = String(message.content ?? '').trim();
  if (!text) {
    ElMessage.warning(t('aiHelper.applyEmpty'));
    return;
  }
  applyingMessageId.value = message.id;
  const handled = emitAiInsert(text);
  if (handled) {
    ElMessage.success(t('aiHelper.applyDone'));
  } else {
    ElMessage.warning(t('aiHelper.applyNoEditor'));
  }
  window.setTimeout(() => {
    if (applyingMessageId.value === message.id) {
      applyingMessageId.value = null;
    }
  }, 800);
}

function clear(): void {
  messages.value = [];
  error.value = '';
  applyingMessageId.value = null;
}

onBeforeUnmount(() => {
  messages.value = [];
});
</script>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ai-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.ai-welcome {
  padding: 16px 4px;
}

.ai-welcome-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.ai-welcome-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.ai-welcome-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ai-message {
  margin-bottom: 14px;
}

.ai-message.is-user .ai-message-label {
  text-align: right;
}

.ai-message-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.ai-bubble {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-message.is-user .ai-bubble {
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.ai-text {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
}

.ai-thinking {
  color: var(--el-text-color-secondary);
}

.ai-message-actions {
  margin-top: 4px;
}

.ai-error {
  margin: 8px 12px;
  font-size: 12px;
  color: var(--el-color-danger, #f56c6c);
}

.ai-composer {
  padding: 8px 12px 12px;
  border-top: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
}

.ai-composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
