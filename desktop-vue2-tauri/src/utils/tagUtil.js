/**
 * 标签纯工具集（无 Electron / Vuex 依赖，可直接在 Jest 中单测）
 *
 * 职责：
 *   1. notes.tags 字符串（`*` 分隔的 tagGuid 列表）的拆分 / 拼装
 *   2. AI 返回文本 → 规范化标签名列表（JSON 数组 / 逐行 / 逗号分隔都兼容）
 *   3. 「本地标签 + 云端标签」合并成复用池，并按名称做大小写无关匹配
 *   4. 标签配色（按名称哈希取稳定色，避免每次渲染变色）
 *
 * 数据形态参考：
 *   - tags 表行：{ id, name, color, created_at, tagGuid: 'local_tag_<id>' }
 *   - 云端标签：{ tagGuid, name, parentTagGuid? }
 *   - notes.tags：'local_tag_1*local_tag_7'
 */

const TAG_SEPARATOR = '*'
const MAX_TAG_NAME_LENGTH = 24
const MAX_SUGGESTED_TAGS = 8
const DEFAULT_SUGGESTED_TAGS = 3

// 与 Quasar / Material 调色板对齐，保证与设置面板其它卡片风格一致
const TAG_COLOR_PALETTE = [
  '#00897B', '#3949AB', '#5E35B1', '#D81B60', '#E53935',
  '#F4511E', '#F9A825', '#43A047', '#00ACC1', '#546E7A'
]

/**
 * notes.tags → tagGuid 数组
 * @param {string|string[]} tags
 * @returns {string[]}
 */
function splitTagGuids (tags) {
  if (Array.isArray(tags)) {
    return tags.map(tag => String(tag || '').trim()).filter(Boolean)
  }
  return String(tags == null ? '' : tags)
    .split(TAG_SEPARATOR)
    .map(tag => tag.trim())
    .filter(Boolean)
}

/**
 * tagGuid 数组 → notes.tags（去重 + 保持原顺序）
 * @param {string[]} guids
 * @returns {string}
 */
