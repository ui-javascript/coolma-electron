<template>
  <div class="ai-drawer-demo">
    <div class="ai-demo-chat-shell">
      <div ref="scrollbar" class="ai-demo-scroll">
        <div class="ai-demo-scroll__inner">
          <el-x-welcome
            icon="el-icon-chat-dot-round"
            :title="welcomeTitle"
            :description="welcomeDescription"
            variant="filled"
          />

          <div class="ai-demo-message-list">
            <div
              v-for="message in messages"
              :key="message.id"
              class="ai-demo-message-item"
              :class="[
                `ai-demo-message-item--${message.role}`,
                message.status ? `ai-demo-message-item--${message.status}` : ''
              ]"
            >
              <div class="ai-demo-message-label">
                {{ message.role === 'user' ? $t('aiDrawerUserLabel') : $t('aiAssistant') }}
              </div>
              <div class="ai-demo-message-bubble">
                <template v-if="message.role === 'assistant'">
                  <div
                    v-if="message.status === 'streaming' && !message.content"
                    class="ai-demo-thinking"
                  >
                    {{ $t('aiDrawerThinking') }}
                  </div>
                  <div
                    v-else-if="getRenderedContent(message)"
                    class="ai-demo-rendered-content"
                    v-html="getRenderedContent(message)"
                  />
                  <div
                    v-else
                    class="ai-demo-plain-content"
                  >
                    {{ message.content || '' }}
                  </div>
                </template>
                <template v-else>
                  <div class="ai-demo-plain-content">
                    {{ message.content }}
                  </div>
                </template>
              </div>
              <div
                v-if="message.role === 'assistant' && message.status && message.status !== 'done'"
                class="ai-demo-message-status"
              >
                {{ getMessageStatusText(message) }}
              </div>
              <div
                v-if="message.role === 'assistant' && message.content && hasCurrentNote && message.status === 'done' && !codeGenMode"
                class="ai-demo-message-actions"
              >
                <button
                  type="button"
                  class="ai-demo-apply-link"
                  :disabled="applyingMessageId !== null && applyingMessageId !== message.id"
                  @click="applyToCurrentNote(message)"
                >
                  <span v-if="applyingMessageId === message.id" class="ai-demo-apply-link__dot" aria-hidden="true"></span>
                  <span v-else class="ai-demo-apply-link__icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" />
                      <path d="M11.5 2.5h2v2" />
                      <path d="M8 8l5.5-5.5" />
                    </svg>
                  </span>
                  <span class="ai-demo-apply-link__label">{{ $t('aiDrawerApplyToNote') }}</span>
                </button>
              </div>
              <!-- 代码生成模式：气泡下方醒目的「应用到编辑器」按钮 -->
              <div
                v-if="message.role === 'assistant' && codeGenMode && message.status === 'done' && message.content"
                class="ai-demo-echo-apply-bar"
              >
                <el-button
                  type="primary"
                  size="small"
                  icon="el-icon-document-copy"
                  class="ai-demo-echo-apply-btn"
                  :disabled="applyingMessageId !== null && applyingMessageId !== message.id"
                  @click="applyCodeToEditor(message)"
                >
                  <span v-if="applyingMessageId === message.id">应用中…</span>
                  <span v-else>应用到当前{{ codeGenType === 'rune' ? '符文' : '回响' }}编辑框</span>
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="ai-demo-composer">
        <div class="ai-demo-composer__hint">{{ composerHint }}</div>
        <div v-if="activeResponseMeta" class="ai-demo-composer__meta">
          {{ activeResponseMeta }}
        </div>
        <div v-if="loading" class="ai-demo-composer__actions">
          <el-button size="mini" type="warning" plain @click="stopStreaming">
            {{ $t('aiDrawerStopGenerating') }}
          </el-button>
        </div>
        <el-x-sender
          :value="draftMessage"
          :disabled="loading || !isReady"
          :placeholder="composerPlaceholder"
          @input="draftMessage = $event"
          @submit="handleSubmit"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { i18n } from 'boot/i18n'
import { createNamespacedHelpers } from 'vuex'
import PortkeyService from 'src/services/PortkeyService'
import MarkdownRenderer from 'src/services/MarkdownRenderer'
import appBus from 'src/components/common/bus'
import { EVENTS as appEvents } from 'src/utils/const/eventsConst'

const { mapGetters: mapServerGetters } = createNamespacedHelpers('server')

