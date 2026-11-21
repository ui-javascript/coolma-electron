<template>
  <div class="ai-panel">
    <div class="ai-chat-shell">
      <div ref="scrollRef" class="ai-messages">
        <Welcome
          class="ai-welcome"
          variant="filled"
          :title="welcomeTitle"
          :description="welcomeDescription"
        >
          <template #image>
            <el-icon class="ai-welcome-icon"><ChatDotRound /></el-icon>
          </template>
        </Welcome>
        <div v-if="!codeGenMode" class="ai-welcome-hint">
          {{ hasNote ? t('aiHelper.contextOn', { title: noteTitle }) : t('aiHelper.contextOff') }}
        </div>

        <div class="ai-message-list">
          <div
            v-for="message in messages"
            :key="message.id"
            class="ai-message"
            :class="`is-${message.role}`"
          >
            <div class="ai-message-label">
              {{ message.role === 'user' ? t('aiHelper.you') : t('aiHelper.assistant') }}
            </div>
            <div class="ai-bubble" :class="{ 'is-markdown': message.role === 'assistant' && message.content }">
              <span v-if="message.status === 'pending' && !message.content" class="ai-thinking">
                {{ t('aiHelper.thinking') }}
              </span>
              <div
                v-else-if="message.role === 'assistant' && message.content"
                class="ai-markdown"
                v-html="renderMarkdown(message.content)"
              />
              <pre v-else class="ai-text">{{ message.content }}</pre>
            </div>
            <div
              v-if="message.role === 'assistant' && message.status && message.status !== 'pending'"
              class="ai-message-status"
            >
              {{ statusText(message) }}
            </div>
            <div
              v-if="message.role === 'assistant' && !message.status && message.content && hasNote && !codeGenMode"
              class="ai-message-actions"
            >
              <button
                type="button"
                class="ai-apply-link"
                :disabled="applyingMessageId !== null && applyingMessageId !== message.id"
                @click="applyToNote(message)"
              >
                <span
                  v-if="applyingMessageId === message.id"
                  class="ai-apply-link__dot"
                  aria-hidden="true"
                />
                <span v-else class="ai-apply-link__icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" />
                    <path d="M11.5 2.5h2v2" />
                    <path d="M8 8l5.5-5.5" />
                  </svg>
                </span>
                <span>{{ t('aiHelper.applyToNote') }}</span>
              </button>
              <button
                type="button"
                class="ai-apply-link is-danger"
                :disabled="applyingMessageId !== null"
                @click="overwriteNote(message)"
              >
                {{ t('aiHelper.overwriteNote') }}
              </button>
            </div>
            <div
              v-if="message.role === 'assistant' && codeGenMode && !message.status && message.content"
              class="ai-message-actions"
            >
              <el-button
                type="primary"
                plain
                size="small"
                :loading="applyingMessageId === message.id"
                :disabled="applyingMessageId !== null && applyingMessageId !== message.id"
                @click="applyCodeToEditor(message)"
              >
                {{ applyingMessageId === message.id
                  ? t('aiHelper.codeApplying')
                  : t('aiHelper.applyCodeTo', { type: codeGenTypeLabel }) }}
              </el-button>
            </div>
          </div>
        </div>
        <div v-if="error" class="ai-error">{{ error }}</div>
      </div>

      <div class="ai-composer">
        <div v-if="codeGenMode" class="ai-composer__hint">
          {{ t('aiHelper.codegenComposerHint', { type: codeGenTypeLabel }) }}
        </div>
        <div class="ai-composer-actions">
          <el-button text size="small" :disabled="busy" @click="clear">{{ t('aiHelper.clear') }}</el-button>
          <el-button v-if="busy" type="warning" plain size="small" @click="stopGenerating">
            {{ t('aiHelper.stopGenerating') }}
          </el-button>
        </div>
        <XSender
          ref="senderRef"
          :disabled="busy"
          :max-length="100000"
          :placeholder="composerPlaceholder"
          @submit="send"
        />
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { ChatDotRound } from '@element-plus/icons-vue';
import { Welcome, XSender } from 'vue-element-plus-x';
import { emitAiInsert } from '@/editor/aiInsert';
import { aiChatCancel, aiChatStream, onAiChatStream } from '@/services/ipc';
import { useNotesStore } from '@/stores/notes';
import { extractGeneratedCode } from '@/utils/aiCodegen';
import { renderMarkdown } from '@/utils/markdown';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  status?: 'pending' | 'stopped' | 'truncated';
}

const props = defineProps<{
  noteId?: number | null;
  codeGenPrompt?: string;
  codeGenType?: 'rune' | 'echo' | null;
  codeGenTargetName?: string;
  codeGenCallback?: (code: string) => void;
}>();
const { t } = useI18n();
const notesStore = useNotesStore();

