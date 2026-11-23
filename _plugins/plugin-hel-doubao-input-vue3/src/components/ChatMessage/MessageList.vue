<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ChatMessage } from './type';
import MessageItem from './MessageItem.vue';

interface Props {
  messages: ChatMessage[];
}

const props = defineProps<Props>();

const scrollContainerRef = ref<HTMLElement | null>(null);
const isAutoScroll = ref(true);

// Auto-scroll to bottom when new messages arrive
watch(() => props.messages.length, async () => {
  await nextTick();
  if (isAutoScroll.value && scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight;
  }
});

// Handle scroll to detect if user scrolled up
function onScroll() {
  if (!scrollContainerRef.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.value;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  isAutoScroll.value = distanceFromBottom < 100;
}

function scrollToBottom() {
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTo({
      top: scrollContainerRef.value.scrollHeight,
      behavior: 'smooth'
    });
  }
}

defineExpose({
  scrollToBottom
});
</script>

<template>
  <div 
    ref="scrollContainerRef"
    class="message-list"
    @scroll="onScroll"
  >
    <div class="message-list-content">
      <MessageItem 
        v-for="message in messages" 
        :key="message.id"
        :message="message"
      />
      
      <!-- Empty state -->
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </div>
        <div class="empty-text">开始对话吧！</div>
        <div class="empty-hint">输入消息开始与 AI 交流</div>
      </div>
    </div>
    
    <!-- Scroll to bottom button -->
    <transition name="fade">
      <button 
        v-if="!isAutoScroll && messages.length > 0"
        class="scroll-to-bottom"
        @click="scrollToBottom"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
      </button>
    </transition>
  </div>
</template>

<style lang="scss" scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--s-color-border-tertiary, rgba(0,0,0,0.1));
    border-radius: 3px;
    
    &:hover {
      background: var(--s-color-border-secondary, rgba(0,0,0,0.2));
    }
  }
}

.message-list-content {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 8px 0;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  
  .empty-icon {
    width: 64px;
    height: 64px;
    margin-bottom: 16px;
    color: var(--s-color-text-quaternary, rgba(0,0,0,0.3));
    
    svg {
      width: 100%;
      height: 100%;
    }
  }
  
  .empty-text {
    font-size: 18px;
    font-weight: 600;
    color: var(--s-color-text-secondary, rgba(0,0,0,0.85));
    margin-bottom: 8px;
  }
  
  .empty-hint {
    font-size: 14px;
    color: var(--s-color-text-tertiary, rgba(0,0,0,0.5));
  }
}

.scroll-to-bottom {
  position: absolute;
  bottom: 100px;
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--s-color-bg-float, #fff);
  border: 1px solid var(--s-color-border-primary, rgba(0,0,0,0.1));
  box-shadow: var(--s-shadow-lv2, 0 6px 10px rgba(0,0,0,0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  
  svg {
    width: 20px;
    height: 20px;
    color: var(--s-color-text-secondary, rgba(0,0,0,0.85));
  }
  
  &:hover {
    background: var(--s-color-bg-secondary, #f3f4f6);
    transform: translateY(-2px);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
