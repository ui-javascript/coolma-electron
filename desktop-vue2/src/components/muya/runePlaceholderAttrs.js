// ============================================================================
// src/components/muya/runePlaceholderAttrs.js
//
// 符文占位符（<div data-rune-name data-rune-id data-rune-node-id data-rune-value …>）
// 的 Markdown 属性读写工具。纯函数，不依赖 Vue / Muya，可在 Jest 里直接单测。
//
// 为什么单独抽出来：
//   1) 旧实现 rewriteRunePlaceholderByNodeId 是「整段重建 div」，只回填 4 个系统属性，
//      用户手写的 data-rune-prop-* / data-rune-width 会被抹掉 —— 属性当 props 的机制
//      一写回就失效。这里改成「只改要改的属性，其余原样保留」。
//   2) 自然属性（prop 名直接写成 HTML 属性）支持后，属性读写要成为可复用的唯一入口。
//
// 口径：
//   - 属性名大小写不敏感（HTML 解析会折叠大小写），值一律用双引号写回；
//   - 找不到 nodeId 时原样返回，不抛错、不改动 Markdown；
//   - 未知属性、属性顺序、原有单引号/无引号写法都不主动重排（只替换命中的那一段）。
// ============================================================================

// 匹配 <div ...>...</div>，group 1 = 属性串（以空白开头），group 2 = innerText
export const RUNE_PLACEHOLDER_FULL_TAG_RE = /<div(\s+[^>]*?)>([\s\S]*?)<\/div>/gi
// 只匹配开标签，用于在不碰 innerText 的前提下改属性
const RUNE_OPENING_TAG_RE = /<div\b([^>]*)>/gi

// 单个 HTML 属性的匹配源：name / "value" / 'value' / 裸值
const ATTR_PIECE_SOURCE = '([^\\s"\'=<>`]+)(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+)))?'
const ATTR_PIECE_RE = new RegExp(ATTR_PIECE_SOURCE, 'g')

// 单个属性值的匹配源：双引号 / 单引号 / 裸值（允许值里出现反引号，Markdown 里常见）
const ATTR_VALUE_SOURCE = '"[^"]*"|\'[^\']*\'|[^\\s"\'=<>`]+'

export const RUNE_SYSTEM_ATTR_NAMES = [
  'data-rune-name',
  'data-rune-id',
  'data-rune-node-id',
  'data-rune-value',
  'data-rune-width',
  'data-rune-height'
]

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const escapeRuneAttrValue = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

export const escapeRuneInnerText = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

export const normalizeRuneDimension = value => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

// prop 名 → 自然属性名（maxHeight → max-height；与 dataset 的 runePropMaxHeight 对应）
export const toRunePlainAttrName = name => String(name || '')
  .replace(/([A-Z])/g, '-$1')
  .toLowerCase()

// prop 名 → data-* 属性名（maxHeight → data-rune-prop-max-height）
export const toRunePropAttrName = name => `data-rune-prop-${toRunePlainAttrName(name)}`

// 解析一段属性串为 { 原始属性名: 值 }
export function parseRuneAttrs (attrsSource = '') {
  const source = String(attrsSource || '')
  const out = {}
  ATTR_PIECE_RE.lastIndex = 0
  let match
  while ((match = ATTR_PIECE_RE.exec(source))) {
    const name = match[1]
    if (!name || name === '/' || name === 'div') continue
    const raw = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : (match[4] !== undefined ? match[4] : ''))
    // 同名属性只取第一次出现（与浏览器行为一致）
    if (!Object.prototype.hasOwnProperty.call(out, name)) out[name] = raw
  }
  return out
}

// 按名字（大小写不敏感）读单个属性；缺失返回 ''
export function readRuneDataAttr (attrsSource = '', attrName = '') {
  const needle = String(attrName || '').trim().toLowerCase()
  if (!needle) return ''
  const attrs = parseRuneAttrs(attrsSource)
  const key = Object.keys(attrs).find(name => name.toLowerCase() === needle)
  return key === undefined ? '' : attrs[key]
}

// 写单个属性：已存在则原位替换值（保留原属性名大小写与位置），否则追加到末尾
export function setRuneAttr (attrsSource = '', attrName = '', attrValue = '') {
  const source = String(attrsSource || '')
  const name = String(attrName || '').trim()
  if (!name) return source
  const escaped = escapeRuneAttrValue(attrValue)
  // 匹配 name = "v" / name='v' / name=v 三种写法，只替换「= 值」这一段
  const attrRe = new RegExp(`(${escapeRegExp(name)}\\s*=\\s*)(${ATTR_VALUE_SOURCE})`, 'i')
  if (attrRe.test(source)) {
    return source.replace(attrRe, `$1"${escaped}"`)
  }
  return `${source} ${name}="${escaped}"`
}

// 删单个属性（连同等号与值）
export function removeRuneAttr (attrsSource = '', attrName = '') {
  const source = String(attrsSource || '')
  const name = String(attrName || '').trim()
  if (!name) return source
  const attrRe = new RegExp(`\\s+${escapeRegExp(name)}(?:\\s*=\\s*(${ATTR_VALUE_SOURCE}))?`, 'i')
  return source.replace(attrRe, '')
}

