/* eslint-env jest */
/**
 * P1-1 阶段二：Tauri 引擎路径回归。
 *
 * 用假的 `@tauri-apps/api/core` 把 `db_query` / `db_run` 接到一个 sql.js 内存库上，
 * 复刻 `src-tauri/src/db.rs` 的返回契约（query 返回对象数组、run 返回 { changes, lastInsertRowid }）。
 * 这样能在没有真实 WebView 的环境里验证「前端异步助手 + Rust 命令契约」是否闭环：
 * 参数形态或返回形态一旦漂移，这里会先炸。
 */
jest.mock('sql.js/dist/sql-wasm-browser.js', () => () => jest.requireActual('sql.js')())
jest.mock('sql.js/dist/sql-wasm-browser.wasm', () => 'sql-wasm-browser.wasm')
jest.mock('portkey-ai', () => jest.fn())
jest.mock('../src/desktop/database/storage', () => ({
  loadSnapshot: jest.fn(),
  writeSnapshot: jest.fn()
}))

const mockState = { memory: null, commands: [] }

function mockRowsOf (sql, params) {
  const memory = mockState.memory
  if (!params || !params.length) {
    const result = memory.exec(sql)
    if (!result.length) return []
    const { columns, values } = result[0]
    return values.map(row => {
      const record = {}
      columns.forEach((column, index) => { record[column] = row[index] })
      return record
    })
  }
  const statement = memory.prepare(sql)
  try {
    statement.bind(params)
    const records = []
    while (statement.step()) records.push(statement.getAsObject())
    return records
  } finally {
    statement.free()
  }
}

jest.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  convertFileSrc: () => 'http://coolma-resource.localhost/',
  invoke: async (command, args = {}) => {
    mockState.commands.push(command)
    if (command === 'db_query') return mockRowsOf(args.sql, args.params)
    if (command === 'db_run') {
      mockRowsOf(args.sql, args.params)
      return {
        changes: mockState.memory.getRowsModified(),
        lastInsertRowid: mockState.memory.exec('SELECT last_insert_rowid() AS id')[0].values[0][0]
      }
    }
    throw new Error('未预期的命令：' + command)
  }
}))

let invoke

beforeAll(async () => {
  const SQL = await jest.requireActual('sql.js')()
  mockState.memory = new SQL.Database()
  invoke = require('../src/desktop/database').invokeDatabase
  // 首条命令会走 ensureDatabase → initSchema，全部落到 db_run / db_query
  await invoke('db:getStats')
})

afterAll(() => {
  if (mockState.memory) mockState.memory.close()
})

test('引擎选择走 tauri 分支：只调 Rust 命令，不再读写整库快照', () => {
  const storage = require('../src/desktop/database/storage')
  expect(storage.loadSnapshot).not.toHaveBeenCalled()
  expect(storage.writeSnapshot).not.toHaveBeenCalled()
  expect(mockState.commands).toContain('db_query')
  expect(mockState.commands).toContain('db_run')
})

test('Rust 契约下笔记写入读回一致（含图片地址归一）', async () => {
  const created = await invoke('db:createNote', { title: 'Tauri 引擎验证', content: '正文', doc_guid: 'local_tauri_1', dirty: 1 })
  expect(created && created.id).toBeTruthy()

  const updated = await invoke('db:updateNote', {
    id: created.id,
    updates: { content: '![](http://coolma-resource.localhost/kb/doc/b.png)' }
  })
  // Tauri 形态下读回是渲染用地址（含 coolma-resource 主机）
  expect(updated.content).toContain('coolma-resource.localhost/kb/doc/b.png')

  const rows = await invoke('db:getNotes', {})
  const list = Array.isArray(rows) ? rows : (rows && rows.notes) || []
  expect(list.some(note => note.id === created.id)).toBe(true)

  await expect(invoke('db:deleteNote', created.id)).resolves.toBeTruthy()
})

test('Rust 契约下连续写与标签链路不丢数据', async () => {
  await invoke('db:setAppState', { key: 'engine/tauri/a', value: '1' })
  await invoke('db:setAppState', { key: 'engine/tauri/b', value: '2' })
  await expect(invoke('db:getAppState', 'engine/tauri/a')).resolves.toBe('1')
  await expect(invoke('db:getAppState', 'engine/tauri/b')).resolves.toBe('2')

  const tag = await invoke('db:createTag', { name: 'tauri标签', color: '#000000' })
  expect(tag && tag.id).toBeTruthy()
  const note = await invoke('db:createNote', { title: '事务笔记', content: 'x', doc_guid: 'local_tauri_2' })
  await expect(invoke('db:attachTagToNote', { noteId: note.id, tagId: tag.id })).resolves.toBeTruthy()
  const noteTags = await invoke('db:getNoteTags', { noteId: note.id })
  expect(noteTags.some(row => row.id === tag.id)).toBe(true)
})
