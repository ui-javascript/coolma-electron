<template>
  <q-bar
    class="q-electron-drag header text-grey"
    :class="['header--skin-' + skin]"
    :data-header-skin="skin"
    @dblclick="macDoubleClickHandler"
  >
    <!-- Mac: 左侧标题 -->
    <div
      v-if="$q.platform.is.mac"
      class="header-note-title animated fadeIn q-electron-drag--exception"
      style="cursor: pointer"
      @click="toggleTagDialog"
    >
      <span class='save-dot' :class="{ 'show': noteState !== 'default' }"></span>
      <q-tooltip
        v-if="tags.length > 0"
        :offset="[20, 10]"
        content-class="shadow-4 text-h7 tag-tooltip"
      >
        <q-chip v-for="(tag, index) in tags" :key="index" icon="bookmark">{{
          tag
        }}</q-chip>
      </q-tooltip>
      <span key="title" slot="reference">{{ title }}</span>
    </div>

    <!-- 左侧图标组 -->
    <header-left-group
      :search-highlight="searchHighlight"
      :note-list-visible="noteListVisible"
      :pane-layout-mode="paneLayoutMode"
      @search-click="handleSearchClick"
    />

    <!-- Windows: 标题（可拖拽） -->
    <q-space />

    <div
      v-if="!$q.platform.is.mac"
      class="header-note-title animated fadeIn q-electron-drag--exception"
      :class="{ 'mac': $q.platform.is.mac }"
      style="cursor: pointer;"
      @click="toggleTagDialog"
    >
      <span class="save-dot" :class="{'show': noteState !== 'default'}"></span>
      <q-tooltip
        v-if="tags.length > 0"
        :offset="[20, 10]"
        content-class="shadow-4 text-h7 tag-tooltip"
      >
        <q-chip v-for="(tag, index) in tags" :key="index" icon="bookmark">{{
          tag
        }}</q-chip>
      </q-tooltip>
      <span key="title">{{ title }}</span>
    </div>

    <q-space />

    <!-- 右侧图标组 -->
    <header-right-group
      :is-maximized="isMaximized"
      :settings-highlight="settingsHighlight"
      :ai-entry-highlight="aiEntryHighlight"
      :is-push-syncing="isPushSyncing"
      :is-pull-syncing="isPullSyncing"
      @settings-click="handleSettingsClick"
      @ai-click="handleAiAssistantClick"
      @im-click="handleImChatClick"
      @login-click="handleLoginClick"
      @sync-start="handleSyncStart"
      @sync-end="handleSyncEnd"
    />

    <!-- Dialog 组件 -->
    <LoginDialog ref="loginDialog" />
    <SettingsDialog ref="settingsDialog" />
    <EchoInstanceDialog
      v-if='echoInstanceDialogVisible'
      v-model='echoInstanceDialogVisible'
      :instance='activeEchoInstance'
      :echo='activeEchoDefinition'
      @submit='handleEchoInstanceSubmit'
      @open-definition='handleEchoDefinitionOpenFromInstance'
    />
    <SearchDialog ref='searchDialog' />
    <TagDialog ref="tagDialog" />
    <microAppDrawer ref="microAppDrawer" />
    <AiDoubaoDrawer ref="doubaoChatDrawer" />
  </q-bar>
</template>

<script>
import { ipcRenderer } from 'electron'
import { createNamespacedHelpers } from 'vuex'
import { skinMixin } from 'src/mixins/skinMixin'
import { decodeEchoPayload } from 'components/echo/echoCore'
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'

import LoginDialog from '../login/LoginDialog.vue'
import SettingsDialog from '../settings/SettingsDialog.vue'
import SearchDialog from 'components/search/SearchDialog'
import microAppDrawer from 'components/microApp/microAppDrawer'
import AiDoubaoDrawer from 'components/ai/AiDoubaoDrawer'
import echoInstanceDialog from 'components/echo/echoInstanceDialog.vue'
import HeaderLeftGroup from './HeaderLeftGroup.vue'
import HeaderRightGroup from './HeaderRightGroup.vue'

