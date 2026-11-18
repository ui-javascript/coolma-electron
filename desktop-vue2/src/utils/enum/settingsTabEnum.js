/**
 * Settings Tab / SubTab 枚举
 *
 * 顶层 7 个一级 tab（general / editor / ai / server / echo / cloudFn / rune），
 * 每个 tab 嵌套一个二级 sub-tab enum；icon / i18n label / accent-color
 * 都作为元数据挂在 enum 项里。
 *
 * 字面值（value / sub-tab value）与既有 SettingsNav / SettingsXxxPanel.vue
 * 的裸字符串 1:1 一致，仅把分散的 if 链和 computed subTabOptions 集中到
 * 这里。
 *
 * 注：Settings 是稳定功能区域；本次只改"枚举化"，不改任何渲染、事件、
 * 业务逻辑路径。组件用 enum 替代裸字符串，但模板结构、watch 行为、
 * data() 默认值与改造前完全等价。
 */

import { Enum } from 'enum-plus'

// ---------- 通用 ----------
// v2026-08-01 起把「CDN 注入 / 微应用 / 个人信息」从云服务挪到通用：
// - CDN 注入：和编辑器渲染/打包有关，是客户端通用基础配置。
// - 微应用：聊天抽屉内 wujie 子应用列表，是宿主层面的扩展管理。
// - 个人信息（地区偏好）：和当前账号无关，是终端用户偏好。
//
// v2026-08-08 删除「DeleteConfirm」独立 tab：删除特效 overlay 已纳入微应用列表
// （displayMode=fullscreen 的内置条目，isBuiltIn=true）。
// 用户在「设置 → 通用 → 微应用」里直接开关 / 编辑 URL，体验与其它微应用一致。
const GeneralSubEnum = Enum({
  Language:  { value: 'language',  label: 'generalLanguage', icon: 'language' },
  Theme:     { value: 'theme',     label: 'generalTheme',    icon: 'palette' },
  Cdn:       { value: 'cdn',       label: 'cloudCdnInject',  icon: 'link' },
  MicroApps: { value: 'microApps', label: 'microApps',       icon: 'apps' },
  Profile:   { value: 'profile',   label: 'cloudProfile',    icon: 'person' },
  // 「日志 / 数据库 / 版本」三个运维诊断项永远位于最后三位
  Log:      { value: 'log',      label: 'generalLog',      icon: 'description' },
  Database: { value: 'database', label: 'generalDatabase', icon: 'storage' },
  Version:  { value: 'version',  label: 'generalVersion',  icon: 'info' }
})

// ---------- 编辑器 ----------
// v2026-07-31 起新增 Parsing（语法解析）：控制 echo / rune 提交时的语法严格性开关。
//   - echoRequireParens     回响占位符 (@xxx{...}(prompt)) 的 () 是否必填（默认 true）
//   - runeRequireTemplateDiv 符文 SFC <template> 下是否必须有 <div> 节点（默认 false）
const EditorSubEnum = Enum({
  Note:     { value: 'note',     label: 'editorNote',     icon: 'article' },
  Panel:    { value: 'panel',    label: 'editorPanel',    icon: 'dashboard' },
  Template: { value: 'template', label: 'editorTemplate', icon: 'description' },
  Parsing:  { value: 'parsing',  label: 'editorParsing',  icon: 'code' }
})

// ---------- AI ----------
// v2026-11-04 新增两个子 tab：
//   AutoTag（打标）：用默认 AI 模型批量给「没有标签」的笔记追加标签，优先复用已有标签。
//   Tags（标签）：标签维护（新建 / 重命名 / 删除 / 清理未使用），复用 server 端标签 action。
const AiSubEnum = Enum({
  Entry: { value: 'entry', label: 'aiEntry', icon: 'auto_awesome' },
  Model: { value: 'model', label: 'aiModel', icon: 'smart_toy' },
  Skill: { value: 'skill', label: 'aiSkill', icon: 'auto_fix_high' },
  AutoTag: { value: 'autoTag', label: 'aiAutoTag', icon: 'sell' },
  Tags: { value: 'tags', label: 'aiTags', icon: 'bookmarks' }
})

