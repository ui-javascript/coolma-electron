// ============================================================================
// libs-muya-vue2/lib/rune/runeDefinition.js
//
// 符文定义的类型判定与 melt-js 配置解析。纯函数，不依赖 Vue / DOM / Muya，
// 供 render 层（props 白名单解析）与宿主应用（定义编辑、保存校验）共用。
//
// 定义口径：
//   - `vue-sfc`：template 是一段 Vue SFC 源码（历史机制，保持原样）
//   - `melt-js`：template 是一段 JSON，顶层带 `"$type": "melt-js"`，描述远端组件依赖、
//     导出名与 props schema。远端渲染器后续接；当前只负责「能识别、能解析、能出 props 白名单」。
// ============================================================================

export const RUNE_TYPE_VUE_SFC = 'vue-sfc'
export const RUNE_TYPE_MELT_JS = 'melt-js'

export const MELT_CONFIG_MARKER = '$type'
export const MELT_DEP_TYPES = ['unpkg', 'github', 'custom']
export const MELT_PROP_TYPES = ['string', 'number', 'boolean', 'json']

// 解析 template 里的 JSON（不是 JSON / 不是对象一律返回 null）
export function parseRuneConfigJson (template) {
  if (typeof template !== 'string') return null
  const source = template.trim()
  if (!source || source.charAt(0) !== '{') return null
  try {
    const parsed = JSON.parse(source)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (_error) {
    return null
  }
}

export function isMeltRuneConfig (config) {
  return !!config && typeof config === 'object' && String(config[MELT_CONFIG_MARKER] || '') === RUNE_TYPE_MELT_JS
}

// 只看 template 判定类型；非 JSON 一律当 vue-sfc（历史数据零迁移）
export function detectRuneType (template) {
  return isMeltRuneConfig(parseRuneConfigJson(template)) ? RUNE_TYPE_MELT_JS : RUNE_TYPE_VUE_SFC
}

// 归一化 melt 配置，缺省值在这里补，渲染层与表单共用同一份口径
export function normalizeMeltRuneConfig (config = {}) {
  const source = config && typeof config === 'object' ? config : {}
  const dep = source.dep && typeof source.dep === 'object' ? source.dep : {}
  const depType = String(dep.type || 'unpkg').trim().toLowerCase()
  const props = source.props && typeof source.props === 'object' && !Array.isArray(source.props) ? source.props : {}
  return {
    type: RUNE_TYPE_MELT_JS,
    version: Number(source.version) || 1,
    dep: {
      name: String(dep.name || '').trim(),
      type: MELT_DEP_TYPES.includes(depType) ? depType : 'unpkg',
      version: String(dep.version || '').trim(),
      platform: String(dep.platform || '').trim(),
      host: String(dep.host || '').trim(),
      requiredExports: Array.isArray(dep.requiredExports) ? dep.requiredExports.map(item => String(item)) : []
    },
    exportName: String(source.exportName || '').trim(),
    valueProp: String(source.valueProp || 'value').trim() || 'value',
    valueEvent: String(source.valueEvent || 'input').trim() || 'input',
    style: source.style && typeof source.style === 'object' ? { ...source.style } : null,
    props
  }
}

// 从 template / rune 对象拿 melt 配置；不是 melt 定义返回 null
export function parseMeltRuneConfig (templateOrRune) {
  const template = templateOrRune && typeof templateOrRune === 'object' && !Array.isArray(templateOrRune)
    ? templateOrRune.template
    : templateOrRune
  const config = parseRuneConfigJson(template)
  return isMeltRuneConfig(config) ? normalizeMeltRuneConfig(config) : null
}

// 保存前的校验：返回 [{ field, message }]，空数组表示通过
export function validateMeltRuneConfig (config = {}) {
  const normalized = normalizeMeltRuneConfig(config)
  const errors = []
  if (!normalized.dep.name) errors.push({ field: 'dep.name', message: '缺少依赖包名' })
  if (normalized.dep.type === 'custom' && !normalized.dep.host) {
    errors.push({ field: 'dep.host', message: 'custom 来源需要填 host' })
  }
  if (!normalized.exportName) errors.push({ field: 'exportName', message: '缺少导出组件名' })
  for (const [name, def] of Object.entries(normalized.props)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      errors.push({ field: `props.${name}`, message: 'prop 名不是合法标识符' })
    }
    const propType = def && def.type ? String(def.type).toLowerCase() : 'string'
    if (!MELT_PROP_TYPES.includes(propType)) {
      errors.push({ field: `props.${name}.type`, message: `prop 类型只支持 ${MELT_PROP_TYPES.join(' / ')}` })
    }
  }
  return errors
}

// props schema → 渲染层使用的 propDefs（与 SFC 版 parseSfcPropsDef 的输出形态对齐）
export function listMeltPropDefs (config = {}) {
  const normalized = normalizeMeltRuneConfig(config)
  return Object.entries(normalized.props).map(([name, def]) => {
    const value = def && typeof def === 'object' ? def : {}
    return {
      name,
      type: value.type ? String(value.type).toLowerCase() : 'string',
      default: value.default,
      label: value.label ? String(value.label) : name
    }
  })
}

// 定义 → { type, config, errors }；vue-sfc 的 propDefs 由调用方用 parseSfcPropsDef 解析
export function resolveRuneDefinition (rune = {}) {
  const type = detectRuneType(rune && rune.template)
  if (type !== RUNE_TYPE_MELT_JS) return { type: RUNE_TYPE_VUE_SFC, config: null, errors: [] }
  const config = parseMeltRuneConfig(rune)
  if (!config) return { type: RUNE_TYPE_MELT_JS, config: null, errors: [{ field: 'template', message: 'melt-js 定义不是合法 JSON' }] }
  return { type: RUNE_TYPE_MELT_JS, config, errors: validateMeltRuneConfig(config) }
}

export default {
  RUNE_TYPE_VUE_SFC,
  RUNE_TYPE_MELT_JS,
  MELT_CONFIG_MARKER,
  MELT_DEP_TYPES,
  MELT_PROP_TYPES,
  parseRuneConfigJson,
  isMeltRuneConfig,
  detectRuneType,
  normalizeMeltRuneConfig,
  parseMeltRuneConfig,
  validateMeltRuneConfig,
  listMeltPropDefs,
  resolveRuneDefinition
}
