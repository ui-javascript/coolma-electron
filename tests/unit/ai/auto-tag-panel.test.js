// ============================================================================
// tests/unit/ai/auto-tag-panel.test.js
//
// 「设置 → AI → 打标」面板的挂载与主流程回归：
//   1) active=true 时能懒加载出「无标签笔记」候选
//   2) runTagging：按勾选逐篇调 AI，结果落到 row.names / status=ready
//   3) applyRow：命中已有标签 → 复用；没命中 → 建新标签；写回笔记并刷新标签树
//   4) 被打标的正好是编辑器当前笔记时，同步 vuex 里的 info.tags
// ============================================================================

jest.mock('src/utils/DatabaseClient', () => {
  const state = { notes: new Map(), attached: [], localTags: [] }
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
        cleanupUnused: jest.fn(async () => ({ success: true, removed: [] }))
      },
      __state: state
    }
  }
})

jest.mock('src/services/AiTagService', () => ({
  __esModule: true,
  default: {
    getDefaultModelStatus: jest.fn(),
    suggestTags: jest.fn()
  }
}))

const path = require('path')
const { mount, createLocalVue } = require('@vue/test-utils')
const Vuex = require('vuex')

const DatabaseClient = require('src/utils/DatabaseClient.js').default
const AiTagService = require('src/services/AiTagService.js').default
const SettingsAiAutoTagPanel = require(path.resolve(
  __dirname,
  '../../../src/components/settings/SettingsAiAutoTagPanel.vue'
)).default

const { __state: dbState } = DatabaseClient

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

const Passthrough = { template: '<div><slot /></div>' }
const QUASAR_TAGS = [
  'q-btn', 'q-icon', 'q-input', 'q-checkbox', 'q-space', 'q-linear-progress',
  'q-spinner', 'q-card', 'q-card-section', 'q-badge', 'q-select', 'q-item',
  'q-item-section', 'q-separator'
]

function createContext ({ currentNote = {}, isLogin = false, tags = [{ name: '读书', tagGuid: 'local_tag_1' }] } = {}) {
  const localVue = createLocalVue()
  localVue.use(Vuex)
  QUASAR_TAGS.forEach(tag => localVue.component(tag, Passthrough))

  const actions = {
    getAllTags: jest.fn(async () => []),
    createTag: jest.fn(async (ctx, { name }) => ({ id: 9, name, tagGuid: 'local_tag_9' }))
  }
  const mutations = { update_current_note_tags: jest.fn() }

  const store = new Vuex.Store({
    modules: {
      server: {
        namespaced: true,
        state: {
          tags,
          isLogin,
          kbGuid: isLogin ? 'kb-1' : '',
          currentNote,
          tagNotesCount: {}
        },
        actions,
        mutations
      }
    }
  })

  const mocks = {
    $t: key => key,
    $q: { notify: jest.fn(), dialog: jest.fn() }
  }

  return { localVue, store, actions, mutations, mocks }
}

function seedUntaggedNotes () {
  dbState.notes.set(11, {
    id: 11,
    doc_guid: 'local_11',
    title: '第一篇',
    category: '/My Notes/',
    content: '第一篇正文',
    tags: '',
    data_modified: 200
  })
  dbState.notes.set(12, {
    id: 12,
    doc_guid: 'local_12',
    title: '第二篇',
    category: '/My Notes/',
    content: '第二篇正文',
    tags: '',
    data_modified: 100
  })
}

function mountPanel (ctx, propsData = {}) {
  return mount(SettingsAiAutoTagPanel, {
    localVue: ctx.localVue,
    store: ctx.store,
    propsData: { active: true, ...propsData },
    mocks: ctx.mocks
  })
}

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

beforeEach(() => {
  dbState.notes.clear()
  dbState.attached.length = 0
  dbState.localTags = [{ id: 1, name: '读书', tagGuid: 'local_tag_1' }]
  DatabaseClient.notes.update.mockClear()
  DatabaseClient.tags.attachToNote.mockClear()

  AiTagService.getDefaultModelStatus.mockReset()
  AiTagService.getDefaultModelStatus.mockResolvedValue({
    config: { model: 'test-model' }, usable: true, model: 'test-model', name: '测试模型', missingFields: []
  })
  AiTagService.suggestTags.mockReset()
  AiTagService.suggestTags.mockResolvedValue({ names: ['读书', '新标签'], raw: '[]', model: 'test-model', usage: null })
})

