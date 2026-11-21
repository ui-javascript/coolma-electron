/* eslint-env jest */
import { createSqlJsEngine, createTauriEngine, normalizeParams } from '../src/desktop/database/engine'

describe('数据库引擎适配层', () => {
  it('undefined 参数折成 null，非数组按空处理', () => {
    expect(normalizeParams([1, undefined, 'x'])).toEqual([1, null, 'x'])
    expect(normalizeParams()).toEqual([])
    expect(normalizeParams('nope')).toEqual([])
  })

  it('Tauri 后端把查询和执行分别映射到 db_query / db_run', async () => {
    const calls = []
    const engine = createTauriEngine(async (command, payload) => {
      calls.push([command, payload])
      return command === 'db_query' ? [{ id: 1 }] : { changes: 1, lastInsertRowid: 7 }
    })
    await expect(engine.query('SELECT ?', [1])).resolves.toEqual([{ id: 1 }])
    await expect(engine.run('INSERT INTO t VALUES (?)', [undefined])).resolves.toEqual({
      changes: 1,
      lastInsertRowid: 7
    })
    expect(calls).toEqual([
      ['db_query', { sql: 'SELECT ?', params: [1] }],
      ['db_run', { sql: 'INSERT INTO t VALUES (?)', params: [null] }]
    ])
  })

  it('没有 invoke 实现时直接报错，不静默失败', () => {
    expect(() => createTauriEngine()).toThrow('缺少 invoke 实现')
  })

  it('sql.js 后端无参数走 exec，有参数走 prepare/step，并在写后落快照', async () => {
    const freed = []
    const database = {
      exec: sql => (sql === 'SELECT last_insert_rowid() as id'
        ? [{ columns: ['id'], values: [[9]] }]
        : [{ columns: ['name'], values: [['无参数']] }]),
      prepare: sql => {
        let stepped = false
        const statement = {
          sql,
          params: null,
          bind (params) { statement.params = params },
          step () {
            if (stepped) return false
            stepped = true
            return true
          },
          getAsObject: () => ({ name: '有参数' }),
          free: () => freed.push(sql)
        }
        return statement
      },
      run: jest.fn(async () => undefined),
      getRowsModified: () => 3
    }
    const persist = jest.fn()
    const engine = createSqlJsEngine(database, persist)

    await expect(engine.query('SELECT name FROM t')).resolves.toEqual([{ name: '无参数' }])
    await expect(engine.query('SELECT name FROM t WHERE name = ?', ['x'])).resolves.toEqual([
      { name: '有参数' }
    ])
    expect(freed).toHaveLength(1)
    await expect(engine.run('INSERT INTO t VALUES (?)', ['y'])).resolves.toEqual({
      changes: 3,
      lastInsertRowid: 9
    })
    expect(database.run).toHaveBeenCalledWith('INSERT INTO t VALUES (?)', ['y'])
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('sql.js 缺少实例时直接报错', () => {
    expect(() => createSqlJsEngine(null)).toThrow('缺少 sql.js 数据库实例')
  })
})
