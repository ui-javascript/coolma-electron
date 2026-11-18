# Element-UI-X 项目适配示例

本文件按场景提供可直接参考的代码模板，覆盖基础接入到完整聊天面板的典型需求。所有示例均适配 coolma 项目的 Electron + Quasar + Vue2 + Element-UI 架构。

## 示例目录

| 场景 | 对应示例 |
|------|---------|
| 快速演示 | 示例 1：基础 AI 抽屉 |
| 真实聊天 | 示例 2：完整聊天面板 |
| 消息管理 | 示例 3：消息列表 + 输入框联动 |
| 流式输出 | 示例 4：流式输出集成思路 |
| Prompt 快捷入口 | 示例 5：Prompts 组件使用 |

---

## 示例 1：基础 AI 抽屉

适合快速上线一个带 Welcome + 打字效果 + 消息气泡 + 输入框的演示版 AI 抽屉。

**文件路径：** `src/components/ui/AiDemoDrawer.vue`

```vue
<template>
  <el-drawer
    title="AI 助手示例"
    :visible.sync="visible"
    direction="rtl"
    size="420px"
    :modal="false"
    append-to-body
  >
    <div class="ai-drawer-demo">
      <!-- 输入框固定在顶部 -->
      <div class="ai-demo-input-section ai-demo-section">
        <el-x-sender
          v-model="draftMessage"
          placeholder="输入内容体验 Sender 组件"
          @submit="handleSubmit"
        />
      </div>

      <!-- 欢迎区 -->
      <el-x-welcome
        icon="el-icon-magic-stick"
        title="开始你的 AI 对话"
        description="这是一个基础演示，后续可扩展为完整聊天面板。"
        variant="filled"
      />

      <!-- 可滚动内容区 -->
      <div class="ai-demo-scroll">
        <div class="ai-demo-section">
          <el-x-typewriter
            :content="typewriterContent"
            :typing="visible"
          />
        </div>
        <div class="ai-demo-section">
          <div class="ai-demo-bubbles">
            <el-x-bubble placement="start" content="你好，这是一个示例消息。" />
            <el-x-bubble placement="end" type="primary" content="收到，你可以开始输入了。" />
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
export default {
  name: 'AiDemoDrawer',
  data () {
    return {
      visible: false,
      draftMessage: '',
      typewriterContent: '欢迎使用 AI 抽屉示例，这里演示了 Welcome、Typewriter、Bubble 和 Sender 组件的基础组合。'
    }
  },
  methods: {
    show () { this.visible = true },
    hide () { this.visible = false },
    toggle () { this.visible = !this.visible },
    handleSubmit (value) {
      const message = typeof value === 'string' ? value : this.draftMessage
      if (!message || !message.trim()) return
      this.$q.notify({
        type: 'positive',
        message: `示例消息：${message.trim()}`,
        position: 'top'
      })
      this.draftMessage = ''
    }
  }
}
</script>

<style scoped>
.ai-drawer-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.ai-demo-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-demo-input-section {
  flex-shrink: 0;
}

.ai-demo-section {
  padding: 16px;
  border: 1px solid var(--floatBorderColor, #ebeef5);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
}

.ai-demo-bubbles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
```

**Header.vue 中挂载方式：**

```vue
<!-- 按钮 -->
<div class="header-icon-btn" title="AI 助手" @click="$refs.aiDemoDrawer.toggle()">
  <i class="el-icon-magic-stick" />
  <span>AI</span>
</div>

<!-- 组件引用 -->
<AiDemoDrawer ref="aiDemoDrawer" />
```

```js
import AiDemoDrawer from 'components/ui/AiDemoDrawer'
export default {
  components: { AiDemoDrawer }
}
```

---

## 示例 2：完整聊天面板

适合升级到类似 ChatGPT 的真实聊天界面，包含会话列表、消息流、Prompt 快捷入口和输入框。

**文件路径：** `src/components/ui/AiChatDrawer.vue`

