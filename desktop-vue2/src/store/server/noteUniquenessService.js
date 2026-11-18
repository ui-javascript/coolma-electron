import DatabaseClient from 'src/utils/DatabaseClient'
import { buildNoteUniqueKey, normalizeCategoryForMatch, normalizeTitleForMatch } from 'src/utils/const/constants'

export async function findExistingNoteByCategoryAndTitle ({
  category,
  title,
  excludeDocGuid = null,
  excludeNoteId = null
}) {
  const normalizedCategory = normalizeCategoryForMatch(category)
  const targetKey = buildNoteUniqueKey(normalizedCategory, title)
  const notes = await DatabaseClient.notes.getAll({ category: normalizedCategory })

  return (notes || []).find(note => {
    if (excludeDocGuid && note.doc_guid === excludeDocGuid) return false
    if (excludeNoteId && note.id === excludeNoteId) return false

    return buildNoteUniqueKey(note.category, note.title) === targetKey
  }) || null
}

export async function ensureUniqueNoteTitleInCategory ({
  category,
  title,
  excludeDocGuid = null,
  excludeNoteId = null
}) {
  const normalizedCategory = normalizeCategoryForMatch(category)
  const normalizedTitle = normalizeTitleForMatch(title)

  const existing = await findExistingNoteByCategoryAndTitle({
    category: normalizedCategory,
    title: normalizedTitle,
    excludeDocGuid,
    excludeNoteId
  })

  return {
    normalizedCategory,
    normalizedTitle,
    exists: !!existing,
    existing
  }
}

export async function generateUniqueNoteTitleInCategory ({ category, title }) {
  const normalizedCategory = normalizeCategoryForMatch(category)
  let finalTitle = normalizeTitleForMatch(title)
  const existingNotes = await DatabaseClient.notes.getAll({ category: normalizedCategory })
  const titleSet = new Set((existingNotes || []).map(note => normalizeTitleForMatch(note.title).toLowerCase()))

  if (!titleSet.has(finalTitle.toLowerCase())) {
    return finalTitle
  }

  let counter = 1
  const lastDotIndex = finalTitle.lastIndexOf('.')
  const baseName = lastDotIndex > 0 ? finalTitle.substring(0, lastDotIndex) : finalTitle
  const ext = lastDotIndex > 0 ? finalTitle.substring(lastDotIndex) : ''

  while (titleSet.has(`${baseName} (${counter})${ext}`.toLowerCase())) {
    counter++
  }

  return `${baseName} (${counter})${ext}`
}
