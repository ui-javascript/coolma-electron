/**
 * TagService —— 标签读写服务（渲染进程）
 *
 * 与 DatabaseClient.tags 的分工：
 *   - DatabaseClient.tags 只做单条 IPC 透传；
 *   - 本服务负责「标签池合并 / 复用匹配 / 批量挂到笔记 / 清理」这类业务组合，
 *     让设置面板（打标、标签维护）与其它调用方复用同一套规则，避免各处再写一遍。
 *
 * 数据真源：
 *   - 标签列表：离线看本地 tags 表；登录后看云端（server/state.tags），由 vuex 决定；
 *   - 笔记 ↔ 标签：notes.tags（`*` 分隔的 tagGuid）+ note_tags（仅本地标签有 id）。
 */

import DatabaseClient from 'src/utils/DatabaseClient'
import {
  splitTagGuids,
  buildTagsString,
  normalizeTagName,
  parseLocalTagGuidId,
  isLocalTagGuid,
  buildTagPool,
  findTagInPool
} from 'src/utils/tagUtil'

/**
 * 组装可复用标签池。
 * @param {Object} options
 * @param {Array}  [options.cloudTags] 云端标签（登录时 server.state.tags）
 * @param {boolean} [options.includeLocalTags=true] 是否把本地 tags 表并入池子（离线模式为 true）
 * @returns {Promise<{ pool: Array, localTags: Array }>}
 */
async function loadTagPool ({ cloudTags = [], includeLocalTags = true } = {}) {
  let localTags = []
  if (includeLocalTags) {
    try {
      const rows = await DatabaseClient.tags.getAll()
      localTags = Array.isArray(rows) ? rows : []
    } catch (err) {
      console.warn('[TagService] loadTagPool: local tags load failed', err)
      localTags = []
    }
  }
  return {
    pool: buildTagPool({ localTags, cloudTags, includeLocalTags }),
    localTags
  }
}

/**
 * 取出「没有标签」的笔记（打标候选）。
 * @returns {Promise<Array<{id, docGuid, kbGuid, title, category, preview, modifiedAt}>>}
 */
async function fetchUntaggedNotes () {
  const notes = await DatabaseClient.notes.getAllLite()
  return (notes || [])
    .filter(note => !String(note.tags || '').trim())
    .filter(note => String(note.title || '').trim() || String(note.content || '').trim())
    .map(note => ({
      id: note.id,
      docGuid: note.doc_guid || '',
      kbGuid: note.kb_guid || '',
      title: String(note.title || '').trim() || 'Untitled',
      category: note.category || '',
      preview: String(note.content || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      modifiedAt: note.data_modified || note.local_modified || 0
    }))
    .sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0))
}

/**
 * 把 AI 给出的标签名解析成可直接写入的 tagRef。
 * 命中已有标签 → 复用；否则调用 createTag 新建（离线写本地 tags 表，登录写云端）。
 *
 * @param {Object} options
 * @param {string[]} options.names AI 生成的标签名
 * @param {Array} options.pool 可复用标签池（会被就地追加新建项，便于同批次后续笔记复用）
 * @param {(name: string) => Promise<object>} options.createTag 由调用方注入（vuex server/createTag）
 * @returns {Promise<{ refs: Array, reused: string[], created: string[], failed: string[] }>}
 */
async function resolveTagRefs ({ names = [], pool = [], createTag } = {}) {
  const refs = []
  const reused = []
  const created = []
  const failed = []

  for (const rawName of names) {
    const name = normalizeTagName(rawName)
    if (!name) continue

    const existing = findTagInPool(pool, name)
    if (existing) {
      refs.push({ ...existing, reused: true })
      reused.push(existing.name)
      continue
    }

    let createdTag = null
    try {
      createdTag = typeof createTag === 'function' ? await createTag(name) : null
    } catch (err) {
      console.warn(`[TagService] resolveTagRefs: create tag "${name}" failed`, err)
      createdTag = null
    }

    const tagGuid = String((createdTag && (createdTag.tagGuid || createdTag.guid)) || '').trim()
    if (!tagGuid) {
      failed.push(name)
      continue
    }

    const ref = {
      name: normalizeTagName(createdTag.name) || name,
      tagGuid,
      localId: parseLocalTagGuidId(tagGuid),
      source: isLocalTagGuid(tagGuid) ? 'local' : 'cloud',
      reused: false
    }
    pool.push(ref)
    refs.push(ref)
    created.push(ref.name)
  }

  return { refs, reused, created, failed }
}

/**
 * 把标签追加到某篇笔记上（保留原有标签）。
 * 写入 notes.tags（触发 dirty=1，后续由同步服务把 tags 推到云端），
 * 本地标签额外维护 note_tags 关联表。
 *
 * @param {Object} options
 * @param {number} options.noteId 本地 notes.id
 * @param {Array} options.tagRefs resolveTagRefs 的产物
 * @returns {Promise<{ added: string[], changed: boolean, note: object|null }>}
 */
async function applyTagsToNote ({ noteId, tagRefs = [] } = {}) {
  const note = await DatabaseClient.notes.getById(noteId)
  if (!note) {
    const error = new Error('NOTE_NOT_FOUND')
    error.code = 'NOTE_NOT_FOUND'
    throw error
  }

  const currentGuids = splitTagGuids(note.tags)
  const added = []

  for (const ref of tagRefs) {
    if (!ref || !ref.tagGuid) continue
    if (!currentGuids.includes(ref.tagGuid)) {
      currentGuids.push(ref.tagGuid)
      added.push(ref.name || ref.tagGuid)
    }
    if (ref.localId) {
      try {
        await DatabaseClient.tags.attachToNote(note.id, ref.localId)
      } catch (err) {
        console.warn('[TagService] applyTagsToNote: attach note_tags failed', err)
      }
    }
  }

  if (!added.length) {
    return { added, changed: false, note }
  }

  const updated = await DatabaseClient.notes.update(note.id, {
    tags: buildTagsString(currentGuids),
    local_modified: Date.now()
  })

  return { added, changed: true, note: updated || { ...note, tags: buildTagsString(currentGuids) } }
}

/**
 * 统计本地笔记里每个 tagGuid 被引用的次数（离线模式下的计数兜底）。
 * @returns {Promise<Record<string, number>>}
 */
async function computeLocalTagUsage () {
  const usage = {}
  try {
    const notes = await DatabaseClient.notes.getAllLite()
    for (const note of (notes || [])) {
      for (const guid of splitTagGuids(note.tags)) {
        usage[guid] = (usage[guid] || 0) + 1
      }
    }
  } catch (err) {
    console.warn('[TagService] computeLocalTagUsage failed', err)
  }
  return usage
}

/**
 * 清理「没有任何笔记引用」的本地标签。
 * @returns {Promise<{ success: boolean, removed: Array<{id, name}> }>}
 */
async function cleanupUnusedTags () {
  return await DatabaseClient.tags.cleanupUnused()
}

export {
  loadTagPool,
  fetchUntaggedNotes,
  resolveTagRefs,
  applyTagsToNote,
  computeLocalTagUsage,
  cleanupUnusedTags
}

export default {
  loadTagPool,
  fetchUntaggedNotes,
  resolveTagRefs,
  applyTagsToNote,
  computeLocalTagUsage,
  cleanupUnusedTags
}
