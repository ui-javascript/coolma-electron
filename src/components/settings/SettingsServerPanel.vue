<template>
  <div class='settings-server-panel-layout'>
    <CategoryTabs
      v-model='subTab'
      :tabs='subTabOptions'
      color-theme='positive'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-server-panel'>
      <!-- 笔记同步 -->
      <SettingsSectionContent v-if='subTab === $enums.ServerSubEnum.Sync' :title="$t('cloudSync')" accent-color='green-7'>
        <!-- 同步策略选择 -->
        <div class='cloud-sync-strategy q-mb-md'>
          <div class='text-body2 text-weight-medium q-mb-xs'>{{ $t('cloudSyncStrategy') }}</div>
          <div class='text-caption text-grey-6 q-mb-sm'>{{ $t('cloudSyncStrategyHint') }}</div>
          <q-option-group
            :value='cloudSyncStrategy'
            :options='cloudSyncStrategyOptionsResolved'
            color='green-7'
            type='radio' inline
            @input='handleCloudSyncStrategyChange'
          />
        </div>
        <q-separator class='q-my-sm' />

        <!-- 同步方式选择 -->
        <div class='cloud-sync-provider q-my-md'>
          <div class='text-body2 text-weight-medium q-mb-xs'>{{ $t('cloudSyncProvider') }}</div>
          <div class='text-caption text-grey-6 q-mb-sm'>{{ $t('cloudSyncProviderHint') }}</div>
          <q-option-group
            :value='cloudSyncProvider'
            :options='cloudSyncProviderOptionsResolved'
            color='green-7'
            type='radio' inline
            @input='handleCloudSyncProviderChange'
          />
        </div>
        <q-separator class='q-my-sm' />

        <!-- 未登录状态 -->
        <div v-if='!isLoggedIn' class='text-center q-pa-lg'>
          <q-icon name='cloud_off' size='3rem' color='grey-5' />
          <div class='text-h6 q-mt-sm text-grey-7'>{{ $t('cloudSyncNotLoggedIn') }}</div>
          <div class='text-caption text-grey-5 q-mt-xs'>{{ $t('cloudSyncNotLoggedInHint') }}</div>
          <q-btn class='q-mt-md' color='green-7' :label="$t('cloudSyncLogin')" icon='login' unelevated @click='$emit("open-login-dialog")' />
        </div>

        <!-- 已登录状态 -->
        <div v-else>
          <div class='cloud-sync-summary q-mb-md'>
            <div class='cloud-sync-summary__header row items-start justify-between no-wrap q-col-gutter-md'>
              <div class='col'>
                <div class='text-body2 text-weight-medium'>{{ accountInfo.displayName || accountInfo.nickname || accountInfo.username || accountInfo.email || $t('cloudSync') }}</div>
                <div class='text-caption text-grey-6 q-mt-xs'>{{ lastSyncTimeFormatted }}</div>
              </div>
              <q-btn flat dense no-caps color='grey-7' icon='logout' :label="$t('cloudSyncLogout')" @click='$emit("confirm-logout")' />
            </div>
            <div class='row q-col-gutter-sm q-mt-sm'>
              <div class='col-4'><div class='sync-stat-card'><div class='text-caption text-grey-6'>{{ $t('cloudSyncPending') }}</div><div class='text-subtitle1 text-weight-bold text-green-7'>{{ syncStats.pending || 0 }}</div></div></div>
              <div class='col-4'><div class='sync-stat-card'><div class='text-caption text-grey-6'>{{ $t('syncing') }}</div><div class='text-subtitle1 text-weight-bold'>{{ syncStatusText }}</div></div></div>
              <div class='col-4'><div class='sync-stat-card'><div class='text-caption text-grey-6'>{{ $t('cloudSync') }}</div><div class='text-subtitle1 text-weight-bold'>{{ syncStats.synced || 0 }}</div></div></div>
            </div>
            <div v-if='syncError' class='text-caption text-negative q-mt-sm'>{{ syncError }}</div>
            <div class='row q-gutter-sm q-mt-md'>
              <q-btn unelevated color='green-7' icon='cloud_upload' :label="$t('cloudSyncSyncPushOnly')" :loading='isSyncing' @click='$emit("do-push-only")' />
              <q-btn outline color='green-7' icon='cloud_download' :label="$t('cloudSyncSyncPullOnly')" :loading='isSyncing' @click='$emit("do-pull-only")' />
            </div>
          </div>
        </div>
      </SettingsSectionContent>

      <!-- 图片上传 -->
      <SettingsSectionContent v-if='subTab === $enums.ServerSubEnum.Image' :title="$t('cloudImage')" accent-color='green-7'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            <span>{{ $t('imageUploadService') }}</span>
            <q-select
              dense options-dense
              :value='$t(imageUploadService)'
              :options='imageUploadServiceOptions'
              @input='imageUploadServiceChangeHandler'
            />
          </div>
        </div>
      </SettingsSectionContent>

      <!-- v2026-08-01 起：CDN注入 / 微应用 / 个人信息 已挪到 GeneralSubEnum（通用面板） -->
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import SessionStorageService from 'src/services/SessionStorageService'

