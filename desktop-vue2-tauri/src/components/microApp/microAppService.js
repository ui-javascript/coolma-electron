/**
 * 微应用（聊天弹框里的 wujie 子应用 + 全屏业务 overlay）辅助工具
 *
 * 负责：
 *  - 默认应用列表（首次启动 / key 不存在时）
 *  - devUrl / url 解析（开发模式用 devUrl，打包后用 url）
 *  - displayMode 区分抽屉 / 全屏两种展示形态
 *  - isBuiltIn 标记内置条目，内置条目由业务方插件注册、不可被用户删除
 *
 * 数据存于 SQLite `app_state` key = 'setting/microApps'
 *
 * v2026-08-08 演进：
 *   - 新增字段 displayMode: 'drawer'（默认，聊天抽屉右侧）/ 'fullscreen'（全屏 dialog，
 *     用于删除特效等业务一次性唤起）
 *   - 新增字段 isBuiltIn: boolean，标记内置条目；用户编辑弹框看不到该字段，
 *     微应用列表的删除按钮在 isBuiltIn=true 时隐藏
 *
 * v2026-08-08 进一步解耦：
 *   - BUILTIN_APPS 不再硬编码任何业务条目（怪兽特效移到
 *     components/microApp/builtins/deleteEffect.js）
 *   - 业务方通过 registerBuiltinApps(...) 在 App boot 时把内置条目注册进来
 *   - 主项目 src/ 内不再持有任何 _plugins/echo-monster-deleter / 怪兽相关硬引用
 */

export const MICRO_APPS_STORAGE_KEY = 'setting/microApps'

/**
 * 全屏 displayMode 的合法值
 */
export const MICRO_APP_DISPLAY_MODES = Object.freeze({
  DRAWER: 'drawer',
  FULLSCREEN: 'fullscreen'
})

/**
 * 是否处于开发模式（dev-server 启着的状态）
 * - quasar dev 或 yarn run dev 都是 true
 * - 打包后 / electron 内置 production 时是 false
 */
export function isDevEnv () {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NODE_ENV === 'development') return true
      if (process.env.MODE === 'development') return true
      if (process.env.DEV === true || process.env.DEV === 'true') return true
    }
  } catch (_) { /* ignore */ }
  return false
}

/**
 * 内置微应用注册表（运行时收集）。
 *
 * 使用方式（业务方）：
 *   import { registerBuiltinApps } from 'components/microApp/microAppService'
 *   registerBuiltinApps([
 *     { id: 'foo-builtin', name: '...', displayMode: 'fullscreen', isBuiltIn: true, ... }
 *   ])
 *
 * 重复注册同 id：后者覆盖前者（业务方重命名 / 调整元数据时方便）。
 * 副作用：registerBuiltinApps 会 push 到 BUILTIN_APPS 数组，normalizeMicroApp /
 * normalizeMicroApps / mergeBuiltInApps / buildDefaultMicroApps 都从这里读。
 */
const _builtinAppsRegistry = []

/**
 * 注册一个或多个内置微应用条目。
 * 注意：内部使用浅拷贝以避免外部修改污染；不要在调用方持有 registerBuiltinApps 之前的引用。
 */
export function registerBuiltinApps (apps) {
  if (!Array.isArray(apps)) return
  apps.filter(Boolean).forEach(app => {
    // 同 id 覆盖（业务方重新注册同名条目可覆盖）
    const idx = _builtinAppsRegistry.findIndex(a => a.id === app.id)
    if (idx >= 0) {
      _builtinAppsRegistry.splice(idx, 1, { ...app })
    } else {
      _builtinAppsRegistry.push({ ...app })
    }
  })
}

/**
 * 测试用：清空内置注册表（jest 单测间需要隔离）
 */
export function _resetBuiltinAppsRegistry () {
  _builtinAppsRegistry.length = 0
}

/**
 * 当前已注册的所有内置条目（只读快照）。
 */
export function getBuiltinApps () {
  return _builtinAppsRegistry.map(a => ({ ...a }))
}