function buildTagsString (guids) {
  const seen = new Set()
  const list = []
  for (const guid of (guids || [])) {
    const value = String(guid || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    list.push(value)
  }
  return list.join(TAG_SEPARATOR)
}

/**
 * 是否是本地标签的 tagGuid（`local_tag_<id>`）
 * @param {string} tagGuid
 */
function isLocalTagGuid (tagGuid) {
  return String(tagGuid || '').startsWith('local_tag_')
}

/**
 * `local_tag_<id>` → 本地 tags.id；非本地标签返回 null
 * @param {string} tagGuid
 * @returns {number|null}
 */
function parseLocalTagGuidId (tagGuid) {
  if (!isLocalTagGuid(tagGuid)) return null
  const id = Number(String(tagGuid).replace('local_tag_', ''))
  return Number.isFinite(id) && id > 0 ? id : null
}

/**
 * 规范化标签名：
 *   - 去掉模型常见的前缀噪音（`#`、`-`、`*`、`•`、`1.`）
 *   - 去掉首尾引号 / 反引号 / 结尾标点
 *   - 折叠空白、截断到 MAX_TAG_NAME_LENGTH
 * @param {*} raw
 * @returns {string}
 */
function normalizeTagName (raw) {
  let name = String(raw == null ? '' : raw).trim()
  if (!name) return ''

  // 首部噪音：列表符号 / 序号 / # 前缀 / 括号（模型偶尔输出 ['a', 'b'] 这类松散数组）
  name = name.replace(/^[\s"'“”‘’`*•·\-–—]+/, '')
  name = name.replace(/^\d+\s*[.、)）]\s*/, '')
  name = name.replace(/^#+\s*/, '')
  name = name.replace(/^[[({]+/, '')
  name = name.replace(/^[\s"'“”‘’`]+/, '')
  // 尾部噪音：括号 / 引号 / 反引号 / 结尾标点
  name = name.replace(/[\]})]+$/, '')
  name = name.replace(/[\s"'“”‘’`*]+$/g, '')
  name = name.replace(/[，,。.、;；:：!！?？]+$/g, '')
  // 内部空白折叠
  name = name.replace(/\s+/g, ' ').trim()

  if (name.length > MAX_TAG_NAME_LENGTH) {
    name = name.slice(0, MAX_TAG_NAME_LENGTH).trim()
  }
  return name
}

/**
 * 从 AI 返回文本中提取 JSON 数组（允许外层有 ```json 包裹或解释性文字）
 * @param {string} text
 * @returns {Array|null}
 */
function extractJsonArray (text) {
  const source = String(text || '')
  const start = source.indexOf('[')
  const end = source.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(source.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch (err) {
    return null
  }
}

/**
 * 宽松切分：换行 / 逗号 / 顿号 / 分号 / 竖线
 * @param {string} text
 * @returns {string[]}
 */
function splitLooseTagText (text) {
  return String(text || '')
    .split(/[\n\r,，、;；|]+/)
    .map(part => part.trim())
    .filter(Boolean)
}

/**
 * AI 输出 → 标签名数组（规范化 + 去重 + 截断）
 * @param {string} rawText
 * @param {{ maxTags?: number }} options
 * @returns {string[]}
 */
function parseTagNames (rawText, { maxTags = DEFAULT_SUGGESTED_TAGS } = {}) {
  const text = String(rawText || '').trim()
  if (!text) return []

  const rawLimit = Number(maxTags)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? clampNumber(rawLimit, 1, MAX_SUGGESTED_TAGS, DEFAULT_SUGGESTED_TAGS)
    : DEFAULT_SUGGESTED_TAGS
  const jsonArray = extractJsonArray(text)
  const candidates = jsonArray || splitLooseTagText(text)

  const names = []
  const seen = new Set()
  for (const candidate of candidates) {
    const name = normalizeTagName(typeof candidate === 'object' && candidate !== null
      ? (candidate.name || candidate.tag || candidate.label || '')
      : candidate)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= limit) break
  }
  return names
}

/**
 * 合并本地 / 云端标签为「可复用标签池」
 * 同名（大小写无关）只保留一条：优先本地行（本地行有 tags.id，才能写 note_tags）。
 * @param {{ localTags?: Array, cloudTags?: Array, includeLocalTags?: boolean }} options
 * @returns {Array<{ name: string, tagGuid: string, localId: number|null, source: 'local'|'cloud' }>}
 */
function buildTagPool ({ localTags = [], cloudTags = [], includeLocalTags = true } = {}) {
  const pool = []
  const byName = new Map()

  const push = (tag, source) => {
    if (!tag) return
    const name = normalizeTagName(tag.name)
    const tagGuid = String(tag.tagGuid || '').trim()
    if (!name || !tagGuid) return
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      // 同名时本地行优先替换云端行，保证后续能写 note_tags
      if (existing.source !== 'local' && source === 'local') {
        existing.tagGuid = tagGuid
        existing.localId = parseLocalTagGuidId(tagGuid)
        existing.source = 'local'
      }
      return
    }
    const entry = {
      name,
      tagGuid,
      localId: parseLocalTagGuidId(tagGuid),
      source
    }
    byName.set(key, entry)
    pool.push(entry)
  }

  if (includeLocalTags) {
    for (const tag of (localTags || [])) push(tag, 'local')
  }
  for (const tag of (cloudTags || [])) push(tag, 'cloud')

  return pool
}

/**
 * 在标签池中按名称查找（大小写无关，二次比较忽略空白）
 * @param {Array} pool
 * @param {string} name
 * @returns {object|null}
 */
function findTagInPool (pool, name) {
  const target = normalizeTagName(name).toLowerCase()
  if (!target) return null
  const list = pool || []
  const exact = list.find(tag => String(tag.name || '').toLowerCase() === target)
  if (exact) return exact
  const compact = target.replace(/\s+/g, '')
  return list.find(tag => String(tag.name || '').toLowerCase().replace(/\s+/g, '') === compact) || null
}

/**
 * 按名称哈希取稳定颜色
 * @param {string} name
 * @returns {string} hex color
 */
function pickTagColor (name) {
  const key = String(name || '')
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000
  }
  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length]
}

/**
 * 压缩笔记正文用于 prompt：去掉图片 / 代码块 / HTML 噪音，并截断
 * @param {string} content
 * @param {number} limit
 * @returns {string}
 */
function condenseNoteContent (content, limit = 1200) {
  let text = String(content || '')
  // base64 图片链接、代码块、HTML 标签在打标场景下没有价值，反而烧 token
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/<[^>]{1,200}>/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (limit > 0 && text.length > limit) {
    text = text.slice(0, limit)
  }
  return text
}

/**
 * 数值收敛（用于输入框脏数据兜底）
 * 空串 / 非数字 → fallback；其余取整后收敛到 [min, max]
 */
function clampNumber (value, min, max, fallback) {
  if (value === '' || value === null || value === undefined) return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(Math.max(Math.round(num), min), max)
}

export {
  TAG_SEPARATOR,
  MAX_TAG_NAME_LENGTH,
  MAX_SUGGESTED_TAGS,
  DEFAULT_SUGGESTED_TAGS,
  TAG_COLOR_PALETTE,
  splitTagGuids,
  buildTagsString,
  isLocalTagGuid,
  parseLocalTagGuidId,
  normalizeTagName,
  extractJsonArray,
  splitLooseTagText,
  parseTagNames,
  buildTagPool,
  findTagInPool,
  pickTagColor,
  condenseNoteContent,
  clampNumber
}

export default {
  TAG_SEPARATOR,
  MAX_TAG_NAME_LENGTH,
  MAX_SUGGESTED_TAGS,
  DEFAULT_SUGGESTED_TAGS,
  TAG_COLOR_PALETTE,
  splitTagGuids,
  buildTagsString,
  isLocalTagGuid,
  parseLocalTagGuidId,
  normalizeTagName,
  extractJsonArray,
  splitLooseTagText,
  parseTagNames,
  buildTagPool,
  findTagInPool,
  pickTagColor,
  condenseNoteContent,
  clampNumber
}
