import types from 'src/store/client/types'
import { Dark, Notify } from 'quasar'
import api from 'src/utils/api'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import _ from 'lodash'
import { importImage, uploadImages } from 'src/ApiInvoker'
import DatabaseClient from 'src/utils/DatabaseClient'
import { BUILTIN_ECHO_CARDS } from 'components/echo/echoCore'

const applyQuickInsertColumns = (value) => {
  if (typeof document === 'undefined') return
  const numericValue = Number(value)
  const normalizedValue = Number.isFinite(numericValue)
    ? Math.min(8, Math.max(4, numericValue))
    : 6
  document.documentElement.style.setProperty('--quick-insert-columns', String(normalizedValue))
}

export default {
  initClientStore ({ commit, state }) {
    const localStore = ClientFileStorage.getItemsFromStore(state)
    const hadPaneLayoutMode = Object.prototype.hasOwnProperty.call(localStore, 'paneLayoutMode')
    commit(types.INIT, localStore)
    if (!hadPaneLayoutMode && state.noteListVisible === false) {
      const patch = { paneLayoutMode: 2, categoryTreeVisible: false }
      commit(types.UPDATE_STATES, patch)
      commit(types.SAVE_ITEMS_TO_LOCAL_STORE_SYNC, patch)
    }
    applyQuickInsertColumns(state.quickInsertColumns)
    Dark.set(state.darkMode)
  },
  toggleChanged ({ commit }, { key, value }) {
    commit(types.TOGGLE_CHANGED, { key, value })
    commit(types.SAVE_TO_LOCAL_STORE_SYNC, [key, value])
    if (key === 'quickInsertColumns') {
      applyQuickInsertColumns(value)
    }
  },
  updateStateAndStore ({ commit }, options) {
    commit(types.UPDATE_STATES, options)
    commit(types.SAVE_ITEMS_TO_LOCAL_STORE_SYNC, options)
    if (Object.prototype.hasOwnProperty.call(options, 'quickInsertColumns')) {
      applyQuickInsertColumns(options.quickInsertColumns)
    }
  },
  cyclePaneLayout ({ state, dispatch }) {
    const next = (state.paneLayoutMode + 1) % 3
    dispatch('updateStateAndStore', {
      paneLayoutMode: next,
      noteListVisible: next !== 2,
      categoryTreeVisible: next === 0
    })
  },
  expandFullPaneLayout ({ dispatch }) {
    dispatch('updateStateAndStore', {
      paneLayoutMode: 0,
      noteListVisible: true,
      categoryTreeVisible: true
    })
  },
  async sendToFlomo ({ state, rootState }, docGuid) {
    const { flomoApiUrl } = state
    if (helper.isNullOrEmpty(flomoApiUrl)) {
      Notify.create({
        message: i18n.t('flomoApiUrlIsEmpty'),
        color: 'red-10',
        caption: i18n.t('requestError')
      })
      return
    }
    const { kbGuid } = rootState.server
    const note = await this.dispatch('server/getContent', {
      kbGuid,
      docGuid
    })
    const isHtml = !_.endsWith(note.info.title, '.md')
    let content
    const { html, resources } = note
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
    await api.ThirdPartApi.sendToFlomo(content, flomoApiUrl)
    Notify.create({
      message: i18n.t('sendToFlomoSuccessfully'),
      color: 'green-10',
      icon: 'check'
    })
  },
  async importImageFromLocal () {
    return importImage()
  },
  async uploadImages ({ state }, imagePaths) {
    return uploadImages(imagePaths)
  },
  setRightClickNoteItem ({ commit }, docGuid) {
    commit(types.TOGGLE_CHANGED, { key: 'rightClickNoteItem', value: docGuid })
  },
  setRightClickCategoryItem ({ commit }, categoryPath) {
    commit(types.TOGGLE_CHANGED, { key: 'rightClickCategoryItem', value: categoryPath })
  },
  /**
   * 仅更新 vuex state（不回写 electron-store）。
   * CDN 依赖的真源是 SQLite `cdnDeps` 表，不适合再写一份到 electron-store。
   * 消费方：博客部署（读 client.cdnDeps 做 VuePress index.html 注入）。
   */
  setCdnDeps ({ commit }, deps) {
    const list = Array.isArray(deps) ? deps : []
    commit(types.UPDATE_STATES, { cdnDeps: list })
    return list
  },
  /**
   * 应用启动时初始化各类「需要先读库」的运行时数据：
   * 符文 / 回响 / 笔记模板 / 语法解析开关 / CDN 依赖清单。
   *
   * v2026-11-03：原先这些数据只有「打开设置弹框」时才会加载
   * （SettingsDialog.loadLazyData），导致不打开设置时：
   *   - 用户自建符文在编辑器快捷插入面板里全部消失；
   *   - DB 里的自定义回响加载不到，编辑器只认内置的 16 张；
   *   - 博客部署读 client.cdnDeps 一直是空数组，CDN 注入不生效。
   * 现在统一在应用启动时加载，与设置弹框无关。
   */
  async initRuntimeData ({ dispatch }) {
    const steps = ['runes', 'echoes', 'noteTemplates', 'parsing']
    const results = await Promise.allSettled([
      dispatch('loadRunes'),
      dispatch('loadEchoes'),
      dispatch('loadNoteTemplates'),
      dispatch('loadParsingSettings')
    ])
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[RuneEcho] init ${steps[i]} failed:`, r.reason)
      }
    })

    // 内置符文预设模板（rune_templates）：DB 为空时懒种 14 张内置模板。
    // 这里主动触发一次，保证「不打开设置」时模板下拉也有内置项。
    try {
      const { default: runeTemplateService } = await import('src/services/RuneTemplateService')
      await runeTemplateService.listFlat()
    } catch (err) {
      console.warn('[RuneEcho] builtin rune templates seed skipped:', err)
    }

    // CDN 依赖清单灌进 vuex（博客部署读 client.cdnDeps 做 VuePress index.html 注入）
    try {
      const { resolveCdnDeps } = await import('src/utils/cdnDepsUtil')
      const deps = await resolveCdnDeps()
      dispatch('setCdnDeps', deps)
    } catch (err) {
      console.warn('[CdnDeps] init cdnDeps cache failed:', err)
    }
  },
  async loadRunes ({ commit }) {
    try {
      const runes = await DatabaseClient.runes.getAll()
      if (Array.isArray(runes)) {
        commit(types.TOGGLE_CHANGED, { key: 'runeCards', value: runes })
      }
    } catch (err) {
      console.error('[Runes] loadRunes error:', err)
    }
  },
  async loadNoteTemplates ({ commit }) {
    try {
      const templates = await DatabaseClient.noteTemplates.getAll()
      if (Array.isArray(templates)) {
        // 读取路径防御：丢弃缺 id/name 的脏数据
        const sanitized = templates
          .filter(t => t && t.id && String(t.name || '').trim())
          .map(t => ({
            id: String(t.id),
            name: String(t.name || ''),
            desc: String(t.desc || ''),
            content: String(t.content || ''),
            is_builtin: t.is_builtin ? 1 : 0,
            sort_order: Number(t.sort_order) || 0,
            created_at: Number(t.created_at) || 0,
            updated_at: Number(t.updated_at) || 0
          }))
        commit(types.TOGGLE_CHANGED, { key: 'noteTemplates', value: sanitized })
      }
    } catch (err) {
      console.error('[NoteTemplates] loadNoteTemplates error:', err)
    }
  },
  async loadEchoes ({ commit }) {
    try {
      const storedFromDb = await DatabaseClient.echoes.getAll()
      const dbCards = Array.isArray(storedFromDb) ? storedFromDb : []

      // === 内置回响装配策略（v2026-07 调整后） ===
      // DB 中存的 builtin 行（来自本地 dev 模式编辑内置回响）优先覆盖代码版默认模板，
      // DB 没有的 builtin 用 BUILTIN_ECHO_CARDS 兜底，保证 16 个总在场。
      // DB schema 没有 isBuiltin 列；按 id 前缀约定补标记，仅用于 UI 区分显示。
      // 生产 (isProd) 也允许读取 DB 里的 builtin 行（同样的覆盖语义），但
      // saveEcho / saveEchoes 在 isProd 时已经过滤掉 builtin 写入，
      // 所以生产时 DB 里的 builtin 行通常为空，本策略实际上不会改变默认模板。
      const builtinIds = new Set(BUILTIN_ECHO_CARDS.map(echo => echo.id))
      const dbBuiltins = dbCards.filter(echo => builtinIds.has(echo.id))
      const dbBuiltinsById = new Map(dbBuiltins.map(echo => [echo.id, echo]))
      const builtinEchoes = BUILTIN_ECHO_CARDS.map(template => {
        const override = dbBuiltinsById.get(template.id)
        if (!override) return { ...template, isBuiltin: true }
        // DB 行覆盖代码版默认模板；保留代码版里 DB 没存的元数据
        return { ...template, ...override, id: template.id, isBuiltin: true }
      })
      const nonBuiltinDbCards = dbCards.filter(echo => !builtinIds.has(echo.id))

      const mergedEchoes = [
        ...builtinEchoes,
        ...nonBuiltinDbCards
      ]

      commit(types.TOGGLE_CHANGED, { key: 'echoCards', value: mergedEchoes })
    } catch (err) {
      console.error('[Echoes] loadEchoes error:', err)
    }
  },
  async saveRune (_, rune) {
    return await DatabaseClient.runes.save(rune)
  },
  async saveNoteTemplate (_, template) {
    return await DatabaseClient.noteTemplates.save(template)
  },
  async saveEcho (_, echo) {
    // 内置回响在本地 dev 模式 (!isProd) 下允许入库（覆盖代码版默认模板），
    // 生产模式 (isProd) 仍只写非 builtin 行，避免污染云端默认模板。
    // 注：Quasar 用 webpack DefinePlugin 注入 process.env.PROD，dev 下是字符串 'true'，prod 下是 false，
    // 所以用 Boolean(...) 而非 === true，与项目其它 isProd computed 风格一致。
    if (echo && echo.isBuiltin && Boolean(process.env.PROD)) {
      return { success: true, data: echo, skipped: 'builtin-in-prod' }
    }
    return await DatabaseClient.echoes.save(echo)
  },
  async deleteRune (_, id) {
    return await DatabaseClient.runes.remove(id)
  },
  async deleteNoteTemplate (_, id) {
    return await DatabaseClient.noteTemplates.remove(id)
  },
  async deleteEcho (_, id) {
    return await DatabaseClient.echoes.remove(id)
  },
  async saveRunes (_, runes) {
    return await DatabaseClient.runes.saveMany(runes)
  },
  async saveNoteTemplates (_, templates) {
    return await DatabaseClient.noteTemplates.saveMany(templates)
  },
  async saveEchoes (_, echoes) {
    // 内置回响在本地 dev 模式 (!isProd) 下允许入库（覆盖代码版默认模板），
    // 生产模式 (isProd) 过滤掉 isBuiltin 行，避免污染云端默认模板。
    const isProd = Boolean(process.env.PROD)
    const persistable = (Array.isArray(echoes) ? echoes : [])
      .filter(echo => !(echo && echo.isBuiltin && isProd))
    if (persistable.length === 0) return []
    return await DatabaseClient.echoes.saveMany(persistable)
  },
  /**
   * 执行同步（调用 SyncService）
   */
  async sync ({ commit }) {
    const SyncService = (await import('src/services/SyncService')).default

    commit(types.UPDATE_SYNC_STATUS, { isSyncing: true })

    try {
      const result = await SyncService.backupToCloud()

      const stats = await DatabaseClient.sync.getStats()
      commit(types.UPDATE_SYNC_STATUS, {
        isSyncing: false,
        lastSyncTime: Date.now(),
        ...stats
      })

      return result
    } catch (error) {
      console.error('[sync] Sync failed:', error)
      commit(types.UPDATE_SYNC_STATUS, { isSyncing: false })
      throw error
    }
  },
  async refreshSyncStatus ({ commit }) {
    const stats = await DatabaseClient.sync.getStats()
    commit(types.UPDATE_SYNC_STATUS, { ...stats })
  },
  /**
   * 从 SQLite app_state 读取「语法解析」开关到 vuex 内存缓存。
   * 真源是 DatabaseClient.appState（即 app_state 表 setting/parsing/* 键），
   * vuex 的 echoRequireParens / runeRequireTemplateDiv 字段仅作运行时响应式 cache，
   * 持久化永远走 SQLite（依据 sqlite-settings-storage.mdc 规范）。
   *
   * 读取路径防御：appState.get 在键不存在时返回 null/undefined，JSON.parse 失败也要容错，
   * 否则 vuex 会被一个坏数据直接毁成 NaN / undefined 触发下游 SettingsParsingPanel 抛错。
   *
   * @returns {Promise<{echoRequireParens:boolean, runeRequireTemplateDiv:boolean}>}
   */
  async loadParsingSettings ({ commit, state }) {
    const safeBool = (raw, fallback) => {
      if (raw === null || raw === undefined) return fallback
      if (typeof raw === 'boolean') return raw
      const text = String(raw).trim().toLowerCase()
      if (text === 'true' || text === '1') return true
      if (text === 'false' || text === '0') return false
      return fallback
    }
    const result = { echoRequireParens: true, runeRequireTemplateDiv: false }
    try {
      const rawEcho = await DatabaseClient.appState.get('setting/parsing/echoRequireParens')
      const rawRune = await DatabaseClient.appState.get('setting/parsing/runeRequireTemplateDiv')
      result.echoRequireParens = safeBool(rawEcho, state.echoRequireParens !== undefined ? state.echoRequireParens : true)
      result.runeRequireTemplateDiv = safeBool(rawRune, state.runeRequireTemplateDiv !== undefined ? state.runeRequireTemplateDiv : false)
    } catch (err) {
      console.warn('[parsing] loadParsingSettings fallback to defaults:', err)
    }
    const patch = {}
    if (state.echoRequireParens !== result.echoRequireParens) patch.echoRequireParens = result.echoRequireParens
    if (state.runeRequireTemplateDiv !== result.runeRequireTemplateDiv) patch.runeRequireTemplateDiv = result.runeRequireTemplateDiv
    if (Object.keys(patch).length > 0) {
      // 注意：不调 SAVE_ITEMS_TO_LOCAL_STORE_SYNC——这是 SQLite 真源，
      // 不应该再回写到 electron-store。
      commit(types.UPDATE_STATES, patch)
    }
    return result
  },
  /**
   * 仅更新 vuex state（不回写 electron-store）。专供 SettingsDialog 切换
   * 「语法解析 / echoRequireParens / runeRequireTemplateDiv」使用：
   *   - 真源是 SQLite app_state('setting/parsing/*')
   *   - 同步已经由 SettingsDialog.saveParsingSetting 做了 IPC
   *   - 这里只是把新值推给 vuex 让 Muya.vue 的 watch 触发实时切换
   *     inlineRules.echo_anno（不再走 electron-store 双写）。
   * 不传 STORE_SYNC 的好处：在 SettingsDialog 启动项目早期不会有冗余 IO，
   * 也避免「electron-store 里也有一份 echoRequireParens 但被 sqlite 覆盖」
   * 导致的二义性。
   */
  updateParsingStates ({ commit }, payload = {}) {
    const patch = {}
    if (Object.prototype.hasOwnProperty.call(payload, 'echoRequireParens')) {
      patch.echoRequireParens = Boolean(payload.echoRequireParens)
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'runeRequireTemplateDiv')) {
      patch.runeRequireTemplateDiv = Boolean(payload.runeRequireTemplateDiv)
    }
    if (Object.keys(patch).length > 0) {
      commit(types.UPDATE_STATES, patch)
    }
    return patch
  }
}
