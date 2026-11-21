<template>
  <q-drawer
    ref="drawer"
    :width="width"
    side="right"
    overlay
    elevated
    content-class="hide-scrollbar"
    class="ai-chat-drawer"
    z-index="9999"
  >
    <div class="ai-chat-container">
      <!-- Header bar -->
      <div class="ai-chat-header">
        <span class="ai-chat-title">{{ $t('aiAssistant') || 'AI 助手' }}</span>
        <q-btn
          dense
          flat
          round
          icon="close"
          size="sm"
          @click="hide"
        />
      </div>

      <!-- Wujie micro-frontend container -->
      <div class="ai-wujie-wrapper">
        <WujieVue
          v-if="wujieKey"
          :key="wujieKey"
          name="doubao-chat"
          class="ai-wujie-frame"
          :url="wujieUrl"
          :sync="false"
          :props="wujieProps"
        />
      </div>
    </div>
  </q-drawer>
</template>

<script>
import WujieVue from 'wujie-vue2'
import { getAppPath } from 'src/ApiInvoker'

export default {
  name: 'AiDoubaoDrawer',
  components: {
    WujieVue
  },
  props: {
    width: {
      type: Number,
      default: 600  // 更大的默认宽度以适应技能面板
    }
  },
  data () {
    return {
      visible: false,
      appBasePath: '',
      // 每次打开抽屉都自增，强制 WujieVue 重新挂载、重新拉起子应用，
      // 避免上一次会话的对话状态影响新一次打开。
      wujieMountKey: 0
    }
  },
  computed: {
    wujieKey () {
      return this.visible ? this.wujieMountKey : 0
    },
    wujieUrl () {
      // 开发环境使用本地开发服务器
      if (process.env.DEV) {
        return 'http://localhost:3001'
      }
      // 生产环境使用本地构建产物
      const basePath = this.appBasePath || ''
      return `file://${basePath}_plugins/doubao-input/dist/index.html`
    },
    wujieProps () {
      return {
        // 传递给子应用的数据
        data: {
          theme: 'light',
          locale: this.$i18n.locale
        },
        // 回调函数
        onMessage: this.handleMessage
      }
    }
  },
  async mounted () {
    try {
      const basePath = await getAppPath()
      this.appBasePath = basePath
    } catch (err) {
      console.warn('[AiDoubaoDrawer] Failed to get app path:', err)
    }
  },
  methods: {
    handleMessage (data) {
      // 处理来自子应用的消息
      console.log('[AiDoubaoDrawer] Received message:', data)
      this.$emit('message', data)
    },
    show () {
      this.wujieMountKey += 1
      this.visible = true
      this.$nextTick(() => {
        if (this.$refs.drawer) {
          this.$refs.drawer.show()
        }
      })
      this.$emit('shown')
    },
    hide () {
      if (this.$refs.drawer) {
        this.$refs.drawer.hide()
      }
      this.$emit('hidden')
    },
    toggle () {
      if (this.$refs.drawer && this.$refs.drawer.showing) {
        this.hide()
      } else {
        this.show()
      }
    },
    // 向子应用发送消息
    sendMessage (data) {
      if (this.$refs.wujieVue) {
        this.$refs.wujieVue.contentWindow?.postMessage(data, '*')
      }
    }
  }
}
</script>

<style scoped lang="scss">
.ai-chat-drawer {
  background-color: transparent !important;
  box-shadow: none !important;
}

.ai-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--editorBgColor, #ffffff);
  border-radius: 8px 0 0 8px;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
}

.ai-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--floatBorderColor, #e8e8e8);
  flex-shrink: 0;
}

.ai-chat-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--editorColor, #333);
}

.ai-wujie-wrapper {
  flex: 1;
  width: 100%;
  height: calc(100% - 44px);
  overflow: hidden;
  position: relative;
}

.ai-wujie-frame {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
