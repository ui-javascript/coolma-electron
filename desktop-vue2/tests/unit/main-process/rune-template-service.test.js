// ============================================================================
// tests/unit/main-process/rune-template-service.test.js
//
// 锁定主进程 src-electron/main-process/service/rune-template-service.js
// 的事务 + INSERT OR REPLACE 契约（v2026-08-01）。
//
//   这里用"假 sql.js db"替身（只录 calls、模拟抛错），不引入 sql.js + wasm
//   依赖。覆盖项：
//
//     1) saveOne 用 INSERT OR REPLACE（一条 SQL 落到底，不再 SELECT-then-INSERT/UPDATE）
//     2) saveMany 包到 BEGIN/COMMIT 事务，单条 SQL 失败整体 ROLLBACK
//     3) 整批成功才落盘（saveDatabase 只在 COMMIT 后被调一次）
//     4) saveMany 输入空数组时直接返回 success，不动 db
//     5) saveOne 给空 row 或无 id 直接返回 INVALID，不发 SQL
//
// ============================================================================

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

// ==== sql.js 替身：只记录 db.run() 调用，模拟 BEGIN/COMMIT/ROLLBACK 与单条失败 ====
function makeFakeDb (opts = {}) {
  const log = []
  const failOnInsert = opts.failOnInsert || null // 例如 { matchSql: 'INSERT OR REPLACE INTO rune_templates (id, category_key, name, "desc", color, icon, template, source_url, is_builtin, sort_order, created_at, updated_at)' }
  let inTxn = false
  let txnFailed = false

  const db = {
    run (sql, params) {
      const head = String(sql).split(/\s+/)[0].toUpperCase()
      if (head === 'BEGIN') {
        inTxn = true
        log.push({ type: 'BEGIN' })
        return
      }
      if (head === 'COMMIT') {
        log.push({ type: 'COMMIT' })
        inTxn = false
        return
      }
      if (head === 'ROLLBACK') {
        log.push({ type: 'ROLLBACK' })
        inTxn = false
        return
      }
      // 业务 SQL
      log.push({ type: 'RUN', sql: String(sql), params, inTxn })
      if (failOnInsert && String(sql).startsWith(failOnInsert.matchSql)) {
        txnFailed = true
        throw new Error('fake INSERT failure')
      }
      return
    },
    getLog () { return log.slice() },
    isInTxn () { return inTxn },
    isTxnFailed () { return txnFailed }
  }
  return db
}

// ==== 替身 execOne：从已记录的行里按 id 找 ====
// 这里用更简单的占位：永远返回 null（saveOne 内部最后 execOne 取的是 SELECT 结果，
// 测试不关心 SELECT 返回内容，只关心 SQL 序列与事务边界）
function execOneStub (_sql, _params) { return null }

// ==== 替身 execToObjects：同上 ====
function execToObjectsStub (_sql, _params) { return [] }