type SenderExposed = {
  getModelValue: () => { text: string };
  clear: () => void;
  setText: (text: string) => void;
};

const messages = ref<ChatMessage[]>([]);
const senderRef = ref<SenderExposed | null>(null);
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
const codeGenMode = computed(() => Boolean(String(props.codeGenPrompt || '').trim()));
const codeGenTypeLabel = computed(() => (
  props.codeGenType === 'rune' ? t('library.runesTab') : t('library.echoesTab')
));
const welcomeTitle = computed(() => (
  codeGenMode.value
    ? t('aiHelper.codegenTitle', { type: codeGenTypeLabel.value })
    : t('aiHelper.welcomeTitle')
));
const welcomeDescription = computed(() => (
  codeGenMode.value
    ? t('aiHelper.codegenDesc', {
      type: codeGenTypeLabel.value,
      name: props.codeGenTargetName || t('aiHelper.untitled'),
    })
    : t('aiHelper.welcomeDesc')
));
const composerPlaceholder = computed(() => (
  codeGenMode.value
    ? t('aiHelper.codegenPlaceholder', { type: codeGenTypeLabel.value })
    : t('aiHelper.placeholder')
));

watch(
  () => messages.value.length,
  () => scrollToBottom(true),
);

function contextMessages(): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  // 代码生成模式不注入当前笔记，prompt 里已经带描述、当前源码和全部内置模板。
  if (codeGenMode.value) {
    return messages.value
      .filter((message) => message.content && !message.status)
      .map((message) => ({ role: message.role, content: message.content }));
  }
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
  const text = String(senderRef.value?.getModelValue().text ?? '').trim();
  if (!text || busy.value) {
    return;
  }
  error.value = '';
  seq += 1;
  const userMessage: ChatMessage = { id: seq, role: 'user', content: text };
  messages.value.push(userMessage);
  senderRef.value?.clear();
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
    assistant.status = result.data.stopped
      ? 'stopped'
      : result.data.truncated ? 'truncated' : undefined;
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

/** 对齐 vue2 getMessageStatusText。 */
function statusText(message: ChatMessage): string {
  if (message.status === 'stopped') {
    return t('aiHelper.stoppedStatus');
  }
  if (message.status === 'truncated') {
    return t('aiHelper.truncatedStatus');
  }
  return '';
}

