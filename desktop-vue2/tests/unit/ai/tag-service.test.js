// ============================================================================
// tests/unit/ai/tag-service.test.js
//
// 锁定 TagService（打标结果的落库层）：
//   1) resolveTagRefs：命中已有标签就复用（不新建），没命中才 createTag；新建失败要进 failed
//   2) 新建的标签会被塞回 pool，同批次后续笔记能直接复用（避免同一批里建出重复标签）
//   3) applyTagsToNote：追加而不覆盖原有 tags；只有本地标签才写 note_tags
//   4) fetchUntaggedNotes：只挑「无标签且非空」的笔记，并按修改时间倒序
//
// DatabaseClient 用内存假实现替换（真实实现依赖 electron ipcRenderer）。
// ============================================================================

jest.mock('src/utils/DatabaseClient', () => {
  const state = {
    notes: new Map(),
    attached: [],
    localTags: []
  }
  return {
    __esModule: true,
    default: {
      notes: {
        getById: jest.fn(async id => state.notes.get(id) || null),
        getAllLite: jest.fn(async () => Array.from(state.notes.values())),
        update: jest.fn(async (id, updates) => {
          const next = { ...(state.notes.get(id) || {}), ...updates }
          state.notes.set(id, next)
          return next
        })
      },
      tags: {
        getAll: jest.fn(async () => state.localTags),
        attachToNote: jest.fn(async (noteId, tagId) => {
          state.attached.push({ noteId, tagId })
          return true
        }),
        cleanupUnused: jest.fn(async () => ({ success: true, removed: [{ id: 9, name: '未使用' }] }))
      },
      __state: state
    }
  }
})

const DatabaseClient = require('src/utils/DatabaseClient.js').default
const TagService = require('../../../src/services/TagService.js').default

const { __state: dbState } = DatabaseClient

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

beforeEach(() => {
  dbState.notes.clear()
  dbState.attached.length = 0
  dbState.localTags = []
  DatabaseClient.notes.update.mockClear()
  DatabaseClient.tags.attachToNote.mockClear()
})

function seedNote (note) {
  const row = { id: 1, title: 'Untitled', content: '', category: '/', tags: '', data_modified: 0, ...note }
  dbState.notes.set(row.id, row)
  return row
}

describe('TagService — resolveTagRefs（复用优先）', () => {
  const pool = [
    { name: '读书笔记', tagGuid: 'local_tag_1', localId: 1, source: 'local' },
    { name: 'AI Tools', tagGuid: 'cloud-guid-1', localId: null, source: 'cloud' }
  ]

  test('命中已有标签 → 直接复用，不调用 createTag', async () => {
    const createTag = jest.fn()
    const result = await TagService.resolveTagRefs({
      names: ['读书笔记', 'ai tools'],
      pool: [...pool],
      createTag
    })

    expect(result.reused).toEqual(['读书笔记', 'AI Tools'])
    expect(result.created).toEqual([])
    expect(result.failed).toEqual([])
    expect(createTag).not.toHaveBeenCalled()
    expect(result.refs.map(ref => ref.tagGuid)).toEqual(['local_tag_1', 'cloud-guid-1'])
    expect(result.refs.every(ref => ref.reused === true)).toBe(true)
  })

  test('未命中 → 调用 createTag，并把新标签写回 pool 供后续复用', async () => {
    const mutablePool = [...pool]
    const createTag = jest.fn(async name => ({ id: 7, name, tagGuid: 'local_tag_7' }))

    const first = await TagService.resolveTagRefs({
      names: ['时间管理'],
      pool: mutablePool,
      createTag
    })
    expect(first.created).toEqual(['时间管理'])
    expect(first.refs[0].tagGuid).toBe('local_tag_7')
    expect(first.refs[0].localId).toBe(7)
    expect(first.refs[0].reused).toBe(false)

    const second = await TagService.resolveTagRefs({
      names: ['时间管理'],
      pool: mutablePool,
      createTag
    })
    expect(second.reused).toEqual(['时间管理'])
    expect(createTag).toHaveBeenCalledTimes(1)
  })

  test('createTag 抛错或无返回值 → 记入 failed，不产生 ref', async () => {
    const createTag = jest.fn(async name => {
      if (name === '坏标签') throw new Error('boom')
      return null
    })
    const result = await TagService.resolveTagRefs({
      names: ['坏标签', '空标签'],
      pool: [],
      createTag
    })
    expect(result.refs).toEqual([])
    expect(result.failed).toEqual(['坏标签', '空标签'])
  })

  test('空名称被忽略', async () => {
    const createTag = jest.fn()
    const result = await TagService.resolveTagRefs({ names: ['', '  ', '#'], pool: [], createTag })
    expect(result.refs).toEqual([])
    expect(createTag).not.toHaveBeenCalled()
  })
})

