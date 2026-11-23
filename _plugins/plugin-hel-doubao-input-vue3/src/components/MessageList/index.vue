<script setup lang="ts">
import type { ChatMessage } from '../ChatMessage/type';
import MessageItem from '../ChatMessage/MessageItem.vue';

interface Props {
  messages: ChatMessage[];
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  messages: () => [],
  loading: false,
});

const emit = defineEmits<{
  (e: 'retry', messageId: string): void;
  (e: 'delete', messageId: string): void;
  (e: 'copy', content: string): void;
  (e: 'scroll-to-bottom'): void;
}>();

// Retry handler
const handleRetry = (messageId: string) => {
  emit('retry', messageId);
};

// Delete handler
const handleDelete = (messageId: string) => {
  emit('delete', messageId);
};

// Copy handler
const handleCopy = (content: string) => {
  emit('copy', content);
  navigator.clipboard.writeText(content);
};
</script>

<template>
  <div class="message-list">
    <div class="message-list-inner">
      <TransitionGroup name="message" tag="div" class="messages-container">
        <MessageItem
          v-for="message in messages"
          :key="message.id"
          :message="message"
          @retry="handleRetry"
          @delete="handleDelete"
          @copy="handleCopy"
        />
      </TransitionGroup>
      
      <!-- Loading indicator -->
      <div v-if="loading" class="loading-indicator">
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
        <span class="loading-text">AI 正在思考...</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  scroll-behavior: smooth;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--s-color-border-tertiary, #e0e0e0);
    border-radius: 3px;
    
    &:hover {
      background: var(--s-color-border-secondary, #c0c0c0);
    }
  }
}

.message-list-inner {
  max-width: 809px;
  margin: 0 auto;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--s-color-bg-secondary, #f5f5f5);
  border-radius: 12px;
  width: fit-content;
  margin-top: 16px;
  
  .loading-dots {
    display: flex;
    gap: 4px;
    
    .dot {
      width: 8px;
      height: 8px;
      background: var(--s-color-brand-primary-default, #0057ff);
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
      
      &:nth-child(1) {
        animation-delay: -0.32s;
      }
      
      &:nth-child(2) {
        animation-delay: -0.16s;
      }
    }
  }
  
  .loading-text {
    font-size: 14px;
    color: var(--s-color-text-secondary, #666);
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

// Transition animations
.message-enter-active {
  animation: message-in 0.3s ease-out;
}

.message-leave-active {
  animation: message-out 0.2s ease-in;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes message-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-10px);
  }
}
</style>
