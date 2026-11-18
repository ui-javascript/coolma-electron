/**
 * 云同步策略常量与辅助函数
 *
 * 三种策略（值即 SettingsServerPanel 单选按钮的 value）：
 *   - offlineFirst（默认）：离线优先
 *       * 保证 SQLite 同步成功（本地写入 await，必须成功）
 *       * 笔记在线保存 / 更新接口异步（fire-and-forget，不阻塞）
 *       * 首次打开先用离线数据渲染文件夹树 / 笔记列表，无需等待登录与接口
 *   - onlineFirst：在线优先
 *       * 接口返回内容后才取消笔记 loading
 *       * 首次打开先登录并等接口返回文件夹树结构才取消 loading
 *       * SQLite 同步改为异步（不阻塞在线主路径）
 *   - pureOnline：纯在线（项目最开始的模式）
 *       * 全部依赖在线，无需同步 SQLite
 */

export const SYNC_STRATEGY = {
  OFFLINE_FIRST: 'offlineFirst',
  ONLINE_FIRST: 'onlineFirst',
  PURE_ONLINE: 'pureOnline'
}

export const DEFAULT_SYNC_STRATEGY = SYNC_STRATEGY.OFFLINE_FIRST

export function normalizeSyncStrategy (value) {
  return Object.values(SYNC_STRATEGY).includes(value) ? value : DEFAULT_SYNC_STRATEGY
}

/**
 * 从 rootState.client.cloudSyncStrategy 解析当前策略（含兜底默认值）
 * @param {object} rootState vuex rootState
 * @returns {'offlineFirst'|'onlineFirst'|'pureOnline'}
 */
export function getSyncStrategy (rootState) {
  return normalizeSyncStrategy(rootState?.client?.cloudSyncStrategy)
}

export function isOfflineFirst (rootState) {
  return getSyncStrategy(rootState) === SYNC_STRATEGY.OFFLINE_FIRST
}

export function isOnlineFirst (rootState) {
  return getSyncStrategy(rootState) === SYNC_STRATEGY.ONLINE_FIRST
}

export function isPureOnline (rootState) {
  return getSyncStrategy(rootState) === SYNC_STRATEGY.PURE_ONLINE
}
