/**
 * DatabaseClient - 渲染进程数据库客户端
 * 通过 IPC 与主进程通信，实现数据库操作。
 *
 * 按领域暴露分组接口，便于业务代码按 notes/tags/categories/
 * sync/appState/runes 组织调用。
 */

import { ipcRenderer } from 'electron'

const invoke = (channel, payload) => {
  if (typeof payload === 'undefined') {
    return ipcRenderer.invoke(channel)
  }
  return ipcRenderer.invoke(channel, payload)
}

const notes = {
  /**
   * 获取所有笔记
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>}
   */
  async getAll(options = {}) {
    return await invoke('db:getNotes', options)
  },

  /**
   * 获取单个笔记
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    return await invoke('db:getNote', id)
  },

  /**
   * 根据 doc_guid 获取单个笔记
   * @param {string} docGuid
   * @returns {Promise<Object|null>}
   */
  async getByDocGuid(docGuid) {
    return await invoke('db:getNoteByDocGuid', docGuid)
  },

  /**
   * 根据 doc_guid 获取笔记（按 local_modified 时间戳取最新版本）
   * @param {string} docGuid
   * @returns {Promise<Object|null>}
   */
  async getByDocGuidWithPriority(docGuid) {
    return await invoke('db:getNoteByDocGuidWithPriority', docGuid)
  },

  /**
   * 获取笔记列表摘要（不含正文，content 只返回前 200 字预览）
   * 用于启动 / 切换目录时快速渲染文件树与笔记列表。
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>}
   */
  async getAllLite(options = {}) {
    return await invoke('db:getNotesLite', options)
  },

  /**
   * 获取所有笔记的基本信息（用于去重检查）
   * @returns {Promise<Array>} 返回 [{title, category, kb_guid}, ...]
   */
  async getAllBasic() {
    return await invoke('db:getAllNotesBasic')
  },

  /**
   * 创建笔记
   * @param {Object} note
   * @returns {Promise<Object|null>}
   */
  async create(note) {
    return await invoke('db:createNote', note)
  },

  /**
   * 更新笔记
   * @param {number} id
   * @param {Object} updates
   * @returns {Promise<Object|null>}
   */
  async update(id, updates) {
    return await invoke('db:updateNote', { id, updates })
  },

  /**
   * 删除笔记
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async remove(id) {
    return await invoke('db:deleteNote', id)
  },

  /**
   * 按 kb_guid 删除所有笔记（logout 时清理旧账号数据）
   * @param {string} kbGuid
   * @returns {Promise<number>}
   */
  async deleteByKbGuid(kbGuid) {
    return await invoke('db:deleteNotesByKbGuid', kbGuid)
  },

  /**
   * logout 时清理旧账号数据
   * @param {string} kbGuid
   * @returns {Promise<number>}
   */
  async clearByKbGuid(kbGuid) {
    return await invoke('db:clearNotesByKbGuid', kbGuid)
  },

  /**
   * 清理不属于当前账号的所有笔记（login 时隔离旧账号数据）
   * @param {string} currentKbGuid
   * @returns {Promise<number>}
   */
  async clearOtherAccounts(currentKbGuid) {
    return await invoke('db:clearOtherAccountNotes', currentKbGuid)
  },

  /**
   * 获取指定账号的待同步笔记
   * @param {string} kbGuid
   * @returns {Promise<Array>}
   */
  async getPendingByKbGuid(kbGuid) {
    return await invoke('db:getPendingSyncNotesByKbGuid', kbGuid)
  },

  /**
   * 将 kb_guid=null 的离线笔记迁移到当前账号
   * @param {string} currentKbGuid
   * @returns {Promise<number>}
   */
  async migrateOffline(currentKbGuid) {
    return await invoke('db:migrateOfflineNotes', currentKbGuid)
  }
}

