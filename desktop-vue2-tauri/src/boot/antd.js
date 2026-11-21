import Vue from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/antd.css'
import moment from 'moment'
import 'moment/locale/zh-cn'

// ant-design-vue 1.x 与 Calendar/DatePicker 依赖 moment 的语言环境
moment.locale('zh-cn')

Vue.use(Antd)

export default ({ app }) => {
  app.antd = Antd
}

export { Antd }
