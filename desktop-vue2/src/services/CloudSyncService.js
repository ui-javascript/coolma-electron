/**
 * CloudSyncService - 云同步服务
 * 挂载在 Settings 弹框的云同步面板中
 * 永远本地优先：同步只是将本地数据推送到云端，拉取只在本地不存在时发生
 */

import SyncService from './SyncService'
import DatabaseClient from '../utils/DatabaseClient'
import SessionStorageService from './SessionStorageService'

class CloudSyncService {
  constructor() {
    this._status = {
      isSyncing: false,
      lastSyncTime: null,
      total: 0,
      synced: 0,
      pending: 0,
      account: null,
      error: null
    }
    this._listeners = []
  }

  _normalizeSyncResult(result, fallbackSuccessPayload = {}) {
    const normalized = result && typeof result === 'object' ? { ...result } : null

    if (!normalized) {
      console.warn('[CloudSyncService] Sync returned empty result, treating as success payload fallback', {
        resultType: typeof result,
        fallbackSuccessPayload
      })
      return {
        ...fallbackSuccessPayload,
        success: true,
        reason: null,
        error: null
      }
    }

    const hasExplicitSuccess = Object.prototype.hasOwnProperty.call(normalized, 'success')
    const success = hasExplicitSuccess ? Boolean(normalized.success) : true

    if (!success) {
      const reason = normalized.reason || 'sync_failed'
      const error = normalized.error || this._getReasonMessage(reason)
      console.warn('[CloudSyncService] Normalized sync failure result', {
        reason,
        error,
        normalized
      })
      return {
        ...normalized,
        success: false,
        reason,
        error
      }
    }

    return {
      ...fallbackSuccessPayload,
      ...normalized,
      success: true,
      reason: normalized.reason || null,
      error: null
    }
  }

  _getReasonMessage(reason) {
    const messages = {
      not_logged_in: 'Cloud sync requires login first.',
      already_syncing: 'A sync task is already running.',
      preview_failed: 'Failed to load cloud restore preview.',
      sync_failed: 'Cloud sync failed.'
    }

    return messages[reason] || 'Cloud sync failed.'
  }

  get status() {
    return { ...this._status }
  }

  get isLoggedIn() {
    return SessionStorageService.isLoggedIn()
  }

  get accountInfo() {
    return SessionStorageService.getAccountInfo()
  }

  addListener(callback) {
    this._listeners.push(callback)
  }

  removeListener(callback) {
    this._listeners = this._listeners.filter(cb => cb !== callback)
  }

  _notify(event) {
    this._listeners.forEach(cb => {
      try { cb(event) } catch (e) { console.error('[CloudSyncService] Listener error:', e) }
    })
  }

  async _refreshStats() {
    try {
      const stats = await DatabaseClient.sync.getStats()
      this._status.total = stats.total || 0
      this._status.synced = stats.synced || 0
      this._status.pending = stats.pending || 0
    } catch (e) {
      console.warn('[CloudSyncService] Failed to refresh stats:', e)
    }
  }

  async _refreshAccount() {
    this._status.account = this.accountInfo
  }

  /**
   * 默认同步：仅备份本地变更到云端
   */
  async sync() {
    return this.pushOnly()
  }

  /**
   * 恢复预览：统计将新增/跳过/补全的笔记数
   */
  async getRestorePreview() {
    if (!this.isLoggedIn) {
      return {
        success: false,
        reason: 'not_logged_in',
        stats: { total: 0, pulled: 0, skipped: 0, backfilled: 0 }
      }
    }

    return await SyncService.previewRestoreFromCloud()
  }

  /**
   * 仅拉取：作为手动恢复入口，只从云端下载本地不存在的笔记，不推送
   */
  async pullOnly() {
    if (!this.isLoggedIn) {
      return this._normalizeSyncResult({ success: false, reason: 'not_logged_in' })
    }
    this._status.isSyncing = true
    this._status.error = null
    this._notify({ type: 'sync_start' })

    try {
      const result = this._normalizeSyncResult(await SyncService.restoreFromCloud())
      if (!result.success) {
        this._status.error = result.error
        this._notify({ type: 'sync_error', error: result.error })
        return result
      }

      const stats = result.stats || {}
      this._status.lastSyncTime = Date.now()
      await this._refreshStats()
      this._notify({ type: 'sync_complete', result })
      return {
        ...result,
        pulled: stats.pulled || 0,
        skipped: stats.skipped || 0,
        backfilled: stats.backfilled || 0
      }
    } catch (error) {
      this._status.error = error.message
      this._notify({ type: 'sync_error', error: error.message })
      return this._normalizeSyncResult({ success: false, error: error.message, reason: 'sync_failed' })
    } finally {
      this._status.isSyncing = false
    }
  }

  /**
   * 仅推送：只把本地 dirty 笔记推送到云端，不拉取
   */
  async pushOnly() {
    if (!this.isLoggedIn) {
      console.warn('[CloudSyncService] pushOnly blocked: SessionStorageService reports not logged in', {
        account: this.accountInfo,
        status: this._status
      })
      return this._normalizeSyncResult({ success: false, reason: 'not_logged_in' })
    }
    this._status.isSyncing = true
    this._status.error = null
    this._notify({ type: 'sync_start' })

    try {
      console.log('[CloudSyncService] pushOnly started', {
        account: this.accountInfo,
        pending: this._status.pending,
        synced: this._status.synced,
        total: this._status.total
      })
      const rawResult = await SyncService.pushToCloud()
      console.log('[CloudSyncService] pushOnly raw SyncService result', rawResult)
      const result = this._normalizeSyncResult(rawResult, { count: 0, errors: 0 })
      if (!result.success) {
        this._status.error = result.error
        console.warn('[CloudSyncService] pushOnly finished with failure result', result)
        this._notify({ type: 'sync_error', error: result.error })
        return result
      }

      this._status.lastSyncTime = Date.now()
      await this._refreshStats()
      console.log('[CloudSyncService] pushOnly completed', {
        result,
        status: this._status
      })
      this._notify({ type: 'sync_complete', result })
      return result
    } catch (error) {
      this._status.error = error.message
      console.error('[CloudSyncService] pushOnly threw exception', {
        message: error?.message,
        stack: error?.stack,
        responseStatus: error?.response?.status,
        responseData: error?.response?.data
      })
      this._notify({ type: 'sync_error', error: error.message })
      return this._normalizeSyncResult({ success: false, error: error.message, reason: 'sync_failed' })
    } finally {
      this._status.isSyncing = false
      console.log('[CloudSyncService] pushOnly finished finally', {
        status: this._status
      })
    }
  }

  /**
   * 初始化：加载同步状态
   */
  async init() {
    await this._refreshStats()
    await this._refreshAccount()
  }

  /**
   * 格式化最后同步时间
   */
  formatLastSyncTime() {
    if (!this._status.lastSyncTime) return null
    const d = new Date(this._status.lastSyncTime)
    return d.toLocaleString()
  }
}

export default new CloudSyncService()