const tags = {
  /**
   * 获取所有标签
   * @returns {Promise<Array>}
   */
  async getAll(options = {}) {
    return await invoke('db:getTags', options)
  },

  /**
   * 创建标签
   * @param {Object} tag
   * @returns {Promise<Object|null>}
   */
  async create(tag) {
    return await invoke('db:createTag', tag)
  },

  async getByName(name) {
    return await invoke('db:getTagByName', { name })
  },

  async getNoteTags(noteId) {
    return await invoke('db:getNoteTags', { noteId })
  },

  async attachToNote(noteId, tagId) {
    return await invoke('db:attachTagToNote', { noteId, tagId })
  },

  async removeFromNote(noteId, tagId) {
    return await invoke('db:removeTagFromNote', { noteId, tagId })
  },

  /**
   * 重命名标签（本地标签）
   * @param {number} id
   * @param {string} name
   * @returns {Promise<{success: boolean, data?: object, code?: string, message?: string}>}
   */
  async rename(id, name) {
    return await invoke('db:renameTag', { id, name })
  },

  async remove(id) {
    return await invoke('db:deleteTag', id)
  },

  /**
   * 清理未被任何笔记引用的本地标签
   * @returns {Promise<{success: boolean, removed: Array<{id, name}>}>}
   */
  async cleanupUnused() {
    return await invoke('db:cleanupUnusedTags')
  }
}

const sync = {
  /**
   * 获取同步状态统计
   * @returns {Promise<Object>}
   */
  async getStats() {
    return await invoke('db:getStats')
  },

  // ============ 诊断接口（临时） ============
  async diagCounts() {
    return await invoke('db:diag:counts')
  },
  async diagDirtyNotes() {
    return await invoke('db:diag:dirty-notes')
  },
  async diagSimulateNoopWrite(noteId) {
    return await invoke('db:diag:simulate-noop-write', noteId)
  },

  /**
   * 创建本地 ID ↔ 云端 doc_guid 映射记录
   * @param {number} localId
   * @param {string} cloudGuid
   * @param {string} source
   * @returns {Promise<Object|null>}
   */
  async createGuidMapping(localId, cloudGuid, source = 'wiznote') {
    return await invoke('db:createGuidMapping', { localId, serverGuid: cloudGuid, service: source })
  },

  /**
   * 记录删除待同步日志
   * @param {Object} payload
   * @param {number} payload.noteId
   * @param {string} payload.docGuid
   * @param {string} payload.kbGuid
   * @returns {Promise<boolean>}
   */
  async logPendingDelete({ noteId, docGuid, kbGuid }) {
    return await invoke('db:logPendingDelete', {
      noteId,
      docGuid,
      kbGuid
    })
  },

  async getPendingDeleteLogs() {
    return await invoke('db:getPendingDeleteLogs')
  },

  async markSyncLogSynced(id) {
    return await invoke('db:markSyncLogSynced', { id })
  },

  async cleanupSyncedDeleteLogs() {
    return await invoke('db:cleanupSyncedDeleteLogs')
  },

  /**
   * 重置 SQLite 数据库（清空所有本地笔记，重置同步状态）
   * @returns {Promise<boolean>}
   */
  async resetDatabase() {
    return await invoke('db:resetDatabase')
  }
}

const categories = {
  async getAll(options = {}) {
    return await invoke('db:getCategories', options)
  },

  async create(params) {
    return await invoke('db:createCategory', params)
  },

  async remove(category) {
    return await invoke('db:deleteCategory', { category })
  },

  async ensureOfflineRoot() {
    return await invoke('db:ensureOfflineRoot')
  },

  async syncToCloud(params) {
    return await invoke('db:syncCategoryToCloud', params)
  },

  async migrateOffline(currentKbGuid) {
    return await invoke('db:migrateOfflineCategories', currentKbGuid)
  }
}

const appState = {
  async get(key) {
    return await invoke('db:getAppState', key)
  },

  async getMany(keys = []) {
    return await invoke('db:getAppStates', keys)
  },

  async set(key, value) {
    return await invoke('db:setAppState', { key, value })
  },

  async remove(key) {
    return await invoke('db:removeAppState', key)
  }
}

