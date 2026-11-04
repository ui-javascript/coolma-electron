import types from 'src/store/server/types'
import clientTypes from 'src/store/client/types'
import api from 'src/utils/api'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'src/components/common/bus'
import { OFFLINE_ROOT_CATEGORY, OFFLINE_ROOT_CATEGORY_KEY, normalizeCategoryForMatch } from 'src/utils/const/constants'
import { SYNC_STRATEGY, getSyncStrategy, isPureOnline } from 'src/utils/const/syncStrategy'
import SessionStorageService from 'src/services/SessionStorageService'
import { DEFAULT_CALENDAR_DATE_BASIS } from 'src/utils/enum'
import { APP_STATE_KEYS, loadWorkspaceState, saveWorkspaceStateValue } from 'src/store/server/workspaceState'
import path from 'path'
import {
  buildCategoryTreeFromNotes,
  categoryExistsInTree,
  findCategoryNode,
  removeCategoryNode,
  formatYmd,
  getCalendarNoteTimestamp,
  mapLocalNoteToSummary
} from 'src/store/server/noteTree'
import {
  ensureUniqueNoteTitleInCategory,
  generateUniqueNoteTitleInCategory
} from 'src/store/server/noteUniquenessService'

function mergeCategoryCollections ({ localCategories = [], remoteCategories = [], localNotes = [], remoteCategoryPos = {} }) {
  const normalizedMap = new Map()

  const appendCategory = (rawCategory, source = {}, options = {}) => {
    const shouldNormalizeRoot = options.normalizeRoot !== false
    const category = shouldNormalizeRoot ? normalizeCategoryForMatch(rawCategory) : rawCategory
    if (!category || category === '/') return

    const defaultParent = shouldNormalizeRoot ? OFFLINE_ROOT_CATEGORY : (source.parent || '/')
    const existing = normalizedMap.get(category) || {
      category,
      parent: source.parent || defaultParent,
      kbGuid: source.kbGuid || source.kb_guid || '',
      local_only: source.local_only || 0
    }

    normalizedMap.set(category, {
      ...existing,
      ...source,
      category,
      parent: source.parent || existing.parent || defaultParent,
      kbGuid: source.kbGuid ?? source.kb_guid ?? existing.kbGuid ?? '',
      local_only: source.local_only ?? existing.local_only ?? 0
    })
  }

  for (const category of localCategories) {
    appendCategory(category?.category, category)
  }

  for (const note of localNotes) {
    appendCategory(note?.category, {
      parent: OFFLINE_ROOT_CATEGORY,
      kbGuid: note?.kb_guid || '',
      local_only: 1
    })
  }

  for (const category of remoteCategories) {
    appendCategory(category?.category, category, { normalizeRoot: false })
  }

  const mergedCategories = Array.from(normalizedMap.values())
  const tree = remoteCategories.length > 0
    ? buildCategoryTreeFromNotes([], mergedCategories)
    : buildCategoryTreeFromNotes(localNotes, mergedCategories)

  return {
    categories: mergedCategories,
    tree,
    pos: remoteCategoryPos || {}
  }
}

/**
 * 拉取并规范化云端文件夹列表（不含本地合并）。
 * 用于在线优先 / 纯在线策略的「云端优先」目录树路径。
 */
async function fetchRemoteCategories (kbGuid) {
  const res = await api.KnowledgeBaseApi.getCategories({ kbGuid })
  const rawRemoteCategories = Array.isArray(res?.result)
    ? res.result
    : Array.isArray(res)
      ? res
      : Array.isArray(res?.categories)
        ? res.categories
        : []
  const remoteCategories = rawRemoteCategories
    .map(item => {
      if (typeof item === 'string') {
        const category = item
        const trimmed = category.replace(/\/$/, '')
        const lastSlashIndex = trimmed.lastIndexOf('/')
        const parent = lastSlashIndex > 0
          ? `${trimmed.slice(0, lastSlashIndex + 1)}`
          : '/'
        return {
          category,
          parent: parent === category ? '/' : parent,
          kbGuid: kbGuid || ''
        }
      }

      const category = item?.category || item?.name || item?.path || item?.categoryName || ''
      const trimmed = category.replace(/\/$/, '')
      const inferredParent = trimmed && trimmed !== '/My Notes'
        ? `${trimmed.slice(0, trimmed.lastIndexOf('/') + 1)}`
        : '/'

      return {
        ...item,
        category,
        parent: item?.parent || item?.parentCategory || item?.parentPath || inferredParent || '/',
        kbGuid: item?.kbGuid || item?.kb_guid || item?.bizGuid || kbGuid || ''
      }
    })
    .filter(item => !!item.category)

  return {
    remoteCategories,
    pos: res?.pos || res?.resultPos || {}
  }
}

import {
  createLocalDraftNote,
  upsertLocalNoteByDocGuid
} from 'src/store/server/notePersistenceService'
import {
  getOfflineCalendarDates,
  getOfflineCalendarNotes,
  getOfflineNotesByCategory,
  getOfflineTagNotes,
  getOfflineTagsWithCounts,
  loadLocalWorkspaceData
} from 'src/store/server/localDataService'
import {
  getNoteTagList,
  migrateOfflineTagsToCloud,
  parseLocalTagId
} from 'src/store/server/localSyncMigration'

/** @deprecated 请从 src/utils/const/constants 导入，保持单点定义 */
export { OFFLINE_ROOT_CATEGORY_KEY } from 'src/utils/const/constants'
/** @deprecated 请从 src/utils/const/constants 导入，保持单点定义 */
export { OFFLINE_ROOT_CATEGORY } from 'src/utils/const/constants'

import { Dark, Dialog, Loading, Notify, QSpinnerGears } from 'quasar'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import _ from 'lodash'
import {
  exportFile,
  exportMarkdownFile,
  exportMarkdownFiles,
  exportPng,
  saveTempImage,
  uploadImages,
  startBlogDeploy,
  cancelBlogDeploy,
  getBlogDeployConfig
} from 'src/ApiInvoker'
import html2canvas from 'html2canvas'
import debugLogger from 'src/utils/debugLogger'
import BlogDeployService from 'src/services/BlogDeployService'

function getDefaultCategoryForMode (state, category = '') {
  if (state?.isLogin && state?.kbGuid) {
    if (!category || category === OFFLINE_ROOT_CATEGORY) return ''
    return category
  }
  return category || OFFLINE_ROOT_CATEGORY
}

function getSixDaoFolderDepth (category = '') {
  const normalized = normalizeCategoryForMatch(category)
  if (!normalized) return 1
  const segments = normalized.split('/').filter(Boolean)
  return Math.max(1, segments.length)
}

function isCurrentCategoryAffected (currentCategory, categories = []) {
  const normalizedCurrent = normalizeCategoryForMatch(currentCategory)
  return categories
    .map(category => normalizeCategoryForMatch(category))
    .includes(normalizedCurrent)
}

/**
 * 从云端 / 本地缓存获取笔记内容（不查 SQLite）。
 * 用于纯在线 / 在线优先策略的「云端优先」读取路径。
 */
async function fetchCloudNoteContentRaw (kbGuid, docGuid) {
  const { info } = await api.KnowledgeBaseApi.getNoteContent({
    kbGuid,
    docGuid,
    data: {
      downloadInfo: 1
    }
  })
  const cacheKey = api.KnowledgeBaseApi.getCacheKey(kbGuid, docGuid)
  const note = ClientFileStorage.getCachedNote(info, cacheKey)
  let result
  if (note) {
    console.log(`[fetchCloudNoteContentRaw] Using cached note (cacheKey=${cacheKey.substring(0, 50)}...)`)
    result = note
  } else {
    result = await api.KnowledgeBaseApi.getNoteContent({
      kbGuid,
      docGuid,
      data: {
        downloadInfo: 1,
        downloadData: 1
      }
    })
    ClientFileStorage.setCachedNote(result, cacheKey)
    console.log('[fetchCloudNoteContentRaw] Fetched from cloud and cached')
  }
  return result
}

/**
 * 把一篇笔记内容直接推送 / 更新到云端（单篇）。
 * - 已有云端 docGuid（非 local_ 开头）→ updateNote
 * - 否则 → createNote，返回新生成的云端 guid
 */
async function pushNoteContentToCloud ({ kbGuid, docGuid, title, category, content, tags = '', resources = [] }) {
  const isLite = (category || '').replace(/\//g, '') === 'Lite'
  const html = helper.embedMDNote(content || '', resources, {
    wrapWithPreTag: isLite,
    kbGuid,
    docGuid
  })

  if (docGuid && !docGuid.startsWith('local_')) {
    await api.KnowledgeBaseApi.updateNote({
      kbGuid,
      docGuid,
      data: {
        html,
        title,
        kbGuid,
        docGuid,
        resources,
        type: isLite ? 'lite/markdown' : 'document',
        tags,
        category: category || OFFLINE_ROOT_CATEGORY
      }
    })
    return docGuid
  }

  const result = await api.KnowledgeBaseApi.createNote({
    kbGuid,
    data: {
      category: category || OFFLINE_ROOT_CATEGORY,
      kbGuid,
      title: title || 'Untitled',
      owner: SessionStorageService.getUserId() || '',
      html,
      type: isLite ? 'lite/markdown' : 'document',
      tags
    }
  })
  return result?.guid || result?.docGuid || null
}

export async function _getContent (kbGuid, docGuid) {
  
  // ✅ 关键改进：先检查 SQLite 是否有本地修改版本（比缓存更新）
  try {
      const localNote = await DatabaseClient.notes.getByDocGuidWithPriority(docGuid)
    if (localNote && localNote.content !== null && localNote.content !== undefined) {
      const localMod = parseInt(localNote.local_modified) || 0
      console.log(`[_getContent] Found in SQLite: id=${localNote.id}, local_mod=${localMod}, dirty=${localNote.dirty}, content_len=${(localNote.content || '').length}`)
      
      // 直接返回 SQLite 数据（本地优先），跳过云端和缓存
      return {
        _isRawMarkdown: true,
        info: { 
          docGuid: localNote.doc_guid || docGuid, 
          kbGuid, 
          title: localNote.title, 
          category: localNote.category || OFFLINE_ROOT_CATEGORY, 
          dataCreated: localNote.data_created, 
          dataModified: localMod || Date.now()
        },
        html: localNote.content,
        resources: []
      }
    }
  } catch (sqliteError) {
    console.warn(`[_content] SQLite check failed (will fallback to cloud/cache):`, sqliteError.message)
  }
  
  // 原有逻辑：从云端/缓存获取
  return fetchCloudNoteContentRaw(kbGuid, docGuid)
}

function buildLocalNoteResult (localNote, docGuid, kbGuid, source = 'sqlite') {
  const content = typeof localNote.content === 'string' ? localNote.content : ''
  return {
    _isRawMarkdown: true,
    _loadTimestamp: Date.now(),
    _source: source,
    info: {
      docGuid: localNote.doc_guid || docGuid,
      kbGuid: kbGuid || '',
      title: localNote.title || 'Untitled',
      category: localNote.category || OFFLINE_ROOT_CATEGORY,
      dataCreated: localNote.data_created || Date.now(),
      dataModified: parseInt(localNote.local_modified) || parseInt(localNote.data_modified) || Date.now()
    },
    html: content,
    resources: []
  }
}

function buildEmptyNoteResult (docGuid, kbGuid, title = 'Untitled', source = 'empty-fallback') {
  return {
    _isRawMarkdown: true,
    _loadTimestamp: Date.now(),
    _source: source,
    info: {
      docGuid,
      kbGuid: kbGuid || '',
      title,
      category: OFFLINE_ROOT_CATEGORY,
      dataCreated: Date.now(),
      dataModified: Date.now()
    },
    html: '',
    resources: []
  }
}

async function saveCloudContentToSqlite (kbGuid, docGuid, result) {
  if (!result || !result.html) return
  // 已存在本地记录时不覆盖（在线优先下以云端为准展示，本地可能是未同步的离线编辑）
  const existing = await DatabaseClient.notes.getByDocGuid(docGuid)
  if (existing) return
  const markdown = helper.extractMarkdownFromMDNote(
    result.html,
    kbGuid,
    docGuid,
    result.resources || []
  )
  await DatabaseClient.notes.create({
    doc_guid: docGuid,
    kb_guid: kbGuid,
    title: result.info?.title || 'Untitled',
    content: markdown,
    category: result.info?.category || OFFLINE_ROOT_CATEGORY,
    data_created: result.info?.dataCreated,
    data_modified: result.info?.dataModified,
    server_modified: Date.now(),
    local_modified: Date.now()
  })
}

/**
 * 把一篇笔记写入本地 SQLite（存在则更新，不存在则创建）。
 * 离线优先策略中此步骤必须 await 成功；在线优先策略中此步骤异步执行。
 */
async function persistNoteToSqlite ({ docGuid, title, content, category, tags = '', now = Date.now() }) {
  const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
  if (localNote) {
    return DatabaseClient.notes.update(localNote.id, {
      title,
      content,
      category,
      tags: tags || '',
      local_modified: now
    })
  }
  return DatabaseClient.notes.create({
    doc_guid: docGuid,
    title,
    content,
    category,
    tags: tags || '',
    data_created: now,
    data_modified: now,
    local_modified: now
  })
}

/**
 * 在线优先策略：云端已保存后异步落 SQLite。
 * 若云端返回了新 guid（新笔记创建成功），先把本地 local_ 记录迁移到云端 guid，
 * 避免后续保存重复创建云端笔记。
 */
async function persistSyncedNoteToSqlite ({ oldDocGuid, newDocGuid, kbGuid, title, content, category, tags = '', now = Date.now() }) {
  if (newDocGuid && oldDocGuid && oldDocGuid !== newDocGuid) {
    const localNote = await DatabaseClient.notes.getByDocGuid(oldDocGuid)
    if (localNote) {
      return DatabaseClient.notes.update(localNote.id, {
        doc_guid: newDocGuid,
        kb_guid: kbGuid,
        title,
        content,
        category,
        tags: tags || '',
        server_modified: now,
        local_modified: now
      })
    }
  }
  return persistNoteToSqlite({ docGuid: newDocGuid || oldDocGuid, title, content, category, tags, now })
}

function readFileAsync (f) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = event => {
      const base64 = event.target.result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(f)
  })
}

