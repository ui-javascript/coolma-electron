import Vue from 'vue'
import ElementUI from 'element-ui'
import ElementUIX from 'vue-element-ui-x'
import 'element-ui/lib/theme-chalk/index.css'
// 把 Element UI 主色（#409EFF 及其梯度）桥接到应用的 --themeColor* CSS 变量，
// 使其跟随 Default-Light / Default-Dark / 皮肤实时切换。
import '../assets/css/element-theme.css'

Vue.use(ElementUI)
Vue.use(ElementUIX)
window.$message = ElementUI.Message

export default ({ app }) => {
  app.elementUI = ElementUI
}

export { ElementUI }
