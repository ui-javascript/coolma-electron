import api from 'src/utils/api'
import DatabaseClient from 'src/utils/DatabaseClient'

export function getNoteTagList (note) {
  return (note?.tags || '').split('*').filter(Boolean)
}

export function parseLocalTagId (tagGuid) {
  if (!tagGuid || typeof tagGuid !== 'string') return null
  if (!tagGuid.startsWith('local_tag_')) return null
  const id = Number(tagGuid.replace('local_tag_', ''))
  return Number.isFinite(id) ? id : null
}

export function replaceTagGuidString (tagString = '', fromTagGuid, toTagGuid) {
  const parts = tagString.split('*').filter(Boolean)
  const mapped = parts.map(tag => (tag === fromTagGuid ? toTagGuid : tag))
  return Array.from(new Set(mapped)).join('*')
}

export async function migrateOfflineTagsToCloud (kbGuid) {
  if (!kbGuid) return { created: 0, attached: 0, updatedNotes: 0 }

  const localTags = await DatabaseClient.tags.getAll()
  if (!Array.isArray(localTags) || localTags.length === 0) {
    return { created: 0, attached: 0, updatedNotes: 0 }
  }

  const cloudTags = await api.KnowledgeBaseApi.getAllTags({ kbGuid })
  const cloudTagMap = new Map((cloudTags || []).map(tag => [tag.name, tag]))

  let created = 0
  let attached = 0
  let updatedNotes = 0

  const localNotes = await DatabaseClient.notes.getAll()
  for (const localTag of localTags) {
    let cloudTag = cloudTagMap.get(localTag.name)
    if (!cloudTag) {
      cloudTag = await api.KnowledgeBaseApi.createTag({
        kbGuid,
        data: {
          name: localTag.name,
          parentTagGuid: ''
        }
      })
      if (cloudTag) {
        created++
        cloudTagMap.set(localTag.name, cloudTag)
      }
    }

    const cloudTagGuid = cloudTag?.tagGuid || cloudTag?.guid
    if (!cloudTagGuid) continue

    for (const note of (localNotes || [])) {
      const noteTags = getNoteTagList(note)
      if (!noteTags.includes(localTag.tagGuid)) continue

      const nextTags = replaceTagGuidString(note.tags || '', localTag.tagGuid, cloudTagGuid)
      if (nextTags !== (note.tags || '')) {
        await DatabaseClient.notes.update(note.id, {
          tags: nextTags,
          dirty: 1,
          local_modified: Date.now()
        })
        attached++
        updatedNotes++
      }
    }
  }

  return { created, attached, updatedNotes }
}
