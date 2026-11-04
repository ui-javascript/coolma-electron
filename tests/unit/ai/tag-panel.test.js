// ============================================================================
// tests/unit/ai/tag-panel.test.js
//
// 「设置 → AI → 标签」维护面板：
//   1) 标签行 = 当前标签列表（离线本地 / 登录云端）+ 引用次数，并按次数倒序
//   2) 搜索 / 使用中 / 未使用 过滤
//   3) 新建：同名拦截；正常走既有 server/createTag
//   4) 重命名：走既有 server/renameTag，同名失败要提示
//   5) 删除：走既有 server/deleteTag，并从当前笔记的 info.tags 里摘掉该 tagGuid
//   6) 清理未使用：离线走主进程批量清理
// ============================================================================

jest.mock('src/utils/DatabaseClient', () => {
  const state = { notes: new Map(), localTags: [] }
  return {
    __esModule: true,
    default: {
      notes: {
        getById: jest.fn(async id => state.notes.get(id) || null),
        getAllLite: jest.fn(async () => Array.from(state.notes.values())),
        update: jest.fn(async (id, updates) => updates)
      },
      tags: {
        getAll: jest.fn(async () => state.localTags),
        attachToNote: jest.fn(async () => true),
        cleanupUnused: jest.fn(async () => ({ success: true, removed: [{ id: 2, name: '未用' }] }))
      },
      __state: state
    }
  }
})

const path = require('path')
const { mount, createLocalVue } = require('@vue/test-utils')
const Vuex = require('vuex')

const DatabaseClient = require('src/utils/DatabaseClient.js').default
const SettingsAiTagPanel = require(path.resolve(
  __dirname,
  '../../../src/components/settings/SettingsAiTagPanel.vue'
)).default

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

const Passthrough = { template: '<div><slot /></div>' }
const QUASAR_TAGS = [
  'q-btn', 'q-icon', 'q-input', 'q-checkbox', 'q-space', 'q-toggle',
  'q-btn-toggle', 'q-badge', 'q-spinner', 'q-tooltip', 'q-separator', 'q-item',
  'q-item-section'
]

function createContext ({ currentNote = {}, isLogin = false } = {}) {
  const localVue = createLocalVue()
  localVue.use(Vuex)
  QUASAR_TAGS.forEach(tag => localVue.component(tag, Passthrough))

  const actions = {
    getAllTags: jest.fn(async () => []),
    createTag: jest.fn(async () => ({ id: 5, name: '新标签', tagGuid: 'local_tag_5' })),
    renameTag: jest.fn(async () => ({ success: true })),
    deleteTag: jest.fn(async () => true)
  }
  const mutations = { update_current_note_tags: jest.fn() }

  const store = new Vuex.Store({
    modules: {
      server: {
        namespaced: true,
        state: {
          tags: [],
          tagNotesCount: {},
          isLogin,
          kbGuid: isLogin ? 'kb-1' : '',
          currentNote
        },
        actions,
        mutations
      }
    }
  })

  let lastDialog = null
  let lastOkHandler = null
  const mocks = {
    $t: key => key,
    $q: {
      notify: jest.fn(),
      dialog: jest.fn(options => {
        lastDialog = options
        return {
          onOk: handler => {
            lastOkHandler = handler
            return { onOk: handler }
          }
        }
      })
    }
  }

  return {
    localVue,
    store,
    actions,
    mutations,
    mocks,
    getLastDialog: () => lastDialog,
    runLastDialogOk: () => lastOkHandler()
  }
}

function mountPanel (ctx) {
  return mount(SettingsAiTagPanel, {
    localVue: ctx.localVue,
    store: ctx.store,
    propsData: { active: true },
    mocks: ctx.mocks
  })
}

function seedTags (store, tags, counts) {
  store.state.server.tags = tags
  store.state.server.tagNotesCount = counts
}

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

beforeEach(() => {
  DatabaseClient.__state.notes.clear()
  DatabaseClient.__state.localTags = []
  DatabaseClient.tags.cleanupUnused.mockClear()
})