// 批量写：patch = { 属性名: 值 }，值为 null/undefined 表示删除
export function patchRuneAttrs (attrsSource = '', patch = {}) {
  let next = String(attrsSource || '')
  for (const [name, value] of Object.entries(patch || {})) {
    if (value === null || value === undefined) {
      next = removeRuneAttr(next, name)
    } else {
      next = setRuneAttr(next, name, value)
    }
  }
  return next
}

// 读取某个 nodeId 的占位符：{ attrs, innerText, matched }
export function readRunePlaceholderByNodeId (markdown = '', nodeId = '') {
  const source = String(markdown || '')
  const target = String(nodeId || '').trim()
  const empty = { attrs: {}, innerText: '', matched: false }
  if (!source || !target) return empty
  const re = new RegExp(RUNE_PLACEHOLDER_FULL_TAG_RE.source, 'gi')
  let match
  while ((match = re.exec(source))) {
    const attrsSource = match[1] || ''
    if (readRuneDataAttr(attrsSource, 'data-rune-node-id') !== target) continue
    return {
      attrs: parseRuneAttrs(attrsSource),
      innerText: match[2] || '',
      matched: true
    }
  }
  return empty
}

// 在「开标签」上打补丁：只改属性，不碰 innerText / 其它属性
export function patchRuneOpeningTagByNodeId (markdown = '', nodeId = '', patch = {}) {
  const source = String(markdown || '')
  const target = String(nodeId || '').trim()
  if (!source || !target) return source
  let rewritten = false
  const next = source.replace(RUNE_OPENING_TAG_RE, (match, attrsSource = '') => {
    if (rewritten) return match
    if (readRuneDataAttr(attrsSource, 'data-rune-node-id') !== target) return match
    rewritten = true
    return `<div${patchRuneAttrs(attrsSource, patch)}>`
  })
  return rewritten ? next : source
}

// 回写 value：只更新 data-rune-value + innerText，其它属性全部保留
export function rewriteRunePlaceholderByNodeId (markdown = '', nodeId = '', nextValue = null) {
  const source = String(markdown || '')
  const target = String(nodeId || '').trim()
  if (!source || !target) return source

  let rewritten = false
  const value = nextValue == null ? '' : String(nextValue).trim()
  const nextMarkdown = source.replace(
    new RegExp(RUNE_PLACEHOLDER_FULL_TAG_RE.source, 'gi'),
    (match, attrsSource = '', _innerText = '') => {
      if (rewritten) return match
      if (readRuneDataAttr(attrsSource, 'data-rune-node-id') !== target) return match
      const runeName = readRuneDataAttr(attrsSource, 'data-rune-name') || 'Rune'
      const nextAttrs = setRuneAttr(attrsSource, 'data-rune-value', value)
      rewritten = true
      return `<div${nextAttrs}>${escapeRuneInnerText(value || runeName)}</div>`
    }
  )
  return rewritten ? nextMarkdown : source
}

// 回写尺寸：data-rune-width / data-rune-height，其它属性全部保留
export function rewriteRunePlaceholderSizeByNodeId (markdown = '', nodeId = '', { width = null, height = null } = {}) {
  const nextWidth = normalizeRuneDimension(width)
  const nextHeight = normalizeRuneDimension(height)
  if (!nextWidth && !nextHeight) return String(markdown || '')
  const patch = {}
  if (nextWidth) patch['data-rune-width'] = nextWidth
  if (nextHeight) patch['data-rune-height'] = nextHeight
  return patchRuneOpeningTagByNodeId(markdown, nodeId, patch)
}

// 回写 props：{ propName: value } → data-rune-prop-<kebab>，null/undefined 删除该属性
export function rewriteRunePlaceholderPropsByNodeId (markdown = '', nodeId = '', props = {}) {
  const patch = {}
  for (const [propName, value] of Object.entries(props || {})) {
    const attrName = toRunePropAttrName(propName)
    if (!attrName) continue
    if (value === null || value === undefined) {
      patch[attrName] = null
    } else if (typeof value === 'boolean') {
      patch[attrName] = value ? '1' : '0'
    } else if (typeof value === 'object') {
      patch[attrName] = JSON.stringify(value)
    } else {
      patch[attrName] = String(value)
    }
  }
  if (!Object.keys(patch).length) return String(markdown || '')
  return patchRuneOpeningTagByNodeId(markdown, nodeId, patch)
}

export default {
  RUNE_PLACEHOLDER_FULL_TAG_RE,
  RUNE_SYSTEM_ATTR_NAMES,
  escapeRuneAttrValue,
  escapeRuneInnerText,
  normalizeRuneDimension,
  toRunePlainAttrName,
  toRunePropAttrName,
  parseRuneAttrs,
  readRuneDataAttr,
  setRuneAttr,
  removeRuneAttr,
  patchRuneAttrs,
  readRunePlaceholderByNodeId,
  patchRuneOpeningTagByNodeId,
  rewriteRunePlaceholderByNodeId,
  rewriteRunePlaceholderSizeByNodeId,
  rewriteRunePlaceholderPropsByNodeId
}
