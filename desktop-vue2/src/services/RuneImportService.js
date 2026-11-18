// ============================================================================
// RuneImportService —— 符文 JSON 批量导入 / 导出业务封装（v2026-08-01）
//
// 对齐 EchoImportService 的契约：
//   - 顶层带 format/version/exportedAt 头（不是裸数组）
//   - 字段归一化落到白名单（name / desc / category / color / icon / template）
//   - 不导出数据库审计字段（id / isBuiltin / created_at / updated_at / sort_order）
//   - 解析失败时返回结构清晰的错误对象（含 code 字段，便于 UI 隐藏/降级）
//   - 与回响的互斥检测交给调用方（runeBatchImportDialog / echoBatchImportDialog 各守门口）
//
// 不做：
//   - 不读 SQLite（DB 读路径走主进程 / RuneTemplateService.dryRunImport，避免 renderer 缓存与 DB 漂移）
//   - 不写 runes / rune_templates（属于 RuneTemplateService.batchImport）
//   - 不引入新的工具库
//
// 与 Rune JSON v1（旧版裸数组）的差异：
//   - 旧版：顶层直接是 [{name, desc, category, template, color, icon}, ...]
//   - 新版：{format: 'memocast.rune-pack', version: 1, exportedAt, runes: [...]}
//   - 旧版 fallback 已被移除（v2026-08-01 起，旧版裸数组直接 RUNE_PACK_FORMAT 拒绝）
// ============================================================================

const RUNE_PACK_FORMAT = 'memocast.rune-pack'
const RUNE_PACK_VERSION = 1
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_RUNES = 500
const MAX_TEMPLATE_BYTES = 512 * 1024
const MAX_NAME_LENGTH = 100
const MAX_DESC_LENGTH = 2000

// 符文分类白名单（与 src/utils/enum/runeEchoCategoriesEnum.js → RuneCategoryEnum.items 的 value 字段保持同步）。
// 仅做白名单校验；非法值 fallback 到 'general'，与 RuneTemplateService 的语义对齐。
const VALID_CATEGORY_KEYS = new Set([
  'general', 'education', 'outfit', 'fitness', 'music', 'novel',
  'movie', 'food', 'travel', 'research', 'legal', 'government',
  'entertainment', 'gaming', 'consulting', 'community', 'social',
  'medical', 'finance', 'insurance', 'manufacturing', 'construction',
  'realEstate', 'lodging', 'catering', 'business', 'transportation',
  'warehousing', 'sales', 'trading', 'agriculture', 'energy',
  'environment', 'resume'
])

const MAX_TEMPLATE_BYTES_VALUE = MAX_TEMPLATE_BYTES
const MAX_NAME_LENGTH_VALUE = MAX_NAME_LENGTH
const MAX_DESC_LENGTH_VALUE = MAX_DESC_LENGTH

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

const isValidCategory = (raw) => typeof raw === 'string' && VALID_CATEGORY_KEYS.has(String(raw).trim())

/**
 * 校验并归一化一个导入条目。
 * - 非法条目返回 { ok: false, reason }；合法条目返回 { ok: true, item }。
 * - 不做 DB 查重 / 不做内置过滤（后者由调用方按 builtinNames 集合处理）。
 */
function normalizeRuneEntry (raw) {
  if (!isPlainObject(raw)) return { ok: false, reason: 'NOT_OBJECT' }
  const name = String(raw.name || '').trim()
  if (!name) return { ok: false, reason: 'EMPTY_NAME' }
  if (name.length > MAX_NAME_LENGTH_VALUE) return { ok: false, reason: 'NAME_TOO_LONG', name }
  const desc = String(raw.desc || '')
  if (desc.length > MAX_DESC_LENGTH_VALUE) return { ok: false, reason: 'DESC_TOO_LONG', name }
  const template = String(raw.template || '').trim()
  if (!template) return { ok: false, reason: 'EMPTY_TEMPLATE', name }
  if (template.length > MAX_TEMPLATE_BYTES_VALUE) {
    return { ok: false, reason: 'TEMPLATE_TOO_LARGE', name }
  }
  const sourceCategory = String(raw.category || '').trim()
  if (sourceCategory && !isValidCategory(sourceCategory)) {
    // 非法 category：按 rune 既有语义 fallback 到 'general'，不阻塞整批导入
    // （与 RuneTemplateService.batchImport 的 validTargetCategory 语义对齐）
  }
  return {
    ok: true,
    item: {
      name,
      desc,
      color: String(raw.color || '#7E57C2'),
      icon: String(raw.icon || 'star'),
      template,
      category: isValidCategory(sourceCategory) ? sourceCategory : 'general'
    }
  }
}

