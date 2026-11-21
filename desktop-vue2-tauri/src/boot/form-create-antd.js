import Vue from 'vue'
import formCreate from '@form-create/ant-design-vue'

Vue.use(formCreate)

export default ({ app }) => {
  app.formCreateAntd = formCreate
}

export { formCreate }