import DatabaseClient from 'src/utils/DatabaseClient'
import { OFFLINE_ROOT_CATEGORY, normalizeCategoryForMatch } from 'src/utils/const/constants'
import {
  buildCategoryTreeFromNotes,
  formatYmd,
  getCalendarNoteTimestamp,
  mapLocalNoteToSummary
} from 'src/store/server/noteTree'
import { getNoteTagList, parseLocalTagId } from 'src/store/server/localSyncMigration'

export async function loadLocalWorkspaceData () {
  await DatabaseClient.categories.ensureOfflineRoot()
  // 启动路径用摘要查询（不带正文），避免把整库笔记正文通过 IPC 搬到渲染进程
  const notes = await DatabaseClient.notes.getAllLite()
  const categories = await DatabaseClient.categories.getAll({})
  const tree = buildCategoryTreeFromNotes(notes, categories)

  return {
    notes,
    categories,
    tree
  }
}

/**
 * 获取指定分类下的本地笔记
 * @param {string} category - 原始 category 路径（如 '/' 或 '/My Notes/'）
 * @returns {Promise<Array>} 格式化后的笔记列表
 */
export async function getOfflineNotesByCategory (category = OFFLINE_ROOT_CATEGORY) {
  // ✅ 关键修复：使用规范化后的 category 进行查询
  // 因为 SQLite 中存储的 category 可能是 '/'，但显示时 normalize 为 '/My Notes/'
  // 所以查询时也要用规范化后的 category，确保能匹配到
  const normalizedCategory = normalizeCategoryForMatch(category || OFFLINE_ROOT_CATEGORY)

  const localNotes = await DatabaseClient.notes.getAllLite({
    category: normalizedCategory
  })

  return (localNotes || [])
    .filter(note => note.title && note.title !== 'Untitled')
    .map(note => mapLocalNoteToSummary(note, normalizedCategory))
    .sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))
}

export async function getOfflineCalendarNotes ({ basis, dayStart, dayEnd }) {
  const localNotes = await DatabaseClient.notes.getAllLite()

  return (localNotes || [])
    .filter(note => note.title && note.title !== 'Untitled')
    .filter(note => {
      const ts = getCalendarNoteTimestamp(note, basis)
      return ts >= dayStart && ts < dayEnd
    })
    .map(note => mapLocalNoteToSummary(note, note.category || OFFLINE_ROOT_CATEGORY))
    .sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))
}

export async function getOfflineCalendarDates ({ basis, monthStart, monthEnd }) {
  const localNotes = await DatabaseClient.notes.getAllLite()
  const dateSet = new Set()

  for (const note of (localNotes || [])) {
    const ts = getCalendarNoteTimestamp(note, basis)
    if (ts >= monthStart && ts < monthEnd) {
      dateSet.add(formatYmd(ts))
    }
  }

  return Array.from(dateSet).sort()
}

export async function getOfflineTagNotes (tagGuid) {
  const localTagId = parseLocalTagId(tagGuid)
  if (!localTagId) {
    return []
  }

  const taggedLocalNotes = await DatabaseClient.notes.getAllLite()
  const localTagNotes = []

  for (const note of (taggedLocalNotes || [])) {
    const noteTags = getNoteTagList(note)
    if (noteTags.includes(tagGuid)) {
      localTagNotes.push(mapLocalNoteToSummary(note, note.category || OFFLINE_ROOT_CATEGORY))
    }
  }

  return localTagNotes.sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))
}

export async function getOfflineTagsWithCounts (currentDocGuid) {
  const tags = await DatabaseClient.tags.getAll()
  const countMap = {}
  const allNotes = await DatabaseClient.notes.getAllLite()

  for (const tag of tags) {
    let count = 0
    for (const note of (allNotes || [])) {
      const noteTags = getNoteTagList(note)
      if (noteTags.includes(tag.tagGuid)) {
        count++
      }
    }
    countMap[tag.tagGuid] = count
  }

  let currentNoteTags = null
  if (currentDocGuid && currentDocGuid.startsWith('local_')) {
    const localNote = await DatabaseClient.notes.getByDocGuid(currentDocGuid)
    if (localNote) {
      const noteTags = await DatabaseClient.tags.getNoteTags(localNote.id)
      currentNoteTags = noteTags.map(tag => tag.tagGuid).join('*')
    }
  }

  return {
    tags,
    countMap,
    currentNoteTags
  }
}
