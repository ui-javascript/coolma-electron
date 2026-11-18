// Stub for Memocast's boot/i18n.js
// Muya uses this to translate UI labels via i18n.t()
import Vue from 'vue'
import VueI18n from 'vue-i18n'

Vue.use(VueI18n)

const i18n = new VueI18n({
  locale: 'en-us',
  fallbackLocale: 'en-us',
  messages: {
    'en-us': {},
    'zh-cn': {}
  }
})

export { i18n }
export default ({ app }) => { app.i18n = i18n }
