// ============================================================================
// tests/unit/layout/header-auto-upload.test.js
//
// 右上角「仅上传」按钮的定时轮询触发回归：
//   1) 启动 3s 后首次轮询；有待同步笔记时自动触发上传，
//      并且发出与手动点击完全一致的 sync-start / sync-end（按钮 loading 依赖它）
//   2) 没有待同步笔记时只刷新角标，不触发上传
//   3) 每 30s 重复轮询
//   4) 同步进行中（按钮已 loading）不重复触发
//   5) 上传失败后冷却 5 分钟，不会每 30s 反复弹错
//   6) 登录成功后立刻补一次轮询
//   7) 组件销毁时清理定时器
// ============================================================================

jest.mock('src/services/CloudSyncService', () => ({
  __esModule: true,
  default: {
    pushOnly: jest.fn(async () => ({ success: true, count: 1, errors: 0 })),
    pullOnly: jest.fn(async () => ({ success: true, pulled: 0 })),
    status: { isSyncing: false }
  }
}))

jest.mock('src/utils/DatabaseClient', () => ({
  __esModule: true,
  default: {
    sync: {
      getStats: jest.fn(async () => ({ total: 3, synced: 3, pending: 0 })),
      getPendingDeleteLogs: jest.fn(async () => [])
    }
  }
}))

const path = require('path')
const { mount, createLocalVue } = require('@vue/test-utils')
const Vue = require('vue')
const Vuex = require('vuex')

const CloudSyncService = require('src/services/CloudSyncService').default
const DatabaseClient = require('src/utils/DatabaseClient').default
const HeaderRightGroup = require(path.resolve(
  __dirname,
  '../../../src/components/layout/HeaderRightGroup.vue'
)).default

const getStats = DatabaseClient.sync.getStats
const getPendingDeleteLogs = DatabaseClient.sync.getPendingDeleteLogs
const pushOnly = CloudSyncService.pushOnly

// 轮询常量（与组件内保持一致，改动组件时这里要同步）
const KICKOFF_DELAY = 3 * 1000
const POLL_INTERVAL = 30 * 1000
const RETRY_COOLDOWN = 5 * 60 * 1000

const flushMicrotasks = async (rounds = 12) => {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}

function createCtx ({ isLogin = true } = {}) {
  const localVue = createLocalVue()
  localVue.use(Vuex)

  const store = new Vuex.Store({
    modules: {
      server: {
        namespaced: true,
        state: { isLogin },
        getters: { avatarUrl: () => '' }
      },
      client: {
        namespaced: true,
        state: {
          paneLayoutMode: 0,
          aiAssistantProvider: 'azure',
          syncStatus: {
            isSyncing: false,
            lastSyncTime: null,
            total: 3,
            synced: 1,
            pending: 2
          }
        },
        actions: {
          toggleChanged () {},
          cyclePaneLayout () {}
        },
        mutations: {
          update_sync_status (state, status) {
            state.syncStatus = { ...state.syncStatus, ...status }
          }
        }
      }
    }
  })

  const mocks = {
    $t: key => key,
    $q: {
      notify: jest.fn(),
      dialog: jest.fn(() => ({ onOk: jest.fn() })),
      platform: { is: { mac: false } }
    }
  }

  return { localVue, store, mocks }
}

function mountGroup (ctx, propsData = {}) {
  return mount(HeaderRightGroup, {
    localVue: ctx.localVue,
    store: ctx.store,
    propsData: {
      isMaximized: false,
      settingsHighlight: false,
      aiEntryHighlight: false,
      isPushSyncing: false,
      isPullSyncing: false,
      ...propsData
    },
    mocks: ctx.mocks
  })
}

let wrapper = null

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  CloudSyncService.status.isSyncing = false
  getStats.mockReset()
  getStats.mockResolvedValue({ total: 3, synced: 3, pending: 0 })
  getPendingDeleteLogs.mockReset()
  getPendingDeleteLogs.mockResolvedValue([])
  pushOnly.mockReset()
  pushOnly.mockResolvedValue({ success: true, count: 1, errors: 0 })
})

afterEach(() => {
  if (wrapper) {
    wrapper.destroy()
    wrapper = null
  }
  jest.clearAllTimers()
  jest.useRealTimers()
})

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterAll(() => {
  jest.restoreAllMocks()
})

