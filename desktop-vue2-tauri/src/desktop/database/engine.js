/**
 * 数据库引擎适配层：把「查询 / 执行」抽象成异步接口，两种后端共用同一套调用写法。
 *
 * - Tauri 后端：走 Rust 的 `db_query` / `db_run`（rusqlite，单连接，增量写盘）
 * - 浏览器预览：仍用 sql.js 内存库 + IndexedDB 快照，保持 `pnpm dev:frontend` 可用
 *
 * 这里只放纯适配逻辑，不 import sql.js，避免单元测试被 wasm 资源拖下水。
 */

const LAST_INSERT_ROWID_SQL = 'SELECT last_insert_rowid() as id'

/** `undefined` 在 serde 侧会变成「缺字段」，统一折成 null 再传出去。 */
export function normalizeParams (params) {
  if (!Array.isArray(params)) return []
  return params.map(value => (value === undefined ? null : value))
}

/** Rust 侧返回 {@code { changes, lastInsertRowid }}，与 sql.js 的取数方式对齐。 */
export function createTauriEngine (invokeImpl) {
  if (typeof invokeImpl !== 'function') throw new Error('缺少 invoke 实现')
  return {
    query: (sql, params) => invokeImpl('db_query', { sql, params: normalizeParams(params) }),
    run: (sql, params) => invokeImpl('db_run', { sql, params: normalizeParams(params) }),
    // rusqlite 每条语句已落到真实文件，无需整库导出
    flush: async () => {},
    // 与 sql.js 一致：无参数时也能查询（PRAGMA、SELECT 常量等）
    dispose: () => {}
  }
}

function rowsFromExec (result) {
  if (!result || !result.length) return []
  const { columns, values } = result[0]
  return values.map(row => {
    const record = {}
    columns.forEach((column, index) => { record[column] = row[index] })
    return record
  })
}

function lastInsertRowid (database) {
  const result = database.exec(LAST_INSERT_ROWID_SQL)
  if (result && result.length && result[0].values.length) return result[0].values[0][0]
  return null
}

/**
 * sql.js 后端。`persist` 由 `flush()` 调用，浏览器预览靠它把整库快照塞进 IndexedDB。
 */
export function createSqlJsEngine (database, persist = () => undefined) {
  if (!database) throw new Error('缺少 sql.js 数据库实例')
  return {
    async query (sql, params) {
      const bound = normalizeParams(params)
      if (!bound.length) return rowsFromExec(database.exec(sql))
      const statement = database.prepare(sql)
      try {
        statement.bind(bound)
        const records = []
        while (statement.step()) records.push(statement.getAsObject())
        return records
      } finally {
        statement.free()
      }
    },
    async run (sql, params) {
      await database.run(sql, normalizeParams(params))
      return { changes: database.getRowsModified(), lastInsertRowid: lastInsertRowid(database) }
    },
    /**
     * 落盘。sql.js 后端只能整库导出，故由调用方在「命令边界」统一触发一次，
     * 避免 initSchema 这种连续几十条写语句各导出一次。
     */
    async flush () {
      try {
        await persist()
      } catch (error) {
        // 打标：调用方据此区分「写盘失败」与「SQL 语法/约束错误」，命令整体要失败
        if (error && typeof error === 'object') error.persistFailure = true
        throw error
      }
    },
    dispose () {
      database.close()
    }
  }
}