const aiModels = {
  async getAll() {
    return await invoke('db:getAiModelConfigs')
  },

  async getById(id) {
    return await invoke('db:getAiModelConfig', id)
  },

  async save(config) {
    return await invoke('db:saveAiModelConfig', config)
  },

  async remove(id) {
    return await invoke('db:deleteAiModelConfig', id)
  },

  async setDefault(id) {
    return await invoke('db:setDefaultAiModelConfig', id)
  },

  async testConnection(id) {
    return await invoke('db:testAiModelConfig', id)
  }
}

const aiSkills = {
  /**
   * 获取用户可见的自定义技能列表（排除内置）
   */
  async getAll() {
    return await invoke('db:getAiSkills')
  },

  /**
   * 获取全部技能（含内置），仅供开发调试使用
   */
  async getAllIncludingBuiltin() {
    return await invoke('db:getAllAiSkills')
  },

  async getById(id) {
    return await invoke('db:getAiSkill', id)
  },

  async save(skill) {
    return await invoke('db:saveAiSkill', skill)
  },

  async remove(id) {
    return await invoke('db:deleteAiSkill', id)
  }
}

const runes = {
  async getAll() {
    return await invoke('db:getRunes')
  },

  async save(rune) {
    return await invoke('db:saveRune', rune)
  },

  async saveMany(items) {
    return await invoke('db:saveRunes', items)
  },

  async remove(id) {
    return await invoke('db:deleteRune', id)
  }
}

/**
 * 符文预设模板（rune_templates 表）。
 * 与 runes（用户保存的符文卡片实例）解耦，仅承担"下拉选项 / 远端导入"职责。
 */
const runeTemplates = {
  async getAll() {
    return await invoke('db:getRuneTemplates')
  },

  async save(item) {
    return await invoke('db:saveRuneTemplate', item)
  },

  async saveMany(list) {
    return await invoke('db:saveRuneTemplates', list)
  },

  async remove(id) {
    return await invoke('db:deleteRuneTemplate', id)
  },

  /**
   * 重置符文模板：删掉所有内置符文模板，再用传入的最新列表重新插入；用户自定义符文模板保留。
   * @param {Object} [options]
   * @param {Array} [options.builtins] 由 renderer 端推过来的最新内置符文模板列表（取自
   *                                   `src/components/rune/runeTemplates/runeTemplates.js` 的
   *                                   `BUILTIN_RUNE_TEMPLATE_META`）；不传则 main 端因拿不到
   *                                   兜底镜像而直接返回 `NO_BUILTIN_RUNE_TEMPLATES`。
   *
   * 与 `echoes.clearAll` 对称：v2026-07-29 之后主进程已不再维护内置符文模板镜像，
   * 真相源完全在 renderer 端，因此 IPC 必须把 `builtins` 一并 push 过去。
   */
  async clearAll (options = {}) {
    const builtins = Array.isArray(options && options.builtins) ? options.builtins : null
    return await invoke('db:clearRuneTemplates', { builtins })
  },

  async fetchRemote({ sourceUrl, categoryKey }) {
    return await invoke('rune-template:fetchRemote', { sourceUrl, categoryKey })
  }
}

/**
 * Rune Pack 在线 URL 抓取（v2026-08-01）。
 *
 * 与 runeTemplates.fetchRemote（单文件 .vue 源码 URL）的区别：
 *   - 本接口返回 { success, text, finalUrl }，由 renderer 端 parseRunePack 自行解析为 Rune Pack v1。
 *   - 不写库、不调 inferTemplateMeta、不 saveMany —— 这条路径只把"URL → 文本"做完，
 *     让弹框复用 parseRunePack / preview / commit 这一条与 file 上传完全一致的链路。
 *
 * 错误码与 file 上传路径统一：
 *   INVALID_URL / FETCH_FAILED / TOO_LARGE / EMPTY_BODY / REDIRECT_LOOP。
 */
const runePacks = {
  async fetchRemote ({ sourceUrl } = {}) {
    return await invoke('rune-pack:fetchRemote', { sourceUrl })
  }
}

