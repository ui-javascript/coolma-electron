import DatabaseClient from 'src/utils/DatabaseClient'
import { OFFLINE_ROOT_CATEGORY, normalizeNbsp } from 'src/utils/const/constants'

export function createLocalDocGuid () {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

export async function saveOfflineImportedNote ({ title, text, now, category = OFFLINE_ROOT_CATEGORY }) {
  const normalizedTitle = normalizeNbsp(title)
  const normalizedText = normalizeNbsp(text)
  const localDocGuid = createLocalDocGuid()
  const note = await DatabaseClient.notes.create({
    doc_guid: localDocGuid,
    title: normalizedTitle,
    content: normalizedText,
    category,
    data_created: now,
    data_modified: now,
    local_modified: now
  })

  return {
    localDocGuid,
    note,
    currentNote: {
      _isRawMarkdown: true,
      info: {
        docGuid: localDocGuid,
        kbGuid: '',
        title: normalizedTitle,
        category,
        dataCreated: now,
        dataModified: now
      },
      html: normalizedText,
      resources: []
    }
  }
}

export async function createLocalDraftNote ({
  docGuid = createLocalDocGuid(),
  kbGuid = '',
  title,
  content,
  category = OFFLINE_ROOT_CATEGORY,
  now,
  dataCreated = now,
  dataModified = now
}) {
  const normalizedTitle = normalizeNbsp(title)
  const normalizedContent = normalizeNbsp(content)
  const note = await DatabaseClient.notes.create({
    doc_guid: docGuid,
    kb_guid: kbGuid,
    title: normalizedTitle,
    content: normalizedContent,
    category,
    data_created: dataCreated,
    data_modified: dataModified,
    local_modified: now
  })

  return {
    note,
    localNoteId: note?.id || null,
    docGuid
  }
}

export async function promoteLocalDraftToCloudGuid ({ localNoteId, docGuid, source = 'wiznote' }) {
  if (!localNoteId || !docGuid) return

  await DatabaseClient.notes.update(localNoteId, {
    doc_guid: docGuid
  })
  await DatabaseClient.sync.createGuidMapping(localNoteId, docGuid, source)
}

export async function upsertLocalNoteByDocGuid ({
  docGuid,
  title,
  content,
  category,
  now,
  dataCreated = now,
  dataModified = now
}) {
  const normalizedTitle = normalizeNbsp(title)
  const normalizedContent = normalizeNbsp(content)
  const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
  if (localNote) {
    const updatedNote = await DatabaseClient.notes.update(localNote.id, {
      title: normalizedTitle,
      content: normalizedContent,
      category,
      local_modified: now
    })

    return {
      action: 'updated',
      localNote,
      note: updatedNote,
      localNoteId: localNote.id,
      docGuid: localNote.doc_guid || docGuid
    }
  }

  const created = await DatabaseClient.notes.create({
    doc_guid: docGuid,
    title: normalizedTitle,
    content: normalizedContent,
    category,
    data_created: dataCreated,
    data_modified: dataModified,
    local_modified: now
  })

  return {
    action: 'created',
    localNote: created,
    note: created,
    localNoteId: created?.id || null,
    docGuid: created?.doc_guid || docGuid
  }
}