describe('打标面板 — 挂载与候选列表', () => {
  test('active=true 时懒加载无标签笔记', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()

    expect(wrapper.vm.notes.map(row => row.id)).toEqual([11, 12])
    expect(wrapper.vm.notes[0].selected).toBe(true)
    expect(wrapper.vm.modelUsable).toBe(true)
    expect(wrapper.vm.tagNameOptions).toEqual(['读书'])
    expect(wrapper.vm.visibleNotes).toHaveLength(2)
    expect(wrapper.vm.canGenerate).toBe(true)
  })

  test('active=false 时不查库（懒加载）', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    mountPanel(ctx, { active: false })
    await flushPromises()
    expect(AiTagService.getDefaultModelStatus).not.toHaveBeenCalled()
  })

  test('没有可用默认模型时 canGenerate=false', async () => {
    seedUntaggedNotes()
    AiTagService.getDefaultModelStatus.mockResolvedValue({
      config: null, usable: false, model: '', name: '', missingFields: []
    })
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()

    expect(wrapper.vm.modelUsable).toBe(false)
    expect(wrapper.vm.canGenerate).toBe(false)
  })

  test('登录态只用云端标签做复用池（避免把 local_tag_* 推到云端）', async () => {
    seedUntaggedNotes()
    dbState.localTags = [{ id: 1, name: '本地标签', tagGuid: 'local_tag_1' }]
    const ctx = createContext({
      isLogin: true,
      tags: [{ name: '云端标签', tagGuid: 'cloud-guid-1' }]
    })
    const wrapper = mountPanel(ctx)
    await flushPromises()

    expect(wrapper.vm.cloudMode).toBe(true)
    expect(wrapper.vm.tagNameOptions).toEqual(['云端标签'])
  })

  test('离线态把本地标签并入复用池', async () => {
    seedUntaggedNotes()
    dbState.localTags = [{ id: 1, name: '本地标签', tagGuid: 'local_tag_1' }]
    const ctx = createContext({ isLogin: false, tags: [] })
    const wrapper = mountPanel(ctx)
    await flushPromises()

    expect(wrapper.vm.cloudMode).toBe(false)
    expect(wrapper.vm.tagNameOptions).toEqual(['本地标签'])
  })
})

describe('打标面板 — runTagging', () => {
  test('按勾选逐篇生成，结果写入 row.names 且状态为 ready', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()

    // 取消第二篇，只跑第一篇
    wrapper.vm.notes[1].selected = false
    await wrapper.vm.runTagging()

    expect(AiTagService.suggestTags).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.notes[0].status).toBe('ready')
    expect(wrapper.vm.notes[0].names).toEqual(['读书', '新标签'])
    expect(wrapper.vm.notes[0].reusedNames).toEqual(['读书'])
    expect(wrapper.vm.notes[1].status).toBe('idle')
    expect(wrapper.vm.progress).toMatchObject({ done: 1, total: 1 })
  })

  test('AI 抛错时该行标记 failed 并带错误文案，其余行继续', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()

    // 串行跑，保证「第一篇失败、第二篇成功」的断言顺序稳定
    wrapper.vm.runConcurrency = 1
    AiTagService.suggestTags
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'AI_TAG_NO_DEFAULT_CONFIG' }))
      .mockResolvedValueOnce({ names: ['读书'], raw: '', model: 'm', usage: null })

    await wrapper.vm.runTagging()

    expect(wrapper.vm.notes[0].status).toBe('failed')
    expect(wrapper.vm.notes[0].error).toBe('aiAutoTagNoConfig')
    expect(wrapper.vm.notes[1].status).toBe('ready')
  })

  test('没有勾选任何笔记时不发请求', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.toggleSelectAll(false)
    await wrapper.vm.runTagging()

    expect(AiTagService.suggestTags).not.toHaveBeenCalled()
    expect(ctx.mocks.$q.notify).toHaveBeenCalled()
  })

  test('sanitizeNames 限制每篇标签数', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()

    wrapper.vm.maxTagsPerNote = 1
    AiTagService.suggestTags.mockResolvedValue({ names: ['A', 'B', 'C'], raw: '', model: 'm', usage: null })
    await wrapper.vm.runTagging()

    expect(wrapper.vm.notes[0].names).toEqual(['A'])
  })

  test('被 max_tokens 截断时给专门的提示文案', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()

    AiTagService.suggestTags.mockResolvedValue({
      names: [], raw: '', truncated: true, finishReason: 'length', model: 'm', usage: null
    })
    await wrapper.vm.runTagging()

    expect(wrapper.vm.notes[0].status).toBe('failed')
    expect(wrapper.vm.notes[0].error).toBe('aiAutoTagTruncated')
  })

  test('并发 worker 池：全部行都会被处理，且同时最多跑 runConcurrency 篇', async () => {
    const total = 5
    dbState.notes.clear()
    for (let i = 0; i < total; i++) {
      dbState.notes.set(100 + i, {
        id: 100 + i,
        doc_guid: `local_${100 + i}`,
        title: `笔记 ${i}`,
        category: '/My Notes/',
        content: `正文 ${i}`,
        tags: '',
        data_modified: total - i
      })
    }

    let inFlight = 0
    let maxInFlight = 0
    AiTagService.suggestTags.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight--
      return { names: ['读书'], raw: '', model: 'm', usage: null }
    })

    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()
    wrapper.vm.runConcurrency = 3
    await wrapper.vm.runTagging()

    expect(AiTagService.suggestTags).toHaveBeenCalledTimes(total)
    expect(wrapper.vm.notes.every(row => row.status === 'ready')).toBe(true)
    expect(wrapper.vm.progress).toMatchObject({ done: total, total })
    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1)
  })
})