function createMessage(id, role, content, status = 'done', meta = null) {
  return {
    id,
    role,
    content,
    status,
    meta,
    renderedContent: null
  }
}

// 内容组件仅承担业务 UI（纯 Options API）。
// 容器（el-drawer）由 aiHelperDrawerContent.js 工厂在创建层时声明：
//   - 容器默认 props（direction / size / modal / zIndex 等）
//   - 容器标题（i18n.aiAssistant）通过 factory 的 props.title 注入；
//     不走 defineLayer（Options API 没有 setup 钩子，跳过 defineLayer）。
// 标题从 props.titleProp 读。

export default {
  name: 'AiHelperBusDialog',
  // props 由 vue-layerx open({ props }) 透传进来：
  //   - codeGenPrompt     符文 / 回响 代码生成模式的预填 prompt
  //   - codeGenTargetName 目标符文 / 回响名（用于界面提示）
  //   - codeGenType       'rune' | 'echo' | null
  //   - codeGenCallback   AI 完成后回写到 Monaco 编辑器的回调（仅 codeGen 模式使用）
  // 容器（el-drawer）的 title 由 aiHelperDrawerContent.js factory 的 props.title 直接绑定，
  // 不进内容组件。
  props: {
    // The registry consumes this default as vue-layerx container props. Callers
    // normally omit it and only pass the AI business payload below.
    busDialogProps: {
      type: Object,
      default: () => ({
        container: 'drawer',
        direction: 'rtl',
        size: '420px',
        customClass: 'ai-demo-drawer',
        modal: false,
        appendToBody: true,
        withHeader: true,
        wrapperClosable: false,
        closeOnPressEscape: false,
        zIndex: 9999,
        title: i18n.t('aiAssistant')
      })
    },
    codeGenPrompt: { type: String, default: '' },
    codeGenTargetName: { type: String, default: '' },
    codeGenType: { type: String, default: null },
    codeGenCallback: { type: Function, default: null }
  },
  data () {
    return {
      draftMessage: this.codeGenPrompt || '',
      messageId: 2,
      loading: false,
      defaultConfig: null,
      streamAbortController: null,
      activeResponseMeta: '',
      rendererReady: false,
      applyingMessageId: null,
      messages: [
        createMessage(1, 'assistant', i18n.t('aiDrawerIntroMessage'))
      ],
      // 代码生成模式（符文/回响）由 props.codeGenType 决定开关
      codeGenMode: !!this.codeGenType,
      streamDisposed: false
    }
  },
  computed: {
    ...mapServerGetters(['currentNote']),
    hasCurrentNote () {
      const note = this.currentNote
      if (!note) return false
      if (typeof note === 'string') return true
      if (typeof note === 'object') {
        if (typeof note.__markdown === 'string') return true
        if (note.info && note.info.docGuid) return true
      }
      return false
    },
    providerLabel () {
      if (!this.defaultConfig) {
        return this.$t('aiProviderLabelGeneric')
      }
      return PortkeyService.getProviderLabel(this.defaultConfig.provider_type)
    },
    isReady () {
      return PortkeyService.isConfigUsable(this.defaultConfig)
    },
    welcomeTitle () {
      if (this.codeGenMode) {
        const type = this.codeGenType === 'rune' ? '符文' : '回响'
        return `AI 辅助生成${type}代码`
      }
      return this.isReady
        ? this.$t('aiDrawerWelcomeReadyTitle', { provider: this.providerLabel })
        : this.$t('aiDrawerWelcomeNotReadyTitle')
    },
    welcomeDescription () {
      if (this.codeGenMode) {
        const targetName = this.codeGenTargetName
        const targetType = this.codeGenType === 'rune' ? '符文' : '回响'
        return `正在为「${targetName}」生成${targetType}代码。生成完成后，点击「应用到${targetType}编辑框」将代码填入 Monaco 编辑器。`
      }
      if (!this.defaultConfig) {
        return this.$t('aiDrawerWelcomeNoDefaultDescription')
      }
      if (!this.isReady) {
        return this.$t('aiDrawerWelcomeIncompleteDescription', {
          name: this.defaultConfig.name,
          provider: this.providerLabel
        })
      }
      return this.$t('aiDrawerWelcomeReadyDescription', {
        name: this.defaultConfig.name,
        model: this.defaultConfig.model
      })
    },
    composerHint () {
      if (this.codeGenMode) {
        const targetType = this.codeGenType === 'rune' ? '符文' : '回响'
        return `请根据描述和模板生成${targetType}代码`
      }
      if (!this.defaultConfig) {
        return this.$t('aiDrawerComposerHintNoDefault')
      }
      if (!this.isReady) {
        return this.$t('aiDrawerComposerHintIncomplete', { provider: this.providerLabel })
      }
      return this.$t('aiDrawerComposerHintReady', { provider: this.providerLabel })
    },
    composerPlaceholder () {
      if (!this.defaultConfig) {
        return this.$t('aiDrawerComposerPlaceholderNoDefault')
      }
      return this.isReady
        ? this.$t('aiDrawerComposerPlaceholderReady')
        : this.$t('aiDrawerComposerPlaceholderIncomplete', { provider: this.providerLabel })
    }
  },
  async mounted () {
    try {
      await MarkdownRenderer.initMarkdownRenderer()
      this.rendererReady = true
    } catch (err) {
      console.warn('[AiHelperBusDialog] Failed to initialize MarkdownRenderer:', err)
    }
    await this.refreshDefaultConfig()
    // 普通入口（非 codeGen）需要 provider 已就绪；codeGen 模式由调用方保证可写。
    // 不可用 → appBus 通知 Header 跳 Settings（Header 收到后也会关 drawer）。
    if (!this.codeGenMode && !PortkeyService.isConfigUsable(this.defaultConfig)) {
      appBus.$emit('REQUEST_AI_PROVIDER_CONFIG')
    }
  },
  beforeDestroy () {
    MarkdownRenderer.disposeAll()
  },
  methods: {
    async refreshDefaultConfig () {
      this.defaultConfig = await PortkeyService.getDefaultConfig()
    },

    nextMessageId () {
      const id = this.messageId
      this.messageId += 1
      return id
    },
    pushMessage (role, content, status = 'done', meta = null) {
      const message = createMessage(this.nextMessageId(), role, content, status, meta)
      this.messages.push(message)
      return message
    },
    updateMessageById (id, updater) {
      const message = this.messages.find(item => item.id === id)
      if (!message) return null
      updater(message)
      return message
    },
    extractAssistantContent (response) {
      return response?.choices?.[0]?.message?.content || this.$t('aiDrawerEmptyResponse')
    },
    buildHistoryMessages () {
      return this.messages
        .filter(item => item.role === 'user' || item.role === 'assistant')
        .filter(item => item.status !== 'error')
        .map(item => ({
          role: item.role,
          content: item.content
        }))
    },
    updateActiveResponseMeta (meta = {}) {
      const maxTokens = meta.effectiveMaxTokens || meta.maxTokens
      if (meta.finishReason && maxTokens) {
        this.activeResponseMeta = this.$t('aiDrawerMetaWithFinishReason', {
          finishReason: meta.finishReason,
          maxTokens
        })
        return
      }
      if (meta.finishReason) {
        this.activeResponseMeta = this.$t('aiDrawerMetaFinishReasonOnly', { finishReason: meta.finishReason })
        return
      }
      if (maxTokens) {
        this.activeResponseMeta = this.$t('aiDrawerMetaMaxTokensOnly', { maxTokens })
        return
      }
      this.activeResponseMeta = ''
    },
    getMessageStatusText (message) {
      if (message.status === 'streaming') return this.$t('aiDrawerStreamingStatus')
      if (message.status === 'stopped') return this.$t('aiDrawerStoppedStatus')
      if (message.status === 'truncated') return this.$t('aiDrawerTruncatedStatus')
      if (message.status === 'error') return this.$t('aiDrawerErrorStatus')
      return ''
    },
    getRenderedContent (message) {
      if (!message.content) {
        return message.status === 'streaming' ? this.$t('aiDrawerThinking') : ''
      }
      if (!this.rendererReady) {
        return message.content
      }
      if (!message.renderedContent || message.rawContent !== message.content) {
        message.rawContent = message.content
        message.renderedContent = MarkdownRenderer.renderMarkdown(message.content)
      }
      return message.renderedContent
    },
    scrollToBottom () {
      this.$nextTick(() => {
        const scrollEl = this.$refs.scrollbar
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight
        }
      })
    },
    stopStreaming ({ silent = false } = {}) {
      if (this.streamAbortController) {
        this.streamAbortController.abort()
        this.streamAbortController = null
      }
      const streamingMessage = [...this.messages].reverse().find(item => item.role === 'assistant' && item.status === 'streaming')
      if (streamingMessage) {
        this.updateMessageById(streamingMessage.id, item => {
          item.status = 'stopped'
          if (!item.content) {
            item.content = this.$t('aiDrawerStoppedEmptyMessage')
          }
        })
      }
      this.loading = false
      if (!silent) {
        this.$q.notify({
          type: 'warning',
          message: this.$t('aiDrawerStoppedNotify'),
          position: 'top'
        })
      }
    },
    applyToCurrentNote (message) {
      if (!message || message.role !== 'assistant') return
      if (!this.hasCurrentNote) {
        this.$q.notify({
          type: 'warning',
          message: this.$t('aiDrawerApplyNoNote'),
          position: 'top'
        })
        return
      }
      const text = (message.content || '').trim()
      if (!text) {
        this.$q.notify({
          type: 'warning',
          message: this.$t('aiDrawerApplyEmpty'),
          position: 'top'
        })
        return
      }
      this.applyingMessageId = message.id
      try {
        appBus.$emit(appEvents.INSERT_AI_TEXT, text)
        this.$q.notify({
          type: 'positive',
          message: this.$t('aiDrawerApplyDone'),
          position: 'top'
        })
      } catch (error) {
        this.$q.notify({
          type: 'negative',
          message: this.$t('aiDrawerApplyFailed', { message: error.message || String(error) }),
          position: 'top'
        })
      } finally {
        setTimeout(() => {
          if (this.applyingMessageId === message.id) {
            this.applyingMessageId = null
          }
        }, 800)
      }
    },
    applyCodeToEditor (message) {
      if (!message || message.role !== 'assistant') return
      const content = message.content || ''
      if (!content.trim()) {
        this.$q.notify({
          type: 'warning',
          message: 'AI 响应为空，无法提取代码',
          position: 'top'
        })
        return
      }
      const codeBlockRegex = /```(?:javascript)?\s*([\s\S]*?)```/g
      let extractedCode = null
      let match
      while ((match = codeBlockRegex.exec(content)) !== null) {
        const code = (match[1] || '').trim()
        if (code && !code.includes('```')) {
          extractedCode = code
          break
        }
      }
      if (!extractedCode) {
        const lines = content.split('\n')
        const codeLines = []
        let inCodeBlock = false
        for (const line of lines) {
          if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock
            continue
          }
          if (inCodeBlock || (!line.startsWith('#') && !line.startsWith('**') && !line.startsWith('-') && !line.startsWith('*'))) {
            codeLines.push(line)
          }
        }
        if (codeLines.length > 0) {
          extractedCode = codeLines.join('\n').trim()
        }
      }
      if (!extractedCode) {
        this.$q.notify({
          type: 'warning',
          message: '未能从 AI 响应中提取代码',
          position: 'top'
        })
        return
      }
      this.applyingMessageId = message.id
      try {
        if (this.codeGenCallback && typeof this.codeGenCallback === 'function') {
          this.codeGenCallback(extractedCode)
          const targetType = this.codeGenType === 'rune' ? '符文' : '回响'
          this.$q.notify({
            type: 'positive',
            message: `代码已应用到${targetType}编辑框`,
            position: 'top'
          })
        } else {
          this.$q.notify({
            type: 'warning',
            message: '应用回调未定义',
            position: 'top'
          })
        }
      } catch (error) {
        this.$q.notify({
          type: 'negative',
          message: `应用失败: ${error.message || String(error)}`,
          position: 'top'
        })
      } finally {
        setTimeout(() => {
          if (this.applyingMessageId === message.id) {
            this.applyingMessageId = null
          }
        }, 800)
      }
    },
    async handleSubmit (value) {
      const message = typeof value === 'string' ? value : this.draftMessage
      const content = message && message.trim()
      if (!content || this.loading) return
      await this.refreshDefaultConfig()
      if (!this.isReady) {
        this.$q.notify({
          type: 'warning',
          message: this.defaultConfig
            ? this.$t('aiDrawerNotifyIncompleteConfig', { provider: this.providerLabel })
            : this.$t('aiDrawerNotifyNoDefaultConfig'),
          position: 'top'
        })
        return
      }
      this.stopStreaming({ silent: true })
      this.activeResponseMeta = ''
      this.pushMessage('user', content)
      this.draftMessage = ''
      this.loading = true
      const assistantMessage = this.pushMessage('assistant', '', 'streaming', {
        finishReason: null,
        truncated: false,
        effectiveMaxTokens: PortkeyService.resolveEffectiveMaxTokens(this.defaultConfig, {})
      })
      const historyMessages = this.buildHistoryMessages()
      this.streamAbortController = new AbortController()
      this.scrollToBottom()
      try {
        await PortkeyService.chatStream(historyMessages, {
          signal: this.streamAbortController.signal,
          onToken: (token) => {
            this.updateMessageById(assistantMessage.id, item => {
              item.content += token
            })
            this.scrollToBottom()
          },
          onComplete: ({ finishReason, truncated }) => {
            this.updateMessageById(assistantMessage.id, item => {
              item.status = truncated ? 'truncated' : 'done'
              item.meta = {
                ...(item.meta || {}),
                finishReason,
                truncated
              }
              if (!item.content) {
                item.content = this.$t('aiDrawerEmptyResponse')
              }
            })
            this.updateActiveResponseMeta({
              finishReason,
              truncated,
              effectiveMaxTokens: PortkeyService.resolveEffectiveMaxTokens(this.defaultConfig, {})
            })
            if (truncated) {
              this.$q.notify({
                type: 'warning',
                message: this.$t('aiDrawerTruncatedNotify'),
                position: 'top'
              })
            }
          },
          onError: (error) => {
            if (error && error.name === 'AbortError') return
            this.updateMessageById(assistantMessage.id, item => {
              item.status = 'error'
              item.content = item.content || this.$t('aiDrawerRequestFailedMessage', {
                message: error.message || this.$t('loading')
              })
            })
            this.$q.notify({
              type: 'negative',
              message: error.message || this.$t('aiDrawerRequestFailedNotify'),
              position: 'top'
            })
          }
        }, {
          signal: this.streamAbortController.signal
        })
      } catch (error) {
        if (!error || error.name !== 'AbortError') {
          this.updateMessageById(assistantMessage.id, item => {
            item.status = 'error'
            item.content = item.content || this.$t('aiDrawerRequestFailedMessage', {
              message: error.message || this.$t('loading')
            })
          })
          this.$q.notify({
            type: 'negative',
            message: error.message || this.$t('aiDrawerRequestFailedNotify'),
            position: 'top'
          })
        }
      } finally {
        this.loading = false
        this.streamAbortController = null
        this.scrollToBottom()
      }
    }
  }
}
</script>