/**
 * 解析 Rune Pack v1 JSON 文本。
 * - 抛错由调用方捕获并展示。
 * - 解析失败时返回结构清晰的错误对象（含 code 与 message）。
 */
export function parseRunePack (rawText) {
  if (typeof rawText !== 'string') {
    return { success: false, code: 'INVALID_TEXT', message: '文件内容不是文本' }
  }
  if (rawText.length > MAX_FILE_BYTES) {
    return { success: false, code: 'FILE_TOO_LARGE', message: `文件过大（> ${MAX_FILE_BYTES} 字节）` }
  }
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (e) {
    return { success: false, code: 'JSON_PARSE_FAILED', message: e && e.message ? e.message : String(e) }
  }
  if (Array.isArray(parsed)) {
    // 检测到裸数组——文件格式与符文（Rune Pack v1）不匹配
    // 兼容两种典型误传场景：
    //   a) 旧版 Rune JSON 裸数组（v2026-08-01 之前）
    //   b) Echo 导出被误传（顶层 echoes 数组）
    return { success: false, code: 'RUNE_PACK_FORMAT', message: 'JSON 格式不匹配：当前文件不是有效的 Rune Pack（疑似回响导出或旧版符文 JSON）' }
  }
  if (!isPlainObject(parsed)) {
    return { success: false, code: 'RUNE_PACK_INVALID', message: 'Rune Pack 必须为 JSON 对象' }
  }
  if (parsed.format !== RUNE_PACK_FORMAT) {
    // 顶层带 format 但不是 'memocast.rune-pack'（极有可能是 Echo Pack 对象误传）
    return { success: false, code: 'RUNE_PACK_FORMAT_MISMATCH', message: 'JSON 格式不匹配：当前文件不是符文 Rune Pack（疑似回响 Echo Pack 格式）' }
  }
  if (parsed.version !== RUNE_PACK_VERSION) {
    return { success: false, code: 'RUNE_PACK_VERSION_UNSUPPORTED', message: `version 应为 ${RUNE_PACK_VERSION}` }
  }
  if (!Array.isArray(parsed.runes)) {
    return { success: false, code: 'RUNE_PACK_INVALID', message: 'runes 必须为数组' }
  }
  if (parsed.runes.length > MAX_RUNES) {
    return { success: false, code: 'RUNE_PACK_TOO_MANY', message: `条目超过 ${MAX_RUNES} 条` }
  }
  const normalized = []
  const invalidItems = []
  for (let i = 0; i < parsed.runes.length; i++) {
    const result = normalizeRuneEntry(parsed.runes[i])
    if (result.ok) {
      normalized.push({ index: i, raw: parsed.runes[i], normalized: result.item })
    } else {
      invalidItems.push({ index: i, reason: result.reason, name: result.name || '' })
    }
  }
  return {
    success: true,
    format: parsed.format,
    version: parsed.version,
    exportedAt: parsed.exportedAt || null,
    entries: normalized,
    invalidItems
  }
}

/**
 * 导出当前选中符文为 Rune Pack v1 字符串。
 * - 不携带数据库 id / isBuiltin / created_at / updated_at / sort_order / inherit_from_previous。
 * - category 一律归一化到 RuneCategoryEnum 白名单，非法值 fallback 到 'general'。
 */
export function buildRunePack (runes) {
  const list = (Array.isArray(runes) ? runes : []).filter(r => r && r.name)
  const payload = {
    format: RUNE_PACK_FORMAT,
    version: RUNE_PACK_VERSION,
    exportedAt: new Date().toISOString(),
    runes: list.map(r => ({
      name: String(r.name || '').trim(),
      desc: String(r.desc || ''),
      category: isValidCategory(r.category) ? String(r.category).trim() : 'general',
      color: String(r.color || '#7E57C2'),
      icon: String(r.icon || 'star'),
      template: String(r.template || '')
    }))
  }
  return JSON.stringify(payload, null, 2)
}

export const RUNE_PACK = Object.freeze({
  FORMAT: RUNE_PACK_FORMAT,
  VERSION: RUNE_PACK_VERSION,
  MAX_FILE_BYTES,
  MAX_RUNES,
  MAX_TEMPLATE_BYTES,
  MAX_NAME_LENGTH,
  MAX_DESC_LENGTH
})

export const __testOnly__ = {
  normalizeRuneEntry,
  isValidCategory,
  VALID_CATEGORY_KEYS
}
