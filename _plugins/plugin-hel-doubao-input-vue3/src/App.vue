<script setup lang="ts">
import { ref } from 'vue';
import ChatInput from './components/ChatInput/index.vue';
import MessageList from './components/ChatMessage/MessageList.vue';
import SkillsPanel from './components/Skills/SkillsPanel.vue';
import { skillsData, type Skill } from './components/Skills/skillsData';
import type { ChatMessage } from './components/ChatMessage/type';

// Message list
const messages = ref<ChatMessage[]>([]);
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null);
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);

// Skills panel state
const showSkillsPanel = ref(true);
const skillsCategories = ref(skillsData);

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Handle skill selection
function handleSkillSelect(skill: Skill) {
  // Use the skill template nodes
  if (chatInputRef.value) {
    chatInputRef.value.setEditValue(skill.nodes);
  }
  showSkillsPanel.value = false;
}

// Toggle skills panel
function toggleSkillsPanel() {
  showSkillsPanel.value = !showSkillsPanel.value;
}

// Send message handler
async function handleSend(text: string) {
  if (!text.trim()) return;
  
  // Hide skills panel when sending
  showSkillsPanel.value = false;
  
  // Add user message
  const userMessage: ChatMessage = {
    id: generateId(),
    role: 'user',
    content: text,
    createdAt: Date.now(),
    status: 'done'
  };
  messages.value.push(userMessage);
  
  // Add placeholder assistant message for streaming
  const assistantMessage: ChatMessage = {
    id: generateId(),
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    status: 'loading'
  };
  messages.value.push(assistantMessage);
  
  // Scroll to bottom
  await new Promise(resolve => setTimeout(resolve, 100));
  messageListRef.value?.scrollToBottom();
  
  // Simulate streaming response
  await simulateStreamingResponse(assistantMessage);
}

// Simulate AI streaming response
async function simulateStreamingResponse(message: ChatMessage) {
  const responses = [
    `你好！我是你的 AI 助手。让我来回答你的问题。

## 关于这个问题

我可以提供以下帮助：

1. **信息检索** - 帮你查找相关资料
2. **问题解答** - 回答你的疑问
3. **内容创作** - 帮助你写作和创作

有什么我可以帮你的吗？

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`
`,
    `好的，让我来为你解答。

这是一个关于编程的问题。我可以提供详细的代码示例：

### 解决方案

\`\`\`python
def calculate_sum(n):
    total = 0
    for i in range(1, n + 1):
        total += i
    return total
\`\`\`

如果你有任何其他问题，请随时提问！
`,
    `感谢你的提问！让我思考一下...

### 分析

根据你的描述，这个问题可以分为以下几个步骤：

- 步骤 1：理解需求
- 步骤 2：设计方案
- 步骤 3：实现代码
- 步骤 4：测试验证

如果你需要更具体的帮助，请提供更多细节。`
  ];
  
  const response = responses[Math.floor(Math.random() * responses.length)];
  message.status = 'streaming';
  
  // Stream character by character
  for (let i = 0; i < response.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30));
    message.content = response.slice(0, i + 1);
    messageListRef.value?.scrollToBottom();
  }
  
  message.status = 'done';
}

// Clear messages
function handleClear() {
  messages.value = [];
}
</script>

<template>
  <div class="container">
    <div class="chat-wrapper">
      <!-- Header -->
      <div class="chat-header">
        <h1>AI 助手</h1>
        <div class="header-actions">
          <button 
            class="action-btn" 
            :class="{ active: showSkillsPanel }"
            @click="toggleSkillsPanel"
            title="技能模板"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
            </svg>
          </button>
          <button v-if="messages.length > 0" class="action-btn" @click="handleClear" title="清空对话">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Main Content -->
      <div class="chat-main">
        <!-- Skills Panel -->
        <transition name="slide">
          <div v-if="showSkillsPanel" class="skills-sidebar">
            <SkillsPanel 
              :categories="skillsCategories" 
              @select="handleSkillSelect"
            />
          </div>
        </transition>
        
        <!-- Message Area -->
        <div class="message-area">
          <!-- Message List -->
          <div class="chat-body">
            <MessageList ref="messageListRef" :messages="messages" />
          </div>
          
          <!-- Input Area -->
          <div class="chat-footer">
            <ChatInput 
              ref="chatInputRef" 
              @send="handleSend" 
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--s-color-bg-primary, #ffffff);
}

.chat-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid var(--s-color-border-tertiary, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;
  
  h1 {
    font-size: 18px;
    font-weight: 600;
    color: var(--s-color-text-primary, #000);
    margin: 0;
  }
  
  .header-actions {
    display: flex;
    gap: 8px;
  }
  
  .action-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--s-color-border-tertiary, rgba(0, 0, 0, 0.08));
    border-radius: 8px;
    background: transparent;
    color: var(--s-color-text-secondary, rgba(0, 0, 0, 0.85));
    cursor: pointer;
    transition: all 0.2s ease;
    
    svg {
      width: 18px;
      height: 18px;
    }
    
    &:hover {
      background: var(--s-color-bg-secondary, #f3f4f6);
      border-color: var(--s-color-border-secondary, rgba(0, 0, 0, 0.15));
    }
    
    &.active {
      background: var(--s-color-brand-primary-default, #0057ff);
      border-color: var(--s-color-brand-primary-default, #0057ff);
      color: white;
    }
  }
}

.chat-main {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.skills-sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--s-color-border-tertiary, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}

.message-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-body {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.chat-footer {
  flex-shrink: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--s-color-border-tertiary, rgba(0, 0, 0, 0.08));
  background: var(--s-color-bg-primary, #ffffff);
}

// Transition animations
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  width: 0;
  opacity: 0;
}
</style>
