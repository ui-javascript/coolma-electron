// ============================================================================
// libs-muya-vue2/lib/rune/runeProps.js
//
// 符文 props 采集：宿主 DOM 上的「用户显式写过的属性」→ Vue props 对象。
// 纯函数（只依赖宿主元素的标准 DOM API），因此可以脱离 Muya 渲染链单独单测
// （渲染链 render/index.js 会拉起 katex css / i18n，在 Jest 里不友好）。
//
// 双 ABI（v2026-11-22 起并存，canonical 仍是 data-*）：
//   1) data-rune-prop-*（历史机制，可写任意字符串，也不受 HTML 属性名大小写折叠影响）
//   2) 自然属性：prop 名直接写成 HTML 属性（maxHeight → max-height="320"），
//      让「符文的 HTML 属性 ≈ Vue 组件的 props」这件事成立
// 都取不到 → 不传，交给组件自己的 default（Vue 兜底）。
//
// 自然属性的取舍：
//   - 属性名大小写不敏感，按 kebab-case 读取；
//   - 空值属性（<div disabled>）归一为 true，与 Vue 布尔属性直觉一致；
//   - class / style / contenteditable 等宿主标记不做 prop 映射，避免撞车。
// ============================================================================

// 把 camelCase 转成 kebab-case（专给 attribute 用）
export const camelToKebab = s => String(s || '')
  .replace(/([A-Z])/g, '-$1')
  .toLowerCase()

// prop 名 → dataset 键：maxHeight → runePropMaxHeight
export const toRunePropAttr = name => `runeProp${String(name || '').charAt(0).toUpperCase()}${String(name || '').slice(1)}`

// 系统/宿主属性黑名单：这些永远不当 prop 读，避免和 Muya 的块标记撞车
export const PLAIN_ATTR_SKIP = new Set([
  'class',
  'style',
  'contenteditable',
  'hidden',
  'spellcheck',
  'draggable',
  'tabindex'
])

// 按自然属性读单个 prop；读不到返回 undefined（区分「没写」与「写成空值」）
export const readRunePlainAttr = (host, propName) => {
  if (!host || typeof host.getAttribute !== 'function') return undefined
  const attrName = camelToKebab(propName)
  if (!attrName || attrName.startsWith('data-') || PLAIN_ATTR_SKIP.has(attrName)) return undefined
  const value = host.getAttribute(attrName)
  return value === null ? undefined : value
}

// 采集：优先 data-rune-prop-*，其次自然属性；'1'/'0'/'true'/'false' 归布尔，'' 归 true
export const collectRunePropsFromHost = (host, propDefs = []) => {
  const dataset = host && host.dataset ? host.dataset : {}
  const out = {}
  for (const def of propDefs || []) {
    if (!def || !def.name) continue
    const attr = toRunePropAttr(def.name)
    let raw
    if (Object.prototype.hasOwnProperty.call(dataset, attr)) {
      raw = dataset[attr]
    } else if (Object.prototype.hasOwnProperty.call(dataset, attr.toLowerCase())) {
      raw = dataset[attr.toLowerCase()]
    }
    if (raw === undefined) raw = readRunePlainAttr(host, def.name)
    if (raw === undefined || raw === null) continue
    if (raw === '1') out[def.name] = true
    else if (raw === '0') out[def.name] = false
    else if (raw === 'true') out[def.name] = true
    else if (raw === 'false') out[def.name] = false
    else if (raw === '') out[def.name] = true
    else out[def.name] = raw
  }
  return out
}

export default {
  camelToKebab,
  toRunePropAttr,
  PLAIN_ATTR_SKIP,
  readRunePlainAttr,
  collectRunePropsFromHost
}
