import Vue from 'vue'
import formCreate from '@form-create/element-ui'

Vue.use(formCreate)

export default ({ app }) => {
  app.formCreateElm = formCreate
}

export { formCreate }