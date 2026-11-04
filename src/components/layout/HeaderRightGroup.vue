<template>
  <div class="header-right-icons">
    <!-- 全局同步按钮 -->
    <div
      v-if="isLogin"
      class="header-sync-group q-electron-drag--exception"
    >
      <div
        class="header-icon-btn sync-btn sync-btn--push"
        :class="{ 'has-pending': pendingCount > 0, 'is-syncing': isPushSyncing }"
        @click="handlePushSyncClick"
      >
        <i v-if="isPushSyncing" class="el-icon-loading icon-custom sync-icon" />
        <i v-else class="el-icon-top icon-custom sync-icon" />
        <span v-if="pendingCount > 0" class="sync-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
        <q-tooltip
          transition-show="fade"
          transition-hide="fade"
          anchor="bottom middle"
          self="top middle"
          :offset="[0, 8]"
        >
          {{ syncPushTooltip }}
        </q-tooltip>
      </div>
      <div
        class="header-icon-btn sync-btn sync-btn--pull"
        :class="{ 'is-syncing': isPullSyncing }"
        @click="handlePullSyncClick"
      >
        <i v-if="isPullSyncing" class="el-icon-loading icon-custom sync-icon" />
        <i v-else class="el-icon-bottom icon-custom sync-icon" />
        <q-tooltip
          transition-show="fade"
          transition-hide="fade"
          anchor="bottom middle"
          self="top middle"
          :offset="[0, 8]"
        >
          {{ syncPullTooltip }}
        </q-tooltip>
      </div>
    </div>

    <!-- 头像下拉菜单 -->
    <div class="header-avatar-wrapper q-electron-drag--exception">
      <el-dropdown trigger="click" @command="handleAvatarCommand">
        <div class="header-avatar" :class="{ 'has-photo': !!avatarUrl }">
          <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" />
          <a-avatar v-else :size="20" :style="{ backgroundColor: 'transparent' }">
            <i class="el-icon-user header-avatar-placeholder" style="font-size: 11px; color: #fff;" />
          </a-avatar>
        </div>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="login" v-if="!isLogin">
            <i class="el-icon-user" />
            {{ $t('login') }}
          </el-dropdown-item>
          <el-dropdown-item command="logout" v-else>
            <i class="el-icon-switch-button" />
            {{ $t('logout') }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
    </div>

    <!-- 视图切换按钮 -->
    <div
      class="header-icon-btn q-electron-drag--exception"
      :class="{ 'is-active': paneLayoutMode !== 0 }"
      :title="$t('switchView')"
      @click="switchViewHandler"
    >
      <a-icon type="layout" class="icon-custom layout-mirror" />
    </div>

    <!-- 换肤按钮 -->
    <el-dropdown trigger="click" @command="handleSkinCommand">
      <div
        class="header-icon-btn q-electron-drag--exception"
        :title="$t('skin')"
      >
        <a-icon type="skin" class="icon-custom" />
      </div>
      <el-dropdown-menu slot="dropdown">
        <el-dropdown-item command="nezha">{{ $t('skin_nezha') }}</el-dropdown-item>
        <el-dropdown-item command="baiyang">{{ $t('skin_baiyang') }}</el-dropdown-item>
        <el-dropdown-item command="infp">{{ $t('skin_infp') }}</el-dropdown-item>
      </el-dropdown-menu>
    </el-dropdown>

    <!-- AI 助手按钮 -->
    <div
      class="header-icon-btn q-electron-drag--exception ai-entry-btn"
      :class="{ 'is-highlight': aiEntryHighlight, 'is-doubao': aiAssistantProvider === 'doubao' }"
      @click="handleAiAssistantClick"
      :title="$t('aiAssistant')"
    >
      <q-icon :name="aiAssistantIconName" class="icon-custom" />
      <span v-if="aiAssistantProvider === 'doubao'" class="ai-entry-badge">{{ $t('aiAssistantProviderDoubao') }}</span>
      <q-tooltip
        transition-show="fade"
        transition-hide="fade"
        anchor="bottom middle"
        self="top middle"
        :offset="[0, 8]"
      >
        {{ aiAssistantTooltip }}
      </q-tooltip>
    </div>

    <!-- 聊天图标 -->
    <div
      class="header-icon-btn q-electron-drag--exception"
      :title="$t('imChat')"
      @click="handleImChatClick"
    >
      <i class="el-icon-chat-dot-round icon-custom" />
    </div>

    <!-- 设置按钮 -->
    <div
      class="header-icon-btn q-electron-drag--exception"
      :class="{ 'is-highlight': settingsHighlight }"
      :title="$t('settings')"
      @click="handleSettingsClick"
    >
      <i class="el-icon-setting icon-custom" />
    </div>

    <!-- 窗口控制按钮 (Windows) -->
    <div v-if="!$q.platform.is.mac" class="header-window-controls q-electron-drag--exception">
      <div class="header-icon-btn window-control-btn" @click="minimize">
        <svg class="icon-custom window-control-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12h15" />
        </svg>
      </div>
      <div class="header-icon-btn window-control-btn" @click="maximize">
        <svg v-if="!isMaximized" class="icon-custom window-control-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="4.5" width="15" height="15" rx="1.4" />
        </svg>
        <svg v-else class="icon-custom window-control-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.25 4.5H19.5V15.75" />
          <rect x="4.5" y="8.25" width="11.25" height="11.25" rx="1.2" />
        </svg>
      </div>
      <div class="header-icon-btn window-control-btn window-control-btn--close" @click="closeApp">
        <svg class="icon-custom window-control-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 4.5l15 15M19.5 4.5l-15 15" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script>
import debounce from 'lodash/debounce'
import { createNamespacedHelpers } from 'vuex'
import { skinMixin } from 'src/mixins/skinMixin'
import CloudSyncService from 'src/services/CloudSyncService'

const {
  mapState: mapServerState
} = createNamespacedHelpers('server')

const {
  mapState: mapClientState,
  mapActions: mapClientActions,
  mapMutations: mapClientMutations
} = createNamespacedHelpers('client')

const SYNC_REASON_MESSAGES = {
  not_logged_in: 'offlineMode',
  already_syncing: 'cloudSyncSyncing'
}

export default {
  name: 'HeaderRightGroup',
  mixins: [skinMixin],
  computed: {
    ...mapServerState(['isLogin']),
    ...mapClientState([
      'paneLayoutMode',
      'syncStatus',
      'aiAssistantProvider'
    ]),
    pendingCount () {
      return this.syncStatus?.pending || 0
    },
    isSyncing () {
      return this.isPushSyncing || this.isPullSyncing
    },
    syncPushTooltip () {
      if (this.isPushSyncing) return this.$t('cloudSyncSyncing')
      if (this.pendingCount > 0) return `${this.$t('cloudSyncSyncPushOnly')} (${this.pendingCount})`
      return this.$t('cloudSyncSyncPushOnly')
    },
    syncPullTooltip () {
      if (this.isPullSyncing) return this.$t('cloudSyncSyncing')
      return this.$t('cloudSyncSyncPullOnly')
    },
    avatarUrl () {
      return this.$store.getters['server/avatarUrl']
    },
    aiAssistantIconName () {
      return this.aiAssistantProvider === 'doubao' ? 'mic' : 'auto_awesome'
    },
    aiAssistantTooltip () {
      return this.aiAssistantProvider === 'doubao'
        ? this.$t('aiAssistantEntryDoubaoTooltip')
        : this.$t('aiAssistant')
    }
  },
  props: {
    isMaximized: Boolean,
    settingsHighlight: Boolean,
    aiEntryHighlight: Boolean,
    isPushSyncing: Boolean,
    isPullSyncing: Boolean
  },
  data () {
    return {
      _handlePushDebounced: null,
      _handlePullDebounced: null
    }
  },
  methods: {
    ...mapClientActions(['toggleChanged', 'cyclePaneLayout']),
    ...mapClientMutations({ UPDATE_SYNC_STATUS: 'update_sync_status' }),

    // ==================== 窗口控制 ====================
    minimize () {
      const { ipcRenderer } = require('electron')
      ipcRenderer.send('window-minimize')
    },
    maximize () {
      const { ipcRenderer } = require('electron')
      ipcRenderer.send('window-maximize')
    },
    closeApp () {
      // 标题栏的「关闭」= 退出程序，而不是隐藏到后台。
      // 二次确认，避免用户以为是“收起到托盘”。
      this.$q.dialog({
        title: this.$t('quitAppTitle'),
        message: this.$t('quitAppMessage'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('quit'), color: 'negative' }
      }).onOk(() => {
        const { ipcRenderer } = require('electron')
        ipcRenderer.send('window-quit')
      })
    },

    // ==================== 视图切换 ====================
    switchViewHandler () {
      this.cyclePaneLayout()
    },

    // ==================== 换肤 ====================
    handleSkinCommand (command) {
      const supportedSkins = ['baiyang', 'nezha', 'infp']
      const nextSkin = supportedSkins.includes(command) ? command : 'baiyang'
      if (nextSkin === this.$store.state.client.skin) {
        this.$q.notify({
          message: this.$t('skinSwitched', { name: this.$t(`skin_${nextSkin}`) }),
          type: 'info',
          position: 'top'
        })
        return
      }
      this.toggleChanged({ key: 'skin', value: nextSkin })
      this.applySkinThemeColor(nextSkin)
      this.triggerSkinEffect(nextSkin)
      this.notifySkinSwitched(nextSkin)
    },

    // ==================== 头像菜单 ====================
    handleAvatarCommand (command) {
      if (command === 'login') {
        this.$emit('login-click')
      } else if (command === 'logout') {
        this.$q.dialog({
          title: this.$t('logout'),
          message: this.$t('logoutHint'),
          cancel: { label: this.$t('cancel') },
          ok: { label: this.$t('logout') }
        }).onOk(() => {
          this.$store.dispatch('server/logout')
        })
      }
    },

    // ==================== AI 入口 ====================
    handleAiAssistantClick () {
      this.$emit('ai-click')
    },

    // ==================== 其他按钮 ====================
    handleSettingsClick () {
      this.$emit('settings-click')
    },
    handleImChatClick () {
      this.$emit('im-click')
    },

    // ==================== 同步 ====================
    async refreshSyncStatusFromDb (lastSyncTime = null) {
      const DatabaseClient = require('src/utils/DatabaseClient').default
      const stats = await DatabaseClient.sync.getStats()
      this.UPDATE_SYNC_STATUS({
        isSyncing: false,
        ...(lastSyncTime ? { lastSyncTime } : {}),
        ...stats
      })
      return stats
    },
    formatSyncFailureMessage (result) {
      if (!result) return this.$t('cloudSyncFailed')
      if (result.error) return result.error
      const messageKey = SYNC_REASON_MESSAGES[result.reason]
      if (messageKey) return this.$t(messageKey)
      return this.$t('cloudSyncFailed')
    },
    async runSyncAction ({ key, action, successMessage, icon, getCount }) {
      if (this.isSyncing) return
      if (!this.isLogin) {
        this.$q.notify({ message: this.$t('offlineMode'), type: 'info', position: 'top' })
        return
      }
      this.$emit('sync-start', key)
      try {
        const result = await action()
        await this.refreshSyncStatusFromDb(Date.now())
        if (result.success) {
          const count = getCount(result)
          this.$q.notify({
            message: count ? `${successMessage} ${count}` : successMessage,
            type: 'positive',
            position: 'top',
            icon
          })
        } else {
          this.$q.notify({ message: this.formatSyncFailureMessage(result), type: 'negative', position: 'top' })
        }
        return result
      } catch (error) {
        try { await this.refreshSyncStatusFromDb() } catch (_) { /* ignore */ }
        this.$q.notify({
          message: error?.message || this.$t('cloudSyncFailed'),
          type: 'negative',
          position: 'top'
        })
        return null
      } finally {
        this.$emit('sync-end', key)
      }
    },
    async handlePushSyncAction () {
      await this.runSyncAction({
        key: 'isPushSyncing',
        action: () => CloudSyncService.pushOnly(),
        successMessage: this.$t('cloudBackupComplete'),
        icon: 'cloud_upload',
        getCount: result => (result.count > 0 ? `↑${result.count}` : '')
      })
    },
    async handlePullSyncAction () {
      this.$q.dialog({
        title: this.$t('syncPullConfirmTitle'),
        message: this.$t('syncPullConfirmMessage'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('syncPullConfirmOk'), color: 'primary' },
        persistent: true
      }).onOk(async () => {
        await this.runSyncAction({
          key: 'isPullSyncing',
          action: () => CloudSyncService.pullOnly(),
          successMessage: this.$t('cloudRestoreComplete'),
          icon: 'cloud_download',
          getCount: result => (result.pulled > 0 ? `↓${result.pulled}` : '')
        })
      })
    },
    handlePushSyncClick: debounce(function () {
      this.handlePushSyncAction()
    }, 500, { leading: true, trailing: false }),
    handlePullSyncClick: debounce(function () {
      this.handlePullSyncAction()
    }, 500, { leading: true, trailing: false })
  },
  beforeDestroy () {
    if (this.handlePushSyncClick && this.handlePushSyncClick.cancel) {
      this.handlePushSyncClick.cancel()
    }
    if (this.handlePullSyncClick && this.handlePullSyncClick.cancel) {
      this.handlePullSyncClick.cancel()
    }
  }
}
</script>

<style scoped>
.header-right-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-icon-btn {
  height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.header-icon-btn:hover {
  background-color: var(--floatHoverColor);
}

.header-icon-btn .icon-custom {
  font-size: 18px;
  color: var(--iconColor, #6b7280);
  transition: all 0.2s ease;
}

.header-icon-btn:hover .icon-custom {
  color: var(--themeColor);
}

.header-icon-btn.is-active .icon-custom {
  color: var(--themeColor);
  filter: drop-shadow(0 1px 2px var(--themeColor40));
}

.header-icon-btn.is-active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 2px;
  background-color: var(--themeColor);
  border-radius: 1px;
}

.header-icon-btn.is-highlight {
  background-color: var(--themeColor10);
  animation: highlight-pulse 5s ease-out forwards;
}

.header-icon-btn.is-highlight::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 2px;
  background-color: var(--themeColor);
  border-radius: 1px;
  animation: highlight-pulse 5s ease-out forwards;
}

@keyframes highlight-pulse {
  0% { opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0; }
}

.ai-entry-btn.is-doubao .icon-custom {
  color: var(--themeColor);
}

.ai-entry-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 0 4px;
  height: 14px;
  line-height: 14px;
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #1e6fff 0%, #4f8bff 100%);
  border-radius: 7px;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 2px rgba(30, 111, 255, 0.35);
}