<style scoped>
.ai-drawer-demo {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.ai-demo-chat-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--floatBorderColor, #ebeef5);
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 48%, #ffffff 100%);
  overflow: hidden;
}

.ai-demo-scroll {
  flex: 1;
  min-height: 0;
  padding: 16px 16px 0;
  overflow-y: auto;
}

.ai-demo-scroll__inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.ai-demo-message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 12px;
}

.ai-demo-message-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-demo-message-item--user {
  align-items: flex-end;
}

.ai-demo-message-item--system {
  align-items: flex-start;
}

.ai-demo-message-item--system .ai-demo-message-bubble {
  background: rgba(124, 77, 255, 0.1);
  border-color: rgba(124, 77, 255, 0.3);
  font-style: italic;
  color: rgba(124, 77, 255, 0.9);
}

.ai-demo-message-item--system .ai-demo-message-label {
  display: none;
}

.ai-demo-message-label {
  font-size: 12px;
  color: #909399;
}

.ai-demo-message-status {
  font-size: 12px;
  color: #c0c4cc;
}

.ai-demo-message-actions {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding-left: 4px;
}

.ai-demo-apply-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  margin: 0;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: #909399;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
  user-select: none;
}

.ai-demo-apply-link:hover:not(:disabled) {
  color: var(--themeColor);
  background-color: var(--themeColor10);
}