describe('标签面板 — 列表、计数与过滤', () => {
  test('合并 tagNotesCount 并按下标数倒序', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [
      { name: '未用', tagGuid: 'local_tag_2' },
      { name: '读书', tagGuid: 'local_tag_1' }
    ], { local_tag_1: 3 })

    const wrapper = mountPanel(ctx)
    await flushPromises()

    expect(ctx.actions.getAllTags).toHaveBeenCalled()
    expect(wrapper.vm.tagRows.map(row => [row.name, row.count])).toEqual([
      ['读书', 3],
      ['未用', 0]
    ])
    expect(wrapper.vm.totalCount).toBe(2)
    expect(wrapper.vm.usedCount).toBe(1)
    expect(wrapper.vm.unusedCount).toBe(1)
  })

  test('tagNotesCount 缺省时用本地笔记统计兜底', async () => {
    DatabaseClient.__state.notes.set(1, { id: 1, tags: 'local_tag_2', content: 'x', title: 't' })
    const ctx = createContext()
    seedTags(ctx.store, [{ name: '未用', tagGuid: 'local_tag_2' }], {})

    const wrapper = mountPanel(ctx)
    await flushPromises()

    expect(wrapper.vm.tagRows[0].count).toBe(1)
  })

  test('搜索与「使用中 / 未使用」过滤', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [
      { name: '读书笔记', tagGuid: 'local_tag_1' },
      { name: '未使用标签', tagGuid: 'local_tag_2' }
    ], { local_tag_1: 2 })

    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.filterMode = 'unused'
    expect(wrapper.vm.filteredTags.map(tag => tag.name)).toEqual(['未使用标签'])

    wrapper.vm.filterMode = 'used'
    expect(wrapper.vm.filteredTags.map(tag => tag.name)).toEqual(['读书笔记'])

    wrapper.vm.filterMode = 'all'
    wrapper.vm.searchText = '读书'
    expect(wrapper.vm.filteredTags.map(tag => tag.name)).toEqual(['读书笔记'])
  })

  test('hasTagName 忽略大小写与首尾空格', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [{ name: 'AI Tools', tagGuid: 'cloud-1' }], {})
    const wrapper = mountPanel(ctx)
    await flushPromises()

    expect(wrapper.vm.hasTagName(' ai tools ')).toBe(true)
    expect(wrapper.vm.hasTagName('AI Tools', 'cloud-1')).toBe(false)
    expect(wrapper.vm.hasTagName('其它')).toBe(false)
  })
})

describe('标签面板 — 新建 / 重命名', () => {
  test('新建标签走既有 createTag', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [], {})
    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.openCreateTagDialog()
    expect(ctx.getLastDialog().prompt).toBeTruthy()
    await ctx.runLastDialogOk() // 值为空 → 提示必填
    expect(ctx.actions.createTag).not.toHaveBeenCalled()

    await wrapper.vm.submitCreateTag(' 新标签 ')
    expect(ctx.actions.createTag.mock.calls[0][1]).toEqual({ name: '新标签' })
    expect(ctx.mocks.$q.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'aiTagCreated' })
    )
  })

  test('同名标签不重复创建', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [{ name: '读书', tagGuid: 'local_tag_1' }], {})
    const wrapper = mountPanel(ctx)
    await flushPromises()

    await wrapper.vm.submitCreateTag('读书')
    expect(ctx.actions.createTag).not.toHaveBeenCalled()
    expect(ctx.mocks.$q.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'tagExisted' })
    )
  })

  test('重命名调用既有 renameTag', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [{ name: '读书', tagGuid: 'local_tag_1' }], {})
    const wrapper = mountPanel(ctx)
    await flushPromises()

    const tag = wrapper.vm.tagRows[0]
    wrapper.vm.startRename(tag)
    wrapper.vm.editingName = '阅读'
    await wrapper.vm.commitRename(tag)

    expect(ctx.actions.renameTag.mock.calls[0][1]).toEqual({ tagGuid: 'local_tag_1', name: '阅读' })
    expect(wrapper.vm.editingId).toBe(null)
  })

  test('重命名为同名标签时给出提示且不调用接口', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [
      { name: '读书', tagGuid: 'local_tag_1' },
      { name: '阅读', tagGuid: 'local_tag_2' }
    ], {})
    const wrapper = mountPanel(ctx)
    await flushPromises()

    const tag = wrapper.vm.tagRows.find(row => row.tagGuid === 'local_tag_1')
    wrapper.vm.startRename(tag)
    wrapper.vm.editingName = '阅读'
    await wrapper.vm.commitRename(tag)

    expect(ctx.actions.renameTag).not.toHaveBeenCalled()
    expect(ctx.mocks.$q.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'tagExisted' })
    )
  })

  test('后端返回 TAG_DUPLICATE_NAME 时提示同名', async () => {
    const ctx = createContext()
    ctx.actions.renameTag.mockResolvedValue({ success: false, code: 'TAG_DUPLICATE_NAME' })
    seedTags(ctx.store, [{ name: '读书', tagGuid: 'local_tag_1' }], {})
    const wrapper = mountPanel(ctx)
    await flushPromises()

    const tag = wrapper.vm.tagRows[0]
    wrapper.vm.startRename(tag)
    wrapper.vm.editingName = '阅读'
    await wrapper.vm.commitRename(tag)

    expect(ctx.mocks.$q.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'tagExisted', type: 'negative' })
    )
  })
})

