/**
 * 云同步方式枚举
 *
 * SettingsServerPanel.vue 和 store/client/state.js 用到。
 */

import { Enum } from 'enum-plus'

export const CloudSyncProviderEnum = Enum({
  WizNote: {
    value: 'wiznote',
    label: 'cloudSyncProviderWizNote',
    icon: 'cloud_circle',
    tagType: 'success'
  },
  CustomFn: {
    value: 'customFn',
    label: 'cloudSyncProviderCustomFn',
    icon: 'functions',
    tagType: 'info'
  }
})

export const DEFAULT_CLOUD_SYNC_PROVIDER = CloudSyncProviderEnum.WizNote