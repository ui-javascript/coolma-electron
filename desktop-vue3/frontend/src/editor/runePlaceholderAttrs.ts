/**
 * 符文占位符属性读写（移植 vue2 `runePlaceholderAttrs.js` 的尺寸子集）。
 *
 * 口径：
 * - 只 patch 命中的 `data-rune-node-id` 开标签，innerText 与其它属性原样保留；
 * - 宽度/高度必须是正数，四舍五入成整数；非法值直接忽略；
 * - 同名属性大小写不敏感匹配，写回统一用双引号；
 * - 找不到 nodeId 时返回原 Markdown，不抛错。
 */

const RUNE_OPENING_TAG_RE = /<div\b([^>]*)>/gi
const ATTR_PIECE_SOURCE = '([^\\s"\'=<>`]+)(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+)))?'
const ATTR_VALUE_SOURCE = '"[^"]*"|\'[^\']*\'|[^\\s"\'=<>`]+'

const escapeRegExp = (value: string): string =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const escapeRuneAttrValue = (value: unknown = ''): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const normalizeRuneDimension = (value: unknown): number | null => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

/** 偏移可正可负、可为零；空串、NaN、Infinity 一律视为非法。 */
export const normalizeRuneOffset = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : null
}

export function parseRuneAttrs(attrsSource = ''): Record<string, string> {
  const out: Record<string, string> = {}
  const re = new RegExp(ATTR_PIECE_SOURCE, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(String(attrsSource || '')))) {
    const name = match[1]
    if (!name || name === '/' || name === 'div') continue
    const raw = match[2] !== undefined
      ? match[2]
      : (match[3] !== undefined ? match[3] : (match[4] !== undefined ? match[4] : ''))
    if (!Object.prototype.hasOwnProperty.call(out, name)) out[name] = raw
  }
  return out
}

export function readRuneDataAttr(attrsSource = '', attrName = ''): string {
  const needle = String(attrName || '').trim().toLowerCase()
  if (!needle) return ''
  const attrs = parseRuneAttrs(attrsSource)
  const key = Object.keys(attrs).find((name) => name.toLowerCase() === needle)
  return key === undefined ? '' : attrs[key]
}

export function setRuneAttr(attrsSource = '', attrName = '', attrValue: unknown = ''): string {
  const source = String(attrsSource || '')
  const name = String(attrName || '').trim()
  if (!name) return source
  const escaped = escapeRuneAttrValue(attrValue)
  const attrRe = new RegExp(`(${escapeRegExp(name)}\\s*=\\s*)(${ATTR_VALUE_SOURCE})`, 'i')
  if (attrRe.test(source)) {
    return source.replace(attrRe, `$1"${escaped}"`)
  }
  return `${source} ${name}="${escaped}"`
}

export function removeRuneAttr(attrsSource = '', attrName = ''): string {
  const source = String(attrsSource || '')
  const name = String(attrName || '').trim()
  if (!name) return source
  const attrRe = new RegExp(`\\s+${escapeRegExp(name)}(?:\\s*=\\s*(${ATTR_VALUE_SOURCE}))?`, 'i')
  return source.replace(attrRe, '')
}

export function patchRuneAttrs(attrsSource = '', patch: Record<string, unknown> = {}): string {
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

/** 只改命中 nodeId 的开标签属性，不触碰 innerText 和其它 div。 */
export function patchRuneOpeningTagByNodeId(
  markdown = '',
  nodeId = '',
  patch: Record<string, unknown> = {},
): string {
  const source = String(markdown || '')
  const target = String(nodeId || '').trim()
  if (!source || !target || !Object.keys(patch || {}).length) return source
  let rewritten = false
  const next = source.replace(RUNE_OPENING_TAG_RE, (match, attrsSource = '') => {
    if (rewritten) return match
    if (readRuneDataAttr(attrsSource, 'data-rune-node-id') !== target) return match
    rewritten = true
    return `<div${patchRuneAttrs(attrsSource, patch)}>`
  })
  return rewritten ? next : source
}

/**
 * 回写几何：宽高（正数）与偏移（有符号，0 视为默认值并删属性）。
 * 只 patch 命中 nodeId 的开标签，其它属性全部保留。
 */
export function rewriteRunePlaceholderBoxByNodeId(
  markdown = '',
  nodeId = '',
  {
    width = null,
    height = null,
    offsetX = null,
    offsetY = null,
  }: { width?: unknown; height?: unknown; offsetX?: unknown; offsetY?: unknown } = {},
): string {
  const nextWidth = normalizeRuneDimension(width)
  const nextHeight = normalizeRuneDimension(height)
  const nextOffsetX = normalizeRuneOffset(offsetX)
  const nextOffsetY = normalizeRuneOffset(offsetY)
  const patch: Record<string, unknown> = {}
  if (nextWidth) patch['data-rune-width'] = nextWidth
  if (nextHeight) patch['data-rune-height'] = nextHeight
  if (nextOffsetX !== null) patch['data-rune-offset-x'] = nextOffsetX === 0 ? null : nextOffsetX
  if (nextOffsetY !== null) patch['data-rune-offset-y'] = nextOffsetY === 0 ? null : nextOffsetY
  if (!Object.keys(patch).length) return String(markdown || '')
  return patchRuneOpeningTagByNodeId(markdown, nodeId, patch)
}

/** 兼容旧调用：只回写宽高，不碰偏移。 */
export function rewriteRunePlaceholderSizeByNodeId(
  markdown = '',
  nodeId = '',
  { width = null, height = null }: { width?: unknown; height?: unknown } = {},
): string {
  return rewriteRunePlaceholderBoxByNodeId(markdown, nodeId, { width, height })
}
