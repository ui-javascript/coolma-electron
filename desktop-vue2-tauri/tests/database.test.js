jest.mock('sql.js/dist/sql-wasm-browser.js', () => () => jest.requireActual('sql.js')())
jest.mock('sql.js/dist/sql-wasm-browser.wasm', () => 'sql-wasm-browser.wasm')
jest.mock('portkey-ai', () => jest.fn())

jest.mock('../src/desktop/database/storage', () => ({
  loadSnapshot: jest.fn().mockResolvedValue(new Uint8Array()),
  writeSnapshot: jest.fn().mockResolvedValue(undefined)
}))

let invoke
let snapshot

beforeEach(() => {
  jest.resetModules()
  invoke = require('../src/desktop/database').invokeDatabase
  snapshot = require('../src/desktop/database/storage')
})

test('offline note and settings survive reloading the database', async () => {
  const id = await invoke('db:createNote', { title: 'Tauri 本地笔记', content: '# 本地内容', doc_guid: 'local_tauri_test', dirty: 1 })
  const created = await invoke('db:getNoteByDocGuid', 'local_tauri_test')
  expect(id).toBeTruthy()
  expect(created).toMatchObject({ title: 'Tauri 本地笔记', content: '# 本地内容', dirty: 1 })
  await invoke('db:setAppState', { key: 'setting/editor/fontSize', value: '15' })

  const bytes = snapshot.writeSnapshot.mock.lastCall[0]
  expect(Buffer.from(bytes).subarray(0, 16).toString()).toBe('SQLite format 3\0')
  jest.resetModules()
  const load = require('../src/desktop/database/storage').loadSnapshot
  load.mockResolvedValue(bytes)
  const reopened = require('../src/desktop/database').invokeDatabase
  await expect(reopened('db:getNote', created.id)).resolves.toMatchObject({ content: '# 本地内容', dirty: 1 })
  await expect(reopened('db:getAppState', 'setting/editor/fontSize')).resolves.toBe('15')
})

test('a failed snapshot write rejects the command, and the next write persists it', async () => {
  await invoke('db:getNotes')
  snapshot.writeSnapshot.mockRejectedValueOnce(new Error('disk offline'))
  await expect(invoke('db:setAppState', { key: 'setting/bridge/test', value: '1' })).rejects.toThrow('disk offline')
  // 内存里的值还在，下一次写入会把整库快照重新落盘（sql.js 引擎每次 run 后导出）
  await expect(invoke('db:getAppState', 'setting/bridge/test')).resolves.toBe('1')
  await expect(invoke('db:setAppState', { key: 'setting/bridge/test2', value: '2' })).resolves.toBeTruthy()
  // getNotes（initSchema 之后首次 flush）、失败的 setAppState、getAppState 的补写、最后一次 setAppState
  expect(snapshot.writeSnapshot).toHaveBeenCalledTimes(4)
  expect(await snapshot.writeSnapshot.mock.lastCall[0]).toBeDefined()
  expect(Buffer.from(snapshot.writeSnapshot.mock.lastCall[0]).subarray(0, 16).toString()).toBe('SQLite format 3\0')
})