.header-avatar-wrapper {
  margin-left: 4px;
  margin-right: 5px;
  display: flex;
  align-items: center;
}

.header-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--themeColor30, rgba(64, 158, 255, 0.35)), var(--themeColor, #409eff));
  box-sizing: border-box;
}

.header-avatar.has-photo {
  background: var(--editorBgColor, #fff);
}

.header-avatar:hover {
  box-shadow: 0 0 0 1px var(--themeColor40, rgba(64, 158, 255, 0.4));
}

.header-avatar-placeholder {
  font-size: 11px;
  color: #fff;
}

.header-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.header-window-controls {
  margin-left: 8px;
  display: flex;
  align-items: center;
}

/* 窗口控制: 与右侧其它图标统一的 18px 线稿风格 */
.window-control-btn {
  padding: 0 9px;
  border-radius: 6px;
}

.window-control-btn + .window-control-btn {
  margin-left: 2px;
}

.window-control-icon {
  width: 18px;
  height: 18px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 关闭按钮保留 destructive 语义的红色悬浮 */
.window-control-btn--close:hover {
  background-color: rgba(255, 105, 105, 0.12);
}

.window-control-btn--close:hover .window-control-icon {
  color: var(--deleteColor);
}

.el-dropdown-menu {
  background-color: var(--editorBgColor);
  border: 1px solid var(--floatBorderColor);
}

.el-dropdown-menu__item {
  color: var(--editorColor);
}

.el-dropdown-menu__item:hover {
  background-color: var(--themeColor10);
  color: var(--themeColor);
}

.el-dropdown-menu__item i {
  margin-right: 8px;
}

/* 同步按钮样式 */
.header-sync-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sync-btn {
  position: relative;
}

.sync-btn.has-pending .sync-icon {
  color: var(--themeColor);
}

.sync-btn.is-syncing .sync-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.sync-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  color: #fff;
  background-color: #f56c6c;
  border-radius: 8px;
  transform: translate(25%, -25%);
}

.layout-mirror {
  transform: scaleX(-1);
}
</style>
