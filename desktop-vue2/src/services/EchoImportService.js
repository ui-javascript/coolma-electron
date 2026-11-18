// ============================================================================
// EchoImportService —— 回响 JSON 批量导入 / 导出业务封装（v2026-08-01）
//
// 职责：
//   - 解析 Echo Pack v1 文件（format/version 校验 + 字段归一化）
//   - 调用 DatabaseClient.echoes.previewImport / importMany 走主进程
//   - 生成 Echo Pack v1 导出数据（不导出 id / isBuiltin / 数据库审计字段）
//
// 不做：
//   - 不读 SQLite（DB 读路径走主进程，避免 renderer 缓存与 DB 漂移）
//   - 不写 echoRuntime / echoRegistry / echoCore（属于业务封装层）
//   - 不引入新的工具库（lodash / lodash-es 等）
//
// 与 Rune 的差异：
//   - JSON 顶层带 format/version，不是裸数组
//   - 内置回响禁止覆盖（依赖 BUILTIN_ECHO_CARDS.name 集合）
//   - 文件内重复单独标记为 fileDuplicates，不静默合并
//   - 提交使用 createNames / replaceNames 显式决策；主进程再次核对 DB
// ============================================================================

import DatabaseClient from 'src/utils/DatabaseClient'
import { BUILTIN_ECHO_CARDS } from 'src/components/echo/echoCore'

const ECHO_PACK_FORMAT = 'memocast.echo-pack'
const ECHO_PACK_VERSION = 1
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ECHOES = 500
const MAX_ANNO_SOURCE_BYTES = 512 * 1024
const MAX_NAME_LENGTH = 100
const MAX_DESC_LENGTH = 2000

// 内存里的内置回响名称集合（来自 BUILTIN_ECHO_CARDS）。
// 仅用于运行期保护；最终覆盖检查仍以主进程 DB 实时为准。
const BUILTIN_NAME_SET = (() => {
  const set = new Set()
  for (const card of (Array.isArray(BUILTIN_ECHO_CARDS) ? BUILTIN_ECHO_CARDS : [])) {
    if (card && card.name) set.add(String(card.name).trim().toLowerCase())
  }
  return set
})()

const computeNameKey = (name) => String(name || '').trim().toLowerCase()

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

const MAX_ANNO_SOURCE_BYTES_VALUE = MAX_ANNO_SOURCE_BYTES
const MAX_NAME_LENGTH_VALUE = MAX_NAME_LENGTH
const MAX_DESC_LENGTH_VALUE = MAX_DESC_LENGTH

/**
 * 校验并归一化一个导入条目。
 * - 非法条目返回 { ok: false, reason }；合法条目返回 { ok: true, item }。
 * - 不做 DB 查重，只做结构 / 长度 / 内置分类等纯客户端校验。
 */
function normalizeEchoEntry (raw) {
  if (!isPlainObject(raw)) return { ok: false, reason: 'NOT_OBJECT' }
  const name = String(raw.name || '').trim()
  if (!name) return { ok: false, reason: 'EMPTY_NAME' }
  if (name.length > MAX_NAME_LENGTH_VALUE) return { ok: false, reason: 'NAME_TOO_LONG', name }
  const desc = String(raw.desc || '')
  if (desc.length > MAX_DESC_LENGTH_VALUE) return { ok: false, reason: 'DESC_TOO_LONG', name }
  const annoSource = String(raw.anno_source || '').trim()
  if (!annoSource) return { ok: false, reason: 'EMPTY_ANNO_SOURCE', name }
  if (annoSource.length > MAX_ANNO_SOURCE_BYTES_VALUE) {
    return { ok: false, reason: 'ANNO_SOURCE_TOO_LARGE', name }
  }
  const sourceCategory = String(raw.category || '').trim()
  if (sourceCategory === 'builtin') {
    return { ok: false, reason: 'BUILTIN_CATEGORY_NOT_ALLOWED', name }
  }
  if (sourceCategory && !['marker', 'showy', 'typography'].includes(sourceCategory)) {
    // 非法分类：禁止写入，避免在 DB schema 默认值下产生隐式归一化
    return { ok: false, reason: 'INVALID_CATEGORY', name }
  }
  const renderType = String(raw.render_type || 'anno').trim()
  if (renderType && renderType !== 'anno') {
    return { ok: false, reason: 'INVALID_RENDER_TYPE', name }
  }
  return {
    ok: true,
    item: {
      name,
      desc,
      color: String(raw.color || '#26A69A'),
      icon: String(raw.icon || 'graphic_eq'),
      anno_source: annoSource,
      render_type: renderType || 'anno',
      category: sourceCategory || 'marker'
    }
  }
}