/** 防抖刷新所有标签的笔记数量（500ms 间隔） */
let _debouncedRefreshTagCounts = null

function getDebouncedRefreshTagCounts () {
  if (!_debouncedRefreshTagCounts) {
    _debouncedRefreshTagCounts = _.debounce(async function (store) {
      const { kbGuid, tags } = store.state
      if (!kbGuid || !tags || !tags.length) return
      const countMap = {}
      await Promise.all(
        tags.map(async tag => {
          try {
            const count = await api.KnowledgeBaseApi.getTagNoteCount({
              kbGuid,
              data: { tag: tag.tagGuid }
            })
            countMap[tag.tagGuid] = count
          } catch (err) {
            countMap[tag.tagGuid] = 0
          }
        })
      )
      store.commit(types.UPDATE_TAG_NOTES_COUNT, countMap)
    }, 500)
  }
  return _debouncedRefreshTagCounts
}

function mergeLocalAndCloudNotes (localNotes = [], cloudNotes = []) {
  const result = new Map()

  // 先加入本地笔记（本地优先）
  for (const local of localNotes) {
    // ✅ 关键：使用 docGuid 作为唯一 key（本地和云端统一）
    const key = local.docGuid || local.title || ''
    if (!key) continue
    result.set(key, {
      ...local,
      _preferLocal: true,
      _localDirty: local._dirty
    })
  }

  // 再加入云端笔记（覆盖非 dirty 的本地笔记）
  for (const cloud of cloudNotes) {
    const cloudGuid = cloud.docGuid || cloud.guid || ''

    if (cloudGuid && result.has(cloudGuid)) {
      const existing = result.get(cloudGuid)
      // 如果本地有 dirty 笔记 → 保留本地版本
      if (existing._localDirty) {
        console.log(`[mergeLocalAndCloudNotes] Keeping local dirty note: ${existing.title}`)
        continue
      }
    }

    // 云端笔记 或 本地无 dirty 标记 → 使用云端数据
    result.set(cloudGuid || cloud.title, {
      docGuid: cloudGuid || cloud.title,
      guid: cloudGuid || cloud.title,
      title: cloud.title || 'Untitled',
      abstractText: cloud.abstract || cloud.abstractText || '',
      category: cloud.category || cloud.categoryPath || '',
      dataCreated: cloud.dataCreated || cloud.data_created || Date.now(),
      dataModified: cloud.dataModified || cloud.data_modified || Date.now(),
      _preferLocal: false,
      _source: 'cloud'
    })
  }

  return Array.from(result.values())
}