describe('TagService — applyTagsToNote', () => {
  test('追加标签而保留原有 tags，并写 note_tags', async () => {
    seedNote({ id: 1, docGuid: 'local_1', tags: 'local_tag_1' })
    const result = await TagService.applyTagsToNote({
      noteId: 1,
      tagRefs: [
        { name: '读书笔记', tagGuid: 'local_tag_1', localId: 1 },
        { name: '时间管理', tagGuid: 'local_tag_7', localId: 7 }
      ]
    })

    expect(result.changed).toBe(true)
    // 原本的 local_tag_1 不会被重复追加
    expect(result.added).toEqual(['时间管理'])
    expect(result.note.tags).toBe('local_tag_1*local_tag_7')
    expect(DatabaseClient.notes.update).toHaveBeenCalledTimes(1)
    const [, updates] = DatabaseClient.notes.update.mock.calls[0]
    expect(updates.tags).toBe('local_tag_1*local_tag_7')
    expect(typeof updates.local_modified).toBe('number')
    // 两个本地标签都写了 note_tags
    expect(dbState.attached).toEqual([
      { noteId: 1, tagId: 1 },
      { noteId: 1, tagId: 7 }
    ])
  })

  test('云端标签（无 localId）只改 notes.tags，不写 note_tags', async () => {
    seedNote({ id: 2, docGuid: 'cloud-2', tags: '' })
    const result = await TagService.applyTagsToNote({
      noteId: 2,
      tagRefs: [{ name: 'AI Tools', tagGuid: 'cloud-guid-1', localId: null }]
    })
    expect(result.note.tags).toBe('cloud-guid-1')
    expect(dbState.attached).toEqual([])
  })

  test('标签已存在时 changed=false 且不写库', async () => {
    seedNote({ id: 3, docGuid: 'local_3', tags: 'local_tag_1' })
    const result = await TagService.applyTagsToNote({
      noteId: 3,
      tagRefs: [{ name: '读书笔记', tagGuid: 'local_tag_1', localId: 1 }]
    })
    expect(result.added).toEqual([])
    expect(result.changed).toBe(false)
    expect(DatabaseClient.notes.update).not.toHaveBeenCalled()
  })

  test('笔记不存在 → NOTE_NOT_FOUND', async () => {
    await expect(TagService.applyTagsToNote({ noteId: 999, tagRefs: [] }))
      .rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' })
  })
})

describe('TagService — fetchUntaggedNotes', () => {
  test('只返回无标签且有内容的笔记，按修改时间倒序', async () => {
    seedNote({ id: 1, title: '有标签', tags: 'local_tag_1', data_modified: 300, content: 'x' })
    seedNote({ id: 2, title: '旧的无标签', tags: '', data_modified: 100, content: '正文 A' })
    seedNote({ id: 3, title: '新的无标签', tags: null, data_modified: 200, content: '正文 B' })
    seedNote({ id: 4, title: '', tags: '', content: '   ', data_modified: 400 })

    const rows = await TagService.fetchUntaggedNotes()
    expect(rows.map(row => row.id)).toEqual([3, 2])
    expect(rows[0]).toMatchObject({
      id: 3,
      title: '新的无标签',
      preview: '正文 B',
      modifiedAt: 200
    })
  })

  test('预览截断到 160 字符', async () => {
    seedNote({ id: 5, title: '长文', tags: '', content: '字'.repeat(400), data_modified: 10 })
    const [row] = await TagService.fetchUntaggedNotes()
    expect(row.preview.length).toBe(160)
  })
})

describe('TagService — 统计与清理', () => {
  test('computeLocalTagUsage 统计每个 tagGuid 被引用次数', async () => {
    seedNote({ id: 1, tags: 'local_tag_1*local_tag_2' })
    seedNote({ id: 2, tags: 'local_tag_1' })
    seedNote({ id: 3, tags: '' })

    const usage = await TagService.computeLocalTagUsage()
    expect(usage).toEqual({ local_tag_1: 2, local_tag_2: 1 })
  })

  test('loadTagPool 在登录态可只合并云端标签', async () => {
    const { pool } = await TagService.loadTagPool({
      cloudTags: [{ name: '云标签', tagGuid: 'cloud-guid-9' }],
      includeLocalTags: false
    })
    expect(pool).toEqual([{ name: '云标签', tagGuid: 'cloud-guid-9', localId: null, source: 'cloud' }])
  })

  test('cleanupUnusedTags 透传主进程结果', async () => {
    const result = await TagService.cleanupUnusedTags()
    expect(result).toMatchObject({ success: true })
    expect(result.removed).toHaveLength(1)
  })
})
