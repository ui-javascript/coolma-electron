import I18n from './I18n'
import Store from 'electron-store'
import messages from './messages'

const ClientFileStorage = new Store({
  name: 'ClientFileStorage'
})
const locale = ClientFileStorage.get('language')
const i18n = new I18n({
  locale: locale,
  messages,
  availableLocales: ['en-us', 'zh-cn']
})

export default i18n
// export { i18n }