.ai-demo-apply-link:active:not(:disabled) {
  background-color: var(--themeColor20);
}

.ai-demo-apply-link:focus-visible {
  outline: none;
  color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.18);
}

.ai-demo-apply-link:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ai-demo-apply-link--echo {
  margin-left: 8px;
  color: #7c4dff;
}

.ai-demo-apply-link--echo:hover:not(:disabled) {
  color: #7c4dff;
  background-color: rgba(124, 77, 255, 0.08);
}

.ai-demo-apply-link--echo:active:not(:disabled) {
  background-color: rgba(124, 77, 255, 0.14);
}

.ai-demo-apply-link__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: inherit;
}

.ai-demo-apply-link__label {
  white-space: nowrap;
}

.ai-demo-apply-link__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #409eff;
  position: relative;
}

.ai-demo-apply-link__dot::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid rgba(64, 158, 255, 0.45);
  animation: ai-demo-apply-pulse 0.9s ease-out infinite;
}

@keyframes ai-demo-apply-pulse {
  0% {
    transform: scale(0.6);
    opacity: 1;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}

.ai-demo-message-bubble {
  background: #ffffff;
  border-radius: 12px;
  padding: 5px;
  max-width: 85%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.ai-demo-message-item--user .ai-demo-message-bubble {
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
}

.ai-demo-message-item--assistant .ai-demo-message-bubble {
  background: #ffffff;
  border-color: #ebeef5;
}

.ai-demo-plain-content {
  word-break: break-word;
  white-space: pre-wrap;
}

.ai-demo-thinking {
  color: #909399;
  font-style: italic;
}

.ai-demo-rendered-content {
  line-height: 1.6;
  word-break: break-word;
}

.ai-demo-rendered-content h1,
.ai-demo-rendered-content h2,
.ai-demo-rendered-content h3,
.ai-demo-rendered-content h4,
.ai-demo-rendered-content h5,
.ai-demo-rendered-content h6 {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.25;
}

.ai-demo-rendered-content h1 { font-size: 1.5em; }
.ai-demo-rendered-content h2 { font-size: 1.25em; }
.ai-demo-rendered-content h3 { font-size: 1.1em; }

.ai-demo-rendered-content p {
  margin: 0.5em 0;
}

.ai-demo-rendered-content ul,
.ai-demo-rendered-content ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.ai-demo-rendered-content li {
  margin: 0.25em 0;
}

.ai-demo-rendered-content code {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

.ai-demo-message-item--user .ai-demo-rendered-content code {
  background: rgba(255, 255, 255, 0.2);
}

.ai-demo-rendered-content pre {
  margin: 0.75em 0;
  border-radius: 8px;
  overflow: hidden;
}

.ai-demo-rendered-content pre code {
  background: transparent;
  padding: 0;
  font-size: 0.85em;
}

.ai-demo-rendered-content blockquote {
  margin: 0.5em 0;
  padding-left: 1em;
  border-left: 3px solid #dcdfe6;
  color: #909399;
}

.ai-demo-message-item--user .ai-demo-rendered-content blockquote {
  border-left-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.8);
}

.ai-demo-rendered-content a {
  color: #409eff;
  text-decoration: none;
}

.ai-demo-message-item--user .ai-demo-rendered-content a {
  color: #ffffff;
  text-decoration: underline;
}

.ai-demo-rendered-content table {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
}

.ai-demo-rendered-content th,
.ai-demo-rendered-content td {
  border: 1px solid #ebeef5;
  padding: 0.5em 1em;
  text-align: left;
}

.ai-demo-rendered-content th {
  background: #fafafa;
  font-weight: 600;
}

.ai-demo-rendered-content hr {
  margin: 1em 0;
  border: none;
  border-top: 1px solid #ebeef5;
}

.ai-demo-composer {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255, 255, 255, 0.92);
}

.ai-demo-composer__hint,
.ai-demo-composer__meta {
  font-size: 12px;
  color: #909399;
}

.ai-demo-composer__actions {
  display: flex;
  justify-content: flex-end;
}

/* 代码生成模式：气泡下方醒目的应用按钮 */
.ai-demo-echo-apply-bar {
  margin-top: 10px;
  display: flex;
  align-items: center;
}

.ai-demo-echo-apply-btn {
  background: linear-gradient(135deg, #7c4dff 0%, #651fff 100%) !important;
  border-color: #651fff !important;
  color: #ffffff !important;
  font-weight: 500;
  border-radius: 20px;
  padding: 6px 18px;
  transition: all 0.2s ease;
}

.ai-demo-echo-apply-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #9575ff 0%, #7c4dff 100%) !important;
  border-color: #7c4dff !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(101, 31, 255, 0.35);
}

.ai-demo-echo-apply-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(101, 31, 255, 0.25);
}

.ai-demo-echo-apply-btn.is-disabled,
.ai-demo-echo-apply-btn:disabled {
  background: linear-gradient(135deg, #b39ddb 0%, #9575cd 100%) !important;
  border-color: #9575cd !important;
  cursor: not-allowed;
  opacity: 0.8;
}
</style>