```vue
<template>
  <el-drawer
    :visible.sync="visible"
    direction="rtl"
    size="520px"
    :modal="false"
    append-to-body
    custom-class="ai-chat-drawer"
  >
    <div class="ai-chat-layout">
      <!-- 左侧：会话列表（可选，如不需要可隐藏） -->
      <div v-if="showConversations" class="ai-chat-sidebar">
        <el-x-conversations
          :list="conversationList"
          :active-id="currentConvId"
          @select="switchConversation"
          @create="createConversation"
        />
      </div>

      <!-- 右侧：对话区 -->
      <div class="ai-chat-main">
        <!-- 顶部快捷指令 -->
        <div class="ai-chat-prompts">
          <el-x-prompts
            :list="promptList"
            direction="row"
            @click="handlePromptClick"
          />
        </div>

        <!-- 消息列表 -->
        <div class="ai-chat-messages">
          <!-- 欢迎消息（首次打开时） -->
          <el-x-welcome
            v-if="messageList.length === 0"
            icon="el-icon-chat-dot-round"
            title="AI 助手已就绪"
            description="选择一个快捷指令，或直接输入你的问题。"
            variant="filled"
          />

          <!-- AI 思考中 -->
          <el-x-thinking
            v-if="isThinking"
            text="正在思考中..."
          />

          <!-- 消息流 -->
          <el-x-bubble-list
            v-else
            :list="messageList"
          />
        </div>

        <!-- 输入区 -->
        <div class="ai-chat-input">
          <el-x-sender
            v-model="draftMessage"
            :preset-list="presetList"
            placeholder="输入消息，Enter 发送"
            @submit="handleSend"
            @preset="handlePreset"
          />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
export default {
  name: 'AiChatDrawer',
  data () {
    return {
      visible: false,
      showConversations: true,
      isThinking: false,
      draftMessage: '',
      currentConvId: null,
      conversationList: [],
      messageList: [],
      promptList: [
        { label: '写作助手', value: '你是一个写作助手，请帮我优化以下文字：' },
        { label: '代码解释', value: '请解释以下代码的功能：' },
        { label: '翻译', value: '请翻译以下内容为中文：' }
      ],
      presetList: [
        { label: '润色', value: '请帮我润色这段文字：' },
        { label: '总结', value: '请总结以下内容的要点：' }
      ]
    }
  },
  methods: {
    show () { this.visible = true },
    hide () { this.visible = false },
    toggle () { this.visible = !this.visible },

    handlePromptClick (item) {
      this.draftMessage = item.value || item.label
    },

    handlePreset (item) {
      this.draftMessage = item.value
      this.$nextTick(() => this.handleSend(this.draftMessage))
    },

    handleSend (value) {
      const text = typeof value === 'string' ? value : this.draftMessage
      if (!text || !text.trim()) return

      // 追加用户消息
      this.messageList.push({
        id: Date.now() + '-user',
        content: text.trim(),
        placement: 'end',
        type: 'primary'
      })

      this.draftMessage = ''
      this.isThinking = true

      // TODO: 这里替换为真实 AI 接口调用
      // 示例：setTimeout 模拟 AI 回复
      setTimeout(() => {
        this.isThinking = false
        this.messageList.push({
          id: Date.now() + '-ai',
          content: '这是一条模拟回复，实际使用时替换为你的 AI 接口。',
          placement: 'start'
        })
      }, 1500)
    },

    switchConversation (item) {
      this.currentConvId = item.id
      // TODO: 加载该会话的历史消息
    },

    createConversation () {
      // TODO: 创建新会话
    }
  }
}
</script>

<style scoped>
.ai-chat-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.ai-chat-sidebar {
  width: 200px;
  border-right: 1px solid var(--floatBorderColor, #ebeef5);
  overflow-y: auto;
}

.ai-chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
}

.ai-chat-prompts {
  flex-shrink: 0;
}

.ai-chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-chat-input {
  flex-shrink: 0;
}
</style>
```

---

## 示例 3：消息列表 + 输入框联动

演示如何把 `Sender` 的内容追加到 `BubbleList` 中，适合需要自己管理消息列表的场景。

```js
// data
messageList: [],
draftMessage: ''

// methods
appendUserMessage (text) {
  this.messageList.push({
    id: Date.now() + '-user',
    content: text,
    placement: 'end',
    type: 'primary'
  })
},

appendAiMessage (text) {
  this.messageList.push({
    id: Date.now() + '-ai',
    content: text,
    placement: 'start'
  })
},

async handleSend (value) {
  const text = typeof value === 'string' ? value : this.draftMessage
  if (!text || !text.trim()) return

  this.appendUserMessage(text.trim())
  this.draftMessage = ''
  this.isThinking = true

  try {
    // TODO: 替换为真实 AI 接口
    const response = await this.callAiApi(text)
    this.appendAiMessage(response)
  } catch (err) {
    this.$q.notify({
      type: 'negative',
      message: 'AI 回复失败：' + (err.message || '未知错误'),
      position: 'top'
    })
  } finally {
    this.isThinking = false
  }
}
```

