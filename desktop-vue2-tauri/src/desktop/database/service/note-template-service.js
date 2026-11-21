/**
 * note-template-service - 笔记模板 DB 持久化服务
 *
 * 提供：
 *   - ensureSchema()    建表 note_templates + 两条索引；幂等可反复调用
 *   - listAll()         按 sort_order 排序返回所有 row
 *   - saveOne(row)      upsert 单条，按 id 主键冲突则 UPDATE
 *   - saveMany(rows)    批量 upsert，返回 { success, count }
 *   - remove(id)        删除单条
 *
 * 表结构：
 *   id           TEXT PRIMARY KEY   客户端生成的稳定 id
 *   name         TEXT NOT NULL      模板名（用户可读）
 *   desc         TEXT               模板描述
 *   content      TEXT NOT NULL      模板正文（Markdown）；不含 H1 标题行，标题由 createNote 拼在最前
 *   is_builtin   INTEGER DEFAULT 0  内置标记（目前不内置种子，预留）
 *   sort_order   INTEGER DEFAULT 0  排序权重，升序
 *   created_at   INTEGER            创建时间
 *   updated_at   INTEGER            更新时间
 *
 * 工厂模式：createNoteTemplateService({ db, execToObjects, execOne, saveDatabase, log })
 */

function createNoteTemplateService ({ db, execToObjects, execOne, saveDatabase, log } = {}) {
  if (!db) throw new Error('[note-template-service] db is required')
  if (typeof execToObjects !== 'function') throw new Error('[note-template-service] execToObjects is required')
  if (typeof execOne !== 'function') throw new Error('[note-template-service] execOne is required')
  const logger = log || console

  function ensureSchema () {
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS note_templates (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          "desc"      TEXT,
          content     TEXT NOT NULL DEFAULT '',
          is_builtin  INTEGER NOT NULL DEFAULT 0,
          sort_order  INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        )
      `)
      db.run(`CREATE INDEX IF NOT EXISTS idx_note_tpl_name       ON note_templates(name)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_note_tpl_sort_order ON note_templates(sort_order)`)
      logger.info && logger.info('[DB] note_templates table ready')
    } catch (error) {
      logger.error && logger.error('[DB] ensureSchema(note_templates) error:', error)
    }
  }

  function listAll () {
    try {
      const rows = execToObjects(
        'SELECT * FROM note_templates ORDER BY is_builtin DESC, sort_order ASC, created_at ASC'
      ) || []
      return rows.map(normalizeRow).filter(Boolean)
    } catch (error) {
      logger.error && logger.error('[note-template-service] listAll error:', error)
      return []
    }
  }

  function saveOne (row) {
    if (!row || !row.id) {
      return { success: false, code: 'INVALID', message: 'id required' }
    }
    const name = String(row.name || '').trim()
    if (!name) {
      return { success: false, code: 'NAME_REQUIRED', message: 'name required' }
    }
    try {
      const now = Date.now()
      const existing = execOne('SELECT id FROM note_templates WHERE id = ?', [row.id])
      const params = [
        name,
        String(row.desc || ''),
        String(row.content || ''),
        row.is_builtin ? 1 : 0,
        Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        now
      ]
      if (existing) {
        db.run(
          `UPDATE note_templates SET name = ?, "desc" = ?, content = ?, is_builtin = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
          [...params, row.id]
        )
      } else {
        // 表 8 列：id, name, "desc", content, is_builtin, sort_order, created_at, updated_at
        // params = [name, desc, content, is_builtin, sort_order, now(updated_at)]
        // created_at 也用 now；[row.id, ...params, now] = 1+6+1 = 8 个
        db.run(
          `INSERT INTO note_templates (id, name, "desc", content, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id, ...params, now]
        )
      }
      if (typeof saveDatabase === 'function') saveDatabase()
      return { success: true, data: normalizeRow(execOne('SELECT * FROM note_templates WHERE id = ?', [row.id])) }
    } catch (error) {
      logger.error && logger.error('[note-template-service] saveOne error:', error)
      const message = error && error.message ? error.message : String(error)
      return { success: false, code: 'SAVE_FAILED', message }
    }
  }

  function saveMany (rows) {
    const list = Array.isArray(rows) ? rows : []
    if (list.length === 0) return { success: true, count: 0 }
    let count = 0
    for (const row of list) {
      const r = saveOne(row)
      if (r && r.success) count++
    }
    return { success: true, count }
  }

  function remove (id) {
    if (!id) return false
    try {
      db.run('DELETE FROM note_templates WHERE id = ?', [id])
      if (typeof saveDatabase === 'function') saveDatabase()
      return true
    } catch (error) {
      logger.error && logger.error('[note-template-service] remove error:', error)
      return false
    }
  }

  // 防御性规整：未知字段 / 错误类型 graceful skip
  function normalizeRow (raw) {
    if (!raw || typeof raw !== 'object') return null
    if (!raw.id) return null
    return {
      id: String(raw.id),
      name: String(raw.name || ''),
      desc: String(raw.desc || ''),
      content: String(raw.content || ''),
      is_builtin: raw.is_builtin ? 1 : 0,
      sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : 0,
      created_at: Number(raw.created_at) || 0,
      updated_at: Number(raw.updated_at) || 0
    }
  }

  return {
    ensureSchema,
    listAll,
    saveOne,
    saveMany,
    remove,
    normalizeRow
  }
}

module.exports = createNoteTemplateService
module.exports.createNoteTemplateService = createNoteTemplateService
