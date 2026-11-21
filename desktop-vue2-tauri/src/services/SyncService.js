/**
 * SyncService - 为知笔记同步服务
 * 纯本地优先架构：只 push，不 pull
 * 用 dirty 字段(0/1)跟踪待同步状态
 */

import DatabaseClient from 'src/utils/DatabaseClient'
import WizNoteApi from '../utils/api'
import helper from '../utils/helper'
import SessionStorageService from './SessionStorageService'
import { OFFLINE_ROOT_CATEGORY, normalizeNbsp, normalizeCategoryForMatch } from '../utils/const/constants'

function getKbGuid() {
  return SessionStorageService.getKbGuid()
}

const api = {
  async getDocs(since = null, docGuid = null) {
    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    if (docGuid) {
      const info = await WizNoteApi.KnowledgeBaseApi.getNoteInfo({ kbGuid, docGuid })
      if (info) {
        const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({ kbGuid, docGuid })
        return [{ ...info, content: content || '' }]
      }
      return []
    }

    const docs = []
    let start = 0
    const count = 100

    for (;;) {
      const result = await WizNoteApi.KnowledgeBaseApi.getCategoryNotes({
        kbGuid,
        data: { category: '', start, count }
      })

      const items = Array.isArray(result) ? result : (result?.result || [])
      if (items.length === 0) break

      for (const doc of items) {
        try {
          const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({
            kbGuid,
            docGuid: doc.guid || doc.docGuid
          })
          docs.push({ ...doc, content: content || '' })
        } catch (e) {
          docs.push({ ...doc, content: '' })
        }
      }

      if (items.length < count) break
      start += count
    }

    return docs
  },

  async createDoc(note, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    const userId = SessionStorageService.getUserId() || ''
    const isLite = (note.category || '').replace(/\//g, '') === 'Lite'
    const category = note.category || ''

    const html = helper.embedMDNote(note.content || '', [], {
      wrapWithPreTag: isLite,
      kbGuid: effectiveKbGuid,
      docGuid: ''
    })

    const createData = {
      category,
      kbGuid: effectiveKbGuid,
      title: note.title || 'Untitled',
      owner: userId,
      html,
      type: isLite ? 'lite/markdown' : 'document',
      tags: note.tags || ''
    }

    const result = await WizNoteApi.KnowledgeBaseApi.createNote({
      kbGuid: effectiveKbGuid,
      data: createData
    })

    console.log('[SyncService] createDoc API response:', JSON.stringify(result))

    if (result && result.guid) {
      return { guid: result.guid }
    }

    const errorMsg = result?.returnMessage || 'Failed to create note'
    console.error('[SyncService] createDoc failed:', {
      error: errorMsg,
      returnCode: result?.returnCode,
      externCode: result?.externCode,
      fullResponse: result,
      noteData: {
        title: note.title,
        category: note.category,
        contentLength: (note.content || '').length,
        kbGuid: effectiveKbGuid
      }
    })
    throw new Error(errorMsg)
  },

  async updateDoc(docGuid, updates, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    const html = helper.embedMDNote(updates.content || '', [], {
      wrapWithPreTag: false,
      kbGuid: effectiveKbGuid,
      docGuid
    })

    const data = {
      html,
      title: updates.title,
      kbGuid: effectiveKbGuid,
      docGuid,
      resources: updates.resources || [],
      type: 'document',
      tags: updates.tags || ''
    }

    // ✅ 保持原始 category 不做 normalize，确保上传路径与本地存储一致
    // normalizeCategory 仅用于去重/search 匹配逻辑，不用于 API 上传
    if (updates.category != null) {
      data.category = updates.category
    }

    const result = await WizNoteApi.KnowledgeBaseApi.updateNote({
      kbGuid: effectiveKbGuid,
      docGuid,
      data
    })

    return result
  },

  async deleteDoc(docGuid, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }
    return await WizNoteApi.KnowledgeBaseApi.deleteNote({ kbGuid: effectiveKbGuid, docGuid })
  }
}

