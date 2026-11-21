import { DEFAULT_NOTE_ORDER_TYPE } from 'src/utils/enum'
import { DEFAULT_CALENDAR_DATE_BASIS } from 'src/utils/enum'
import {
  DEFAULT_AI_ASSISTANT_PROVIDER,
  DEFAULT_CLOUD_SYNC_PROVIDER
} from 'src/utils/enum'
import { DEFAULT_SYNC_STRATEGY } from 'src/utils/const/syncStrategy'
import { BUILTIN_ECHO_CARDS } from 'components/echo/echoCore'

export default function () {
  return {
    language: null,
    autoLogin: false,
    rememberPassword: true,
    darkMode: false,
    noteListDenseMode: false,
    markdownOnly: false,
    enableSelfHostServer: false,
    imageUploadService: 'wizOfficialImageUploadService',
    imageUploadServiceParam: {},
    noteOrderType: DEFAULT_NOTE_ORDER_TYPE,
    apiServerUrl: '',
    postParam: '',
    jsonPath: '',
    customHeader: '',
    customBody: '',
    shrinkInTray: false,
    paneLayoutMode: 0,
    categoryTreeVisible: true,
    noteListVisible: true,
    enablePreviewEditor: true,
    rightClickNoteItem: {},
    rightClickCategoryItem: '',
    theme: 'Default-Light',
    themes: [],
    // 头部皮肤: 'baiyang'(白羊/默认白) / 'nezha'(哪吒/莫兰迪红) / 'infp'(INFP/莫兰迪绿)
    skin: 'baiyang',
    autoSaveGap: 0,
    quickInsertColumns: 6,
    splitterWidth: 580,
    // 左侧工作区模式：category（Idx神引/文件夹，默认）/ tag（Core超脱/Tag）/ calendar（Arch终极/日历）
    sidebarTreeType: 'category',
    calendarSelectedDate: '',
    calendarDateBasis: DEFAULT_CALENDAR_DATE_BASIS,
    leftInnerSplitterRatio: 280,
    runeCards: [],
    noteTemplates: [],
    echoCards: BUILTIN_ECHO_CARDS.map(echo => ({ ...echo })),
    // 右上角 AI 助手入口使用的实现由 AiAssistantProviderEnum 管理
    aiAssistantProvider: DEFAULT_AI_ASSISTANT_PROVIDER,
    // 云同步方式由 CloudSyncProviderEnum 管理
    cloudSyncProvider: DEFAULT_CLOUD_SYNC_PROVIDER,
    // 云同步策略：offlineFirst（默认）/ onlineFirst / pureOnline
    // 真源为 electron-store，由 setCloudSyncStrategy 写入并立刻生效
    cloudSyncStrategy: DEFAULT_SYNC_STRATEGY,
    syncStatus: {
      isSyncing: false,
      lastSyncTime: null,
      total: 0,
      synced: 0,
      pending: 0
    },
    // CDN 依赖配置：用于笔记软件静态资源 + 可选注入到博客 index.html
    // 每项结构: { id, name, url, enabled, applyToBlog }
    cdnDeps: [],
    // ===== 「语法解析」开关的内存缓存（v2026-07-31 起固定） =====
    // 真源是 SQLite app_state 表的 setting/parsing/* 键，由 SettingsDialog 写入。
    // vuex 仅作为响应式缓存，便于 Muya.vue 在 SettingsDialog 关闭后仍能 watch
    // 变化并实时切换 inlineRules.echo_anno 规则（不需要重建编辑器）。
    // 默认值与 SettingsParsingPanel 的 data 默认值保持一致。
    echoRequireParens: true,
    runeRequireTemplateDiv: false
  }
}
