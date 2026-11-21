/**
 * 业务内置微应用 migration 注册表（main-process）
 * ==========================================================================
 *
 * 这是个最小化的注册点：各业务模块（怪兽特效等）把自己的 migrate 函数注册进来，
 * 应用启动时统一 applyAll 跑一次。
 *
 * v2026-08-08 解耦：
 *   - 主进程不再持有任何业务 id 字符串（echo-monster-deleter / setting/deleteEffect 全部藏在
 *     各业务的 migrate 文件里）
 *   - 下架某业务：注释 / 删除该业务 require + registerBuiltinMigration 调用即可，主进程本身不动
 *
 * 使用方式（electron-main.js）:
 *   const builtinMigrationRegistry = require('./service/microApp/builtinMigrationRegistry')
 *   builtinMigrationRegistry.register([
 *     require('./service/microApp/deleteEffectBuiltinMigration')
 *   ])
 *   ...
 *   await builtinMigrationRegistry.applyAll({ db, execOne, saveDatabase, log, MICRO_APPS_KEY })
 */

const builtinMigrations = []

/**
 * 注册一个或多个业务内置迁移。
 * @param {Array<{id: string, migrate: (ctx) => Promise<any>}>} migrations
 */
function register (migrations) {
  if (!Array.isArray(migrations)) return
  migrations.filter(Boolean).forEach(m => {
    if (typeof m.migrate !== 'function') return
    const idx = builtinMigrations.findIndex(x => x.id === m.id)
    if (idx >= 0) builtinMigrations.splice(idx, 1, m)
    else builtinMigrations.push(m)
  })
}

/**
 * 应用所有已注册迁移。返回 { id, ok, result, error } 列表。
 * 单条迁移异常不影响其它迁移执行（独立 try/catch）。
 */
async function applyAll (ctx) {
  const out = []
  for (const m of builtinMigrations) {
    try {
      const result = await m.migrate(ctx)
      out.push({ id: m.id, ok: true, result })
    } catch (err) {
      out.push({ id: m.id, ok: false, error: String(err) })
    }
  }
  return out
}

/**
 * 测试用：清空注册表（jest 单测间需要隔离）
 */
function _reset () {
  builtinMigrations.length = 0
}

/**
 * 已注册迁移数（调试用）
 */
function _count () {
  return builtinMigrations.length
}

module.exports = {
  register,
  applyAll,
  _reset,
  _count
}