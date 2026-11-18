/**
 * deleteEffect 业务内置插件 —— main-process 迁移模块
 * ==========================================================================
 *
 * 一次性迁移：把旧 `setting/deleteEffect` 的开关 + URL 合并进
 * `setting/microApps` 列表的内置条目 echo-monster-deleter，然后删掉旧 key。
 *
 * 升级场景：
 *   - 旧用户的 SQLite 里有 setting/deleteEffect = { enabled, url, devUrl }
 *   - 首次跑新代码后 microApps 列表里没有 echo-monster-deleter（首次升级还没触发 mergeBuiltInApps）
 *   - 这里读旧 key → 把 url/devUrl 写进新内置条目（合并入列表）→ 删旧 key
 *
 * v2026-08-08 演进：
 *   - 从 electron-main.js 抽到独立文件，主进程只需要 require + 调用迁移函数，
 *     本身不再持有任何怪兽字样字符串。
 *   - 下架流程：删本文件 + 删 src/components/microApp/builtins/deleteEffect.js 的
 *     install 调用 + 删 _plugins/echo-monster-deleter/ 子项目目录，主进程代码完全不动。
 *
 * 使用方式（electron-main.js）:
 *   const { runDeleteEffectMigration } = require('./service/microApp/deleteEffectBuiltinMainMigration')
 *   ...
 *   await runDeleteEffectMigration({ db, execOne, saveDatabase, log, MICRO_APPS_KEY })
 */

const LEGACY_DELETE_EFFECT_KEY = 'setting/delete/deleteEffect'
const DELETE_EFFECT_APP_ID = 'echo-monster-deleter'

/**
 * 注入主进程上下文，运行一次性迁移。
 * @param {Object} ctx
 * @param {Object} ctx.db           better-sqlite3 数据库实例
 * @param {Function} ctx.execOne    SELECT 单行回调 (sql, params) => { value } | undefined
 * @param {Function} ctx.saveDatabase
 * @param {Object}   ctx.log        { info, warn, error }
 * @param {string}   ctx.MICRO_APPS_KEY  microApps 列表在 app_state 表里的 key
 */
async function runDeleteEffectMigration (ctx) {
  const { db, execOne, saveDatabase, log, MICRO_APPS_KEY } = ctx
  const legacyRow = execOne('SELECT value FROM app_state WHERE key = ?', [LEGACY_DELETE_EFFECT_KEY])
  if (!legacyRow) return { migrated: false, reason: 'no-legacy-key' }
  let legacy = null
  try { legacy = JSON.parse(legacyRow.value) } catch (_) { legacy = null }
  if (!legacy || typeof legacy !== 'object') {
    await db.run('DELETE FROM app_state WHERE key = ?', [LEGACY_DELETE_EFFECT_KEY])
    saveDatabase()
    return { migrated: false, reason: 'legacy-corrupted' }
  }

  const microAppsRow = execOne('SELECT value FROM app_state WHERE key = ?', [MICRO_APPS_KEY])
  let list = []
  try { list = JSON.parse(microAppsRow.value) } catch (_) { list = [] }
  if (!Array.isArray(list)) list = []
  const idx = list.findIndex(a => a && a.id === DELETE_EFFECT_APP_ID)

  const builtinEntry = {
    id: DELETE_EFFECT_APP_ID,
    name: '小怪兽删除特效',
    icon: 'el-icon-magic-stick',
    url: typeof legacy.url === 'string' ? legacy.url : '',
    devUrl: typeof legacy.devUrl === 'string' ? legacy.devUrl : '',
    isDefault: false,
    enabled: Boolean(legacy.enabled),
    isMobile: false,
    displayMode: 'fullscreen',
    isBuiltIn: true
  }

  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      url: builtinEntry.url,
      devUrl: builtinEntry.devUrl,
      enabled: builtinEntry.enabled,
      isBuiltIn: true,
      displayMode: 'fullscreen'
    }
  } else {
    list.push(builtinEntry)
  }

  const now = Date.now()
  await db.run(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [MICRO_APPS_KEY, JSON.stringify(list), now]
  )
  await db.run('DELETE FROM app_state WHERE key = ?', [LEGACY_DELETE_EFFECT_KEY])
  saveDatabase()
  log.info('[deleteEffectBuiltinMigration] 已合并旧 setting/deleteEffect → microApps 内置条目')
  return { migrated: true }
}

module.exports = {
  id: 'delete-effect-builtin-migration',
  migrate: runDeleteEffectMigration,
  LEGACY_DELETE_EFFECT_KEY,
  DELETE_EFFECT_APP_ID
}