/**
 * 构建默认微应用列表。
 *
 * v2026-08-08 起：默认列表 = 三方通用应用（box-im / coolma / vue2-sfc-playground）
 * + 当前已注册的全部内置条目（业务方通过 registerBuiltinApps 注册）。
 *
 * 注意：本函数只用于「首次初始化」—— 升级场景下不能用 buildDefaultMicroApps 覆盖用户已存的列表，
 * 而应该用 mergeBuiltInApps 把缺失的内置条目补进去（保留用户修改）。
 */
export function buildDefaultMicroApps () {
  return [
    {
      id: 'box-im',
      name: '聊天',
      icon: 'el-icon-chat-dot-round',
      url: 'https://luo0412.github.io/box-im/#/',
      devUrl: 'http://localhost:18080/',
      isDefault: true,
      enabled: true,
      isMobile: false,
      displayMode: MICRO_APP_DISPLAY_MODES.DRAWER,
      isBuiltIn: false
    },
    {
      id: 'coolma',
      name: 'coolma',
      icon: 'el-icon-cloudy',
      url: 'https://static-59728804-d890-4267-8e45-393e10b3c780.bspapp.com/',
      devUrl: '',
      isDefault: false,
      enabled: true,
      isMobile: true,
      displayMode: MICRO_APP_DISPLAY_MODES.DRAWER,
      isBuiltIn: false
    },
    {
      id: 'vue2-sfc-playground',
      name: 'Vue2 SFC Playground',
      icon: 'el-icon-cpu',
      devUrl: 'http://localhost:3333/',
      url: '',
      isDefault: false,
      enabled: true,
      isMobile: false,
      displayMode: MICRO_APP_DISPLAY_MODES.DRAWER,
      isBuiltIn: false
    },
    ..._builtinAppsRegistry.map(app => ({ ...app }))
  ]
}

/**
 * 归一化一条微应用记录，补齐缺失字段，过滤掉完全没用的残缺记录。
 *
 * 内置条目（isBuiltIn=true）与普通条目**一样**允许被用户编辑（url / devUrl / displayMode
 * 均来自用户输入），唯一的区别是：不可被删除。
 *
 * 注册表（_builtinAppsRegistry）仅在「识别 isBuiltIn 身份」和「提供缺省 displayMode」时使用：
 *  - isBuiltIn 标记：用于 UI 隐藏删除按钮。
 *  - displayMode 缺省值：如果用户未指定 displayMode 且该条目是注册的内置条目，则用注册表默认值；
 *    如果用户已指定，则尊重用户输入。
 */
export function normalizeMicroApp (raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  if (!id) return null
  // 兼容「业务方已注册的内置条目」
  const builtinDef = _builtinAppsRegistry.find(a => a.id === id)
  const isBuiltIn = builtinDef ? true : Boolean(raw.isBuiltIn)
  // displayMode：用户输入优先；没有输入时用注册表默认值（内置）或 DRAWER（普通）
  const baseDisplayMode = raw.displayMode
    ? (raw.displayMode === MICRO_APP_DISPLAY_MODES.FULLSCREEN
        ? MICRO_APP_DISPLAY_MODES.FULLSCREEN
        : MICRO_APP_DISPLAY_MODES.DRAWER)
    : (builtinDef ? builtinDef.displayMode : MICRO_APP_DISPLAY_MODES.DRAWER)
  return {
    id,
    name: String(raw.name || id),
    icon: String(raw.icon || 'el-icon-chat-dot-round'),
    url: String(raw.url || ''),
    devUrl: String(raw.devUrl || ''),
    isDefault: Boolean(raw.isDefault),
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    isMobile: raw.isMobile === true,
    displayMode: baseDisplayMode,
    isBuiltIn
  }
}

/**
 * 将微应用列表整体归一化（自动剔除坏数据）。
 */
export function normalizeMicroApps (rawList) {
  if (!Array.isArray(rawList)) return []
  const list = rawList.map(normalizeMicroApp).filter(Boolean)
  // 保证最多一个 isDefault
  let seenDefault = false
  return list.map(item => {
    if (item.isDefault) {
      if (seenDefault) return { ...item, isDefault: false }
      seenDefault = true
    }
    return item
  })
}

/**
 * 解析"实际访问哪个 url"：dev 时用 devUrl，否则用 url；都没有时给空串。
 */
