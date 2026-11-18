# Element-UI-X 组件能力详解

## 概览

Element-UI-X 是专为 Vue2 + Element-UI 项目设计的 AI 组件库，基于 Element Plus X 的成熟设计理念。完整组件列表与官方文档见 [https://element-ui-x.com/](https://element-ui-x.com/)。

## 组件能力详解

### Welcome

卡片式欢迎区，适合作为抽屉或面板顶部说明。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `icon` | `String` | - | Element UI 图标类名，如 `el-icon-chat-dot-round` |
| `title` | `String` | - | 标题文本 |
| `description` | `String` | - | 描述文本 |
| `variant` | `String` | `'borderless'` | 变体：`filled` / `borderless` |
| `extra` | `Slot` | - | 右侧扩展区，可放按钮或下拉菜单 |
| `rtl` | `Boolean` | `false` | RTL 布局 |

**示例：**

```vue
<el-x-welcome
  icon="el-icon-magic-stick"
  title="AI 助手"
  description="在这里体验 AI 对话能力"
  variant="filled"
/>
```

### Typewriter

打字机效果组件，适合展示 AI 思考过程或逐字输出。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `content` | `String` | - | 要逐字显示的内容 |
| `typing` | `Boolean` | `false` | 是否开始打字动画 |
| `speed` | `Number` | `50` | 每个字符的延时（ms） |
| `delete` | `Boolean` | `false` | 是否支持回退动画 |
| `loop` | `Boolean` | `false` | 是否循环播放 |

**关键行为：**

- `typing` 设为 `true` 时开始动画，设为 `false` 时停止。
- 建议在抽屉打开时设为 `true`，关闭时重置为 `false`。
- 若用于展示 AI 思考，可配合 `Thinking` 组件先展示加载状态，再切换到打字效果。

**示例：**

```vue
<el-x-typewriter
  :content="aiResponseText"
  :typing="isTyping"
  :speed="30"
/>
```

### Bubble

单条气泡消息，适合静态展示或自建列表。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `content` | `String` | - | 消息内容 |
| `placement` | `String` | `'start'` | 位置：`start`（左）/ `end`（右） |
| `type` | `String` | `'default'` | 类型：`default` / `primary` / `success` / `warning` / `danger` |
| `avatar` | `String` | - | 头像 URL |
| `name` | `String` | - | 发消息者名称 |
| `time` | `String` | - | 时间戳文本 |

**示例：**

```vue
<el-x-bubble
  placement="start"
  type="default"
  name="AI 助手"
  avatar="/static/ai-avatar.png"
  content="你好，有什么可以帮助你的？"
  time="10:30"
/>
<el-x-bubble
  placement="end"
  type="primary"
  content="我想创建一个新笔记"
/>
```

### BubbleList

带滚动和加载更多的消息列表，适合真实聊天场景。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `list` | `Array` | `[]` | 消息列表，每项结构同 Bubble props |
| `loading` | `Boolean` | `false` | 是否加载更多 |
| `finished` | `Boolean` | `false` | 是否已全部加载 |
| `scrollBottomText` | `String` | `'已加载全部消息'` | 到底部提示文字 |

**消息项数据结构：**

```js
{
  id: 'unique-id',
  content: '消息内容',
  placement: 'start', // 或 'end'
  type: 'default',    // 或 'primary'
  avatar: '',
  name: '',
  time: ''
}
```

**常用事件：**

| 事件 | 参数 | 说明 |
|------|------|------|
| `loadmore` | - | 滚动到底部触发，加载更多历史消息 |

**示例：**

```vue
<el-x-bubble-list
  :list="messageList"
  :loading="loadingMore"
  :finished="noMoreMessages"
  @loadmore="loadHistory"
/>
```

### Sender

智能输入框，支持快捷指令、扩展按钮和附件，是 AI 对话的核心交互组件。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` / `v-model` | `String` | - | 输入内容（支持 v-model） |
| `placeholder` | `String` | `'请输入...'` | 占位文本 |
| `disabled` | `Boolean` | `false` | 是否禁用 |
| `presetList` | `Array` | `[]` | 快捷指令列表，如 `['解释这段代码', '优化这段文字']` |
| `header` | `Boolean` | `true` | 是否显示头部（快捷指令区） |
| `footer` | `Boolean` | `true` | 是否显示底部（字数统计等） |
| `maxlength` | `Number` | - | 最大字符数 |
| `rows` | `Number` | `1` | 最小行数，支持自动扩展 |

**快捷指令数据结构：**

```js
{
  label: '解释这段代码',
  value: '请解释这段代码'
}
```

**常用事件：**

| 事件 | 参数 | 说明 |
|------|------|------|
| `input` | `value: String` | 输入内容变化 |
| `submit` | `value: String` | 按下发送按钮或回车时触发，value 为当前输入内容 |
| `clear` | - | 清空输入框时触发 |
| `preset` | `item: Object` | 点击快捷指令时触发 |

**示例：**

```vue
<el-x-sender
  v-model="draftMessage"
  placeholder="输入消息，Enter 发送"
  :preset-list="presetList"
  @submit="handleSend"
  @preset="handlePreset"
/>
```

```js
handlePreset (item) {
  this.draftMessage = item.value
  this.$nextTick(() => this.handleSend(item.value))
}
```

### Prompts

预设 Prompt 按钮组，适合作为 AI 功能的快捷入口。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `list` | `Array` | `[]` | Prompt 列表 |
| `direction` | `String` | `'row'` | 排列方向：`row` / `column` |
| `gap` | `String` | `'8px'` | 按钮间距 |
| `trigger` | `String` | `'click'` | 触发方式 |

**Prompt 项数据结构：**

```js
{
  label: '写作助手',
  description: '帮你润色和优化文章',
  icon: 'el-icon-edit',
  value: '你是一个写作助手，请帮我优化以下文字：'
}
```

**示例：**

```vue
<el-x-prompts
  :list="promptList"
  direction="row"
  @click="handlePromptClick"
/>
```

### Thinking

AI 思考中的加载动画，适合在等待 AI 回复时展示。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `text` | `String` | `'AI 正在思考中...'` | 提示文字 |
| `variant` | `String` | `'default'` | 变体：`default` / `primary` |
| `size` | `String` | `'medium'` | 尺寸：`small` / `medium` / `large` |

**示例：**

```vue
<el-x-thinking text="正在思考中，请稍候..." />
```

### ThoughtChain

展示 AI 推理链路，适合 o1/o3 类思考型模型的输出展示。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `list` | `Array` | `[]` | 思考步骤列表 |
| `activeIndex` | `Number` | `0` | 当前激活的步骤 |
| `direction` | `String` | `'column'` | 排列方向 |

**示例：**

```vue
<el-x-thought-chain
  :list="thoughtSteps"
  :active-index="currentStep"
/>
```

### Conversations

会话管理组件，提供类似 ChatGPT 的左侧会话列表。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `list` | `Array` | `[]` | 会话列表 |
| `activeId` | `String` / `Number` | - | 当前选中的会话 ID |
| `searchable` | `Boolean` | `true` | 是否显示搜索框 |
| `draggable` | `Boolean` | `false` | 是否支持拖拽排序 |

**会话项数据结构：**

```js
{
  id: 'conv-001',
  title: '关于笔记整理的讨论',
  updatedAt: '2026-06-07 10:30',
  messages: []
}
```

**常用事件：**

| 事件 | 参数 | 说明 |
|------|------|------|
| `select` | `item: Object` | 选中会话时触发 |
| `delete` | `id: String` | 删除会话时触发 |
| `create` | - | 新建会话时触发 |

**示例：**

```vue
<el-x-conversations
  :list="conversationList"
  :active-id="currentConvId"
  @select="switchConversation"
  @delete="deleteConversation"
/>
```

### FilesCard

展示 AI 返回的文件卡片，适合代码片段、文件下载等场景。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `files` | `Array` | `[]` | 文件列表 |
| `theme` | `String` | `'light'` | 主题：`light` / `dark` |

**文件项数据结构：**

```js
{
  name: 'example.js',
  language: 'javascript',
  code: 'const a = 1;',
  description: '示例代码文件'
}
```

### Attachments

用户上传附件的组件。

**常用属性：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | `Array` | `[]` | 已上传附件列表 |
| `limit` | `Number` | `9` | 最大上传数量 |
| `accept` | `String` | - | 接受的文件类型 |
| `disabled` | `Boolean` | `false` | 是否禁用 |

**常用事件：**

| 事件 | 参数 | 说明 |
|------|------|------|
| `change` | `files: Array` | 附件变化时触发 |

## Mixins

Element-UI-X 还提供几个实用的 Mixin，方便接入流式接口和发送逻辑。

### sendMixin

封装了常见的发送逻辑，适合配合 `Sender` 使用。

### streamMixin

封装了流式接口的读取和解析逻辑，适合 SSE / WebSocket 场景。

### recordMixin

封装了语音识别的相关逻辑，适合需要语音输入的场景。

使用方式：

```js
import { streamMixin } from 'vue-element-ui-x'

export default {
  mixins: [streamMixin],
  methods: {
    async startStream (url, params) {
      await this.streamStart(url, params)
    }
  }
}
```

## 项目内注意事项

### 1. 本项目通知体系

本项目使用 Quasar 的 `$q.notify` 作为通知 API，不要混用 Element UI 的 `$message`。

### 2. 抽屉与布局

coolma 的抽屉建议使用 `el-drawer`，并通过 `append-to-body` 避免层级冲突。内容区推荐纵向 flex 布局，输入框根据需求决定置顶或置底。

### 3. 状态管理

AI 对话状态（消息列表、思考状态、当前会话）建议放在组件本地 data 中；若需要持久化，再接入 Vuex store。

### 4. 主题适配

Element-UI-X 组件使用 CSS 变量管理颜色，已内置一套默认变量。若需要适配 coolma 的深色模式，可覆盖以下变量：

```css
:root {
  --color-primary: #409eff;
  --color-success: #67c23a;
  --color-warning: #e6a23c;
  --color-danger: #f56c6c;
  --color-info: #909399;
}
```