describe('rune-template-service 主进程契约（v2026-08-01）', () => {
  let createRuneTemplateService

  beforeAll(() => {
    const mod = require('../../../src-electron/main-process/service/rune-template-service.js')
    // module.exports 兼容两种形态：
    //   module.exports = createRuneTemplateService
    //   module.exports.createRuneTemplateService = createRuneTemplateService
    createRuneTemplateService = (typeof mod === 'function')
      ? mod
      : mod.createRuneTemplateService
  })

  describe('saveOne 单条原子 upsert', () => {
    test('INSERT OR REPLACE 一条 SQL 完成，不再 SELECT-then-分支', () => {
      const db = makeFakeDb()
      let saveCalls = 0
      const svc = createRuneTemplateService({
        db,
        execToObjects: execToObjectsStub,
        execOne: execOneStub,
        saveDatabase: () => { saveCalls++ },
        log: console
      })

      const result = svc.saveOne({
        id: 'rune-1', category_key: 'general', name: 'A',
        desc: '', color: '#FFF', icon: 'star',
        template: '<div/>', source_url: '', is_builtin: 0, sort_order: 1
      })

      expect(result.success).toBe(true)
      const log = db.getLog()
      // 只允许一条 INSERT OR REPLACE，不能有 SELECT
      const runs = log.filter(l => l.type === 'RUN')
      expect(runs.length).toBe(1)
      expect(runs[0].sql).toMatch(/INSERT OR REPLACE INTO rune_templates/i)
      expect(runs[0].params[0]).toBe('rune-1')
      expect(saveCalls).toBe(1)
    })

    test('没 id 直接返回 INVALID，不发 SQL', () => {
      const db = makeFakeDb()
      const svc = createRuneTemplateService({
        db, execToObjects: execToObjectsStub, execOne: execOneStub,
        saveDatabase: () => {}, log: console
      })
      expect(svc.saveOne({}).success).toBe(false)
      expect(svc.saveOne(null).success).toBe(false)
      expect(db.getLog().filter(l => l.type === 'RUN').length).toBe(0)
    })
  })

  describe('saveMany 事务包裹', () => {
    test('空数组直接 success，不动 db', () => {
      const db = makeFakeDb()
      let saveCalls = 0
      const svc = createRuneTemplateService({
        db, execToObjects: execToObjectsStub, execOne: execOneStub,
        saveDatabase: () => { saveCalls++ }, log: console
      })
      const r = svc.saveMany([])
      expect(r.success).toBe(true)
      expect(r.count).toBe(0)
      expect(db.getLog().length).toBe(0)
      expect(saveCalls).toBe(0)
    })

    test('整批成功：BEGIN → 多次 INSERT → COMMIT，落盘只一次', () => {
      const db = makeFakeDb()
      let saveCalls = 0
      const svc = createRuneTemplateService({
        db, execToObjects: execToObjectsStub, execOne: execOneStub,
        saveDatabase: () => { saveCalls++ }, log: console
      })
      const rows = [
        { id: 'r1', category_key: 'general', name: 'A', template: '<a/>' },
        { id: 'r2', category_key: 'general', name: 'B', template: '<b/>' },
        { id: 'r3', category_key: 'general', name: 'C', template: '<c/>' }
      ]
      const r = svc.saveMany(rows)
      expect(r.success).toBe(true)
      expect(r.count).toBe(3)

      const log = db.getLog()
      expect(log[0].type).toBe('BEGIN')
      expect(log[log.length - 1].type).toBe('COMMIT')
      // 中间 3 条都是 INSERT OR REPLACE
      const inserts = log.filter(l => l.type === 'RUN')
      expect(inserts.length).toBe(3)
      inserts.forEach(i => expect(i.sql).toMatch(/INSERT OR REPLACE INTO rune_templates/i))
      // 落盘只 1 次（COMMIT 后）
      expect(saveCalls).toBe(1)
    })

    test('中间一条失败：ROLLBACK、不 COMMIT、整批不落盘', () => {
      const db = makeFakeDb({
        failOnInsert: { matchSql: 'INSERT OR REPLACE INTO rune_templates' } // 第一次 INSERT 就炸
      })
      let saveCalls = 0
      const svc = createRuneTemplateService({
        db, execToObjects: execToObjectsStub, execOne: execOneStub,
        saveDatabase: () => { saveCalls++ }, log: console
      })
      const rows = [
        { id: 'r1', category_key: 'general', name: 'A', template: '<a/>' },
        { id: 'r2', category_key: 'general', name: 'B', template: '<b/>' },
        { id: 'r3', category_key: 'general', name: 'C', template: '<c/>' }
      ]
      const r = svc.saveMany(rows)
      expect(r.success).toBe(false)
      expect(r.code).toBe('SAVE_FAILED')

      const log = db.getLog()
      // 必须有 BEGIN、有 ROLLBACK、绝不能有 COMMIT
      expect(log.some(l => l.type === 'BEGIN')).toBe(true)
      expect(log.some(l => l.type === 'ROLLBACK')).toBe(true)
      expect(log.some(l => l.type === 'COMMIT')).toBe(false)
      // 不能落盘
      expect(saveCalls).toBe(0)
    })

    test('无 id 的脏行被跳过，不计入 count、不抛错', () => {
      const db = makeFakeDb()
      let saveCalls = 0
      const svc = createRuneTemplateService({
        db, execToObjects: execToObjectsStub, execOne: execOneStub,
        saveDatabase: () => { saveCalls++ }, log: console
      })
      const rows = [
        { id: 'r1', category_key: 'general', name: 'A', template: '<a/>' },
        null,
        { category_key: 'general', name: 'no-id' }, // 无 id
        { id: '', category_key: 'general', name: 'empty-id' }, // 空 id
        { id: 'r2', category_key: 'general', name: 'B', template: '<b/>' }
      ]
      const r = svc.saveMany(rows)
      expect(r.success).toBe(true)
      expect(r.count).toBe(2) // 只有 r1、r2 真的写入了
      const inserts = db.getLog().filter(l => l.type === 'RUN')
      expect(inserts.length).toBe(2)
      expect(saveCalls).toBe(1)
    })

    test('即使整批都是脏行：空跑事务不影响任何 INSERT', () => {
      const db = makeFakeDb()
      let saveCalls = 0
      const svc = createRuneTemplateService({
        db, execToObjects: execToObjectsStub, execOne: execOneStub,
        saveDatabase: () => { saveCalls++ }, log: console
      })
      const r = svc.saveMany([null, {}, { name: 'no-id' }])
      expect(r.success).toBe(true)
      expect(r.count).toBe(0)
      // 注意：当前实现仍是 BEGIN/COMMIT 事务框架——验证 SQL 序列对齐契约
      const log = db.getLog()
      expect(log[0].type).toBe('BEGIN')
      expect(log[log.length - 1].type).toBe('COMMIT')
      const inserts = log.filter(l => l.type === 'RUN')
      expect(inserts.length).toBe(0)
    })
  })
})
