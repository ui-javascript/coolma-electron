/**
 * 全局工具 / 枚举 / 云函数挂载
 *
 * 调用约定：
 *   this.$lodash.xxx()              — 完整 lodash
 *   this.$enums.XxxEnum.xxx()       — enum-plus Enum 实例方法
 *   this.$utils.emptyUtil.isNullOrEmpty(...)  — util namespace
 *   this.$cloudfns.xxxCloudFn.xxx() — 云函数（模块成熟后）
 */

import Vue from 'vue'
import lodash from 'lodash'
import busDialog from 'src/components/common/busDialogBus'

// ---------- $lodash ----------
Vue.prototype.$lodash = lodash

// ---------- $busDialog ----------
// Dedicated event bus for the lazy vue-layerx BusDialog registry.
Vue.prototype.$busDialog = busDialog

// ---------- $enums ----------
// enumSetup.js 必须在所有 Enum.create(...) 执行前先跑，所以 import 放在最前面。
// 用 index.js barrel 统一入口，避免逐文件列举时遗漏。
import 'src/utils/enum/index.js'
import {
  NoteOrderTypeEnum,
  CalendarDateBasisEnum,
  AiAssistantProviderEnum,
  CloudSyncProviderEnum,
  SettingsTabEnum,
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum,
  RuneCategoryEnum,
  EchoCategoryEnum
} from 'src/utils/enum/index.js'

Vue.prototype.$enums = {
  NoteOrderTypeEnum,
  CalendarDateBasisEnum,
  AiAssistantProviderEnum,
  CloudSyncProviderEnum,
  SettingsTabEnum,
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum,
  RuneCategoryEnum,
  EchoCategoryEnum,
}

// ---------- $utils ----------
// 只挂 NoteItem.vue 当前实际用到的函数，其他 util 等有调用方时再追加。
import { isNullOrEmpty } from '../utils/util/emptyUtil.js'
import { displayDateElegantly } from '../utils/util/dateUtil.js'
import { wizIsPredefinedLocation, generateCategoryNodeTree, generateTagNodeTree, checkCategoryExistence, checkTagExistence } from '../utils/util/treeUtil.js'

Vue.prototype.$utils = {
  emptyUtil: { isNullOrEmpty },
  dateUtil: { displayDateElegantly },
  treeUtil: { wizIsPredefinedLocation, generateCategoryNodeTree, generateTagNodeTree, checkCategoryExistence, checkTagExistence },
}

// ---------- $cloudfns（云函数模块成熟后生效，当前为空对象） ----------
const cloudContext = require.context('src/cloudfns/', false, /[A-Z]\w+CloudFn\.js$/)
Vue.prototype.$cloudfns = buildNameSpacedMap(cloudContext)

export default ({ app }) => {}

function buildNameSpacedMap (ctx) {
  const map = {}
  ctx.keys().forEach(key => {
    const fileBaseName = key.replace(/^\.\//, '').replace(/\.js$/, '')
    const camelName = fileBaseName.charAt(0).toLowerCase() + fileBaseName.slice(1)
    const mod = ctx(key)
    const aggregated = map[camelName] || {}
    Object.keys(mod).forEach(exportName => {
      if (exportName === 'default') return
      aggregated[exportName] = mod[exportName]
    })
    map[camelName] = aggregated
  })
  return map
}