describe('右上角上传按钮的定时轮询', () => {
  it('启动 3 秒后自动触发上传，并发出与手动点击一致的 sync-start / sync-end', async () => {
    const ctx = createCtx()
    getStats
      .mockResolvedValueOnce({ total: 3, synced: 1, pending: 2 })
      .mockResolvedValue({ total: 3, synced: 3, pending: 0 })
    pushOnly.mockResolvedValue({ success: true, count: 2, errors: 0 })

    wrapper = mountGroup(ctx)

    // 启动瞬间不触发，避免和首屏加载抢资源
    expect(pushOnly).not.toHaveBeenCalled()

    jest.advanceTimersByTime(KICKOFF_DELAY)
    await flushMicrotasks()

    // 轮询到 pending=2 → 自动上传（与点击按钮同一条 runSyncAction 链路）
    expect(pushOnly).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('sync-start')).toEqual([['isPushSyncing']])
    expect(wrapper.emitted('sync-end')).toEqual([['isPushSyncing']])
    // 上传完成后刷新角标：pending 归零
    expect(ctx.store.state.client.syncStatus.pending).toBe(0)
    // 后台自动上传成功不弹 toast，避免编辑期间每 30s 刷一次提示
    expect(ctx.mocks.$q.notify).not.toHaveBeenCalled()
  })

  it('没有待同步笔记时只刷新角标，不触发上传', async () => {
    const ctx = createCtx()
    getStats.mockResolvedValue({ total: 3, synced: 3, pending: 0 })

    wrapper = mountGroup(ctx)
    jest.advanceTimersByTime(KICKOFF_DELAY)
    await flushMicrotasks()

    expect(getStats).toHaveBeenCalledTimes(1)
    expect(pushOnly).not.toHaveBeenCalled()
    expect(wrapper.emitted('sync-start')).toBeUndefined()
  })

  it('只有待同步删除日志时也会触发上传', async () => {
    const ctx = createCtx()
    getStats.mockResolvedValue({ total: 3, synced: 3, pending: 0 })
    getPendingDeleteLogs.mockResolvedValue([
      { id: 1, note_id: 9, doc_guid: 'doc-9', kb_guid: 'kb-1', timestamp: Date.now() }
    ])

    wrapper = mountGroup(ctx)
    jest.advanceTimersByTime(KICKOFF_DELAY)
    await flushMicrotasks()

    expect(pushOnly).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('sync-start')).toEqual([['isPushSyncing']])
  })

  it('每 30 秒重复轮询', async () => {
    const ctx = createCtx()

    wrapper = mountGroup(ctx)
    jest.advanceTimersByTime(KICKOFF_DELAY)
    await flushMicrotasks()
    expect(getStats).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(POLL_INTERVAL)
    await flushMicrotasks()
    expect(getStats).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(POLL_INTERVAL)
    await flushMicrotasks()
    expect(getStats).toHaveBeenCalledTimes(3)
  })

  it('同步进行中（按钮已 loading）不重复触发', async () => {
    const ctx = createCtx()
    getStats.mockResolvedValue({ total: 3, synced: 1, pending: 2 })

    wrapper = mountGroup(ctx, { isPushSyncing: true })
    jest.advanceTimersByTime(KICKOFF_DELAY)
    await flushMicrotasks()

    expect(getStats).not.toHaveBeenCalled()
    expect(pushOnly).not.toHaveBeenCalled()
  })

  it('上传失败后冷却 5 分钟，不会每 30 秒重复上传/弹错', async () => {
    const ctx = createCtx()
    getStats.mockResolvedValue({ total: 3, synced: 1, pending: 2 })
    pushOnly
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValue({ success: true, count: 1, errors: 0 })

    wrapper = mountGroup(ctx)
    jest.advanceTimersByTime(KICKOFF_DELAY)
    await flushMicrotasks()

    expect(pushOnly).toHaveBeenCalledTimes(1)
    // 失败仍然提示（成功才是静默的）
    expect(ctx.mocks.$q.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'negative' })
    )

    // 冷却期内：继续轮询角标，但不再上传
    jest.advanceTimersByTime(POLL_INTERVAL)
    await flushMicrotasks()
    expect(pushOnly).toHaveBeenCalledTimes(1)

    // 冷却结束后恢复自动上传
    jest.advanceTimersByTime(RETRY_COOLDOWN)
    await flushMicrotasks()
    expect(pushOnly).toHaveBeenCalledTimes(2)
  })

  it('登录成功后立刻补一次轮询', async () => {
    const ctx = createCtx({ isLogin: false })
    getStats.mockResolvedValue({ total: 0, synced: 0, pending: 0 })

    wrapper = mountGroup(ctx)
    expect(getStats).not.toHaveBeenCalled()

    ctx.store.state.server.isLogin = true
    await Vue.nextTick()
    await flushMicrotasks()

    expect(getStats).toHaveBeenCalledTimes(1)
  })

  it('组件销毁时清理轮询定时器', async () => {
    const ctx = createCtx()
    wrapper = mountGroup(ctx)

    expect(wrapper.vm.autoUploadIntervalTimer).toBeTruthy()
    expect(wrapper.vm.autoUploadKickoffTimer).toBeTruthy()

    wrapper.destroy()
    wrapper = null

    // 销毁后不再轮询
    jest.advanceTimersByTime(POLL_INTERVAL * 2)
    await flushMicrotasks()
    expect(getStats).not.toHaveBeenCalled()
  })
})