---

## 示例 4：流式输出集成思路

如果需要接入 SSE / WebSocket 流式输出，可以利用 `streamMixin` 或自己封装。

```js
import { streamMixin } from 'vue-element-ui-x'

export default {
  mixins: [streamMixin],

  data () {
    return {
      isStreaming: false,
      streamContent: ''
    }
  },

  methods: {
    async startStream (text) {
      this.isStreaming = true
      this.streamContent = ''

      try {
        const response = await fetch('/api/ai/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        })

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          this.streamContent += chunk
        }

        // 流结束后，转为正式消息
        this.appendAiMessage(this.streamContent)
      } catch (err) {
        this.$q.notify({
          type: 'negative',
          message: '流式输出失败',
          position: 'top'
        })
      } finally {
        this.isStreaming = false
        this.streamContent = ''
      }
    }
  }
}
```

流式输出时配合 `Typewriter` 组件可以做出逐字显示效果：

```vue
<el-x-typewriter
  v-if="isStreaming"
  :content="streamContent"
  :typing="true"
  :speed="20"
/>
```

---

## 示例 5：Prompts 组件使用

适合做 AI 功能的快捷入口面板。

```vue
<el-x-prompts
  :list="promptList"
  direction="row"
  @click="handlePromptClick"
/>
```

```js
promptList: [
  {
    label: '写作助手',
    description: '帮你润色和优化文章',
    icon: 'el-icon-edit',
    value: '你是一个写作助手，请帮我优化以下文字：'
  },
  {
    label: '代码助手',
    description: '解释或优化代码',
    icon: 'el-icon-code',
    value: '请解释以下代码的功能：'
  },
  {
    label: '翻译',
    description: '多语言互译',
    icon: 'el-icon translate',
    value: '请翻译以下内容为中文：'
  },
  {
    label: '总结',
    description: '提炼要点',
    icon: 'el-icon-document',
    value: '请总结以下内容的要点：'
  }
]

handlePromptClick (item) {
  // 将 prompt 填充到输入框并自动发送
  this.draftMessage = item.value
  this.$nextTick(() => this.handleSend(item.value))
}
```

---

## Header.vue 中新增 AI 按钮的参考模板

在 `src/components/Header.vue` 的 `header-right-icons` 区域添加按钮：

```vue
<!-- AI 按钮 -->
<div
  class="header-icon-btn q-electron-drag--exception header-ai-btn"
  :class="{ 'is-highlight': aiDrawerHighlight }"
  title="AI 助手"
  @click="handleAiDrawerClick"
>
  <i class="el-icon-magic-stick icon-custom" />
  <span class="header-ai-btn__label">AI</span>
</div>
```

```js
// import
import AiChatDrawer from 'components/ui/AiChatDrawer'

// components
components: { /* ... */, AiChatDrawer }

// data
aiDrawerHighlight: false

// methods
handleAiDrawerClick () {
  this.handleHighlight('aiDrawerHighlight')
  this.$refs.aiChatDrawer.toggle()
}
```

```css
.header-ai-btn {
  gap: 4px;
  padding: 0 10px;
  width: auto;
  min-width: 48px;
}

.header-ai-btn__label {
  font-size: 12px;
  font-weight: 600;
}
```

抽屉组件引用：

```vue
<AiChatDrawer ref="aiChatDrawer" />
```

---

## 样式适配注意事项

1. **内边距**：抽屉内容容器统一使用 `padding: 16px`。
2. **可滚动区**：需要滚动的内容区设置 `flex: 1; min-height: 0; overflow-y: auto`。
3. **固定输入框**：输入框所在区块设置 `flex-shrink: 0`，避免被压缩。
4. **边框颜色**：优先复用 `var(--floatBorderColor, #ebeef5)`。
5. **深色模式**：如需适配 coolma 深色主题，在 `.ai-chat-drawer` 下覆盖 Element-UI-X 的 CSS 变量。