// ---------- 云服务 ----------
// v2026-08-01 起仅保留「同步 / 图片上传」两个 sub-tab；CDN 注入 / 微应用 / 个人信息
// 已挪到 GeneralSubEnum（见 GeneralSubEnum 的注释）。
const ServerSubEnum = Enum({
  Sync:  { value: 'sync',  label: 'cloudSync',  icon: 'cloud_sync' },
  Image: { value: 'image', label: 'cloudImage', icon: 'image' }
})

// ---------- 云函数 ----------
const CloudFnSubEnum = Enum({
  Config:     { value: 'config',     label: 'cloudFnConfig',     icon: 'settings' },
  Navigation: { value: 'navigation', label: 'cloudFnNavigation', icon: 'explore' }
})

// ---------- 顶层：7 个一级 tab ----------
// raw 字段挂 sub-enum 实例，便于组件渲染 sub-tab 时直接遍历。
export const SettingsTabEnum = Enum({
  General: {
    value: 'general',
    label: 'general',
    icon: 'tune',
    accent: 'red-7',
    accentTheme: 'red',
    tabClass: 'text-red-7',
    subEnum: GeneralSubEnum
  },
  Editor: {
    value: 'editor',
    label: 'editor',
    icon: 'edit_attributes',
    accent: 'orange-8',
    accentTheme: 'orange',
    tabClass: 'text-orange-8',
    subEnum: EditorSubEnum
  },
  Ai: {
    value: 'ai',
    label: 'ai',
    icon: 'auto_awesome',
    accent: 'yellow-9',
    accentTheme: 'yellow',
    tabClass: 'text-yellow-9',
    subEnum: AiSubEnum
  },
  Server: {
    value: 'server',
    label: 'server',
    icon: 'storage',
    accent: 'green-7',
    accentTheme: 'green',
    tabClass: 'text-green-7',
    subEnum: ServerSubEnum
  },
  CloudFn: {
    value: 'cloudFn',
    label: 'cloudFn',
    icon: 'cloud_circle',
    accent: 'cyan-7',
    accentTheme: 'cyan',
    tabClass: 'text-cyan-7',
    subEnum: CloudFnSubEnum
  },
  Echo: {
    value: 'echo',
    label: 'echo',
    icon: 'graphic_eq',
    accent: 'blue-7',
    accentTheme: 'blue',
    tabClass: 'text-blue-7',
    subEnum: null
  },
  Rune: {
    value: 'rune',
    label: 'rune',
    icon: 'star',
    accent: 'purple-7',
    accentTheme: 'purple',
    tabClass: 'text-purple-7',
    subEnum: null
  }
})

// 默认一级 tab：'general'（沿用 SettingsDialog.vue 的 data() 默认）
export const DEFAULT_SETTINGS_TAB = SettingsTabEnum.General

// 顺手导出 subEnum 供组件直接 import（避免组件再去 SettingsTabEnum.findBy 取）
export {
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum
}

// 默认 sub-tab：与各 Panel data() 默认值一致
export const DEFAULT_GENERAL_SUB_TAB = GeneralSubEnum.Language
export const DEFAULT_EDITOR_SUB_TAB  = EditorSubEnum.Note
export const DEFAULT_AI_SUB_TAB      = AiSubEnum.Entry
export const DEFAULT_SERVER_SUB_TAB  = ServerSubEnum.Sync
export const DEFAULT_CLOUDFN_SUB_TAB = CloudFnSubEnum.Config

// 兼容入口：老代码仍可能依赖裸字符串
export const SETTINGS_TAB_GENERAL = SettingsTabEnum.General
export const SETTINGS_TAB_EDITOR  = SettingsTabEnum.Editor
export const SETTINGS_TAB_AI      = SettingsTabEnum.Ai
export const SETTINGS_TAB_SERVER  = SettingsTabEnum.Server
export const SETTINGS_TAB_ECHO    = SettingsTabEnum.Echo
export const SETTINGS_TAB_CLOUDFN = SettingsTabEnum.CloudFn
export const SETTINGS_TAB_RUNE    = SettingsTabEnum.Rune