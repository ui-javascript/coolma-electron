/* eslint-env jest */
// P1-1 阶段二回归：数据库助手异步化后，主要写/读路径必须仍然闭环
jest.mock('sql.js/dist/sql-wasm-browser.js', () => () => jest.requireActual('sql.js')())
jest.mock('sql.js/dist/sql-wasm-browser.wasm', () => 'sql-wasm-browser.wasm')
jest.mock('portkey-ai', () => jest.fn())
jest.mock('../src/desktop/database/storage', () => ({
  loadSnapshot: jest.fn().mockResolvedValue(new Uint8Array()),
  writeSnapshot: jest.fn().mockResolvedValue(undefined)
}))

let invoke

beforeEach(() => {
  jest.resetModules()
  invoke = require('../src/desktop/database').invokeDatabase
})

test('笔记 CRUD：创建 → 更新（含图片地址归一）→ 读取 → 删除', async () => {
  const created = await invoke('db:createNote', { title: '异步化验证', content: '正文', doc_guid: 'local_async_1', dirty: 1 })
  expect(created && created.id).toBeTruthy()

  const runtimeUrl = 'http://coolma-resource.localhost/kb/doc/a.png'
  const updated = await invoke('db:updateNote', {
    id: created.id,
    updates: { content: `![](${runtimeUrl})`, title: '异步化验证-改' }
  })
  expect(updated.title).toBe('异步化验证-改')
  // 落库统一规范形态；非 Tauri（浏览器预览/测试）读出来也是规范形态
  expect(updated.content).toContain('coolma://coolma.app/kb/doc/a.png')

  const rows = await invoke('db:getNotes', {})
  const list = Array.isArray(rows) ? rows : (rows && rows.notes) || []
  expect(list.some(note => note.id === created.id)).toBe(true)

  await expect(invoke('db:deleteNote', created.id)).resolves.toBeTruthy()
  await expect(invoke('db:getNote', created.id)).resolves.toBeNull()
})

test('标签链路：建标签 → 挂到笔记 → 查询 → 解绑 → 删标签', async () => {
  const created = await invoke('db:createNote', { title: '标签笔记', content: 'x', doc_guid: 'local_async_2' })
  const tag = await invoke('db:createTag', { name: '异步标签', color: '#123456' })
  expect(tag && tag.id).toBeTruthy()

  await expect(invoke('db:attachTagToNote', { noteId: created.id, tagId: tag.id })).resolves.toBeTruthy()
  const noteTags = await invoke('db:getNoteTags', { noteId: created.id })
  expect(noteTags.some(row => row.id === tag.id)).toBe(true)

  const byName = await invoke('db:getTagByName', { name: '异步标签' })
  expect(byName).toBeTruthy()
  expect(byName.name).toBe('异步标签')

  await expect(invoke('db:removeTagFromNote', { noteId: created.id, tagId: tag.id })).resolves.toBeTruthy()
  await expect(invoke('db:deleteTag', tag.id)).resolves.toBeTruthy()
})

test('设置项读写 + 统计口径', async () => {
  await expect(invoke('db:setAppState', { key: 'setting/async/test', value: 'ok' })).resolves.toBeTruthy()
  await expect(invoke('db:getAppState', 'setting/async/test')).resolves.toBe('ok')
  await expect(invoke('db:getAppStates', ['setting/async/test'])).resolves.toBeDefined()
  await expect(invoke('db:removeAppState', 'setting/async/test')).resolves.toBeTruthy()

  const stats = await invoke('db:getStats')
  expect(typeof stats.total).toBe('number')
  expect(stats.total).toBeGreaterThanOrEqual(0)
})

test('模板服务：符文模板 / 笔记模板的保存、读取、删除', async () => {
  const saved = await invoke('db:saveRuneTemplate', {
    id: 'async-tpl-1',
    name: '异步模板',
    category_key: 'general',
    template: '<template><div/></template>'
  })
  expect(saved.success).toBe(true)

  const list = await invoke('db:getRuneTemplates')
  expect(list.some(row => row.id === 'async-tpl-1')).toBe(true)

  await expect(invoke('db:deleteRuneTemplate', 'async-tpl-1')).resolves.toBe(true)

  const noteTpl = await invoke('db:saveNoteTemplate', { id: 'async-note-tpl', name: '笔记模板', content: 'hi' })
  expect(noteTpl.success).toBe(true)
  const noteTplList = await invoke('db:getNoteTemplates')
  expect(noteTplList.some(row => row.id === 'async-note-tpl')).toBe(true)
})

test('分类与 guid 映射（含事务/索引相关写入）', async () => {
  await expect(invoke('db:ensureOfflineRoot')).resolves.toBeDefined()
  const created = await invoke('db:createCategory', { category: '异步分类', parent: null, localOnly: true })
  expect(created).toBeTruthy()

  const list = await invoke('db:getCategories', {})
  const names = (Array.isArray(list) ? list : []).map(row => row.category)
  expect(names.join('|')).toContain('异步分类')

  await expect(invoke('db:createGuidMapping', {
    localId: 424242,
    serverGuid: 'server-guid-async',
    service: 'wiznote'
  })).resolves.toBeDefined()
  const mapping = await invoke('db:getGuidMappingByLocalId', { localId: 424242 })
  expect(mapping && mapping.server_guid).toBe('server-guid-async')
})

test('diag 只读接口在异步化后仍可用', async () => {
  const counts = await invoke('db:diag:counts')
  expect(counts).toBeDefined()
  const dirty = await invoke('db:diag:dirty-notes')
  expect(dirty).toBeDefined()
})
