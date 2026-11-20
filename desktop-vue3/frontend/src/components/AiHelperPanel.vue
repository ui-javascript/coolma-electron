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
        <div v-if="message.role === 'assistant' && message.status === 'stopped'" class="ai-message-status">
          {{ t('aiHelper.stoppedStatus') }}
        </div>
        <div
          v-if="message.role === 'assistant' && !message.status && message.content && hasNote"
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
        <el-button v-if="busy" type="warning" plain size="small" @click="stopGenerating">
          {{ t('aiHelper.stopGenerating') }}
        </el-button>
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
 *  - vue2 用 element-plus-x 的欢迎卡与 SSE 流式逐字回显；v3 已补 `chatStream`，
 *    事件负责逐字追加，invoke 结束再以完整结果兜底；停止生成已接主进程 abort。
 *  - vue2 有「选择模型 / 技能调用」等动作；「应用到当前笔记」已补，见 P5 11.58。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { emitAiInsert } from '@/editor/aiInsert';
import { aiChatCancel, aiChatStream, onAiChatStream } from '@/services/ipc';
import { useNotesStore } from '@/stores/notes';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  status?: 'pending' | 'stopped';
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
let activeRequestId = '';
let activeAssistant: ChatMessage | null = null;

function scrollToBottom(smooth = false): void {
  void nextTick(() => {
    const host = scrollRef.value;
    if (!host) {
      return;
    }
    host.scrollTo({ top: host.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  });
}

// 主进程流式增量：只认当前请求，直接改响应式消息对象，不重建列表。
const stopStream = onAiChatStream((event) => {
  if (!activeRequestId || event.requestId !== activeRequestId || !activeAssistant) {
    return;
  }
  activeAssistant.content += event.delta;
  scrollToBottom();
});

const activeNote = computed(() => notesStore.activeNote);
const hasNote = computed(() => Boolean(activeNote.value && props.noteId !== null));
const noteTitle = computed(() => activeNote.value?.title || t('aiHelper.untitled'));

watch(
  () => messages.value.length,
  () => scrollToBottom(true),
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
  messages.value.push({ id: seq, role: 'assistant', content: '', status: 'pending' });
  // push 后取数组里的响应式代理，不能改外面那个原始对象，否则流式增量不触发渲染。
  activeAssistant = messages.value[messages.value.length - 1];
  const requestId = `ai-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  const assistant = activeAssistant;
  activeRequestId = requestId;

  try {
    const result = await aiChatStream({ requestId, messages: contextMessages() });
    // 停止后 activeRequestId 会立刻清空；旧请求的结果不能再往新消息上写。
    if (requestId !== activeRequestId) {
      return;
    }
    busy.value = false;
    if (result.ok === false) {
      error.value = result.error.message;
      messages.value.pop();
      messages.value.pop();
      return;
    }
    assistant.content = result.data.content || assistant.content;
    assistant.status = result.data.stopped ? 'stopped' : undefined;
    scrollToBottom();
  } finally {
    if (requestId === activeRequestId) {
      activeRequestId = '';
      activeAssistant = null;
      busy.value = false;
    }
  }
}

/** 对齐 vue2 stopStreaming：立刻把气泡标成已停止，再通知主进程 abort。 */
function stopGenerating(): void {
  const requestId = activeRequestId;
  if (!requestId || !activeAssistant) {
    return;
  }
  if (!activeAssistant.content) {
    activeAssistant.content = t('aiHelper.stoppedEmpty');
  }
  activeAssistant.status = 'stopped';
  activeRequestId = '';
  activeAssistant = null;
  busy.value = false;
  scrollToBottom();
  ElMessage.warning(t('aiHelper.stoppedNotify'));
  void aiChatCancel({ requestId }).then((result) => {
    if (result.ok === false) {
      ElMessage.warning(t('aiHelper.stopFailed'));
    }
  });
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
  if (activeRequestId) {
    void aiChatCancel({ requestId: activeRequestId });
  }
  stopStream();
  activeRequestId = '';
  activeAssistant = null;
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

.ai-message-status {
  margin-top: 4px;
  font-size: 12px;
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