export function resolveActiveUrl (app) {
  if (!app) return ''
  if (isDevEnv() && app.devUrl) return app.devUrl
  return app.url || app.devUrl || ''
}

/**
 * 从已启用应用中找出默认应用；没有默认时退回第一个。
 */
export function pickDefaultApp (apps) {
  const list = normalizeMicroApps(apps).filter(a => a.enabled !== false)
  if (!list.length) return null
  return list.find(a => a.isDefault) || list[0]
}

/**
 * 判断两条微应用记录在"影响 wujie 挂载"的字段上是否等价。
 * 涉及字段：url / devUrl / displayMode（displayMode 影响宿主壳是 drawer 还是 fullscreen）。
 */
function microAppMountKey (app) {
  if (!app) return ''
  return `${app.url || ''}::${app.devUrl || ''}::${app.displayMode || 'drawer'}`
}

/**
 * 对比两份微应用列表，返回需要重新挂载（destroy + 重新 start）的 id 集合：
 *  - 内容字段（url/devUrl/displayMode）变化了的
 *  - 被删的（只在老列表里有的 id）
 */
export function diffMicroAppsForReload (oldList, newList) {
  const oldNorm = normalizeMicroApps(oldList)
  const newNorm = normalizeMicroApps(newList)
  const dirty = new Set()

  const oldById = new Map(oldNorm.map(a => [a.id, a]))
  const newById = new Map(newNorm.map(a => [a.id, a]))

  // 被删的 id
  for (const [id, oldItem] of oldById.entries()) {
    if (!newById.has(id)) dirty.add(id)
    else {
      const newItem = newById.get(id)
      if (microAppMountKey(oldItem) !== microAppMountKey(newItem)) {
        dirty.add(id)
      }
    }
  }
  return Array.from(dirty)
}

/**
 * 把已注册的内置条目合并进现有列表（用于升级场景）：
 *   - 内置条目在列表里**已存在** → 完全不动（保留用户的 enabled / url / devUrl / name 等）
 *   - 内置条目**不在列表里** → 追加（用户首次升级时拿到新内置条目）
 *   - 普通条目走 normalizeMicroApp 补齐字段
 *
 * 注意：对已存在的内置条目「不强制刷新 url / devUrl」—— 业务方重新发布子项目后，
 * 用户修改过的 url 仍以用户版本为准（避免升级覆盖）。
 *
 * 用于 boot 阶段的「一次性迁移」：从旧版本升级上来的用户，microApps 列表里可能没
 * 当前已注册的内置条目；这里补进去。返回新数组。
 */
function _shallowNormalizeBuiltin (a) {
  // 保留内置条目所有用户可控字段，只补默认结构
  return {
    id: a.id,
    name: String(a.name || a.id),
    icon: String(a.icon || 'el-icon-chat-dot-round'),
    url: typeof a.url === 'string' ? a.url : '',
    devUrl: typeof a.devUrl === 'string' ? a.devUrl : '',
    isDefault: Boolean(a.isDefault),
    enabled: a.enabled === undefined ? true : Boolean(a.enabled),
    isMobile: a.isMobile === true,
    displayMode: a.displayMode === MICRO_APP_DISPLAY_MODES.FULLSCREEN
      ? MICRO_APP_DISPLAY_MODES.FULLSCREEN
      : MICRO_APP_DISPLAY_MODES.DRAWER,
    isBuiltIn: true
  }
}

export function mergeBuiltInApps (rawList) {
  const existing = Array.isArray(rawList) ? rawList.filter(Boolean) : []
  const existingIds = new Set(existing.map(a => a.id))
  const builtinIds = new Set(_builtinAppsRegistry.map(a => a.id))
  const missing = _builtinAppsRegistry.filter(a => !existingIds.has(a.id))

  // 已有列表归一化：内置条目走 _shallowNormalizeBuiltin（保留用户修改）；其它走 normalizeMicroApp
  const normalizedExisting = existing.map(a => {
    if (a && builtinIds.has(a.id)) return _shallowNormalizeBuiltin(a)
    return normalizeMicroApp(a)
  })

  if (!missing.length) return normalizedExisting

  // 有缺失内置条目：追加 normalize 后的新条目
  return [
    ...normalizedExisting,
    ...missing.map(a => normalizeMicroApp(a))
  ]
}