/**
 * 解析 Echo Pack v1 JSON 文本。
 * - 抛错由调用方捕获并展示。
 * - 解析失败时返回结构清晰的错误对象。
 */
export function parseEchoPack (rawText) {
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
    // 检测到裸数组——文件格式与回响（Echo Pack）不匹配
    // 兼容两种典型误传场景：
    //   a) Rune Pack v1 之前的旧版符文 JSON 裸数组（v2026-08-01 之前）
    //   b) v2026-08-01 之后 Rune Pack 的 runes 数组被误传
    // 进一步：若首个有效条目含 rune 必有字段 template 且缺 echo 必有字段 anno_source → 明确归类为 Rune 误传
    let message = 'JSON 格式不匹配：当前文件不是有效的 Echo Pack（疑似 Rune 格式）'
    if (parsed.length > 0) {
      const firstValid = parsed.find(it => it && typeof it === 'object' && String(it.name || '').trim())
      if (firstValid && firstValid.template && !firstValid.anno_source) {
        message = 'JSON 格式不匹配：当前文件不是回响 Echo Pack（疑似符文导出）'
      }
    }
    return { success: false, code: 'RUNE_PACK_FORMAT', message }
  }
  if (!isPlainObject(parsed)) {
    return { success: false, code: 'ECHO_PACK_INVALID', message: 'Echo Pack 必须为 JSON 对象' }
  }
  // 顶层带 format 但不是 'memocast.echo-pack' → 极有可能是 Rune Pack 对象误传
  if (parsed.format === 'memocast.rune-pack') {
    return { success: false, code: 'RUNE_PACK_OBJECT', message: 'JSON 格式不匹配：当前文件不是回响 Echo Pack（疑似符文 Rune Pack 格式）' }
  }
  if (parsed.format !== ECHO_PACK_FORMAT) {
    return { success: false, code: 'ECHO_PACK_FORMAT_MISMATCH', message: `format 应为 ${ECHO_PACK_FORMAT}` }
  }
  if (parsed.version !== ECHO_PACK_VERSION) {
    return { success: false, code: 'ECHO_PACK_VERSION_UNSUPPORTED', message: `version 应为 ${ECHO_PACK_VERSION}` }
  }
  if (!Array.isArray(parsed.echoes)) {
    return { success: false, code: 'ECHO_PACK_INVALID', message: 'echoes 必须为数组' }
  }
  if (parsed.echoes.length > MAX_ECHOES) {
    return { success: false, code: 'ECHO_PACK_TOO_MANY', message: `条目超过 ${MAX_ECHOES} 条` }
  }
  const normalized = []
  const invalidItems = []
  for (let i = 0; i < parsed.echoes.length; i++) {
    const result = normalizeEchoEntry(parsed.echoes[i])
    if (result.ok) {
      normalized.push({ index: i, raw: parsed.echoes[i], normalized: result.item })
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
 * 内置回响名称集合（外部需要时调用，避免外部直接 import BUILTIN_ECHO_CARDS）。
 */
export function getBuiltinEchoNameSet () {
  return new Set(BUILTIN_NAME_SET)
}

/**
 * 预演导入：把 normalized entries 交给主进程做 DB 比对。
 * 返回结构与主进程 IPC 一致。
 */
export async function previewImport (entries, targetCategory) {
  const safeEntries = Array.isArray(entries) ? entries.map(e => e && e.normalized).filter(Boolean) : []
  if (safeEntries.length === 0) {
    return {
      success: true,
      previewAt: Date.now(),
      targetCategory: targetCategory || 'marker',
      newItems: [],
      conflictItems: [],
      builtinBlocked: [],
      invalidItems: [],
      fileDuplicates: [],
      dbNameCount: 0
    }
  }
  return await DatabaseClient.echoes.previewImport({
    echoes: safeEntries,
    targetCategory: targetCategory || 'marker',
    builtinNamesHint: Array.from(BUILTIN_NAME_SET)
  })
}

/**
 * 计算文件内重复（同一名称在 normalized entries 中出现 >1 次）。
 */
export function computeFileDuplicates (entries) {
  const map = new Map()
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const name = e && e.normalized && e.normalized.name
    if (!name) continue
    const key = computeNameKey(name)
    if (!map.has(key)) map.set(key, { name, indexes: [] })
    map.get(key).indexes.push(e.index)
  }
  const result = []
  for (const { name, indexes } of map.values()) {
    if (indexes.length > 1) result.push({ name, indexes })
  }
  return result
}

/**
 * 提交导入：把用户勾选项 + 决策结果交给主进程。
 */
export async function commitImport ({ entries, newItems, conflictItems, targetCategory, previewAt }) {
  const safeEntries = Array.isArray(entries) ? entries : []
  const sourceByName = {}
  for (const e of safeEntries) {
    if (!e || !e.normalized) continue
    sourceByName[e.normalized.name] = e.normalized
  }
  const createNames = (Array.isArray(newItems) ? newItems : [])
    .filter(e => e && e.selected && e.name)
    .map(e => e.name)
  const replaceNames = (Array.isArray(conflictItems) ? conflictItems : [])
    .filter(e => e && e.selected && e.name)
    .map(e => e.name)
  return await DatabaseClient.echoes.importMany({
    createNames,
    replaceNames,
    targetCategory: targetCategory || 'marker',
    previewAt: Number(previewAt) || Date.now(),
    sourceByName,
    builtinNamesHint: Array.from(BUILTIN_NAME_SET)
  })
}

/**
 * 导出当前分类下全部自定义回响为 Echo Pack v1 字符串。
 * - 不导出内置回响（内置权威源是 BUILTIN_ECHO_CARDS）。
 * - 不导出数据库 id / isBuiltin / created_at / updated_at / sort_order。
 */
export function buildEchoPack (echoes) {
  const list = (Array.isArray(echoes) ? echoes : []).filter(e => e && !e.isBuiltin)
  const payload = {
    format: ECHO_PACK_FORMAT,
    version: ECHO_PACK_VERSION,
    exportedAt: new Date().toISOString(),
    echoes: list.map(e => ({
      name: String(e.name || '').trim(),
      desc: String(e.desc || ''),
      category: String(e.category || 'marker'),
      color: String(e.color || '#26A69A'),
      icon: String(e.icon || 'graphic_eq'),
      anno_source: String(e.anno_source || ''),
      render_type: String(e.render_type || 'anno')
    }))
  }
  return JSON.stringify(payload, null, 2)
}

export const ECHO_PACK = Object.freeze({
  FORMAT: ECHO_PACK_FORMAT,
  VERSION: ECHO_PACK_VERSION,
  MAX_FILE_BYTES,
  MAX_ECHOES,
  MAX_ANNO_SOURCE_BYTES,
  MAX_NAME_LENGTH,
  MAX_DESC_LENGTH
})

export const __testOnly__ = {
  normalizeEchoEntry,
  computeNameKey,
  computeFileDuplicates
}
