<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from './type';

interface Props {
  message: ChatMessage;
}

const props = defineProps<Props>();

const formattedTime = computed(() => {
  const date = new Date(props.message.createdAt);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
});

const isUser = computed(() => props.message.role === 'user');
const isLoading = computed(() => props.message.status === 'loading' || props.message.status === 'streaming');
</script>

<template>
  <div 
    class="message-item"
    :class="{ 'message-user': isUser, 'message-assistant': !isUser }"
  >
    <div class="message-avatar">
      <div v-if="isUser" class="avatar user-avatar">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>
      <div v-else class="avatar assistant-avatar">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3v7.12z"/>
        </svg>
      </div>
    </div>
    
    <div class="message-content-wrapper">
      <div class="message-info">
        <span class="message-time">{{ formattedTime }}</span>
      </div>
      
      <div class="message-bubble" :class="{ 'bubble-user': isUser, 'bubble-assistant': !isUser }">
        <div v-if="isLoading && !message.content" class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div v-else class="message-text" v-html="message.content"></div>
        <div v-if="message.status === 'error'" class="message-error">
          {{ message.error || '出错了，请重试' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-item {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  
  &.message-user {
    flex-direction: row-reverse;
    
    .message-bubble {
      background: var(--s-color-brand-primary-default, #0057ff);
      color: white;
      border-radius: 16px 16px 4px 16px;
    }
    
    .message-info {
      text-align: right;
    }
  }
  
  &.message-assistant {
    .message-bubble {
      background: var(--s-color-bg-secondary, #f3f4f6);
      color: var(--s-color-text-primary, #000);
      border-radius: 16px 16px 16px 4px;
    }
  }
}

.message-avatar {
  flex-shrink: 0;
  
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    
    svg {
      width: 20px;
      height: 20px;
    }
  }
  
  .user-avatar {
    background: var(--s-color-brand-primary-default, #0057ff);
    color: white;
  }
  
  .assistant-avatar {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }
}

.message-content-wrapper {
  max-width: 70%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--s-color-text-tertiary, rgba(0,0,0,0.5));
}

.message-bubble {
  padding: 10px 14px;
  line-height: 1.5;
  font-size: 15px;
  
  .message-text {
    word-break: break-word;
    white-space: pre-wrap;
    
    :deep(p) {
      margin: 0 0 8px 0;
      
      &:last-child {
        margin-bottom: 0;
      }
    }
    
    :deep(code) {
      background: rgba(0, 0, 0, 0.08);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 13px;
    }
    
    :deep(pre) {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
      
      code {
        background: transparent;
        padding: 0;
      }
    }
  }
}

.message-error {
  color: var(--s-color-alert, #ff3b30);
  font-size: 13px;
  margin-top: 4px;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 0;
  
  span {
    width: 8px;
    height: 8px;
    background: var(--s-color-text-tertiary, rgba(0,0,0,0.4));
    border-radius: 50%;
    animation: typing 1.4s infinite ease-in-out;
    
    &:nth-child(1) { animation-delay: 0s; }
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>