describe('打标面板 — applyRow（复用已有标签 / 新建）', () => {
  test('复用已有标签 + 新建缺失标签，并写回笔记与 note_tags', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()
    await wrapper.vm.runTagging()

    const ok = await wrapper.vm.applyRow(wrapper.vm.notes[0])
    expect(ok).toBe(true)

    // 「读书」命中已有标签（不新建），「新标签」走 createTag
    expect(ctx.actions.createTag).toHaveBeenCalledTimes(1)
    expect(ctx.actions.createTag.mock.calls[0][1]).toEqual({ name: '新标签' })

    expect(wrapper.vm.notes[0].status).toBe('applied')
    expect(wrapper.vm.stats).toMatchObject({ appliedNotes: 1, reused: 1, created: 1 })

    const [, updates] = DatabaseClient.notes.update.mock.calls[0]
    expect(updates.tags).toBe('local_tag_1*local_tag_9')
    expect(dbState.attached).toEqual([
      { noteId: 11, tagId: 1 },
      { noteId: 11, tagId: 9 }
    ])
    // 刷新左侧标签树
    expect(ctx.actions.getAllTags).toHaveBeenCalled()
  })

  test('新建的标签会进入 pool，后续笔记直接复用（同批次不重复建）', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()
    await wrapper.vm.runTagging()

    await wrapper.vm.applyRow(wrapper.vm.notes[0])
    await wrapper.vm.applyRow(wrapper.vm.notes[1])

    expect(ctx.actions.createTag).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.stats.created).toBe(1)
    expect(wrapper.vm.stats.reused).toBe(3)
  })

  test('applyAllSuggestions 批量应用所有待应用行', async () => {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    await flushPromises()
    await wrapper.vm.runTagging()

    await wrapper.vm.applyAllSuggestions()

    expect(wrapper.vm.notes.every(row => row.status === 'applied')).toBe(true)
    expect(wrapper.vm.stats.appliedNotes).toBe(2)
  })

  test('当前笔记正好被打了标 → 同步 vuex 的 info.tags', async () => {
    seedUntaggedNotes()
    const ctx = createContext({ currentNote: { info: { docGuid: 'local_11', tags: '' } } })
    const wrapper = mountPanel(ctx)
    await flushPromises()
    await wrapper.vm.runTagging()
    await wrapper.vm.applyRow(wrapper.vm.notes[0])

    expect(ctx.mutations.update_current_note_tags).toHaveBeenCalledWith(
      expect.anything(),
      'local_tag_1*local_tag_9'
    )
  })

  test('不是当前笔记时不动 vuex', async () => {
    seedUntaggedNotes()
    const ctx = createContext({ currentNote: { info: { docGuid: 'other-guid', tags: '' } } })
    const wrapper = mountPanel(ctx)
    await flushPromises()
    await wrapper.vm.runTagging()
    await wrapper.vm.applyRow(wrapper.vm.notes[0])

    expect(ctx.mutations.update_current_note_tags).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 横向单卡分页：一列一张卡，滚轮/箭头翻页
// ---------------------------------------------------------------------------
const CARD_WIDTH = 387
const CARD_GAP = 8
const CARD_STEP = CARD_WIDTH + CARD_GAP

function makeFakeList (cardCount = 3) {
  const cards = Array.from({ length: cardCount }, (_, i) => ({
    offsetLeft: i * CARD_STEP,
    offsetWidth: CARD_WIDTH
  }))
  const list = {
    nodeType: 1,
    children: cards,
    clientWidth: CARD_WIDTH,
    scrollWidth: (cardCount - 1) * CARD_STEP + CARD_WIDTH,
    scrollLeft: 0,
    scrollTo: jest.fn(({ left }) => { list.scrollLeft = left })
  }
  return list
}

function makeWheel (deltaY, deltaX = 0) {
  const event = { deltaY, deltaX, preventDefault: jest.fn() }
  return event
}

describe('打标面板 — 横向分页（一列一张）', () => {
  async function setup (cardCount = 3) {
    seedUntaggedNotes()
    const ctx = createContext()
    const wrapper = mountPanel(ctx)
    // 先等候选真正加载完（loadCandidates 结束时会 resetListScroll），再注入假 DOM
    await flushPromises()
    const list = makeFakeList(cardCount)
    wrapper.vm.$refs.autoTagList = list
    const extra = Array.from({ length: Math.max(cardCount - wrapper.vm.notes.length, 0) }, (_, i) => ({
      id: 200 + i, title: `补 ${i}`, category: '/', preview: '', selected: true, names: [], reusedNames: [], status: 'idle', error: ''
    }))
    wrapper.vm.notes = [...wrapper.vm.notes, ...extra]
    wrapper.vm.visibleLimit = 50
    return { wrapper, list, ctx }
  }

  test('scrollToIndex 按卡片真实偏移滚动，并夹在 0..last 之间', async () => {
    const { wrapper, list } = await setup(3)

    wrapper.vm.scrollToIndex(2)
    expect(wrapper.vm.activeIndex).toBe(2)
    expect(list.scrollTo).toHaveBeenLastCalledWith({ left: 2 * CARD_STEP, behavior: 'smooth' })

    wrapper.vm.scrollToIndex(99)
    expect(wrapper.vm.activeIndex).toBe(2)
    expect(list.scrollTo).toHaveBeenLastCalledWith({ left: 2 * CARD_STEP, behavior: 'smooth' })

    wrapper.vm.scrollToIndex(-5)
    expect(wrapper.vm.activeIndex).toBe(0)
    expect(list.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
  })

  test('onListScroll 按最近卡片反推当前页码', async () => {
    const { wrapper, list } = await setup(3)

    list.scrollLeft = 0
    wrapper.vm.onListScroll()
    expect(wrapper.vm.activeIndex).toBe(0)

    list.scrollLeft = CARD_STEP
    wrapper.vm.onListScroll()
    expect(wrapper.vm.activeIndex).toBe(1)

    list.scrollLeft = 2 * CARD_STEP - 30 // 接近第三张
    wrapper.vm.onListScroll()
    expect(wrapper.vm.activeIndex).toBe(2)
  })

  test('平滑滚动动画期间忽略 scroll 事件，避免页码乱跳', async () => {
    const { wrapper, list } = await setup(3)
    jest.useFakeTimers()
    try {
      wrapper.vm.scrollToIndex(2)
      expect(wrapper.vm.activeIndex).toBe(2)

      // 动画中间帧：scrollLeft 还在第 0 张附近
      list.scrollLeft = 0
      wrapper.vm.onListScroll()
      expect(wrapper.vm.activeIndex).toBe(2)

      // 动画结束后恢复响应
      jest.advanceTimersByTime(500)
      wrapper.vm.onListScroll()
      expect(wrapper.vm.activeIndex).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  test('一次滚轮 = 翻一张；到头后不再拦截，避免卡住面板纵向滚动', async () => {
    const { wrapper, list } = await setup(3)
    jest.useFakeTimers()
    try {
      const first = makeWheel(120)
      wrapper.vm.onListWheel(first)
      expect(first.preventDefault).toHaveBeenCalled()
      expect(wrapper.vm.activeIndex).toBe(1)
      expect(list.scrollTo).toHaveBeenLastCalledWith({ left: CARD_STEP, behavior: 'smooth' })

      // 节流窗口内的第二次滚轮不翻页
      wrapper.vm.onListWheel(makeWheel(120))
      expect(wrapper.vm.activeIndex).toBe(1)
      jest.advanceTimersByTime(400)

      // 翻到最后一张后，继续向下滚应放行（不 preventDefault）
      wrapper.vm.scrollToIndex(2)
      list.scrollLeft = 2 * CARD_STEP
      const atEnd = makeWheel(120)
      wrapper.vm.onListWheel(atEnd)
      expect(atEnd.preventDefault).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  test('触摸板横向滑动（|deltaX|>|deltaY|）交给浏览器原生处理', async () => {
    const { wrapper } = await setup(3)
    const event = makeWheel(8, 90)
    wrapper.vm.onListWheel(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(wrapper.vm.activeIndex).toBe(0)
  })

  test('resetListScroll 回到第一张', async () => {
    const { wrapper, list } = await setup(3)
    wrapper.vm.activeIndex = 2
    list.scrollLeft = 2 * CARD_STEP

    wrapper.vm.resetListScroll()
    expect(list.scrollLeft).toBe(0)
    expect(wrapper.vm.activeIndex).toBe(0)
  })
})
