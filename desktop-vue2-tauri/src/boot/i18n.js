import Vue from 'vue'
import VueI18n from 'vue-i18n'
import messages from 'src/i18n'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'

// 让 enum-plus 的 label 自动走 vue-i18n 翻译
// 注意：enum-plus 官方 plugin-i18next / plugin-vue-i18n 都不支持 vue-i18n v8 legacy 模式，
// 官方推荐做法是手动挂 Enum.localize 到 vue-i18n 的 t 方法上。
// 必须在 VueI18n 实例创建后再赋值，否则 i18n.t 会是 undefined。
import { Enum } from 'enum-plus'

// $enums / $utils / $lodash 由 src/boot/globalGlobals.js 接管（require.context 扫描），
// 本文件只负责把 enum-plus 的 Enum 函数 expose 给 locale 翻译钩子，不再重复 import 各 enum。

// 兜底：首次启动 `language` 未存过 → ClientFileStorage.getItemFromStore 返回 undefined。
// vue-i18n v8 在 locale=undefined 时会 fallback 成内部的 'en-US'（**大写** US），
// 但 messages 字典的 key 是 'en-us'（小写 us），首启所有 i18n.t 都会返回 key 字符串本身。
// 这里显式兜底成 'en-us'，跟 availableLocales 对齐。
const DEFAULT_LOCALE = 'en-us'
const locale = ClientFileStorage.getItemFromStore('language') || DEFAULT_LOCALE
Vue.use(VueI18n)

const i18n = new VueI18n({
  locale,
  fallbackLocale: locale,
  messages,
  availableLocales: ['en-us', 'zh-cn']
})

// 挂载 i18n.t 给 enum-plus，让 Enum.label(value) 自动翻译成当前 locale 文案
Enum.localize = i18n.t.bind(i18n)

// 更新 Quasar Dialog 全局默认按钮文字（支持语言切换时动态更新）
// Quasar v1 使用 Quasar.setDefaults，Dialog 本身没有 setDefaults
function updateDialogDefaults () {
  // Quasar.setDefaults({
  //   dialog: {
  //     ok: {
  //       label: i18n.t('ok'),
  //       color: 'primary'
  //     },
  //     cancel: {
  //       label: i18n.t('cancel'),
  //       color: 'grey'
  //     }
  //   }
  // })
}

// 初始化 Dialog 默认值
updateDialogDefaults()

export default ({ app }) => {
  // Set i18n instance on app
  app.i18n = i18n
}

export { i18n, updateDialogDefaults }