/** 代码生成模式：从回复提取代码块，回调到表单源码框。 */
function applyCodeToEditor(message: ChatMessage): void {
  if (message.role !== 'assistant' || !props.codeGenCallback) {
    ElMessage.warning(t('aiHelper.codeCallbackMissing'));
    return;
  }
  const code = extractGeneratedCode(message.content);
  if (!code) {
    ElMessage.warning(t('aiHelper.codeEmpty'));
    return;
  }
  applyingMessageId.value = message.id;
  try {
    props.codeGenCallback(code);
    ElMessage.success(t('aiHelper.codeApplied', { type: codeGenTypeLabel.value }));
  } catch (error) {
    ElMessage.error(t('aiHelper.codeApplyFailed', {
      message: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    window.setTimeout(() => {
      if (applyingMessageId.value === message.id) {
        applyingMessageId.value = null;
      }
    }, 800);
  }
}

/** 对齐 vue2 applyToCurrentNote：默认追加到编辑器末尾；整篇覆盖是单独按钮。 */
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

/** 增强项：整篇覆盖。先二次确认，避免一条不完整的回复把正文清空。 */
async function overwriteNote(message: ChatMessage): Promise<void> {
  if (message.role !== 'assistant' || !hasNote.value) {
    ElMessage.warning(t('aiHelper.applyNoNote'));
    return;
  }
  const text = String(message.content ?? '').trim();
  if (!text) {
    ElMessage.warning(t('aiHelper.applyEmpty'));
    return;
  }
  try {
    await ElMessageBox.confirm(
      t('aiHelper.overwriteConfirm', { title: noteTitle.value }),
      t('aiHelper.overwriteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('aiHelper.overwriteConfirmButton'),
        cancelButtonText: t('action.cancel'),
      },
    );
  } catch {
    return;
  }
  applyingMessageId.value = message.id;
  const handled = emitAiInsert(text, 'replace');
  if (handled) {
    ElMessage.success(t('aiHelper.overwriteDone'));
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

onMounted(() => {
  if (!codeGenMode.value) {
    return;
  }
  // XSender 没有 v-model，只能在挂载后把 vue2 的 draftMessage 写进输入框。
  void nextTick(() => senderRef.value?.setText(String(props.codeGenPrompt || '')));
});

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
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
}

.ai-chat-shell {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--coolma-border, #ebeef5);
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff 0%, var(--coolma-panel, #fff) 48%, var(--coolma-panel, #fff) 100%);
}

.ai-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 16px 0;
}

.ai-welcome {
  margin: 0;
}

.ai-welcome-icon {
  color: var(--themeColor, #409eff);
  font-size: 24px;
}

.ai-welcome-hint {
  margin: 4px 2px 10px;
  color: #909399;
  font-size: 12px;
}

.ai-message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 12px;
}

.ai-message {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-message.is-user {
  align-items: flex-end;
}

.ai-message-label {
  color: #909399;
  font-size: 12px;
}

.ai-bubble {
  max-width: 85%;
  padding: 5px;
  border: 1px solid rgb(0 0 0 / 6%);
  border-radius: 12px;
  background: var(--coolma-panel, #fff);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
  color: var(--coolma-text, #303133);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-message.is-user .ai-bubble {
  border-color: var(--themeColor, #409eff);
  background: var(--themeColor, #409eff);
  color: #fff;
}

.ai-bubble.is-markdown {
  white-space: normal;
}

.ai-markdown {
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-markdown :deep(h1),
.ai-markdown :deep(h2),
.ai-markdown :deep(h3),
.ai-markdown :deep(h4),
.ai-markdown :deep(h5),
.ai-markdown :deep(h6) {
  margin: 1em 0 0.5em;
  font-weight: 600;
  line-height: 1.25;
}

.ai-markdown :deep(h1) { font-size: 1.5em; }
.ai-markdown :deep(h2) { font-size: 1.25em; }
.ai-markdown :deep(h3) { font-size: 1.1em; }

.ai-markdown :deep(p) { margin: 0.5em 0; }

.ai-markdown :deep(ul),
.ai-markdown :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.ai-markdown :deep(li) { margin: 0.25em 0; }

.ai-markdown :deep(code) {
  padding: 0.2em 0.4em;
  border-radius: 4px;
  background: rgb(0 0 0 / 6%);
  font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

.ai-markdown :deep(pre.code-block) {
  margin: 0.75em 0;
  padding: 8px 10px;
  overflow: hidden;
  border-radius: 8px;
  background: #f6f8fa;
}

.ai-markdown :deep(pre.code-block code) {
  padding: 0;
  background: transparent;
  font-size: 0.85em;
  white-space: pre;
}

.ai-markdown :deep(blockquote) {
  margin: 0.5em 0;
  padding-left: 1em;
  border-left: 3px solid #dcdfe6;
  color: #909399;
}

.ai-markdown :deep(a) {
  color: var(--themeColor, #409eff);
  text-decoration: none;
}

.ai-markdown :deep(table) {
  width: 100%;
  margin: 0.5em 0;
  border-collapse: collapse;
}

.ai-markdown :deep(th),
.ai-markdown :deep(td) {
  padding: 0.5em;
  border: 1px solid #ebeef5;
  text-align: left;
}

.ai-markdown :deep(th) {
  background: #fafafa;
  font-weight: 600;
}

.ai-markdown :deep(hr) {
  margin: 1em 0;
  border: 0;
  border-top: 1px solid #ebeef5;
}

.ai-text {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
}

.ai-thinking {
  color: #909399;
  font-style: italic;
}

.ai-message-status {
  color: #c0c4cc;
  font-size: 12px;
}

.ai-message-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding-left: 4px;
}

.ai-apply-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #909399;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.ai-apply-link:hover:not(:disabled) {
  background: var(--themeColor10, rgb(64 158 255 / 10%));
  color: var(--themeColor, #409eff);
}

.ai-apply-link.is-danger:hover:not(:disabled) {
  background: rgb(245 108 108 / 10%);
  color: var(--el-color-danger, #f56c6c);
}

.ai-apply-link:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ai-apply-link__icon {
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
}

.ai-apply-link__dot {
  position: relative;
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--themeColor, #409eff);
}

.ai-apply-link__dot::after {
  position: absolute;
  inset: -3px;
  border: 2px solid rgb(64 158 255 / 45%);
  border-radius: 50%;
  animation: ai-apply-pulse 0.9s ease-out infinite;
  content: '';
}

@keyframes ai-apply-pulse {
  0% { opacity: 1; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(1.4); }
}

.ai-error {
  margin: 8px 0;
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
}

.ai-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid rgb(0 0 0 / 5%);
  background: color-mix(in srgb, var(--coolma-panel, #fff) 92%, transparent);
}

.ai-composer__hint {
  color: #909399;
  font-size: 12px;
}

.ai-composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