const {
  mapState: mapServerState,
  mapGetters: mapServerGetters,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const {
  mapState: mapClientState,
  mapActions: mapClientActions,
  mapMutations: mapClientMutations
} = createNamespacedHelpers('client')

export default {
  name: 'Header',
  mixins: [skinMixin],
  components: {
    SearchDialog,
    TagDialog: () => import('components/tag/TagDialog'),
    SettingsDialog: () => import('../settings/SettingsDialog.vue'),
    LoginDialog,
    microAppDrawer,
    AiDoubaoDrawer,
    EchoInstanceDialog: echoInstanceDialog,
    HeaderLeftGroup,
    HeaderRightGroup
  },
  computed: {
    ...mapServerState(['user', 'isLogin', 'currentNote', 'noteState', 'currentCategory']),
    ...mapServerGetters(['avatarUrl', 'tagsOfCurrentNote', 'categories']),
    ...mapClientState([
      'shrinkInTray',
      'autoLogin',
      'noteListVisible',
      'paneLayoutMode',
      'enablePreviewEditor',
      'sidebarTreeType',
      'syncStatus',
      'aiAssistantProvider',
      'skin'
    ]),
    title: function () {
      if (this.currentNote && this.currentNote.info) {
        let { title } = this.currentNote.info
        if (title.length > 30) {
          title = `${title.substr(0, 9)}...${title.substring(title.length - 12)}`
        }
        return title
      }
      return ''
    },
    dataLoaded: function () {
      return this.currentNote && this.currentNote.html
    },
    tags: function () {
      return this.tagsOfCurrentNote.map(t => t.name)
    },
    activeEchoDefinition () {
      const definitionId = String(this.activeEchoInstance?.definitionId || '').trim()
      const echoName = String(this.activeEchoInstance?.echoName || '').trim()
      return (this.$store.state.client.echoCards || []).find(item => {
        if (!item) return false
        if (definitionId && String(item.id || '').trim() === definitionId) return true
        if (echoName && item.name === echoName) return true
        return false
      }) || null
    }
  },
  data () {
    return {
      isMaximized: false,
      searchHighlight: false,
      settingsHighlight: false,
      isPushSyncing: false,
      isPullSyncing: false,
      aiEntryHighlight: false,
      echoInstanceDialogVisible: false,
      activeEchoInstance: null
    }
  },
  methods: {
    ...mapServerActions(['logout', 'getCategoryNotes', 'refreshTagNotesCount']),
    ...mapClientActions(['toggleChanged', 'cyclePaneLayout', 'expandFullPaneLayout']),
    ...mapClientMutations({ UPDATE_SYNC_STATUS: 'update_sync_status' }),

    handleHighlight (type) {
      this[type] = true
      setTimeout(() => {
        this[type] = false
      }, 1200)
    },

    handleSearchClick () {
      this.handleHighlight('searchHighlight')
      this.$refs.searchDialog.toggle()
    },

    handleSettingsClick () {
      this.handleHighlight('settingsHighlight')
      const dialog = this.$refs.settingsDialog
      if (dialog) {
        dialog.toggle()
      } else {
        this.$nextTick(() => {
          this.$refs.settingsDialog?.toggle()
        })
      }
    },

    handleAiAssistantClick () {
      this.handleHighlight('aiEntryHighlight')
      if (this.aiAssistantProvider === 'doubao') {
        this.$refs.doubaoChatDrawer.toggle()
      } else {
        this.$busDialog.$emit('AiHelperBusDialog.open')
      }
    },

    handleImChatClick () {
      this.$refs.microAppDrawer.toggle()
    },

    handleLoginClick () {
      this.$refs.loginDialog.toggle()
    },

    handleSyncStart (key) {
      this[key] = true
    },

    handleSyncEnd (key) {
      this[key] = false
    },

    handleAiProviderConfigRequest () {
      this.$nextTick(() => {
        this.$refs.settingsDialog?.show({ openAiAdd: true })
        this.$busDialog.$emit('AiHelperBusDialog.close')
      })
    },

    handleOpenEchoManager (payload = {}) {
      this.activeEchoInstance = {
        echoId: String(payload?.echoId || '').trim(),
        nodeId: String(payload?.nodeId || '').trim(),
        echoName: String(payload?.echoName || '').trim(),
        definitionId: String(payload?.definitionId || decodeEchoPayload(String(payload?.payload || ''))?.props?.definitionId || '').trim(),
        payload: String(payload?.payload || '')
      }
      this.echoInstanceDialogVisible = true
    },

    handleEchoInstanceSubmit (payload = {}) {
      bus.$emit(events.ECHO_EVENTS.commitInstance, payload)
      this.echoInstanceDialogVisible = false
    },

    handleEchoDefinitionOpenFromInstance (payload = {}) {
      this.echoInstanceDialogVisible = false
      this.$nextTick(() => {
        this.$refs.settingsDialog?.show({
          toggle: false,
          tab: 'echo',
          echoId: String(payload?.echoId || '').trim(),
          echoName: String(payload?.echoName || '').trim(),
          openEchoEdit: true
        })
      })
    },

    toggleTagDialog () {
      this.$refs.tagDialog.toggle()
    },

    macDoubleClickHandler: function () {
      if (this.$q.platform.is.mac) {
        const { ipcRenderer } = require('electron')
        ipcRenderer.send('window-maximize')
      }
    },

    async updateMaximizeIcon () {
      const { ipcRenderer } = require('electron')
      this.isMaximized = await ipcRenderer.invoke('window-is-maximized')
    }
  },

  mounted () {
    this.updateMaximizeIcon()
    this.applySkinThemeColor(this.skin)
    ipcRenderer.on('window-maximized', (_, val) => { this.isMaximized = val })
    if (!this.autoLogin && !this.isLogin) {
      this.$nextTick(() => {
        this.$refs.loginDialog.toggle()
      })
    }
    // AI 助手配置缺失时由内容组件自己 emit REQUEST_AI_PROVIDER_CONFIG，
    // 这里订阅跳到 Settings + 关闭 AI drawer。
    bus.$on('REQUEST_AI_PROVIDER_CONFIG', this.handleAiProviderConfigRequest)
    bus.$on(events.VIEW_SHORTCUT_CALL.switchView, this.cyclePaneLayout)
    bus.$on(events.NOTE_SHORTCUT_CALL.searchNote, () => this.$refs.searchDialog.toggle())
    bus.$on(events.ECHO_EVENTS.openManager, this.handleOpenEchoManager)
    bus.$on(events.ECHO_EVENTS.openInstanceEditor, this.handleOpenEchoManager)
    bus.$on('showLoginDialog', () => this.$refs.loginDialog.toggle())
  },

  beforeDestroy () {
    bus.$off(events.VIEW_SHORTCUT_CALL.switchView, this.cyclePaneLayout)
    bus.$off(events.ECHO_EVENTS.openManager, this.handleOpenEchoManager)
    bus.$off(events.ECHO_EVENTS.openInstanceEditor, this.handleOpenEchoManager)
    bus.$off('REQUEST_AI_PROVIDER_CONFIG', this.handleAiProviderConfigRequest)
    bus.$off('showLoginDialog')
  },

  watch: {
    isLogin: function (currentData) {
      if (!currentData) {
        this.$nextTick(() => {
          this.$refs.loginDialog.show()
        })
      }
    }
  }
}
</script>

<style scoped>
.header-note-title {
  display: flex;
  align-items: center;
  margin-left: 0;
}

.header-note-title.mac {
  margin-left: 15%;
}

.header-note-title > span {
  margin-left: 7px;
  letter-spacing: 0.3px;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* === 头部皮肤样式 ===
 * baiyang: 默认白
 * nezha:   莫兰迪砖红
 * infp:    莫兰迪灰绿
 */
.header--skin-baiyang {
  /* 默认白: 保持 q-bar 原始配色 */
}

.header--skin-nezha {
  background-color: #b5817d !important;
  color: #2c2c2c !important;
}

.header--skin-nezha .header-icon-btn .icon-custom,
.header--skin-nezha .header-note-title > span {
  color: #2c2c2c;
}

.header--skin-nezha .header-icon-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.header--skin-nezha .workspace-mode-btn {
  color: #2c2c2c;
}

.header--skin-nezha .header-icon-btn.is-active .icon-custom {
  color: #2c2c2c;
}

.header--skin-nezha .header-avatar-placeholder {
  background-color: rgba(0, 0, 0, 0.2);
}

.header--skin-infp {
  background-color: #a3b5a6 !important;
  color: #2c2c2c !important;
}

.header--skin-infp .header-icon-btn .icon-custom,
.header--skin-infp .header-note-title > span {
  color: #2c2c2c;
}

.header--skin-infp .header-icon-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.header--skin-infp .workspace-mode-btn {
  color: #2c2c2c;
}

.header--skin-infp .header-icon-btn.is-active .icon-custom {
  color: #2c2c2c;
}

.header--skin-infp .header-avatar-placeholder {
  background-color: rgba(0, 0, 0, 0.2);
}

/* 暗黑模式下:无论哪种皮肤,头部都要保持深色文字 */
.body--dark .header--skin-nezha,
.body--dark .header--skin-infp {
  color: #2c2c2c !important;
}
</style>