export default {
  name: 'SettingsServerPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent
  },
  props: {
    cloudSyncProvider: {
      type: String,
      required: true
    },
    cloudSyncStrategy: {
      type: String,
      required: true
    },
    syncStatus: {
      type: Object,
      required: true
    },
    imageUploadService: {
      type: String,
      required: true
    }
  },
  data () {
    return {
      subTab: this.$enums.ServerSubEnum.Sync,
      cloudSyncLoginState: {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      },
      syncStats: { total: 0, synced: 0, pending: 0 },
      lastSyncTimeDisplay: null,
      isSyncing: false,
      syncError: null,
      cloudSyncStrategyOptions: [
        { label: 'cloudSyncStrategyPureOnline', value: 'pureOnline' },
        { label: 'cloudSyncStrategyOnlineFirst', value: 'onlineFirst' },
        { label: 'cloudSyncStrategyOfflineFirst', value: 'offlineFirst' }
      ],
      cloudSyncProviderOptions: [
        { label: 'cloudSyncProviderWizNote', labelKey: true, value: 'wiznote' },
        { label: 'cloudSyncProviderCustomFn', labelKey: true, value: 'customFn' }
      ],
      imageUploadServiceOptionsPlain: [
        'wizOfficialImageUploadService',
        'picgoServer',
        'none'
      ]
    }
  },
  computed: {
    isLoggedIn () {
      return this.cloudSyncLoginState.isLoggedIn
    },
    accountInfo () {
      return this.cloudSyncLoginState.accountInfo || {}
    },
    cloudSyncStrategyOptionsResolved () {
      return this.cloudSyncStrategyOptions.map(opt => ({
        ...opt,
        label: this.$t(opt.label)
      }))
    },
    cloudSyncProviderOptionsResolved () {
      return this.cloudSyncProviderOptions.map(opt => ({
        ...opt,
        label: opt.labelKey ? this.$t(opt.label) : opt.label
      }))
    },
    imageUploadServiceOptions: function () {
      return [
        this.$t('wizOfficialImageUploadService'),
        this.$t('picgoServer'),
        this.$t('none')
      ]
    },
    lastSyncTimeFormatted () {
      if (!this.syncStatus?.lastSyncTime) return this.$t('never')
      return this.formatSyncTime(this.syncStatus.lastSyncTime)
    },
    syncStatusText () {
      const s = this.syncStatus
      if (s?.isSyncing) return this.$t('syncing')
      if (!s) return this.$t('never')
      return `${s.synced || 0}/${s.total || 0}`
    },
    subTabOptions () {
      return this.$enums.ServerSubEnum.items.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon
      }))
    }
  },
  watch: {
    syncStatus: {
      handler (newVal) {
        if (newVal) {
          this.syncStats = {
            total: newVal.total || 0,
            synced: newVal.synced || 0,
            pending: newVal.pending || 0
          }
          this.isSyncing = newVal.isSyncing || false
        }
      },
      deep: true
    }
    // v2026-08-01 起：subTab 切到 MicroApps 的自动 load 逻辑已挪到 SettingsGeneralPanel
  },
  methods: {
    formatSyncTime (timestamp) {
      if (!timestamp) return this.$t('never')
      // 文案走 i18n：justNow / minutesAgo / hoursAgo / daysAgo
      // 复用 src/utils/util/dateUtil.js 的 displayDateElegantly，自动注入 {num} / {plural} 占位符
      // （直接用 this.$t('minutesAgo') 不会替换 {num}，会出现 "5{num} 分钟前"）
      return this.$utils.dateUtil.displayDateElegantly(timestamp)
    },
    refreshCloudSyncLoginState () {
      this.cloudSyncLoginState = {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      }
    },
    handleCloudSyncProviderChange (value) {
      this.$emit('update-cloud-sync-provider', value)
      const name = this.cloudSyncProviderOptions.find(opt => opt.value === value)?.labelKey
        ? this.$t(this.cloudSyncProviderOptions.find(opt => opt.value === value).label)
        : ''
      this.$q.notify({
        message: this.$t('cloudSyncProviderChanged', { name }),
        type: 'info',
        icon: 'cloud_circle'
      })
    },
    handleCloudSyncStrategyChange (value) {
      this.$emit('update-cloud-sync-strategy', value)
      const option = this.cloudSyncStrategyOptions.find(opt => opt.value === value)
      const name = option ? this.$t(option.label) : value
      this.$q.notify({
        message: this.$t('cloudSyncStrategyChanged', { name }),
        type: 'info',
        icon: 'sync_alt'
      })
    },
    imageUploadServiceChangeHandler: function (service) {
      const servicePlain = this.imageUploadServiceOptionsPlain.find(
        i => this.$t(i) === service
      )
      this.$emit('update-image-upload-service', servicePlain)
    }
    // v2026-08-01 起：addCdnDep / deleteCdnDep / saveCdnDeps 已挪到 SettingsGeneralPanel
  },
  mounted () {
    this.refreshCloudSyncLoginState()
  }
}
</script>

<style scoped>
.settings-server-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-server-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-server-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-server-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-server-panel::-webkit-scrollbar-track {
  background: transparent;
}

.settings-dialog-sep {
  flex-shrink: 0;
}

.setting-item {
  margin-top: 0.45rem;
}

.setting-item--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cloud-sync-summary {
  padding: 12px;
  border: 1px solid rgba(76, 175, 80, 0.16);
  border-radius: 10px;
  background: rgba(76, 175, 80, 0.04);
}

.cloud-sync-summary__header {
  min-width: 0;
}

.sync-stat-card {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 8px 12px;
  text-align: center;
}

.body--dark .sync-stat-card {
  background: #2a2a2a;
}

/* v2026-08-01 起：.cdn-deps-list / .cdn-dep-item 样式已挪到 SettingsGeneralPanel */
</style>