export default {
  /**
   * 从本地缓存中读取数据，初始化状态树
   * @param commit
   * @param state
   */
  async initServerStore ({
    commit,
    state,
    dispatch,
    rootState
  }) {
    const localStore = ClientFileStorage.getItemsFromStore(state)
    commit(types.INIT, localStore)
    const [
      autoLogin,
      userId,
      password,
      url
    ] = ClientFileStorage.getItemsFromStore([
      'autoLogin',
      'userId',
      'password',
      'url'
    ])

    const strategy = getSyncStrategy(rootState)

    // 纯在线：不读 SQLite，全部依赖在线。
    if (strategy === SYNC_STRATEGY.PURE_ONLINE) {
      if (!autoLogin) return
      try {
        await dispatch('login', { userId, password, url })
      } catch (err) {
        console.error('[initServerStore] pureOnline login failed:', err)
      }
      return
    }

    // 在线优先：先登录并等接口返回目录树 / 笔记列表，再取消 loading；SQLite 同步异步。
    if (strategy === SYNC_STRATEGY.ONLINE_FIRST) {
      if (autoLogin) {
        try {
          await dispatch('login', { userId, password, url })
        } catch (err) {
          console.error('[initServerStore] onlineFirst login failed, fallback to local:', err)
          await dispatch('loadLocalData')
        }
      } else {
        // 未开启自动登录：仍用本地数据兜底渲染
        await dispatch('loadLocalData')
      }
      return
    }

    // 离线优先（默认）：先用 SQLite 把目录树 / 笔记列表 / 标签渲染出来，不等任何网络请求。
    // 这样无论是否自动登录，界面都能立刻可用。
    await dispatch('loadLocalData')

    if (!autoLogin) return

    // 云端异步刷新：接口返回后再覆盖更新目录树与列表；失败时保留本地数据。
    dispatch('login', {
      userId,
      password,
      url
    }).catch(err => {
      console.error('[initServerStore] background login failed, keeping local data:', err)
    })
  },
  /**
   * 统一加载本地数据（未登录时从 SQLite 加载，已登录时也通过 getCategoryNotes 加载）
   * 统一使用 currentNotes 和 categories，不再区分 online/offline 数据源
   */
  async loadLocalData ({ commit, state, rootState }) {
    try {
      const workspaceState = await loadWorkspaceState()
      const {
        notes: localNotes,
        categories: localCategories,
        tree
      } = await loadLocalWorkspaceData()
      console.log('[loadLocalData] loaded notes:', localNotes.length)
      console.log('[loadLocalData] localCategories:', localCategories)

      const allCategories = [...new Set(localNotes.map(n => n.category).filter(c => c && c !== '/'))]
      console.log('[loadLocalData] unique categories from notes:', allCategories)

      console.log('[loadLocalData] built tree:', JSON.stringify(tree, null, 2))
      commit(types.SET_CATEGORIES, tree)

      // 分类扁平列表也先用本地数据填上（形状与 getAllCategories 合并结果一致），
      // 供新建目录查重 / 分类选择器等使用，不必等云端。
      const localMerged = mergeCategoryCollections({ localCategories, localNotes })
      commit(types.UPDATE_ALL_CATEGORIES, localMerged.categories)

      const savedCurrentCategory = workspaceState[APP_STATE_KEYS.currentCategory] || state.currentCategory || OFFLINE_ROOT_CATEGORY
      const restoredCategory = categoryExistsInTree(tree, savedCurrentCategory)
        ? savedCurrentCategory
        : OFFLINE_ROOT_CATEGORY
      commit(types.UPDATE_CURRENT_CATEGORY, restoredCategory)

      if (rootState?.client && workspaceState[APP_STATE_KEYS.sidebarTreeType]) {
        commit(`client/${clientTypes.TOGGLE_CHANGED}`, {
          key: 'sidebarTreeType',
          value: workspaceState[APP_STATE_KEYS.sidebarTreeType]
        }, { root: true })
      }

      // 笔记列表：直接读 SQLite 填充当前目录（日历视图由 CalendarPanel 自行驱动，跳过）
      if (rootState?.client?.sidebarTreeType !== 'calendar') {
        const categoryNotes = parseLocalTagId(restoredCategory)
          ? await getOfflineTagNotes(restoredCategory)
          : await getOfflineNotesByCategory(restoredCategory)
        commit(types.UPDATE_CURRENT_NOTES, categoryNotes)
      }

      // 标签树：本地有标签就先显示（登录后 getAllTags 会用云端结果覆盖）
      try {
        const { tags: localTags, countMap } = await getOfflineTagsWithCounts(state.currentNote?.info?.docGuid)
        if (Array.isArray(localTags) && localTags.length > 0) {
          commit(types.UPDATE_ALL_TAGS, localTags)
          commit(types.UPDATE_TAG_NOTES_COUNT, countMap)
        }
      } catch (tagErr) {
        console.warn('[loadLocalData] local tags load failed:', tagErr)
      }

      return localNotes || []
    } catch (err) {
      console.error('[loadLocalData] failed:', err)
      return []
    }
  },
  /**
   * 同步策略切换后立刻按新策略重载工作区（无需重启）。
   * 由 client/setCloudSyncStrategy 在写入新策略后触发。
   */
  async applySyncStrategy ({ commit, state, dispatch, rootState }) {
    const next = getSyncStrategy(rootState)

    if (next === SYNC_STRATEGY.PURE_ONLINE) {
      if (state.isLogin && state.kbGuid) {
        await dispatch('getAllCategories')
        await dispatch('getCategoryNotes', { category: state.currentCategory || '' })
      } else {
        commit(types.SET_CATEGORIES, [])
        commit(types.UPDATE_ALL_CATEGORIES, [])
        commit(types.UPDATE_CURRENT_NOTES, [])
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
      }
      return
    }

    if (next === SYNC_STRATEGY.ONLINE_FIRST) {
      if (state.isLogin && state.kbGuid) {
        await dispatch('getAllCategories')
        await dispatch('getCategoryNotes', { category: state.currentCategory || '' })
      } else {
        await dispatch('loadLocalData')
      }
      return
    }

    // 离线优先（默认）：本地先渲染，云端异步合并
    await dispatch('loadLocalData')
    if (state.isLogin && state.kbGuid) {
      dispatch('getAllCategories').catch(err => console.warn('[applySyncStrategy] getAllCategories failed:', err))
      dispatch('getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY }).catch(err => console.warn('[applySyncStrategy] getCategoryNotes failed:', err))
    }
  },
  async getContent (payload, {
    kbGuid,
    docGuid
  }) {
    return await _getContent(kbGuid, docGuid)
  },
  /**
   * 用户登录接口
   * @param commit
   * @param rootState
   * @param payload
   * @returns {Promise<*>}
   */
  async login ({
    commit,
    rootState,
    state,
    dispatch
  }, payload) {
    const { url } = payload
    api.AccountServerApi.setBaseUrl(url)
    const {
      userId,
      password
    } = payload
    const result = await api.AccountServerApi.Login(payload)

    if (rootState.client.rememberPassword) {
      ClientFileStorage.setItemsInStore({
        userId,
        password,
        url
      })
    } else {
      if (ClientFileStorage.isKeyExistInStore('password')) {
        ClientFileStorage.removeItemFromStore('password')
      }
      ClientFileStorage.setItemsInStore({
        userId,
        url
      })
    }
    if (
      !rootState.client.enableSelfHostServer &&
      ClientFileStorage.isKeyExistInStore('url')
    ) {
      ClientFileStorage.removeItemFromStore('url')
    }

    const shouldShowCategoryTree = rootState.client.paneLayoutMode !== 2 || rootState.client.categoryTreeVisible !== false
    if (shouldShowCategoryTree && rootState.client.sidebarTreeType !== 'calendar') {
      commit(`client/${clientTypes.UPDATE_STATES}`, {
        paneLayoutMode: 0,
        noteListVisible: true,
        categoryTreeVisible: true,
        sidebarTreeType: 'category'
      }, { root: true })
    }

    commit(types.LOGIN, {
      ...result,
      isLogin: true
    })

    // ✅ 永远本地优先：不禁用任何本地笔记
    // 登录时将 kb_guid=null 的离线笔记和文件夹迁移到当前账号，下次同步时推送到云端
    // （纯在线策略无需迁移 SQLite，跳过）
    const newKbGuid = result.kbGuid
    if (newKbGuid && !isPureOnline(rootState)) {
      try {
        const migratedNotes = await DatabaseClient.notes.migrateOffline(newKbGuid)
        if (migratedNotes > 0) {
          console.log(`[login] Migrated ${migratedNotes} offline notes to kbGuid=${newKbGuid}`)
        }
        // 同步迁移离线文件夹（kb_guid='' → current kbGuid）
        await DatabaseClient.categories.migrateOffline(newKbGuid)
        console.log(`[login] Migrated offline categories to kbGuid=${newKbGuid}`)

        const migratedTags = await migrateOfflineTagsToCloud(newKbGuid)
        console.log('[login] Migrated offline tags to cloud:', migratedTags)
      } catch (err) {
        console.warn('[login] Failed to migrate offline data:', err)
      }
    }

    // 检查是否有离线笔记需要同步（local_ 开头的 doc_guid）
    if (!isPureOnline(rootState)) {
      try {
        const pendingNotes = await DatabaseClient.notes.getAll({ dirty: 1 })
        const offlineNotes = pendingNotes.filter(n => n.doc_guid && n.doc_guid.startsWith('local_'))
        if (offlineNotes.length > 0) {
          console.log('[login] Found', offlineNotes.length, 'offline notes to sync')
          bus.$emit('showOfflineSyncPrompt', offlineNotes)
        }
      } catch (err) {
        console.warn('[login] Failed to check offline notes:', err)
      }
    }

    await this.dispatch('server/getAllTags')
    await this.dispatch('server/getAllCategories')

    const nextCategory = getDefaultCategoryForMode(state, state.currentCategory)
    if (state.currentCategory) {
      await dispatch('updateCurrentCategory', {
        data: nextCategory,
        type: 'category'
      })
    } else {
      await this.dispatch('server/getCategoryNotes', { category: nextCategory })
    }

    return result
  },
  /**
   * 登出（永远本地优先：不清除任何本地 SQLite 数据）
   * - 保留所有本地笔记，下次登录时自动关联到新账号
   * - 切换账号 = 改变同步目标，笔记留在本地
   */
  async logout ({ commit, state, dispatch, rootState }) {
    // 保存退出前的状态，避免 commit(LOGOUT) 后读取到被清空的数据
    const oldKbGuid = state.kbGuid
    const previousCategory = state.currentCategory
    const wasTagSelection = !!(state.currentCategory && state.tags?.map(t => t.tagGuid).includes(state.currentCategory))
    const pureOnline = isPureOnline(rootState)

    await api.AccountServerApi.Logout()

    // 纯在线策略不维护 SQLite，跳过本地数据迁移 / 清理
    if (!pureOnline && oldKbGuid) {
      await DatabaseClient.notes.clearByKbGuid(oldKbGuid)
      const accountCategories = await DatabaseClient.categories.getAll({ kbGuid: oldKbGuid })
      const uniqueCategories = new Map()
      for (const category of (accountCategories || [])) {
        if (!category?.category) continue
        uniqueCategories.set(category.category, category)
      }

      for (const category of uniqueCategories.values()) {
        await DatabaseClient.categories.create({
          category: category.category,
          parent: category.parent,
          kbGuid: '',
          localOnly: category.local_only === 1
        })
      }
    }

    SessionStorageService.clearSession()
    commit(types.LOGOUT)

    if (pureOnline) {
      // 纯在线登出：清空界面数据（不读 SQLite）
      commit(types.SET_CATEGORIES, [])
      commit(types.UPDATE_ALL_CATEGORIES, [])
      commit(types.UPDATE_CURRENT_NOTES, [])
      commit(types.UPDATE_ALL_TAGS, [])
      commit(types.UPDATE_CATEGORIES_POS, {})
      return
    }

    await dispatch('loadLocalData')
    await dispatch('getAllTags')
    await dispatch('getAllCategories')
    commit(types.UPDATE_CATEGORIES_POS, {})

    const nextCategory = wasTagSelection
      ? OFFLINE_ROOT_CATEGORY
      : getDefaultCategoryForMode({ isLogin: false, kbGuid: '' }, previousCategory)
    await dispatch('updateCurrentCategory', { data: nextCategory, type: 'category' })
  },
  /**
   * 重新登录
   * @param commit
   * @returns {Promise<void>}
   */
  async reLogin ({ commit, dispatch, state, rootState }) {
    const [userId, password, url] = ClientFileStorage.getItemsFromStore([
      'userId',
      'password',
      'url'
    ])
    const previousCategory = state.currentCategory
    const previousSidebarTreeType = state.currentCategory && state.tags?.map(t => t.tagGuid).includes(state.currentCategory)
      ? 'tag'
      : 'category'
    const result = await api.AccountServerApi.Login({
      userId,
      password,
      url
    })

    commit(types.LOGIN, {
      ...result,
      isLogin: true
    })

    if (result.kbGuid && !isPureOnline(rootState)) {
      try {
        const migratedNotes = await DatabaseClient.notes.migrateOffline(result.kbGuid)
        if (migratedNotes > 0) {
          console.log(`[reLogin] Migrated ${migratedNotes} offline notes to kbGuid=${result.kbGuid}`)
        }
        await DatabaseClient.categories.migrateOffline(result.kbGuid)
        console.log(`[reLogin] Migrated offline categories to kbGuid=${result.kbGuid}`)

        const migratedTags = await migrateOfflineTagsToCloud(result.kbGuid)
        console.log('[reLogin] Migrated offline tags to cloud:', migratedTags)
      } catch (err) {
        console.warn('[reLogin] Failed to migrate offline data:', err)
      }
    }

    await dispatch('getAllTags')
    await dispatch('getAllCategories')

    const nextCategory = getDefaultCategoryForMode({ isLogin: true, kbGuid: result.kbGuid }, previousCategory)
    await dispatch('updateCurrentCategory', {
      data: nextCategory,
      type: previousSidebarTreeType
    })
  },
  /**
   * 获取指定文件夹下的笔记
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  /**
   * 日历模式：用官方 list/category 按修改时间倒序分页，按 dataModified 落在所选本地自然日的笔记写入列表。
   * （公开文档无单独「按日」接口，此为等效查询方式。）
   */
  async fetchNotesByCalendarDate ({
    commit,
    state,
    rootState
  }, payload = {}) {
    const { kbGuid, isLogin } = state
    const basis = rootState.client.calendarDateBasis === 'created' ? 'created' : DEFAULT_CALENDAR_DATE_BASIS
    let ymd = payload.date || rootState.client.calendarSelectedDate
    if (helper.isNullOrEmpty(ymd)) {
      const n = new Date()
      ymd = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    }
    const parts = ymd.split('-').map(p => parseInt(p, 10))
    const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime()
    const dayEnd = new Date(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0).getTime()
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)

    if (!isLogin || !kbGuid) {
      try {
        const collected = await getOfflineCalendarNotes({ basis, dayStart, dayEnd })
        commit(types.UPDATE_CURRENT_NOTES, collected)
      } catch (err) {
        console.error('[fetchNotesByCalendarDate] Offline calendar query failed:', err)
        commit(types.UPDATE_CURRENT_NOTES, [])
      } finally {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
      }
      return
    }

    const orderBy = basis === 'created' ? 'created' : 'modified'
    const collected = []
    let start = 0
    const pageSize = 100
    const maxPages = 120
    try {
      for (let page = 0; page < maxPages; page++) {
        const batch = await api.KnowledgeBaseApi.getCategoryNotes({
          kbGuid,
          data: {
            category: '',
            start,
            count: pageSize,
            withAbstract: true,
            orderBy,
            ascending: 'desc'
          }
        })
        if (!batch || !batch.length) break
        for (const note of batch) {
          const ts = getCalendarNoteTimestamp(note, basis)
          if (ts >= dayEnd) continue
          if (ts >= dayStart && ts < dayEnd) collected.push(note)
          if (ts < dayStart) {
            commit(types.UPDATE_CURRENT_NOTES, collected)
            return
          }
        }
        if (batch.length < pageSize) break
        start += pageSize
      }
      commit(types.UPDATE_CURRENT_NOTES, collected)
    } finally {
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    }
  },
  /**
   * 日历视图：拉取当月有笔记的日期列表，供日历格子高亮使用。
   * @param {number} year  4位年份
   * @param {number} month 1-12
   */
  async fetchCalendarNoteDates ({ commit, state, rootState }, { year, month }) {
    const { kbGuid, isLogin } = state
    const basis = rootState.client.calendarDateBasis === 'created' ? 'created' : DEFAULT_CALENDAR_DATE_BASIS
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime()
    const monthEnd = new Date(year, month, 1, 0, 0, 0, 0).getTime()
    const dateSet = new Set()

    if (!isLogin || !kbGuid) {
      try {
        const offlineDates = await getOfflineCalendarDates({ basis, monthStart, monthEnd })
        commit(types.SET_CALENDAR_NOTE_DATES, offlineDates)
      } catch (err) {
        console.error('[fetchCalendarNoteDates] Offline calendar dates query failed:', err)
      }
      return
    }

    const orderBy = basis === 'created' ? 'created' : 'modified'
    let start = 0
    const pageSize = 100
    const maxPages = 120
    try {
      for (let page = 0; page < maxPages; page++) {
        const batch = await api.KnowledgeBaseApi.getCategoryNotes({
          kbGuid,
          data: {
            category: '',
            start,
            count: pageSize,
            withAbstract: true,
            orderBy,
            ascending: 'asc'
          }
        })
        if (!batch || !batch.length) break
        let pastMonth = false
        for (const note of batch) {
          const ts = getCalendarNoteTimestamp(note, basis)
          if (ts < monthStart) continue
          if (ts >= monthEnd) {
            pastMonth = true
            break
          }
          const d = new Date(ts)
          const y = d.getFullYear()
          const m = d.getMonth() + 1
          const day = d.getDate()
          if (y === year && m === month) {
            dateSet.add(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
          }
        }
        if (pastMonth) break
        if (batch.length < pageSize) break
        start += pageSize
      }
    } finally {
    }
    commit(types.SET_CALENDAR_NOTE_DATES, Array.from(dateSet).sort())
  },

  async getCategoryNotes ({
    commit,
    state,
    rootState
  }, payload = {}) {
    if (rootState.client.sidebarTreeType === 'calendar') {
      await this.dispatch('server/fetchNotesByCalendarDate', payload)
      return
    }
    const {
      kbGuid,
      currentCategory,
      tags,
      isLogin
    } = state
    const {
      category,
      start,
      count
    } = payload
    const resolvedCategory = helper.isNullOrEmpty(category) ? currentCategory : category
    const isTagCategory = tags?.map(t => t.tagGuid).includes(resolvedCategory)
    if (isTagCategory) {
      this.dispatch('server/getTagNotes', { tag: currentCategory })
      return
    }

    const targetCategory = getDefaultCategoryForMode(state, resolvedCategory)
    const strategy = getSyncStrategy(rootState)

    // 纯在线：不读 SQLite，只走云端
    if (strategy === SYNC_STRATEGY.PURE_ONLINE) {
      if (!isLogin || !kbGuid) {
        commit(types.UPDATE_CURRENT_NOTES, [])
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
        return
      }
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
      try {
        const result = await api.KnowledgeBaseApi.getCategoryNotes({
          kbGuid,
          data: {
            category: targetCategory,
            start: start || 0,
            count: count || 100,
            withAbstract: true
          }
        })
        const cloudNotes = Array.isArray(result) ? result : []
        commit(types.UPDATE_CURRENT_NOTES, cloudNotes)
      } catch (err) {
        console.error('[getCategoryNotes/pureOnline] Failed to load remote notes:', err)
        commit(types.UPDATE_CURRENT_NOTES, [])
      } finally {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
      }
      return
    }

    // 在线优先：接口返回后才取消 loading；SQLite 读取异步不阻塞主路径
    if (strategy === SYNC_STRATEGY.ONLINE_FIRST) {
      if (!isLogin || !kbGuid) {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
        const offlineOnly = await getOfflineNotesByCategory(targetCategory).catch(() => [])
        commit(types.UPDATE_CURRENT_NOTES, offlineOnly)
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
        return
      }
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
      const localPromise = getOfflineNotesByCategory(targetCategory).catch(() => [])
      try {
        const result = await api.KnowledgeBaseApi.getCategoryNotes({
          kbGuid,
          data: {
            category: targetCategory,
            start: start || 0,
            count: count || 100,
            withAbstract: true
          }
        })
        const cloudNotes = Array.isArray(result) ? result : []
        const localNotes = await localPromise
        const mergedNotes = mergeLocalAndCloudNotes(localNotes, cloudNotes)
        commit(types.UPDATE_CURRENT_NOTES, mergedNotes)
      } catch (err) {
        console.error('[getCategoryNotes/onlineFirst] Failed to load remote notes:', err)
        const localNotes = await localPromise
        commit(types.UPDATE_CURRENT_NOTES, localNotes)
      } finally {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
      }
      return
    }

    // 离线优先（默认）：SQLite 先渲染，云端异步合并覆盖
    // 统一获取本地笔记（包括 dirty 笔记）
    let localNotes = []
    try {
      localNotes = await getOfflineNotesByCategory(targetCategory)
      console.log(`[getCategoryNotes] Loaded ${localNotes.length} local notes for category: ${targetCategory}`)
    } catch (err) {
      console.error('[getCategoryNotes] Failed to load local notes:', err)
    }

    // 未登录：只用本地笔记
    if (!isLogin || !kbGuid) {
      commit(types.UPDATE_CURRENT_NOTES, localNotes)
      return
    }

    // 已登录：先把 SQLite 里的本地笔记提交上去（立刻可见），再用云端结果合并覆盖
    commit(types.UPDATE_CURRENT_NOTES, localNotes)
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    try {
      const result = await api.KnowledgeBaseApi.getCategoryNotes({
        kbGuid,
        data: {
          category: targetCategory,
          start: start || 0,
          count: count || 100,
          withAbstract: true
        }
      })
      const cloudNotes = Array.isArray(result) ? result : []
      console.log('[getCategoryNotes] Loaded remote notes:', {
        category: targetCategory || '/',
        cloudCount: cloudNotes.length,
        localCount: localNotes.length
      })

      // ✅ 核心修复：合并本地和云端笔记（本地 dirty 优先）
      const mergedNotes = mergeLocalAndCloudNotes(localNotes, cloudNotes)
      console.log(`[getCategoryNotes] Merged: ${mergedNotes.length} notes (local=${localNotes.length}, cloud=${cloudNotes.length})`)

      commit(types.UPDATE_CURRENT_NOTES, mergedNotes)
    } catch (err) {
      console.error('[getCategoryNotes] Failed to load remote notes:', err)
      // 网络失败时，至少显示本地笔记
      commit(types.UPDATE_CURRENT_NOTES, localNotes)
    } finally {
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    }
  },
  /**
   * 获取指定文件夹下的笔记（用于导出，不修改 currentNotes 状态）
   * @param kbGuid
   * @param category
   * @returns {Promise<*>}
   */
  async getCategoryNotesForExport (_, { kbGuid, category }) {
    const result = await api.KnowledgeBaseApi.getCategoryNotes({
      kbGuid,
      data: {
        category,
        start: 0,
        count: 100,
        withAbstract: true
      }
    })
    return result
  },
  /**
   * 获取所有的笔记
   * @param commit
   * @param state
   * @returns {Promise<void>}
   */
  async getAllCategories ({
    commit,
    state,
    rootState
  }) {
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    const { kbGuid, isLogin, currentCategory } = state
    const strategy = getSyncStrategy(rootState)

    try {
      // 纯在线：只走云端，不读 SQLite
      if (strategy === SYNC_STRATEGY.PURE_ONLINE) {
        if (!isLogin || !kbGuid) {
          commit(types.SET_CATEGORIES, [])
          commit(types.UPDATE_ALL_CATEGORIES, [])
          commit(types.UPDATE_CATEGORIES_POS, {})
          return
        }
        const { remoteCategories, pos } = await fetchRemoteCategories(kbGuid)
        const mergedOnline = mergeCategoryCollections({
          remoteCategories,
          remoteCategoryPos: pos
        })
        commit(types.SET_CATEGORIES, mergedOnline.tree)
        commit(types.UPDATE_ALL_CATEGORIES, mergedOnline.categories)
        commit(types.UPDATE_CATEGORIES_POS, mergedOnline.pos)
        return
      }

      // 在线优先：等接口返回目录树后才取消 loading；SQLite 读取异步
      if (strategy === SYNC_STRATEGY.ONLINE_FIRST) {
        if (!isLogin || !kbGuid) {
          const offlineData = await loadLocalWorkspaceData()
          const mergedOffline = mergeCategoryCollections({
            localCategories: offlineData.categories,
            localNotes: offlineData.notes
          })
          commit(types.SET_CATEGORIES, mergedOffline.tree)
          commit(types.UPDATE_ALL_CATEGORIES, mergedOffline.categories)
          commit(types.UPDATE_CATEGORIES_POS, mergedOffline.pos)
          return
        }
        const localPromise = loadLocalWorkspaceData().catch(() => ({ categories: [], notes: [] }))
        const { remoteCategories, pos } = await fetchRemoteCategories(kbGuid)
        const offlineData = await localPromise
        const mergedOnline = mergeCategoryCollections({
          localCategories: offlineData.categories,
          localNotes: offlineData.notes,
          remoteCategories,
          remoteCategoryPos: pos
        })
        commit(types.SET_CATEGORIES, mergedOnline.tree)
        commit(types.UPDATE_ALL_CATEGORIES, mergedOnline.categories)
        commit(types.UPDATE_CATEGORIES_POS, mergedOnline.pos)
        return
      }

      // 离线优先（默认）：先用 SQLite 渲染，云端异步合并覆盖
      const { categories: localCategories, notes: localNotes } = await loadLocalWorkspaceData()

      if (!isLogin || !kbGuid) {
        const mergedOffline = mergeCategoryCollections({
          localCategories,
          localNotes
        })
        commit(types.SET_CATEGORIES, mergedOffline.tree)
        commit(types.UPDATE_ALL_CATEGORIES, mergedOffline.categories)
        commit(types.UPDATE_CATEGORIES_POS, mergedOffline.pos)
        return
      }

      const res = await api.KnowledgeBaseApi.getCategories({ kbGuid })
      console.log('[getAllCategories] Raw remote categories response:', res)
      const rawRemoteCategories = Array.isArray(res?.result)
        ? res.result
        : Array.isArray(res)
          ? res
          : Array.isArray(res?.categories)
            ? res.categories
            : []
      const remoteCategories = rawRemoteCategories
        .map(item => {
          if (typeof item === 'string') {
            const category = item
            const trimmed = category.replace(/\/$/, '')
            const lastSlashIndex = trimmed.lastIndexOf('/')
            const parent = lastSlashIndex > 0
              ? `${trimmed.slice(0, lastSlashIndex + 1)}`
              : '/'
            return {
              category,
              parent: parent === category ? '/' : parent,
              kbGuid: kbGuid || ''
            }
          }

          const category = item?.category || item?.name || item?.path || item?.categoryName || ''
          const trimmed = category.replace(/\/$/, '')
          const inferredParent = trimmed && trimmed !== '/My Notes'
            ? `${trimmed.slice(0, trimmed.lastIndexOf('/') + 1)}`
            : '/'

          return {
            ...item,
            category,
            parent: item?.parent || item?.parentCategory || item?.parentPath || inferredParent || '/',
            kbGuid: item?.kbGuid || item?.kb_guid || item?.bizGuid || kbGuid || ''
          }
        })
        .filter(item => !!item.category)
      console.log('[getAllCategories] Remote category list:', remoteCategories.map(item => ({
        category: item.category,
        parent: item.parent,
        kbGuid: item.kbGuid
      })))
      console.log('[getAllCategories] Merge inputs summary:', {
        localCategoryCount: localCategories?.length || 0,
        localNoteCount: localNotes?.length || 0,
        remoteCategoryCount: remoteCategories.length,
        remotePosKeys: Object.keys(res?.pos || res?.resultPos || {}).length
      })
      const mergedOnline = mergeCategoryCollections({
        localCategories,
        localNotes,
        remoteCategories,
        remoteCategoryPos: res?.pos || res?.resultPos || {}
      })
      console.log('[getAllCategories] mergedOnline categories count:', mergedOnline.categories?.length || 0)
      console.log('[getAllCategories] mergedOnline pos keys:', Object.keys(mergedOnline.pos || {}).length)
      console.log('[getAllCategories] mergedOnline tree root keys:', (mergedOnline.tree || []).map(node => node.key))
      console.log('[getAllCategories] mergedOnline tree snapshot:', JSON.stringify(mergedOnline.tree || [], null, 2))

      const workspaceState = await loadWorkspaceState()
      const savedCurrentCategory = workspaceState[APP_STATE_KEYS.currentCategory] || currentCategory || OFFLINE_ROOT_CATEGORY
      const restoredCategory = categoryExistsInTree(mergedOnline.tree, savedCurrentCategory)
        ? savedCurrentCategory
        : OFFLINE_ROOT_CATEGORY
      console.log('[getAllCategories] restoring currentCategory:', {
        savedCurrentCategory,
        currentCategory,
        restoredCategory
      })

      commit(types.SET_CATEGORIES, mergedOnline.tree)
      commit(types.UPDATE_ALL_CATEGORIES, mergedOnline.categories)
      commit(types.UPDATE_CATEGORIES_POS, mergedOnline.pos)
      commit(types.UPDATE_CURRENT_CATEGORY, restoredCategory)
      console.log('[getAllCategories] committed category tree:', {
        treeRootCount: mergedOnline.tree?.length || 0,
        categoryCount: mergedOnline.categories?.length || 0,
        restoredCategory
      })
    } catch (err) {
      console.error('[getAllCategories] failed:', err)
      commit(types.SET_CATEGORIES, [])
      commit(types.UPDATE_ALL_CATEGORIES, [])
      commit(types.UPDATE_CATEGORIES_POS, {})
    } finally {
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    }
  },
  /**
   * 获取笔记内容
   * 优先从 SQLite 读取本地最新版本（如果有未同步的修改）
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  async getNoteContent ({
    commit,
    state,
    rootState
  }, payload) {
    commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, true)
    const { kbGuid } = state
    const { docGuid } = payload
    const strategy = getSyncStrategy(rootState)
    
    console.log('\n🔍 [getNoteContent] ========== START ==========')
    console.log(`[getNoteContent] Request: docGuid=${docGuid}, kbGuid=${kbGuid}, isLogin=${state.isLogin}`)
    console.time('GetContent')

    // ✅ 防御：如果 docGuid 为空，立即返回
    if (!docGuid) {
      console.error('[getNoteContent] ❌ ERROR: docGuid is empty!')
      commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
      return
    }

    // 离线笔记（未登录 且 (无 docGuid 或 docGuid 以 local_ 开头））：从 SQLite 加载
    if (!state.isLogin && (!docGuid || docGuid.startsWith('local_'))) {
      console.log('[getNoteContent] Offline mode, loading from SQLite:', docGuid)
      try {
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (localNote) {
          console.log(`[getNoteContent] ✅ Offline: Found in SQLite id=${localNote.id}`)
          commit(types.UPDATE_CURRENT_NOTE, {
            _isRawMarkdown: true,
            info: {
              docGuid: localNote.doc_guid,
              kbGuid: '',
              title: localNote.title,
              category: localNote.category || OFFLINE_ROOT_CATEGORY,
              dataCreated: localNote.data_created,
              dataModified: localNote.data_modified || localNote.local_modified
            },
            html: localNote.content || '',
            resources: []
          })
          commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
          console.log('🔍 [getNoteContent] ========== END (Offline) ==========\n')
          return
        }
      } catch (err) {
        console.warn('[getNoteContent] SQLite lookup failed for offline note:', err)
      }
      commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
      console.log('🔍 [getNoteContent] ========== END (Offline - Not Found) ==========\n')
      return
    }

    // 纯在线：只走云端，不读 SQLite
    if (strategy === SYNC_STRATEGY.PURE_ONLINE) {
      console.log('[getNoteContent] pureOnline: loading from cloud only')
      let result
      let loadedFrom = 'none'
      try {
        result = await fetchCloudNoteContentRaw(kbGuid, docGuid)
        loadedFrom = 'cloud'
      } catch (err) {
        console.error('[getNoteContent] pureOnline cloud failed:', err)
        result = buildEmptyNoteResult(docGuid, kbGuid, 'Untitled', 'cloud-error-fallback')
        loadedFrom = 'cloud-error-fallback'
      }
      Loading.hide()
      commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
      commit(types.UPDATE_CURRENT_NOTE, result)
      console.log(`[getNoteContent] pureOnline loadedFrom=${loadedFrom}`)
      return
    }

    // 在线优先：接口返回后才取消 loading；SQLite 异步回填
    if (strategy === SYNC_STRATEGY.ONLINE_FIRST) {
      console.log('[getNoteContent] onlineFirst: cloud first, SQLite async')
      let result
      let loadedFrom = 'none'
      try {
        result = await fetchCloudNoteContentRaw(kbGuid, docGuid)
        loadedFrom = 'cloud'
        saveCloudContentToSqlite(kbGuid, docGuid, result).catch(err => {
          console.warn('[getNoteContent] onlineFirst SQLite backfill failed:', err.message)
        })
      } catch (err) {
        console.warn('[getNoteContent] onlineFirst cloud failed, fallback to SQLite:', err)
        try {
          const localNote = await DatabaseClient.notes.getByDocGuidWithPriority(docGuid)
          if (localNote && localNote.id) {
            result = buildLocalNoteResult(localNote, docGuid, kbGuid, 'sqlite-fallback')
            loadedFrom = 'sqlite-fallback'
          } else {
            result = buildEmptyNoteResult(docGuid, kbGuid, 'Untitled', 'empty-fallback')
            loadedFrom = 'empty-fallback'
          }
        } catch (localErr) {
          result = buildEmptyNoteResult(docGuid, kbGuid, 'Untitled', 'error-fallback')
          loadedFrom = 'error-fallback'
        }
      }
      Loading.hide()
      commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
      commit(types.UPDATE_CURRENT_NOTE, result)
      console.log(`[getNoteContent] onlineFirst loadedFrom=${loadedFrom}`)
      return
    }

    // ✅ 核心原则：SQLite 本地优先！永远先查本地数据库
    let result = null
    let loadedFrom = 'none'
    
    try {
      // Step 1: 查询本地 SQLite 数据库
      console.log('[getNoteContent] Step 1: Querying SQLite...')
      const localNote = await DatabaseClient.notes.getByDocGuidWithPriority(docGuid)
      
      if (localNote && localNote.id) {
        // ✅ 找到本地记录 → 使用本地版本（本地优先原则）
        console.log(`[getNoteContent] ✅ Step 1 SUCCESS: Found in SQLite!`)
        console.log(`[getNoteContent]   - ID: ${localNote.id}`)
        console.log(`[getNoteContent]   - Title: ${localNote.title}`)
        console.log(`[getNoteContent]   - Content length: ${(localNote.content || '').length}`)
        console.log(`[getNoteContent]   - Dirty: ${localNote.dirty}`)
        console.log(`[getNoteContent]   - Local modified: ${localNote.local_modified}`)
        console.log(`[getNoteContent]   - Doc GUID: ${localNote.doc_guid}`)
        
        loadedFrom = 'sqlite-local'
        
        // 提取内容（确保是字符串）
        const content = (typeof localNote.content === 'string') ? localNote.content : ''
        
        result = {
          _isRawMarkdown: true,
          _loadTimestamp: Date.now(),
          _source: 'sqlite',  // 标记来源
          info: { 
            docGuid: localNote.doc_guid || docGuid, 
            kbGuid: kbGuid || '', 
            title: localNote.title || 'Untitled', 
            category: localNote.category || OFFLINE_ROOT_CATEGORY, 
            dataCreated: localNote.data_created || Date.now(), 
            dataModified: parseInt(localNote.local_modified) || parseInt(localNote.data_modified) || Date.now()
          },
          html: content,
          resources: []
        }
        
        console.log(`[getNoteContent] ✅ Using LOCAL content from SQLite (len=${content.length})`)
        
      } else {
        // ❌ SQLite 没有找到 → 去云端获取
        console.log(`[getNoteContent] ⚠️ Step 1: NOT found in SQLite, will try cloud`)
        loadedFrom = 'cloud-fallback'
        
        try {
          console.log('[getNoteContent] Step 2: Fetching from cloud...')
          result = await _getContent(kbGuid, docGuid)
          
          if (result && result.html) {
            console.log(`[getNoteContent] ✅ Step 2 SUCCESS: Got from cloud (len=${(result.html || '').length})`)
            
            // ✅ 回填到 SQLite（下次就不用再去云端了）
            try {
              const markdown = helper.extractMarkdownFromMDNote(
                result.html, 
                kbGuid, 
                docGuid, 
                result.resources || []
              )
              
              await DatabaseClient.notes.create({
                doc_guid: docGuid,
                kb_guid: kbGuid,
                title: result.info?.title || 'Untitled',
                content: markdown,
                category: result.info?.category || OFFLINE_ROOT_CATEGORY,
                data_created: result.info?.dataCreated,
                data_modified: result.info?.dataModified,
                server_modified: Date.now(),
                local_modified: Date.now()
              })
              
              console.log(`[getNoteContent] 💾 Saved cloud content to SQLite for future use`)
            } catch (saveError) {
              console.warn('[getNoteContent] Failed to save to SQLite (non-critical):', saveError.message)
            }
          } else {
            console.warn('[getNoteContent] ⚠️ Step 2: Cloud returned empty/invalid result')
          }
        } catch (cloudError) {
          console.error('[getNoteContent] ❌ Step 2 FAILED: Cloud error:', cloudError)
          
          // ✅ 最后的兜底：创建一个空的本地记录（避免用户看到空白）
          result = {
            _isRawMarkdown: true,
            _loadTimestamp: Date.now(),
            _source: 'empty-fallback',
            info: {
              docGuid: docGuid,
              kbGuid: kbGuid || '',
              title: 'Untitled',
              category: OFFLINE_ROOT_CATEGORY,
              dataCreated: Date.now(),
              dataModified: Date.now()
            },
            html: '',
            resources: []
          }
          console.warn('[getNoteContent] ⚠️ Created empty fallback note (both SQLite and cloud failed)')
        }
      }
      
    } catch (sqliteError) {
      console.error('[getNoteContent] ❌ SQLite query error:', sqliteError)
      console.log('[getNoteContent] Falling back to cloud due to SQLite error...')
      
      // SQLite 出错 → 兜底去云端
      try {
        result = await _getContent(kbGuid, docGuid)
        loadedFrom = 'cloud-error-fallback'
      } catch (finalError) {
        console.error('[getNoteContent] ❌ COMPLETE FAILURE: Both SQLite and cloud failed:', finalError)
        
        // 最终兜底
        result = {
          _isRawMarkdown: true,
          _loadTimestamp: Date.now(),
          _source: 'error-fallback',
          info: {
            docGuid: docGuid,
            kbGuid: kbGuid || '',
            title: 'Error Loading Note',
            category: OFFLINE_ROOT_CATEGORY,
            dataCreated: Date.now(),
            dataModified: Date.now()
          },
          html: `# Error\n\nFailed to load note: ${docGuid}\n\nPlease check the console for details.`,
          resources: []
        }
      }
    }

    console.timeEnd('GetContent')
    
    // ✅ 最终检查：确保 result 有效
    if (!result || !result.info) {
      console.error('[getNoteContent] ❌ CRITICAL: result or result.info is null/undefined!')
      console.error('[getNoteContent] Creating emergency fallback...')
      
      result = {
        _isRawMarkdown: true,
        _loadTimestamp: Date.now(),
        _source: 'emergency-fallback',
        info: {
          docGuid: docGuid,
          kbGuid: kbGuid || '',
          title: 'Loading Error',
          category: OFFLINE_ROOT_CATEGORY,
          dataCreated: Date.now(),
          dataModified: Date.now()
        },
        html: '',
        resources: []
      }
    }
    
    console.log(`\n[getNoteContent] 📊 SUMMARY:`)
    console.log(`[getNoteContent]   - Loaded from: ${loadedFrom}`)
    console.log(`[getNoteContent]   - Result keys: ${Object.keys(result).join(', ')}`)
    console.log(`[getNoteContent]   - _isRawMarkdown: ${result._isRawMarkdown}`)
    console.log(`[getNoteContent]   - info.docGuid: ${result.info?.docGuid}`)
    console.log(`[getNoteContent]   - info.title: ${result.info?.title}`)
    console.log(`[getNoteContent]   - html type: ${typeof result.html}, len: ${(result.html || '').length}`)
    console.log(`[getNoteContent]   - html preview: ${JSON.stringify((result.html || '').substring(0, 100))}`)
    
    Loading.hide()
    commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
    commit(types.UPDATE_CURRENT_NOTE, result)
    
    console.log(`[getNoteContent] ✅ COMMITTED to Vuex store`)
    console.log(`🔍 [getNoteContent] ========== END ==========\n`)
  },
  /**
   * 设置当前显示的笔记文件夹，并在显示之前从网络刷新文件夹的内容
   * @param commit
   * @param category
   * @returns {Promise<void>}
   */
  async updateCurrentCategory ({ commit, state }, payload) {
    const {
      type,
      data
    } = payload
    commit(types.UPDATE_CURRENT_CATEGORY, data)
    commit(types.SAVE_TO_LOCAL_STORE_SYNC, ['currentCategory', data])
    await saveWorkspaceStateValue(APP_STATE_KEYS.currentCategory, data)
    if (type) {
      await saveWorkspaceStateValue(APP_STATE_KEYS.sidebarTreeType, type)
    }

    // 统一模式：始终从 SQLite 加载本地笔记（通过 getCategoryNotes 处理格式化）
    if (!state.isLogin || !state.kbGuid) {
      await this.dispatch('server/getCategoryNotes', { category: data })
      return
    }

    if (type === 'category') {
      await this.dispatch('server/getCategoryNotes', { category: data })
    } else if (type === 'tag') {
      await this.dispatch('server/getTagNotes', { tag: data })
    } else {
      await this.dispatch('server/getCategoryNotes', { category: '' })
    }
  },
  /**
   * 更新笔记信息，例如笔记title等
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  async updateNoteInfo ({
    commit,
    state
  }, payload) {
    const {
      docGuid,
      kbGuid,
      title,
      category
    } = payload
    const currentCategory = state.currentCategory || OFFLINE_ROOT_CATEGORY
    const previousCategory = state.currentNote?.info?.docGuid === docGuid
      ? (state.currentNote?.info?.category || currentCategory)
      : currentCategory
    const nextCategory = category || previousCategory

    if (title && !title.toLowerCase().endsWith('.md')) {
      payload.title = `${title}.md`
      console.log(`[updateNoteInfo] Auto-append .md suffix: "${title}" → "${payload.title}"`)
    }

    const duplicateCheck = await ensureUniqueNoteTitleInCategory({
      category: nextCategory,
      title: payload.title,
      excludeDocGuid: docGuid
    })

    if (duplicateCheck.exists) {
      Notify.create({
        message: i18n.t('noteTitleAlreadyExists'),
        caption: i18n.t('noteTitleAlreadyExistsHint', {
          category: duplicateCheck.normalizedCategory,
          title: duplicateCheck.normalizedTitle
        }),
        type: 'warning',
        icon: 'warning'
      })
      return
    }

    const isOfflineNote = !state.isLogin || !kbGuid || (docGuid && docGuid.startsWith('local_'))
    if (isOfflineNote) {
      try {
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.notes.update(localNote.id, {
            title: payload.title,
            category: nextCategory,
            local_modified: Date.now()
          })
        }

        const currentState = state.currentNote
        if (currentState && currentState.info) {
          commit(types.UPDATE_CURRENT_NOTE, {
            ...currentState,
            info: {
              ...(currentState.info || {}),
              ...payload,
              category: nextCategory
            }
          })
        } else {
          commit(types.UPDATE_CURRENT_NOTE, {
            ...payload,
            category: nextCategory
          })
        }

        const affectedCategories = [currentCategory]
        if (previousCategory !== currentCategory) {
          affectedCategories.push(previousCategory)
        }
        if (nextCategory !== previousCategory) {
          affectedCategories.push(nextCategory)
        }

        if (isCurrentCategoryAffected(currentCategory, affectedCategories)) {
          await this.dispatch('server/getCategoryNotes', { category: currentCategory })
        }
      } catch (err) {
        console.error('[updateNoteInfo/offline] SQLite update failed:', err)
      }
      return
    }
    
    await api.KnowledgeBaseApi.updateNoteInfo({
      kbGuid,
      docGuid,
      data: payload
    })
    
    // ✅ 安全更新：只更新 info 部分，不覆盖整个 currentNote（避免丢失本地编辑内容）
    const currentState = state.currentNote
    if (currentState && currentState.info) {
      // 合并更新：保留现有内容和 _isRawMarkdown 标记，只更新 info
      commit(types.UPDATE_CURRENT_NOTE, {
        ...currentState,
        info: {
          ...(currentState.info || {}),
          ...payload
        }
      })
    } else {
      // 首次设置（没有现有状态）
      commit(types.UPDATE_CURRENT_NOTE, payload)
    }
    
    this.dispatch('server/getCategoryNotes')
  },
  /**
   * 更新笔记内容
   * @param commit
   * @param state
   * @param markdown
   * @returns {Promise<void>}
   */
  async updateNote ({
    commit,
    state,
    rootState
  }, markdown) {
    if (!state.currentNote.info) return
    const {
      kbGuid,
      docGuid,
      category
    } = state.currentNote.info

    // 离线笔记（docGuid 以 local_ 开头）：仅保存到 SQLite，不推云端
    // 注意：必须同时检查 !state.isLogin，因为 login 后 kbGuid 被设置了，!kbGuid 会变成 false
    if (!state.isLogin && docGuid && docGuid.startsWith('local_')) {
      const { title, tags } = state.currentNote.info
      try {
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.notes.update(localNote.id, {
            title,
            content: markdown,
            category,
            tags: tags || '',
            local_modified: Date.now()
          })
          console.log(`[updateNote/offline] SQLite updated: docGuid=${docGuid}, content_len=${markdown.length}`)
        } else {
          console.warn('[updateNote/offline] Note not found in SQLite:', docGuid)
        }
      } catch (err) {
        console.error('[updateNote/offline] SQLite write failed:', err)
      }
      // 刷新本地笔记列表
      await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      commit(types.UPDATE_NOTE_STATE, 'default')
      return
    }
    if (state.noteState === 'default' || state.noteState === 'none') return
    let { title } = state.currentNote.info
    const { resources } = state.currentNote

    const _updateNote = async title => {
      const now = Date.now()
      const tags = state.currentNote.info?.tags || ''
      const strategy = getSyncStrategy(rootState)
      const onlineNote = state.isLogin && kbGuid

      // 纯在线：只推云端，不写 SQLite
      if (strategy === SYNC_STRATEGY.PURE_ONLINE) {
        if (onlineNote) {
          try {
            const cloudGuid = await pushNoteContentToCloud({
              kbGuid,
              docGuid,
              title,
              category,
              content: markdown,
              tags,
              resources
            })
            if (cloudGuid && (!docGuid || docGuid.startsWith('local_'))) {
              commit(types.UPDATE_CURRENT_NOTE, {
                ...state.currentNote,
                info: { ...state.currentNote.info, docGuid: cloudGuid }
              })
            }
          } catch (err) {
            console.error('[updateNote/pureOnline] cloud save failed:', err)
          }
        }
        await this.dispatch('server/getCategoryNotes')
        return
      }

      // 在线优先：先推云端（await），SQLite 异步（非阻塞）
      if (strategy === SYNC_STRATEGY.ONLINE_FIRST && onlineNote) {
        let resolvedDocGuid = docGuid
        try {
          const cloudGuid = await pushNoteContentToCloud({
            kbGuid,
            docGuid,
            title,
            category,
            content: markdown,
            tags,
            resources
          })
          if (cloudGuid) resolvedDocGuid = cloudGuid
        } catch (err) {
          console.error('[updateNote/onlineFirst] cloud save failed:', err)
        }

        // SQLite 异步同步（非阻塞）：新笔记会同时把本地 local_ 记录迁移到云端 guid
        persistSyncedNoteToSqlite({
          oldDocGuid: docGuid,
          newDocGuid: resolvedDocGuid,
          kbGuid,
          title,
          content: markdown,
          category,
          tags,
          now
        }).catch(err => {
          console.warn('[updateNote/onlineFirst] async SQLite write failed:', err?.message || err)
        })

        if (resolvedDocGuid && resolvedDocGuid !== docGuid && state.currentNote?.info?.docGuid === docGuid) {
          // 新笔记拿到云端 guid 后回写当前 info，避免下次保存重复创建
          commit(types.UPDATE_CURRENT_NOTE, {
            ...state.currentNote,
            info: { ...state.currentNote.info, docGuid: resolvedDocGuid }
          })
        }
        await this.dispatch('server/getCategoryNotes')
        return
      }

      // 离线优先（默认）：先写本地 SQLite（await，必须成功），云端异步
      try {
        const note = await persistNoteToSqlite({ docGuid, title, content: markdown, category, tags, now })
        console.log(`[updateNote] SQLite saved: id=${note?.id}, content_len=${markdown.length}, dirty=1 (pending sync)`)
      } catch (err) {
        console.error('[updateNote] SQLite write failed:', err)
      }

      // ✅ 笔记在线保存 / 更新接口异步（fire-and-forget），优先保证离线功能可用
      // 新笔记（local_ 开头）仍交由同步服务统一处理（需回写云端 guid），避免重复创建
      if (onlineNote && docGuid && !docGuid.startsWith('local_')) {
        pushNoteContentToCloud({
          kbGuid,
          docGuid,
          title,
          category,
          content: markdown,
          tags,
          resources
        }).catch(err => {
          console.warn('[updateNote] async cloud push failed (will retry on next sync):', err?.message || err)
        })
      }

      await this.dispatch('server/getCategoryNotes')
    }
    if (!_.endsWith(title, '.md')) {
      Dialog.create({
        title: i18n.t('convertToMarkdownNote'),
        message: i18n.t('convertToMarkdownNoteHint'),
        ok: {
          label: i18n.t('ok')
        },
        cancel: {
          label: i18n.t('cancel')
        }
      }).onOk(async () => {
        title = `${title}.md`
        await _updateNote(title)
      })
    } else {
      await _updateNote(title)
    }
  },
  /**
   * 创建笔记
   * @param commit
   * @param state
   * @param title
   * @returns {Promise<void>}
   */
  async createNote ({
    commit,
    state,
    rootState
  }, payload) {
    const {
      kbGuid,
      currentCategory = '',
      isLogin
    } = state
    const targetCategory = currentCategory || OFFLINE_ROOT_CATEGORY
    const rawTitle = typeof payload === 'string' ? payload : payload?.title
    const prefix = typeof payload === 'string' ? '' : (payload?.prefix || '')
    const noteMethod = typeof payload === 'string' ? '' : (payload?.noteMethod || '')
    const templateId = typeof payload === 'string' ? '' : String(payload?.templateId || '').trim()

    let finalTitle = rawTitle || i18n.t('untitled')
    try {
      finalTitle = await generateUniqueNoteTitleInCategory({
        category: targetCategory,
        title: finalTitle
      })
    } catch (err) {
      console.warn('[createNote] Failed to check duplicate titles:', err)
    }

    // 模板正文：H1 标题永远在最前；找不到模板 / 模板内容为空 → 仅写 # 标题
    // 直接走 DatabaseClient.noteTemplates.getAll()，不依赖 store 缓存（避免「必须先打开设置」）。
    // 读取路径防御：未知字段、空内容、错误类型一律 graceful fallback。
    let templateBody = ''
    if (templateId) {
      try {
        const list = await DatabaseClient.noteTemplates.getAll()
        const arr = Array.isArray(list) ? list : []
        const matched = arr.find(t => t && t.id === templateId)
        if (matched) {
          templateBody = String(matched.content || '').trim()
        } else {
          console.warn('[createNote] noteTemplate not found, fallback to empty template:', templateId)
        }
      } catch (err) {
        console.warn('[createNote] load noteTemplates failed, fallback:', err)
      }
    }
    const initialContent = templateBody
      ? `# ${finalTitle}\n\n${templateBody}`
      : `# ${finalTitle}`
    const now = Date.now()

    // 纯在线：直接在云端创建，不写 SQLite
    if (isPureOnline(rootState)) {
      if (!isLogin || !kbGuid) {
        Notify.create({
          message: i18n.t('cloudSyncPureOnlineLoginRequired'),
          type: 'warning',
          icon: 'login'
        })
        return
      }
      try {
        const cloudCategory = getDefaultCategoryForMode(state, targetCategory)
        const cloudGuid = await pushNoteContentToCloud({
          kbGuid,
          docGuid: null,
          title: finalTitle,
          category: cloudCategory,
          content: initialContent
        })
        if (!cloudGuid) throw new Error('cloud create returned no guid')
        await this.dispatch('server/getCategoryNotes', { category: cloudCategory })
        commit(types.UPDATE_CURRENT_NOTE, {
          _isRawMarkdown: true,
          info: {
            docGuid: cloudGuid,
            kbGuid,
            title: finalTitle,
            category: cloudCategory,
            dataCreated: now,
            dataModified: now
          },
          html: initialContent,
          resources: []
        })
        Notify.create({
          message: i18n.t('saveNoteSuccessfully'),
          type: 'positive',
          icon: 'check'
        })
      } catch (err) {
        console.error('[createNote/pureOnline] cloud create failed:', err)
        Notify.create({
          message: i18n.t('createNoteFailed'),
          type: 'negative',
          icon: 'error'
        })
      }
      return
    }

    const draftPayload = {
      ...(isLogin && kbGuid ? { kbGuid } : {}),
      title: finalTitle,
      content: initialContent,
      category: targetCategory,
      now
    }

    let draft
    try {
      draft = await createLocalDraftNote(draftPayload)
    } catch (err) {
      console.error('[createNote] SQLite create failed:', err)
      Notify.create({
        message: i18n.t('createNoteFailed'),
        type: 'negative',
        icon: 'error'
      })
      return
    }

    if (!draft?.note) {
      console.error('[createNote] SQLite create returned null')
      Notify.create({
        message: i18n.t('createNoteFailed'),
        type: 'negative',
        icon: 'error'
      })
      return
    }

    await this.dispatch('server/getCategoryNotes', { category: targetCategory })

    const refreshedNotes = Array.isArray(this.state?.server?.currentNotes)
      ? this.state.server.currentNotes
      : []
    const createdSummary = refreshedNotes.find(note => note.docGuid === draft.docGuid || note.guid === draft.docGuid)

    if (!createdSummary) {
      commit(types.UPDATE_CURRENT_NOTES, [
        mapLocalNoteToSummary({
          id: draft.note.id,
          doc_guid: draft.docGuid,
          title: finalTitle,
          content: initialContent,
          category: targetCategory,
          data_created: now,
          data_modified: now,
          local_modified: now,
          dirty: 1
        }, targetCategory),
        ...refreshedNotes
      ])
    }

    commit(types.UPDATE_CURRENT_NOTE, {
      _isRawMarkdown: true,
      info: {
        docGuid: draft.docGuid,
        kbGuid: isLogin ? (kbGuid || '') : '',
        title: finalTitle,
        category: targetCategory,
        dataCreated: now,
        dataModified: now
      },
      html: initialContent,
      resources: []
    })
    Notify.create({
      message: i18n.t('saveNoteSuccessfully'),
      type: 'positive',
      icon: 'check'
    })
  },
  /**
   * 保存旧笔记内容（用于切换笔记时保存上一个笔记）
   * 与 updateNote 不同，这里使用传入的 noteInfo 而非 state.currentNote
   * @param commit
   * @param markdown
   * @param noteInfo - 旧笔记的 info 对象，包含 docGuid, kbGuid, title, category, resources 等
   */
  async updateNoteWithInfo ({ commit, state, rootState }, { markdown, noteInfo, resources: incomingResources = [] }) {
    if (!noteInfo) return
    const { kbGuid, docGuid, title, category = '/' } = noteInfo
    // ✅ 优先使用传入的 resources（来自 Muya.vue 的 previousResources），保持与 Ctrl+S 一致
    const resources = incomingResources && incomingResources.length > 0 ? incomingResources : []
    
    // ✅ 区分离线和在线模式：离线优先下 local_ 新笔记走本地；在线优先/纯在线只要云端可用就走云端
    const strategy = getSyncStrategy(rootState)
    const canUseCloud = state.isLogin && kbGuid
    const isOfflineNote = !canUseCloud || !docGuid ||
      (docGuid.startsWith('local_') && strategy === SYNC_STRATEGY.OFFLINE_FIRST)

    if (isOfflineNote) {
      try {
        const now = Date.now()
        const result = await upsertLocalNoteByDocGuid({
          docGuid,
          title,
          content: markdown,
          category: OFFLINE_ROOT_CATEGORY,
          now
        })

        if (result.action === 'updated') {
          console.log(`[updateNoteWithInfo/offline] SQLite updated: id=${result.localNoteId}, docGuid=${result.docGuid}, content_len=${markdown.length}`)
        } else if (result.note) {
          console.log(`[updateNoteWithInfo/offline] SQLite created: id=${result.localNoteId}`)
        }

        await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      } catch (err) {
        console.error('[updateNoteWithInfo/offline] SQLite write failed:', err)
      }

      return
    }

    // 以下为已登录的在线笔记逻辑
    const now = Date.now()

    // 纯在线：只推云端，不写 SQLite
    if (strategy === SYNC_STRATEGY.PURE_ONLINE) {
      try {
        await pushNoteContentToCloud({
          kbGuid,
          docGuid,
          title,
          category,
          content: markdown,
          tags: noteInfo.tags || '',
          resources
        })
      } catch (err) {
        console.error('[updateNoteWithInfo/pureOnline] cloud save failed:', err)
      }
      return
    }

    // 在线优先：先推云端（await），SQLite 异步（非阻塞）
    if (strategy === SYNC_STRATEGY.ONLINE_FIRST) {
      let resolvedDocGuid = docGuid
      try {
        const cloudGuid = await pushNoteContentToCloud({
          kbGuid,
          docGuid,
          title,
          category,
          content: markdown,
          tags: noteInfo.tags || '',
          resources
        })
        if (cloudGuid) resolvedDocGuid = cloudGuid
      } catch (err) {
        console.error('[updateNoteWithInfo/onlineFirst] cloud save failed:', err)
      }
      persistSyncedNoteToSqlite({
        oldDocGuid: docGuid,
        newDocGuid: resolvedDocGuid,
        kbGuid,
        title,
        content: markdown,
        category,
        tags: noteInfo.tags || '',
        now
      }).catch(err => {
        console.warn('[updateNoteWithInfo/onlineFirst] async SQLite write failed:', err?.message || err)
      })
      return
    }

    // 离线优先（默认）：先写本地 SQLite（await，必须成功），云端异步
    try {
      const result = await upsertLocalNoteByDocGuid({
        docGuid,
        title,
        content: markdown,
        category,
        now
      })
      if (result.action === 'updated') {
        console.log(`[updateNoteWithInfo] SQLite updated: id=${result.localNoteId}, content_len=${markdown.length}, dirty=1 (pending sync)`)
      }
    } catch (err) {
      console.error('[updateNoteWithInfo] SQLite write failed:', err)
    }

    // ✅ 笔记在线保存 / 更新接口异步（fire-and-forget）
    pushNoteContentToCloud({
      kbGuid,
      docGuid,
      title,
      category,
      content: markdown,
      tags: noteInfo.tags || '',
      resources
    }).catch(err => {
      console.warn('[updateNoteWithInfo] async cloud push failed (will retry on next sync):', err?.message || err)
    })
  },
  importNote ({
    commit,
    state
  }, importFile) {
    const {
      kbGuid,
      currentCategory = '',
      isLogin
    } = state
    const targetCategory = currentCategory || OFFLINE_ROOT_CATEGORY
    const reader = new FileReader()
    reader.readAsText(importFile)
    reader.onload = async () => {
      const text = reader.result
      const now = Date.now()
      let finalTitle = importFile.name

      try {
        finalTitle = await generateUniqueNoteTitleInCategory({
          category: targetCategory,
          title: finalTitle
        })
      } catch (err) {
        console.warn('[importNote] Failed to check duplicate titles:', err)
      }

      try {
        const draft = await createLocalDraftNote({
          ...(isLogin && kbGuid ? { kbGuid } : {}),
          title: finalTitle,
          content: text,
          category: targetCategory,
          now
        })

        await this.dispatch('server/getCategoryNotes', { category: targetCategory })
        commit(types.UPDATE_CURRENT_NOTE, {
          _isRawMarkdown: true,
          info: {
            docGuid: draft.docGuid,
            kbGuid: isLogin ? (kbGuid || '') : '',
            title: finalTitle,
            category: targetCategory,
            dataCreated: now,
            dataModified: now
          },
          html: text,
          resources: []
        })
      } catch (err) {
        console.error('[importNote] SQLite create failed:', err)
        Notify.create({
          message: i18n.t('importNoteFailed'),
          type: 'negative',
          icon: 'error'
        })
      }
    }
  },
  /**
   * 删除笔记
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  async deleteNote ({
    commit,
    state
  }, payload) {
    const {
      kbGuid,
      docGuid
    } = payload
    const isCloudBackedNote = state.isLogin && kbGuid && docGuid && !docGuid.startsWith('local_')

    try {
      const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
      if (localNote) {
        if (isCloudBackedNote) {
          await DatabaseClient.sync.logPendingDelete({
            noteId: localNote.id,
            docGuid,
            kbGuid
          })
        }
        await DatabaseClient.notes.remove(localNote.id)
      }
      await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
    } catch (err) {
      console.warn('[deleteNote] SQLite delete failed:', err)
    }

    const { currentNote } = state
    if (currentNote && currentNote.info.docGuid === docGuid) {
      commit(types.CLEAR_CURRENT_NOTE)
    }

    const newNotes = state.currentNotes.filter(n => n.docGuid !== docGuid)
    commit(types.UPDATE_CURRENT_NOTES, newNotes)

    Notify.create({
      color: 'red-10',
      message: i18n.t('deleteNoteSuccessfully'),
      icon: 'delete'
    })
  },
  /**
   * 创建笔记目录
   * @param commit
   * @param state
   * @param childCategoryName
   * @returns {Promise<void>}
   */
  async createCategory ({
    commit,
    state
  }, {
    childCategoryName,
    parentCategory
  }) {
    const { kbGuid, isLogin, categories } = state
    const noteMethod = this.state?.client?.noteMethod || ''

    // 计算完整路径（父路径 + 子文件夹名）
    let fullCategoryPath
    const normalizedParentCategory = helper.isNullOrEmpty(parentCategory) ? state.currentCategory : parentCategory
    const parentDepth = getSixDaoFolderDepth(normalizedParentCategory)

    if (noteMethod === 'notesSixDaoLun' && parentDepth >= 3) {
      Notify.create({
        color: 'warning',
        message: '六道笔记论下，第三层及以后只能创建文件，不能再创建文件夹',
        icon: 'warning'
      })
      return
    }

    // 根目录（空、/、/My Notes/）下创建直接子文件夹
    if (helper.isNullOrEmpty(normalizedParentCategory) || normalizedParentCategory === OFFLINE_ROOT_CATEGORY || normalizedParentCategory === '/') {
      fullCategoryPath = `${OFFLINE_ROOT_CATEGORY}${childCategoryName}/`
    } else {
      fullCategoryPath = `${normalizedParentCategory}${childCategoryName}/`
    }

    // 在线模式：同时创建云端目录 + 本地记录
    if (isLogin && kbGuid) {
      if (helper.checkCategoryExistence(categories, parentCategory, childCategoryName)) {
        Notify.create({ color: 'red-10', message: i18n.t('categoryExisted'), icon: 'error' })
        return
      }
      try {
        await api.KnowledgeBaseApi.createCategory({
          kbGuid,
          data: {
            parent: helper.isNullOrEmpty(normalizedParentCategory) ? '/' : normalizedParentCategory,
            pos: Math.floor(Date.now() / 1000).toFixed(0),
            child: childCategoryName
          }
        })
        // 标记本地目录已同步到云端
        await DatabaseClient.categories.create({
          category: fullCategoryPath,
          parent: helper.isNullOrEmpty(normalizedParentCategory) ? OFFLINE_ROOT_CATEGORY : normalizedParentCategory,
          kbGuid,
          localOnly: false
        })
        await this.dispatch('server/getAllCategories')
        await this.dispatch('server/updateCurrentCategory', { data: fullCategoryPath, type: 'category' })
      } catch (err) {
        console.error('[createCategory] online failed:', err)
        Notify.create({ color: 'red-10', message: i18n.t('categoryExisted'), icon: 'error' })
      }
      return
    }

    // 离线模式：只创建本地目录
    try {
      const localCategories = await DatabaseClient.categories.getAll({})
      const exists = localCategories.some(c => c.category === fullCategoryPath)
      if (exists) {
        Notify.create({ color: 'red-10', message: i18n.t('categoryExisted'), icon: 'error' })
        return
      }
      await DatabaseClient.categories.create({
        category: fullCategoryPath,
        parent: helper.isNullOrEmpty(normalizedParentCategory) ? OFFLINE_ROOT_CATEGORY : normalizedParentCategory,
        kbGuid: kbGuid || '',
        localOnly: true
      })

      // 乐观更新目录树：前端直接修改 state.categories（不查数据库，避免看不到刚创建的临时文件夹）
      const currentTree = state.categories
      if (currentTree && currentTree.length > 0) {
        const rootNode = currentTree.find(node => node.key === OFFLINE_ROOT_CATEGORY) || currentTree[0]
        // 找到父节点
        const parentNode = findCategoryNode(rootNode, normalizedParentCategory || OFFLINE_ROOT_CATEGORY)
        if (parentNode) {
          // 避免重复
          if (!parentNode.children.find(c => c.key === fullCategoryPath)) {
            parentNode.children.push({
              label: childCategoryName,
              key: fullCategoryPath,
              children: [],
              selectable: true,
              categoryPath: fullCategoryPath
            })
            // 排序
            parentNode.children.sort((a, b) => a.label.localeCompare(b.label))
          }
        }
        commit(types.SET_CATEGORIES, [...currentTree])
      }
      await this.dispatch('server/updateCurrentCategory', { data: fullCategoryPath, type: 'category' })
      Notify.create({ color: 'positive', message: i18n.t('categoryCreated'), icon: 'folder_open' })
    } catch (err) {
      console.error('[createCategory] offline failed:', err)
      Notify.create({ color: 'red-10', message: '创建文件夹失败', icon: 'error' })
    }
  },
  /**
   * 删除分类（目录）。
   * 【v2026-08-08】增加 silentNotify 选项：走怪兽特效 overlay 路径时，怪兽啃+爆本身已是
   * 视觉反馈，**不再**叠加 Quasar Notify 弹框（"目录删除成功"）。回退路径（无 overlay / overlay
   * 调失败 → 走 $q.dialog 二次确认 → 直接 deleteCategory）仍显示 Notify，因为用户没看到
   * 视觉反馈，需要文字确认。
   *
   * payload 兼容两种形态：
   *   - 旧调用: deleteCategory(category)            → string 当 category
   *   - 新调用: deleteCategory(category, opts)      → opts.silentNotify=true 时跳过 Notify
   *   - 也支持: deleteCategory({ category, silentNotify })  → 对象形态直接解构
   */
  async deleteCategory ({
    commit,
    state
  }, categoryOrPayload, maybeOpts = {}) {
    let category
    let opts = maybeOpts
    if (typeof categoryOrPayload === 'object' && categoryOrPayload !== null) {
      // 对象形态：{ category, silentNotify? }
      category = categoryOrPayload.category
      opts = categoryOrPayload
    } else {
      category = categoryOrPayload
    }
    const { silentNotify = false } = opts || {}
    const { kbGuid, isLogin } = state

    // 在线模式：先删云端
    if (isLogin && kbGuid) {
      try {
        await api.KnowledgeBaseApi.deleteCategory({ kbGuid, data: { category } })
      } catch (err) {
        console.warn('[deleteCategory] online delete failed:', err)
      }
    }

    // 再删本地记录
    try {
      await DatabaseClient.categories.remove(category)

      // 乐观更新目录树：直接从现有 state.categories 中移除被删节点（含子树），
      // 而不是调用 loadLocalWorkspaceData() 全量重建——全量重建会导致整棵树组件
      // 被替换、展开状态丢失、闪烁，严重影响体验。
      const currentTree = state.categories
      if (currentTree && currentTree.length > 0) {
        const removed = removeCategoryNode(currentTree, category)
        if (removed) {
          // 创建新数组引用触发响应式更新，但节点对象本身保持引用稳定
          commit(types.SET_CATEGORIES, [...currentTree])
        }
      }

      // 仅当当前选中的分类属于被删除的目录（本身或其子目录），才重置 currentCategory。
      // 否则保持当前选中，避免因为删除其他文件夹而丢失当前笔记浏览状态。
      const needsReset = !state.currentCategory ||
        state.currentCategory === category ||
        state.currentCategory.startsWith(category)
      if (needsReset) {
        await this.dispatch('server/updateCurrentCategory', { data: '', type: '' })
      }
    } catch (err) {
      console.error('[deleteCategory] local delete failed:', err)
    }

    // silentNotify=true 时跳过 Notify（怪兽特效路径已给出视觉反馈）。
    if (!silentNotify) {
      Notify.create({ color: 'red-6', message: i18n.t('deleteCategorySuccessfully'), icon: 'delete' })
    }
  },
  async uploadImage ({
    commit,
    getters,
    state,
    rootState
  }, file) {
    const token = getters.wizNoteToken
    const {
      kbGuid,
      currentNote: {
        info: { docGuid }
      }
    } = state

    const {
      client: {
        imageUploadService
      }
    } = rootState
    // eslint-disable-next-line no-case-declarations
    let base64

    switch (imageUploadService) {
      case 'wizOfficialImageUploadService':
        if (file instanceof File) {
          base64 = await readFileAsync(file)
          file = {
            file: base64,
            ext: file.name
          }
        }
        // eslint-disable-next-line no-case-declarations
        const result = await uploadImages([file], imageUploadService, {
          kbGuid,
          docGuid,
          wizToken: token,
          baseUrl: api.KnowledgeBaseApi.getBaseUrl()
        })
        commit(types.UPDATE_CURRENT_NOTE_RESOURCE, result.result)
        // await saveUploadedImage(buffer, kbGuid, docGuid, result.name)
        if (!result.success) {
          Notify.create({
            message: i18n.t('failToUpload'),
            type: 'negative',
            icon: 'clear'
          })
          return helper.isNullOrEmpty(base64) ? file : base64
        } else {
          return helper.isNullOrEmpty(result.result) ? file : helper.isNullOrEmpty(result.result[0]) ? file : result.result[0].url
        }
      case 'picgoServer':
        if (file instanceof File) {
          base64 = await readFileAsync(file)
          file = {
            file: base64,
            ext: file.name
          }
        }
        // eslint-disable-next-line no-case-declarations
        const res = await uploadImages([file], imageUploadService)
        if (!res.success) {
          Notify.create({
            message: i18n.t('failToUpload'),
            type: 'negative',
            icon: 'clear'
          })
          return helper.isNullOrEmpty(base64) ? file : base64
        } else {
          return helper.isNullOrEmpty(res.result) ? file : helper.isNullOrEmpty(res.result[0]) ? file : res.result[0]
        }
      case 'none':
        if (file instanceof File) {
          const base64 = await readFileAsync(file)
          file = await saveTempImage({
            file: base64,
            kbGuid,
            docGuid
          })
        }
        return file
      default:
        break
    }
  },
  async moveNote ({ commit, state }, noteInfo) {
    const {
      kbGuid,
      docGuid,
      category,
      type,
      title
    } = noteInfo
    const currentCategory = state.currentCategory || OFFLINE_ROOT_CATEGORY
    const previousCategory = state.currentNote?.info?.docGuid === docGuid
      ? (state.currentNote?.info?.category || currentCategory)
      : currentCategory

    const duplicateCheck = await ensureUniqueNoteTitleInCategory({
      category,
      title,
      excludeDocGuid: docGuid
    })

    if (duplicateCheck.exists) {
      Notify.create({
        message: i18n.t('noteTitleAlreadyExists'),
        caption: i18n.t('noteTitleAlreadyExistsHint', {
          category: duplicateCheck.normalizedCategory,
          title: duplicateCheck.normalizedTitle
        }),
        type: 'warning',
        icon: 'warning'
      })
      return
    }

    const isOfflineNote = !state.isLogin || !kbGuid || (docGuid && docGuid.startsWith('local_'))
    if (isOfflineNote) {
      try {
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.notes.update(localNote.id, {
            category,
            local_modified: Date.now()
          })
        }

        if (state.currentNote?.info?.docGuid === docGuid) {
          commit(types.UPDATE_CURRENT_NOTE, {
            ...state.currentNote,
            info: {
              ...(state.currentNote.info || {}),
              ...noteInfo,
              category
            }
          })
        }

        const affectedCategories = [currentCategory, previousCategory, category]
        if (isCurrentCategoryAffected(currentCategory, affectedCategories)) {
          await this.dispatch('server/getCategoryNotes', { category: currentCategory })
        }
        Notify.create({
          message: i18n.t('moveToAnotherCategorySuccessfully'),
          type: 'positive',
          icon: 'check'
        })
      } catch (err) {
        console.error('[moveNote/offline] SQLite move failed:', err)
        Notify.create({
          message: i18n.t('requestError'),
          type: 'negative',
          icon: 'error'
        })
      }
      return
    }

    const isLite = category === '/Lite/' ? 'lite/markdown' : type
    await api.KnowledgeBaseApi.updateNoteInfo({
      kbGuid,
      docGuid,
      data: {
        ...noteInfo,
        type: isLite ? 'lite/markdown' : type
      }
    })
    await this.dispatch('server/getCategoryNotes')
  },
  async copyNote ({
    commit,
    state
  }, noteInfo) {
    const {
      kbGuid,
      docGuid,
      category,
      title
    } = noteInfo
    const { currentCategory } = state

    const duplicateCheck = await ensureUniqueNoteTitleInCategory({
      category,
      title,
      excludeDocGuid: null
    })

    if (duplicateCheck.exists) {
      Notify.create({
        message: i18n.t('noteTitleAlreadyExists'),
        caption: i18n.t('noteTitleAlreadyExistsHint', {
          category: duplicateCheck.normalizedCategory,
          title: duplicateCheck.normalizedTitle
        }),
        type: 'warning',
        icon: 'warning'
      })
      return
    }

    const isOfflineNote = !state.isLogin || !kbGuid || (docGuid && docGuid.startsWith('local_'))
    if (isOfflineNote) {
      try {
        const sourceNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (!sourceNote) {
          throw new Error(`Source note not found: ${docGuid}`)
        }

        const uniqueTitle = await generateUniqueNoteTitleInCategory({
          category,
          title: sourceNote.title || title || i18n.t('untitled')
        })
        const now = Date.now()
        await createLocalDraftNote({
          title: uniqueTitle,
          content: sourceNote.content || '',
          category,
          now,
          dataCreated: sourceNote.data_created || now,
          dataModified: sourceNote.data_modified || now
        })

        const isCurrentCategory = category === currentCategory
        if (isCurrentCategory || helper.isNullOrEmpty(currentCategory)) {
          await this.dispatch('server/getCategoryNotes', { category: currentCategory || OFFLINE_ROOT_CATEGORY })
        }

        Notify.create({
          message: i18n.t('copyToAnotherCategorySuccessfully'),
          type: 'positive',
          icon: 'check'
        })
      } catch (err) {
        console.error('[copyNote/offline] SQLite copy failed:', err)
        Notify.create({
          message: i18n.t('requestError'),
          type: 'negative',
          icon: 'error'
        })
      }
      return
    }

    await api.KnowledgeBaseApi.copyNote({
      kbGuid,
      docGuid,
      data: {
        targetCategory: category
      }
    })
    const isCurrentCategory = category === currentCategory
    if (isCurrentCategory || helper.isNullOrEmpty(currentCategory)) {
      await this.dispatch('server/getCategoryNotes')
    }
  },
  async searchNote ({
    commit,
    state
  }, searchText) {
    const { kbGuid } = state
    // commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    // commit(types.UPDATE_CURRENT_NOTES, result)
    // commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    return await api.KnowledgeBaseApi.searchNote({
      data: {
        ss: searchText
      },
      kbGuid
    })
  },
  async updateContentsList ({ commit }, editorRootElement) {
    const list = await helper.updateContentsList(editorRootElement) || []
    commit(types.UPDATE_CONTENTS_LIST, list)
  },
  updateNoteState ({ commit }, noteState) {
    commit(types.UPDATE_NOTE_STATE, noteState)
  },
  async getTagNotes ({
    commit,
    state
  }, payload) {
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    const { kbGuid, isLogin } = state
    const {
      tag,
      start,
      count
    } = payload

    if (!isLogin || !kbGuid) {
      try {
        const localTagNotes = await getOfflineTagNotes(tag)
        commit(types.UPDATE_CURRENT_NOTES, localTagNotes)
      } catch (err) {
        console.error('[getTagNotes] Offline local tag query failed:', err)
        commit(types.UPDATE_CURRENT_NOTES, [])
      } finally {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
      }
      return
    }

    const result = await api.KnowledgeBaseApi.getTagNotes({
      kbGuid,
      data: {
        tag,
        withAbstract: true,
        start: start || 0,
        count: count || 100,
        orderBy: 'modified'
      }
    })
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    commit(types.UPDATE_CURRENT_NOTES, result)
  },
  /**
   * 防抖刷新所有标签的笔记数量。
   * 切换到标签树视图时调用，避免频繁切换触发大量请求。
   */
  refreshTagNotesCount () {
    getDebouncedRefreshTagCounts()(this)
  },
  async getAllTags ({
    commit,
    state
  }) {
    const { kbGuid, isLogin, currentNote } = state
    if (!isLogin || !kbGuid) {
      try {
        const { tags, countMap, currentNoteTags } = await getOfflineTagsWithCounts(currentNote?.info?.docGuid)

        commit(types.UPDATE_ALL_TAGS, tags)
        commit(types.UPDATE_TAG_NOTES_COUNT, countMap)

        if (currentNoteTags) {
          commit(types.UPDATE_CURRENT_NOTE_TAGS, currentNoteTags)
        }
      } catch (err) {
        console.error('[getAllTags] Offline tags query failed:', err)
        commit(types.UPDATE_ALL_TAGS, [])
        commit(types.UPDATE_TAG_NOTES_COUNT, {})
      }
      return
    }

    const tags = await api.KnowledgeBaseApi.getAllTags({ kbGuid })

    const countMap = {}
    await Promise.all(
      tags.map(async tag => {
        const count = await api.KnowledgeBaseApi.getTagNoteCount({
          kbGuid,
          data: { tag: tag.tagGuid }
        })
        countMap[tag.tagGuid] = count
      })
    )

    commit(types.UPDATE_ALL_TAGS, tags)
    commit(types.UPDATE_TAG_NOTES_COUNT, countMap)
  },
  /**
   * 创建一个标签，但没有指定哪篇笔记拥有这个标签
   * @param state
   * @param parentTag
   * @param name
   * @returns {Promise<void>}
   */
  async createTag ({ state }, {
    parentTag = {},
    name
  }) {
    const { kbGuid, isLogin } = state
    const { tagGuid: parentTagGuid } = parentTag

    if (!isLogin || !kbGuid) {
      return await DatabaseClient.tags.create({ name })
    }

    return await api.KnowledgeBaseApi.createTag({
      kbGuid,
      data: {
        parentTagGuid,
        name
      }
    })
  },
  /**
   * 将指定的标签添加到当前笔记上
   * @param state
   * @param commit
   * @param tagGuid
   * @returns {Promise<void>}
   */
  async attachTag ({
    state,
    commit
  }, { tagGuid }) {
    const {
      currentNote: { info }
    } = state
    const newTagList = info.tags?.split('*').filter(Boolean) || []
    if (!newTagList.includes(tagGuid)) {
      newTagList.push(tagGuid)
    }
    commit(types.UPDATE_CURRENT_NOTE_TAGS, newTagList.join('*'))

    if (!state.isLogin || !state.kbGuid || (info.docGuid && info.docGuid.startsWith('local_'))) {
      const localTagId = parseLocalTagId(tagGuid)
      const localNote = await DatabaseClient.notes.getByDocGuid(info.docGuid)
      if (localNote && localTagId) {
        await DatabaseClient.tags.attachToNote(localNote.id, localTagId)
        await DatabaseClient.notes.update(localNote.id, {
          tags: newTagList.join('*'),
          local_modified: Date.now()
        })
      }
      this.dispatch('server/getAllTags')
      return
    }

    this.dispatch('server/updateNoteInfo', {
      ...state.currentNote.info,
      tags: newTagList.join('*')
    })
    this.dispatch('server/getAllTags')
  },
  async renameTag ({ state }, tag) {
    const { kbGuid, isLogin } = state
    if (!isLogin || !kbGuid) {
      return
    }

    const {
      tagGuid,
      name
    } = tag
    await api.KnowledgeBaseApi.renameTag({
      kbGuid,
      data: {
        tagGuid,
        name
      }
    })
    this.dispatch('server/getAllTags')
  },
  async moveTag ({ state }, {
    tag,
    parentTag = {}
  }) {
    const { kbGuid, isLogin } = state
    if (!isLogin || !kbGuid) {
      return
    }

    const { tagGuid } = tag
    const { tagGuid: parentTagGuid } = parentTag
    await api.KnowledgeBaseApi.moveTag({
      kbGuid,
      data: {
        tagGuid,
        parentTagGuid
      }
    })
    this.dispatch('server/getAllTags')
  },
  /**
   * 移除某篇笔记上的tag标记，不会删除这个tag
   * @returns {Promise<void>}
   */
  async removeTag ({
    state,
    commit
  }, { tagGuid }) {
    const {
      currentNote: { info }
    } = state
    const newTagList =
      info.tags?.split('*').filter(t => t && t !== tagGuid) || []
    commit(types.UPDATE_CURRENT_NOTE_TAGS, newTagList.join('*'))

    if (!state.isLogin || !state.kbGuid || (info.docGuid && info.docGuid.startsWith('local_'))) {
      const localTagId = parseLocalTagId(tagGuid)
      const localNote = await DatabaseClient.notes.getByDocGuid(info.docGuid)
      if (localNote && localTagId) {
        await DatabaseClient.tags.removeFromNote(localNote.id, localTagId)
        await DatabaseClient.notes.update(localNote.id, {
          tags: newTagList.join('*'),
          local_modified: Date.now()
        })
      }
      this.dispatch('server/getAllTags')
      return
    }

    this.dispatch('server/updateNoteInfo', {
      ...state.currentNote.info,
      tags: newTagList.join('*')
    })
    this.dispatch('server/getAllTags')
  },
  /**
   * 将一个tag永久删除
   * @param state
   * @param tag
   * @returns {Promise<void>}
   */
  async deleteTag ({ state }, tag) {
    const { kbGuid, isLogin } = state
    const { tagGuid } = tag

    if (!isLogin || !kbGuid) {
      const localTagId = parseLocalTagId(tagGuid)
      if (!localTagId) return
      await DatabaseClient.tags.remove(localTagId)
      this.dispatch('server/getAllTags')
      return
    }

    await api.KnowledgeBaseApi.deleteTag({
      kbGuid,
      tagGuid
    })
    this.dispatch('server/getAllTags')
  },
  /**
   * 导出markdown文件到本地
   * @param state
   * @param noteField
   * @param {boolean} current
   * @returns {Promise<void>}
   */
  async exportMarkdownFile ({ state }, {
    noteField,
    current
  }) {
    const {
      kbGuid,
      currentNote
    } = state
    let docGuid
    if (current) {
      docGuid = currentNote.info.docGuid
    } else if (noteField) {
      docGuid = noteField.docGuid
    } else {
      return
    }
    Loading.show({
      spinner: QSpinnerGears,
      message: i18n.t('prepareExportData'),
      delay: 400
    })
    const result = await _getContent(kbGuid, docGuid)
    const title = result.info.title.split('.')[0]
    const isHtml = !_.endsWith(result.info.title, '.md')
    const {
      html,
      resources
    } = result
    let content
    if (isHtml) {
      content = helper.convertHtml2Markdown(html, kbGuid, docGuid, resources)
    } else {
      content = helper.extractMarkdownFromMDNote(
        html,
        kbGuid,
        docGuid,
        resources
      )
    }
    Loading.hide()
    exportMarkdownFile({ content, kbGuid, docGuid, resources, title })
  },
  /**
   * 导出为png
   * @param state
   * @param noteField
   * @param current
   * @param elementId
   * @returns {Promise<void>}
   */
  async exportPng ({ state }, {
    noteField,
    current,
    elementId = 'ag-editor-id'
  }) {
    const {
      kbGuid,
      currentNote
    } = state
    let docGuid
    if (current) {
      docGuid = currentNote.info.docGuid
    } else if (noteField) {
      docGuid = noteField.docGuid
    } else {
      return
    }
    const result = await _getContent(kbGuid, docGuid)
    const title = result.info.title.split('.')[0]
    // const title = _.endsWith(result.info.title, '.md') ? result.info.title.replace('.md') : result.info.title
    if (_.isEmpty(currentNote)) return
    Loading.show({
      spinner: QSpinnerGears,
      message: i18n.t('prepareExportData'),
      delay: 400
    })
    const canvasID = document.getElementById(elementId)
    const color = Dark.isActive
    html2canvas(canvasID, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: color ? '#35373e' : '#ffffff'
    }).then(canvas => {
      const dom = document.body.appendChild(canvas)
      dom.style.display = 'none'
      document.body.removeChild(dom)
      const content = dom.toDataURL('image/png')
      Loading.hide()
      exportPng({ content, title })
    }).catch(e => {
      debugLogger.Error(e)
      Loading.hide()
    })
  },
  async exportFile ({ state }, {
    content,
    fileName,
    fileType
  }) {
    fileName = fileName.split('.')[0]
    // fileName = _.endsWith(fileName, '.md') ? fileName.replace('.md') : fileName
    exportFile({
      content,
      fileName,
      fileType
    }).then()
  },
  /**
   * 批量导出markdown笔记到本地
   * @param state
   * @param noteFields
   * @param category  optional category override for the export folder name
   * @returns {Promise<void>}
   */
  async exportMarkdownFiles ({ state }, noteFields = [], category = '') {
    const {
      kbGuid,
      currentCategory
    } = state
    const results = []
    Loading.show({
      spinner: QSpinnerGears,
      message: i18n.t('prepareExportData'),
      delay: 400
    })
    for (const noteField of noteFields) {
      const { docGuid } = noteField
      const result = await _getContent(kbGuid, docGuid)
      results.push(result)
    }
    const contents = results.map(result => {
      const isHtml = !_.endsWith(result.info.title, '.md')
      const {
        html,
        info: { docGuid },
        resources
      } = result
      let content
      if (isHtml) {
        content = helper.convertHtml2Markdown(html, kbGuid, docGuid, resources)
      } else {
        content = helper.extractMarkdownFromMDNote(
          html,
          kbGuid,
          docGuid,
          resources
        )
      }
      return {
        content,
        title: isHtml ? result.info.title : result.info.title.replace('.md', '')
      }
    })
    Loading.hide()
    const exportCategory = category || currentCategory
    const exportCategoryName = exportCategory.split('/')[1] || 'Export'
    await exportMarkdownFiles({
      contents,
      category: exportCategoryName
    })
  },

  async blogDeploy ({ state, dispatch, rootState }, { category, config: passedConfig } = {}) {
    let config = passedConfig

    // 每次都弹出配置弹框让用户确认
    if (!config) {
      bus.$emit('showBlogDeployDialog', { category })
      return
    }

    if (!config?.blogDir) {
      bus.$emit('showBlogDeployDialog', { category })
      return
    }

    if (!category) {
      category = state.currentCategory
    }

    Loading.show({
      spinner: QSpinnerGears,
      message: i18n.t('deployStart'),
      delay: 200
    })

    try {
      const kbGuid = state.kbGuid
      const noteList = await dispatch('getCategoryNotesForExport', { kbGuid, category })
      if (!noteList || noteList.length === 0) {
        Loading.hide()
        Notify.create({ message: 'No notes to deploy', type: 'warning' })
        return
      }

      // 2. Fetch full content for each note
      const results = []
      for (const note of noteList) {
        const result = await _getContent(kbGuid, note.docGuid)
        results.push(result)
      }

      // 3. Process content (HTML → Markdown)
      const contents = results.map(result => {
        const isHtml = !_.endsWith(result.info.title, '.md')
        const { html, info: { docGuid }, resources } = result
        let content
        if (isHtml) {
          content = helper.convertHtml2Markdown(html, kbGuid, docGuid, resources)
        } else {
          content = helper.extractMarkdownFromMDNote(html, kbGuid, docGuid, resources)
        }
        return {
          content,
          title: isHtml ? result.info.title : result.info.title.replace('.md', '')
        }
      })

      // 4. Write to blog _posts directory (同时生成 shortlink-map.json)
      const blogPath = path.join(config.blogDir)
      await BlogDeployService.writeBlogPosts(blogPath, contents, config.theme || 'default', category)

      // 5. Generate sidebar.json
      await BlogDeployService.generateSidebarJson(blogPath, contents)

      // 6. Ensure README.md exists
      await BlogDeployService.ensureReadme(blogPath, category)

      // 7. Trigger main process: vuepress build + GitHub trigger
      Loading.hide()

      const result = await startBlogDeploy({
        blogDir: config.blogDir,
        theme: config.theme,
        githubConfig: config.github,
        sftpConfig: config.sftp,
        customBuildCommand: config.customBuildCommand,
        base: config.base,
        packageManager: config.packageManager,
        cdnDeps: state.rootState?.client?.cdnDeps || []
      })

      if (result.error) {
        if (result.error === 'vuepressNotFound') {
          Notify.create({ message: i18n.t('vuepressNotFound'), type: 'negative' })
        } else if (result.error === 'blogDirInvalid') {
          const details = result.details?.join('\n') || ''
          Notify.create({
            message: i18n.t('blogDirInvalid'),
            caption: details,
            type: 'negative',
            timeout: 0
          })
        } else {
          Notify.create({ message: i18n.t('deployFailed') + ': ' + result.error, type: 'negative' })
        }
      }
      // Note: on success, the progress dialog handles the done notification
    } catch (err) {
      Loading.hide()
      Notify.create({ message: i18n.t('deployFailed') + ': ' + err.message, type: 'negative' })
    }
  },

  cancelBlogDeploy () {
    cancelBlogDeploy().catch(() => {})
  }
}