describe('标签面板 — 删除 / 清理未使用', () => {
  test('删除标签并同步当前笔记的 info.tags', async () => {
    const ctx = createContext({ currentNote: { info: { docGuid: 'g1', tags: 'local_tag_1*local_tag_2' } } })
    seedTags(ctx.store, [
      { name: '读书', tagGuid: 'local_tag_1' },
      { name: '保留', tagGuid: 'local_tag_2' }
    ], { local_tag_1: 1 })

    const wrapper = mountPanel(ctx)
    await flushPromises()

    const tag = wrapper.vm.tagRows.find(row => row.tagGuid === 'local_tag_1')
    wrapper.vm.confirmDeleteTag(tag)
    expect(ctx.getLastDialog().title).toBe('aiTagDelete')
    await ctx.runLastDialogOk()

    expect(ctx.actions.deleteTag.mock.calls[0][1]).toEqual({ tagGuid: 'local_tag_1' })
    expect(ctx.mutations.update_current_note_tags).toHaveBeenCalledWith(
      expect.anything(),
      'local_tag_2'
    )
  })

  test('当前笔记没有该标签时不动 vuex', async () => {
    const ctx = createContext({ currentNote: { info: { docGuid: 'g1', tags: 'local_tag_2' } } })
    seedTags(ctx.store, [{ name: '读书', tagGuid: 'local_tag_1' }], { local_tag_1: 0 })

    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.confirmDeleteTag(wrapper.vm.tagRows[0])
    await ctx.runLastDialogOk()

    expect(ctx.mutations.update_current_note_tags).not.toHaveBeenCalled()
  })

  test('批量删除选中的标签', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [
      { name: 'A', tagGuid: 'local_tag_1' },
      { name: 'B', tagGuid: 'local_tag_2' },
      { name: 'C', tagGuid: 'local_tag_3' }
    ], {})

    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.enterSelectionMode()
    wrapper.vm.toggleSelect('local_tag_1')
    wrapper.vm.toggleSelect('local_tag_3')
    expect(wrapper.vm.selected).toEqual(['local_tag_1', 'local_tag_3'])

    wrapper.vm.confirmBatchDelete()
    await ctx.runLastDialogOk()

    expect(ctx.actions.deleteTag).toHaveBeenCalledTimes(2)
    expect(ctx.actions.deleteTag.mock.calls.map(call => call[1].tagGuid)).toEqual([
      'local_tag_1', 'local_tag_3'
    ])
    expect(wrapper.vm.selectionMode).toBe(false)
  })

  test('清理未使用标签（离线走主进程批量清理）', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [
      { name: '在用', tagGuid: 'local_tag_1' },
      { name: '未用', tagGuid: 'local_tag_2' }
    ], { local_tag_1: 5 })

    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.confirmCleanupUnused()
    await ctx.runLastDialogOk()

    expect(DatabaseClient.tags.cleanupUnused).toHaveBeenCalled()
    expect(ctx.mocks.$q.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'aiTagCleanupDone' })
    )
  })

  test('没有未使用标签时直接提示，不弹确认框', async () => {
    const ctx = createContext()
    seedTags(ctx.store, [{ name: '在用', tagGuid: 'local_tag_1' }], { local_tag_1: 2 })

    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.confirmCleanupUnused()

    expect(ctx.mocks.$q.dialog).not.toHaveBeenCalled()
    expect(ctx.mocks.$q.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'aiTagCleanupNone' })
    )
  })
})