/**
 * 笔记模板（note_templates 表）。
 * 由用户在 Settings → 编辑器 → 模板中维护；新建笔记时按选中的 templateId
 * 将模板内容拼到 `# {标题}` 之后（标题规则在最前不变）。
 */
const noteTemplates = {
  async getAll() {
    return await invoke('db:getNoteTemplates')
  },

  async save(item) {
    return await invoke('db:saveNoteTemplate', item)
  },

  async saveMany(list) {
    return await invoke('db:saveNoteTemplates', list)
  },

  async remove(id) {
    return await invoke('db:deleteNoteTemplate', id)
  }
}

const echoes = {
  async getAll() {
    return await invoke('db:getEchoes')
  },

  async save(echo) {
    return await invoke('db:saveEcho', echo)
  },

  async saveMany(items) {
    return await invoke('db:saveEchoes', items)
  },

  async remove(id) {
    return await invoke('db:deleteEcho', id)
  },

  /**
   * 回响批量导入 —— 预演（v2026-08-01）
   * @param {Object} payload
   * @param {Array}  payload.echoes              解析后的 Echo Pack echoes 数组
   * @param {string} payload.targetCategory      弹框中选中的导入目标分类
   * @param {Array}  [payload.builtinNamesHint] renderer 端内置回响名称集合（用于运行期保护）
   * @returns {Promise<{success, previewAt, newItems, conflictItems, builtinBlocked, invalidItems, fileDuplicates, ...}>}
   */
  async previewImport(payload) {
    return await invoke('db:previewEchoImport', payload || {})
  },

  /**
   * 回响批量导入 —— 提交（v2026-08-01）
   * @param {Object} payload
   * @param {Array}  payload.createNames         新增项的规范化名称列表
   * @param {Array}  payload.replaceNames        覆盖项的规范化名称列表（必须命中现存自定义回响）
   * @param {number} payload.previewAt           预览返回的预览时间戳，用于 stale 比对
   * @param {string} payload.targetCategory      导入目标分类
   * @param {Object} payload.sourceByName        { [name]: {...待写入完整字段} } 提交时的字段来源
   * @param {Array}  [payload.builtinNamesHint]  内置回响名称集合
   */
  async importMany(payload) {
    return await invoke('db:importEchoes', payload || {})
  },

  /**
   * 重置回响：删掉所有内置回响，再用传入的最新列表重新插入；自定义回响保留。
   * @param {Object} [options]
   * @param {Array} [options.builtins] 由 renderer 端推过来的最新内置 echo 列表（含最新 anno_source）；
   *                                   不传则由 main 进程用其镜像版兜底。
   */
  async clearAll (options = {}) {
    const builtins = Array.isArray(options && options.builtins) ? options.builtins : null
    return await invoke('db:clearEchoes', { builtins })
  }
}

/**
 * Echo Pack 在线 URL 抓取（v2026-08-01）。
 *
 * 与 runePacks.fetchRemote 对称：仅做 URL → text，JSON 解析交给 renderer 端的 parseEchoPack，
 * 错误码与 file 上传路径完全一致，便于在弹框里复用同一套用户文案。
 */
const echoPacks = {
  async fetchRemote ({ sourceUrl } = {}) {
    return await invoke('echo-pack:fetchRemote', { sourceUrl })
  }
}

const cdnDeps = {
  async getAll() {
    return await invoke('db:getCdnDeps')
  },

  async saveAll(deps) {
    return await invoke('db:saveCdnDeps', deps)
  }
}

const microApps = {
  async getAll() {
    return await invoke('db:getMicroApps')
  },

  async saveAll(apps) {
    return await invoke('db:saveMicroApps', apps)
  }
}

const DatabaseClient = {
  notes,
  tags,
  sync,
  categories,
  appState,
  aiModels,
  aiSkills,
  runes,
  runeTemplates,
  runePacks,
  noteTemplates,
  echoes,
  echoPacks,
  cdnDeps,
  microApps
}

export default DatabaseClient