class SyncService {
  constructor() {
    this.isSyncing = false
    this.syncQueue = []
    this.listeners = []
    this._cloudCategoryNotesCache = new Map()
  }

  addListener(callback) {
    this.listeners.push(callback)
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback)
  }

  notifyListeners(event) {
    this.listeners.forEach(callback => {
      try { callback(event) } catch (e) {
        console.error('[SyncService] Listener error:', e)
      }
    })
  }

  async getCloudNotesByCategory(kbGuid, category = '') {
    const cacheKey = `${kbGuid}::${category || ''}`
    if (this._cloudCategoryNotesCache.has(cacheKey)) {
      return this._cloudCategoryNotesCache.get(cacheKey)
    }

    const notes = []
    let start = 0
    const count = 100

    for (;;) {
      const result = await WizNoteApi.KnowledgeBaseApi.getCategoryNotes({
        kbGuid,
        data: {
          category,
          start,
          count,
          withAbstract: true
        }
      })

      const items = Array.isArray(result) ? result : (result?.result || [])
      if (!items.length) break

      notes.push(...items)
      if (items.length < count) break
      start += count
    }

    this._cloudCategoryNotesCache.set(cacheKey, notes)
    return notes
  }

  async findCloudNoteInCategory({ kbGuid, title, category }) {
    const targetTitle = title || 'Untitled'
    const targetCategory = normalizeCategoryForMatch(category || '')
    const notes = await this.getCloudNotesByCategory(kbGuid, category || '')

    return notes.find(doc => {
      const docCategory = normalizeCategoryForMatch(doc.category || '')
      return doc.title === targetTitle && docCategory === targetCategory
    }) || null
  }

  /**
   * 默认同步：仅备份本地变更到云端，不执行恢复
   */
  async sync(options = {}) {
    return this.backupToCloud(options)
  }

  async backupToCloud() {
    if (this.isSyncing) {
      console.info('[SyncService] Sync already in progress, skipping')
      return { success: false, reason: 'already_syncing' }
    }

    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      console.warn('[SyncService] Backup skipped: no kbGuid (not logged in)')
      return { success: false, reason: 'not_logged_in' }
    }

    this.isSyncing = true
    this.notifyListeners({ type: 'sync_start', mode: 'backup' })

    try {
      const stats = { pulled: 0, pushed: 0, errors: 0, skipped: 0, backfilled: 0 }
      this._cloudCategoryNotesCache.clear()

      console.info('[SyncService] Starting backup to cloud...')
      const pushResult = await this.pushToCloud()
      stats.pushed = pushResult.count
      stats.errors += pushResult.errors

      console.info(`[SyncService] ✅ Backup completed: ↑${stats.pushed} pushed, ${stats.errors} errors`)
      this.notifyListeners({ type: 'sync_complete', mode: 'backup', stats })
      return { success: true, mode: 'backup', stats }
    } catch (error) {
      console.error('[SyncService] Backup failed:', error)
      this.notifyListeners({ type: 'sync_error', mode: 'backup', error: error.message })
      return { success: false, mode: 'backup', error: error.message }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 手动恢复：从云端拉取本地不存在的笔记
   */
  async restoreFromCloud() {
    if (this.isSyncing) {
      console.info('[SyncService] Restore already in progress, skipping')
      return { success: false, reason: 'already_syncing' }
    }

    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      console.warn('[SyncService] Restore skipped: no kbGuid (not logged in)')
      return { success: false, reason: 'not_logged_in' }
    }

    this.isSyncing = true
    this.notifyListeners({ type: 'sync_start', mode: 'restore' })

    try {
      this._cloudCategoryNotesCache.clear()
      console.info('[SyncService] Starting restore from cloud (new files only)...')
      const preview = await this.previewRestoreFromCloud()
      const pullResult = await this.pullFromCloud()
      const stats = {
        pulled: pullResult.count || preview.stats?.pulled || 0,
        pushed: 0,
        errors: 0,
        skipped: pullResult.skipped || preview.stats?.skipped || 0,
        backfilled: pullResult.backfilled || preview.stats?.backfilled || 0,
        total: preview.stats?.total || 0
      }

      console.info(`[SyncService] ✅ Restore completed: ↓${stats.pulled} pulled, ⏭️${stats.skipped} skipped, ♻️${stats.backfilled} backfilled`)
      this.notifyListeners({ type: 'sync_complete', mode: 'restore', stats })
      return { success: true, mode: 'restore', stats }
    } catch (error) {
      console.error('[SyncService] Restore failed:', error)
      this.notifyListeners({ type: 'sync_error', mode: 'restore', error: error.message })
      return { success: false, mode: 'restore', error: error.message }
    } finally {
      this.isSyncing = false
    }
  }

  async previewRestoreFromCloud() {
    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      return {
        success: false,
        reason: 'not_logged_in',
        stats: { total: 0, pulled: 0, skipped: 0, backfilled: 0 }
      }
    }

    try {
      const docs = await this._fetchAllCloudDocs(kbGuid)
      const preview = await this._buildRestorePreviewStats({ kbGuid, docs })
      return {
        success: true,
        reason: null,
        stats: preview
      }
    } catch (error) {
      console.error('[SyncService] previewRestoreFromCloud failed:', error)
      return {
        success: false,
        reason: 'preview_failed',
        error: error.message,
        stats: { total: 0, pulled: 0, skipped: 0, backfilled: 0 }
      }
    }
  }

  async _fetchAllCloudDocs(kbGuid) {
    console.log('[SyncService] Fetching cloud note list...')
    const docs = []
    let start = 0
    const count = 100

    for (;;) {
      const result = await WizNoteApi.KnowledgeBaseApi.getCategoryNotes({
        kbGuid,
        data: { category: '', start, count, withAbstract: false }
      })

      if (Array.isArray(result) && result.length > 0) {
        docs.push(...result)
        if (result.length < count) break
        start += count
      } else {
        break
      }
    }

    console.log(`[SyncService] Found ${docs.length} notes on cloud`)
    return docs
  }

  async _buildRestorePreviewStats({ kbGuid, docs, executeBackfill = false }) {
    let pulledCount = 0
    let skippedCount = 0
    let backfilledCount = 0

    const localNotes = await DatabaseClient.notes.getAll() || []
    const localNoteSet = new Set(
      localNotes.map(note => {
        const localCat = normalizeCategoryForMatch(note.category || '')
        return `${note.title || ''}|${localCat}|${note.kb_guid || ''}`.toLowerCase()
      })
    )
    const localNotesByDocGuid = new Map(
      localNotes
        .filter(note => note.doc_guid)
        .map(note => [note.doc_guid, note])
    )

    console.log(`[SyncService] Loaded ${localNoteSet.size} local notes for dedup check`)

    for (const doc of docs) {
      const docGuid = doc.docGuid || doc.guid
      if (!docGuid) continue

      const existingLocalNote = localNotesByDocGuid.get(docGuid)
      if (existingLocalNote && !existingLocalNote.doc_guid?.startsWith('local_')) {
        const existingContent = typeof existingLocalNote.content === 'string' ? existingLocalNote.content.trim() : ''
        if (!existingContent) {
          if (executeBackfill) {
            try {
              const updated = await this._downloadAndUpdateEmptyNote(existingLocalNote, doc, kbGuid, docGuid)
              if (updated) {
                backfilledCount++
                localNotesByDocGuid.set(docGuid, updated)
              }
            } catch (e) {
              console.warn(`[SyncService] Failed to backfill empty note ${docGuid}:`, e.message)
            }
          } else {
            backfilledCount++
          }
        }
        skippedCount++
        continue
      }

      const cloudCategory = normalizeCategoryForMatch(doc.category || '')
      const dedupeKey = `${doc.title || 'Untitled'}|${cloudCategory}|${kbGuid}`.toLowerCase()

      if (localNoteSet.has(dedupeKey)) {
        skippedCount++
        continue
      }

      if (executeBackfill) {
        try {
          const result = await this._downloadAndCreateNote(doc, kbGuid, docGuid)

          if (result) {
            pulledCount++
            console.log(`[SyncService] ↓ Pulled NEW note: "${doc.title}" (${docGuid}) id=${result.id}`)
            localNoteSet.add(dedupeKey)
            localNotesByDocGuid.set(docGuid, result)
          }
        } catch (e) {
          console.warn(`[SyncService] Failed to download note ${docGuid}:`, e.message)
        }
      } else {
        pulledCount++
      }
    }

    return {
      total: docs.length,
      pulled: pulledCount,
      skipped: skippedCount,
      backfilled: backfilledCount
    }
  }

  /**
   * 从云端拉取本地不存在的笔记（不覆盖已有内容）
   * - 获取云端所有笔记列表
   * - 只下载本地 SQLite 中不存在的笔记
   * - 如果 title + category + kbGuid 都相同，直接跳过（永不覆盖本地）
   */
  async pullFromCloud() {
    try {
      const kbGuid = getKbGuid()
      if (!kbGuid || kbGuid === 'null') {
        console.warn('[SyncService] pullFromCloud skipped: no kbGuid')
        return { count: 0, skipped: 0, backfilled: 0 }
      }

      const docs = await this._fetchAllCloudDocs(kbGuid)
      const stats = await this._buildRestorePreviewStats({
        kbGuid,
        docs,
        executeBackfill: true
      })

      console.log(`[SyncService] ✅ pullFromCloud completed: ${stats.pulled} pulled, ${stats.skipped} skipped (already exist locally), ${stats.backfilled} backfilled`)
      return { count: stats.pulled, skipped: stats.skipped, backfilled: stats.backfilled, total: stats.total }
    } catch (error) {
      console.error('[SyncService] pullFromCloud failed:', error)
      return { count: 0, skipped: 0, backfilled: 0, total: 0 }
    }
  }

  async downloadCloudNoteMarkdown(kbGuid, docGuid) {
    const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({
      kbGuid,
      docGuid,
      data: {
        downloadInfo: 1,
        downloadData: 1
      }
    })

    const info = content?.info || null
    const rawHtml = typeof content?.html === 'string' ? content.html : ''
    const infoHtml = typeof info?.html === 'string' ? info.html : ''
    const resources = content?.resources || info?.resources || []

    let markdownContent = ''
    let html = rawHtml || infoHtml

    if (rawHtml) {
      markdownContent = helper.convertHtml2Markdown(rawHtml, kbGuid, docGuid, resources)
    } else if (infoHtml) {
      markdownContent = helper.extractMarkdownFromMDNote(infoHtml, kbGuid, docGuid, resources)
    }

    return {
      markdownContent,
      content,
      info,
      resources,
      html
    }
  }

  async _downloadAndUpdateEmptyNote(localNote, doc, kbGuid, docGuid) {
    const { markdownContent, content, html } = await this.downloadCloudNoteMarkdown(kbGuid, docGuid)
    const normalizedTitle = normalizeNbsp(doc.title) || localNote.title
    const normalizedMarkdown = normalizeNbsp(markdownContent)

    if (!normalizedMarkdown) {
      console.warn('[SyncService] Skip backfill because downloaded content is still empty:', {
        title: doc.title,
        docGuid,
        localNoteId: localNote?.id,
        htmlLength: html.length,
        hasInfo: !!content?.info,
        hasResources: Array.isArray(content?.resources) ? content.resources.length : 0
      })
      return null
    }

    const serverModified = doc.dataModified || doc.data_modified || Date.now()
    const updated = await DatabaseClient.notes.update(localNote.id, {
      title: normalizedTitle,
      content: normalizedMarkdown,
      category: doc.category || localNote.category,
      tags: doc.tags || localNote.tags || '',
      kb_guid: kbGuid,
      server_modified: serverModified
    }, { isSystemUpdate: true })

    if (updated) {
      console.log(`[SyncService] ♻️ Backfilled empty local note: "${doc.title}" (${docGuid}) id=${updated.id}, md_len=${markdownContent.length}`)
    }

    return updated
  }

  /**
   * 从云端下载并创建新笔记到本地
   */
  async _downloadAndCreateNote(doc, kbGuid, docGuid) {
    const { markdownContent, content, html } = await this.downloadCloudNoteMarkdown(kbGuid, docGuid)
    const normalizedTitle = normalizeNbsp(doc.title)
    const normalizedMarkdown = normalizeNbsp(markdownContent)
    const serverModified = doc.dataModified || doc.data_modified || Date.now()

    let cloudCategory = doc.category

    if (!cloudCategory || cloudCategory === '/' || cloudCategory.trim() === '' || cloudCategory === '/My Notes' || cloudCategory === '/My Notes/') {
      console.warn(`[SyncService] ⚠️ Note "${doc.title}" has empty/root category (raw: "${cloudCategory}"), using "${OFFLINE_ROOT_CATEGORY}" as default`)
      cloudCategory = OFFLINE_ROOT_CATEGORY
    } else {
      if (!cloudCategory.startsWith('/')) {
        cloudCategory = '/' + cloudCategory
      }
      if (!cloudCategory.endsWith('/')) {
        cloudCategory = cloudCategory + '/'
      }
    }

    console.log(`[SyncService] ↓ Downloading: "${doc.title}" → category="${cloudCategory}" (original: "${doc.category}"), html_len=${html.length}, md_len=${normalizedMarkdown.length}`)

    const note = await DatabaseClient.notes.create({
      doc_guid: docGuid,
      kb_guid: kbGuid,
      title: normalizedTitle,
      content: normalizedMarkdown,
      category: cloudCategory,
      tags: doc.tags || '',
      data_created: doc.dataCreated || doc.data_created,
      data_modified: serverModified,
      server_modified: serverModified,
      local_modified: serverModified
    })

    if (note && note.id && docGuid) {
      try {
        await DatabaseClient.sync.createGuidMapping(note.id, docGuid, 'wiznote')
      } catch (e) {
        console.warn('[SyncService] GUID mapping failed (non-critical):', e.message)
      }
    }

    if (!normalizedMarkdown) {
      console.warn('[SyncService] Downloaded note has empty markdown content:', {
        title: doc.title,
        docGuid,
        category: cloudCategory,
        htmlLength: html.length,
        hasInfo: !!content?.info,
        hasResources: Array.isArray(content?.resources) ? content.resources.length : 0
      })
    }

    return note
  }

  /**
   * 上传本地变更到云端（纯本地优先架构）
   * - 遍历当前账号所有 dirty=1 的笔记（按 kb_guid 过滤，防止跨账号污染）
   * - 直接用本地内容覆盖/创建云端笔记
   * - 不检查冲突、不比较时间戳，永远本地优先
   */
  async pushToCloud() {
    const kbGuid = getKbGuid()
    console.log('[SyncService] pushToCloud start', {
      kbGuid,
      isSyncing: this.isSyncing,
      userId: SessionStorageService.getUserId(),
      accountInfo: SessionStorageService.getAccountInfo()
    })

    if (!kbGuid || kbGuid === 'null') {
      console.warn('[SyncService] pushToCloud skipped: no kbGuid', {
        kbGuid,
        userId: SessionStorageService.getUserId(),
        accountInfo: SessionStorageService.getAccountInfo()
      })
      return { count: 0, errors: 0, reason: 'not_logged_in' }
    }

    const pendingNotes = await DatabaseClient.notes.getPendingByKbGuid(kbGuid)
    console.log(`[SyncService] 📤 pushToCloud: found ${pendingNotes?.length || 0} dirty notes for kbGuid=${kbGuid}`)

    // ✅ 先把本地独有的目录同步到云端（离线创建的文件夹）
    const categorySyncResult = await this.syncLocalCategoriesToCloud(kbGuid)
    console.log('[SyncService] Category sync result before note push', categorySyncResult)

    if (pendingNotes.length === 0) {
      console.log('[SyncService] No dirty notes to sync')
      return { count: 0, errors: 0 }
    }

    let pushedCount = 0
    let errors = 0
    let deleteSyncedCount = 0

    try {
      const deleteLogs = await DatabaseClient.sync.getPendingDeleteLogs()
      for (const logEntry of deleteLogs) {
        const noteId = parseInt(logEntry.note_id, 10)
        const docGuid = logEntry.doc_guid
        const logKbGuid = logEntry.kb_guid || kbGuid

        if (!docGuid || docGuid.startsWith('local_')) {
          continue
        }

        try {
          await api.deleteDoc(docGuid, logKbGuid)
          await DatabaseClient.sync.markSyncLogSynced(logEntry.id)
          deleteSyncedCount++
          console.log(`[SyncService] ✅ Deleted cloud note: ${docGuid} (log=${logEntry.id})`)
        } catch (deleteError) {
          console.error('[SyncService] ❌ Failed to delete cloud note:', {
            logId: logEntry.id,
            noteId,
            docGuid,
            kbGuid: logKbGuid,
            message: deleteError?.message,
            responseStatus: deleteError?.response?.status,
            responseData: deleteError?.response?.data
          })
          errors++
        }
      }

      if (deleteSyncedCount > 0) {
        await DatabaseClient.sync.cleanupSyncedDeleteLogs()
      }
    } catch (logError) {
      console.error('[SyncService] Failed to process pending delete logs:', logError)
      errors++
    }

    for (const note of pendingNotes) {
      console.log(`[SyncService] Processing: id=${note.id}, title=${note.title}, doc_guid=${note.doc_guid || 'none'}`)

      let syncMode = 'unknown'
      let syncStage = 'prepare'
      let cloudDocGuid = null
      let matchedDoc = null

      try {
        // 1. 从 SQLite 获取最新内容（确保使用用户最后编辑的版本）
        const latestNote = await DatabaseClient.notes.getById(note.id)
        if (latestNote) {
          note.content = latestNote.content
          note.title = latestNote.title || note.title
          note.category = latestNote.category || note.category
        }

        let cloudDocGuid = null

        // 2. 判断是否已有云端 GUID（非 local_ 开头）
        const hasCloudGuid = note.doc_guid && !note.doc_guid.startsWith('local_')

        if (hasCloudGuid) {
          // ✅ 已有云端 GUID → 直接更新覆盖
          syncMode = 'update-by-guid'
          syncStage = 'update-cloud'
          cloudDocGuid = note.doc_guid
          console.log(`[SyncService] Updating cloud note: ${cloudDocGuid}`)

          try {
            await api.updateDoc(cloudDocGuid, {
              title: note.title,
              content: note.content,
              category: note.category || OFFLINE_ROOT_CATEGORY,  // ✅ 空 category 用 OFFLINE_ROOT_CATEGORY 而非 /
              tags: note.tags || ''
            }, note.kb_guid || kbGuid)
          } catch (updateError) {
            // 2004 = 云端笔记已被删除（数据不存在）
            // 回退策略：在同名同目录下创建新笔记，而不是让同步失败
            // execRequest 抛出的 Error 结构：error.code = returnCode, error.message = returnMessage
            const isNotFoundError = updateError.code === 2004 ||
              updateError?.message?.includes('2004') ||
              updateError?.message?.includes('不存在') ||
              updateError?.message?.includes('not exist') ||
              updateError?.message?.includes('not found') ||
              updateError?.externCode === 2004

            if (isNotFoundError) {
              console.warn(`[SyncService] ⚠️ Cloud note ${cloudDocGuid} no longer exists (2004), falling back to create-new mode`)
              cloudDocGuid = null
              syncMode = 'create-new'
              syncStage = 'create-cloud'
            } else {
              throw updateError  // 其他错误继续上抛
            }
          }
        }

        if (!cloudDocGuid) {
          // 无云端 GUID 或 local_ 开头，或更新失败（2004）→ 按“同文件夹下是否存在同名文件”决定更新或创建
          if (syncMode !== 'create-new') {
            console.log(`[SyncService] New/offline note, checking cloud category existence...`)

            try {
              syncStage = 'find-same-category-note'
              matchedDoc = await this.findCloudNoteInCategory({
                kbGuid,
                title: note.title,
                category: note.category || OFFLINE_ROOT_CATEGORY
              })

              if (matchedDoc) {
                syncMode = 'update-by-category-title'
                syncStage = 'update-cloud'
                cloudDocGuid = matchedDoc.guid || matchedDoc.docGuid
                console.log(`[SyncService] Found same-category match, updating: ${cloudDocGuid}`)

                try {
                  await api.updateDoc(cloudDocGuid, {
                    title: note.title,
                    content: note.content,
                    category: note.category || OFFLINE_ROOT_CATEGORY,
                    tags: note.tags || ''
                  }, kbGuid)
                } catch (updateError) {
                  // 2004 = 云端笔记已被删除，回退到创建模式
                  // execRequest 抛出的 Error 结构：error.code = returnCode, error.message = returnMessage
                  const isNotFoundError = updateError.code === 2004 ||
                    updateError?.message?.includes('2004') ||
                    updateError?.message?.includes('不存在') ||
                    updateError?.message?.includes('not exist') ||
                    updateError?.message?.includes('not found') ||
                    updateError?.externCode === 2004

                  if (isNotFoundError) {
                    console.warn(`[SyncService] ⚠️ Matched cloud note ${cloudDocGuid} no longer exists (2004), will create new`)
                    cloudDocGuid = null
                    syncMode = 'create-new'
                    syncStage = 'create-cloud'
                  } else {
                    throw updateError
                  }
                }
              }
            } catch (searchError) {
              console.warn('[SyncService] Category existence check failed, will create new:', {
                message: searchError.message,
                title: note.title,
                category: note.category || OFFLINE_ROOT_CATEGORY,
                kbGuid
              })
            }
          }

          if (!cloudDocGuid) {
            syncMode = 'create-new'
            syncStage = 'create-cloud'
            console.log(`[SyncService] Creating new cloud note: ${note.title}`)
            const result = await api.createDoc({
              title: note.title,
              content: note.content,
              category: note.category || OFFLINE_ROOT_CATEGORY,
              tags: note.tags || ''
            }, note.kb_guid || kbGuid)

            if (result?.guid) {
              cloudDocGuid = result.guid
              console.log(`[SyncService] ✅ Created: ${cloudDocGuid}`)
              const cacheKey = `${kbGuid}::${note.category || OFFLINE_ROOT_CATEGORY}`
              const cachedNotes = this._cloudCategoryNotesCache.get(cacheKey)
              if (cachedNotes) {
                cachedNotes.push({
                  guid: cloudDocGuid,
                  docGuid: cloudDocGuid,
                  title: note.title,
                  category: note.category || OFFLINE_ROOT_CATEGORY
                })
              }
            } else {
              throw new Error('createDoc returned no guid')
            }
          }
        }

        // 3. 同步成功 → 更新本地记录（dirty=0）
        syncStage = 'persist-local-sync-state'
        await DatabaseClient.notes.update(note.id, {
          doc_guid: cloudDocGuid,
          kb_guid: note.kb_guid || kbGuid,
          server_modified: Date.now()
        }, { isSystemUpdate: true })

        // 创建 GUID 映射（如果还没有）
        if (note.id && cloudDocGuid) {
          try {
            await DatabaseClient.sync.createGuidMapping(note.id, cloudDocGuid, 'wiznote')
          } catch (e) {
            console.warn('[SyncService] GUID mapping failed (non-critical):', e.message)
          }
        }

        pushedCount++
        console.log(`[SyncService] ✅ Synced: ${note.title} (id=${note.id})`)

      } catch (error) {
        console.error(`[SyncService] ❌ Failed: ${note.title} (id=${note.id})`, {
          mode: syncMode,
          stage: syncStage,
          localDocGuid: note.doc_guid || null,
          cloudDocGuid,
          matchedDocGuid: matchedDoc ? (matchedDoc.guid || matchedDoc.docGuid || null) : null,
          category: note.category || OFFLINE_ROOT_CATEGORY,
          kbGuid: note.kb_guid || kbGuid,
          message: error?.message,
          responseStatus: error?.response?.status,
          responseData: error?.response?.data,
          stack: error?.stack
        })
        errors++
      }
    }

    console.log(`[SyncService] 📊 pushToCloud completed: ${pushedCount} synced, ${deleteSyncedCount} deleted, ${errors} errors`)
    const finalResult = { count: pushedCount, deleted: deleteSyncedCount, errors }
    console.log('[SyncService] pushToCloud final result payload', finalResult)
    return finalResult
  }

  /**
   * 将本地独有的目录同步到云端
   * - 读取 local_only=1 的目录（离线创建的目录）
   * - 按父子顺序（广度优先）依次在云端创建
   * - 创建成功后更新 local_only=0
   * - 幂等：已存在的目录跳过
   */
  async syncLocalCategoriesToCloud(kbGuid) {
    try {
      const localCats = await DatabaseClient.categories.getAll({ kbGuid })
      const unsynced = localCats.filter(c => c.local_only === 1)

      if (unsynced.length === 0) {
        return { synced: 0, skipped: 0 }
      }

      console.log(`[SyncService] syncLocalCategoriesToCloud: ${unsynced.length} local-only categories to sync`)

      // 按路径深度排序（先创建父目录，再创建子目录）
      const sorted = [...unsynced].sort((a, b) => {
        const depthA = (a.category.match(/\//g) || []).length
        const depthB = (b.category.match(/\//g) || []).length
        return depthA - depthB
      })

      let synced = 0
      for (const cat of sorted) {
        try {
          // 构造 API 需要的 parent 和 child
          const parent = cat.parent || OFFLINE_ROOT_CATEGORY
          const child = cat.category
            .replace(parent, '')
            .replace(/^\//, '')
            .replace(/\/$/, '')

          await WizNoteApi.KnowledgeBaseApi.createCategory({
            kbGuid,
            data: {
              parent: parent,
              pos: Math.floor(Date.now() / 1000).toFixed(0),
              child: child
            }
          })

          // 标记为已同步
          await DatabaseClient.categories.syncToCloud({ category: cat.category })
          synced++
          console.log(`[SyncService] ✅ Category synced: ${cat.category}`)
        } catch (err) {
          // 幂等：云端已存在该目录（错误码 400/409），标记为已同步
          if (err?.response?.status === 400 || err?.response?.status === 409 || err?.message?.includes('exists')) {
            await DatabaseClient.categories.syncToCloud({ category: cat.category })
            console.warn(`[SyncService] Category already exists on cloud, marked synced: ${cat.category}`)
            synced++
          } else {
            console.warn(`[SyncService] Failed to sync category ${cat.category}:`, err?.message || err)
          }
        }
      }

      console.log(`[SyncService] syncLocalCategoriesToCloud: ${synced}/${unsynced.length} categories synced`)
      const summary = { synced, total: unsynced.length }
      console.log('[SyncService] syncLocalCategoriesToCloud summary', summary)
      return summary
    } catch (err) {
      console.error('[SyncService] syncLocalCategoriesToCloud error:', {
        message: err?.message,
        stack: err?.stack,
        responseStatus: err?.response?.status,
        responseData: err?.response?.data
      })
      return { synced: 0, total: 0, error: err?.message || String(err) }
    }
  }

  /**
   * 获取同步状态
   */
  async getStatus() {
    const stats = await DatabaseClient.sync.getStats()
    return {
      isSyncing: this.isSyncing,
      ...stats
    }
  }
}

export default new SyncService()
