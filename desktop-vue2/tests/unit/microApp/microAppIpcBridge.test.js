/**
 * 微应用 ↔ 主应用 IPC 桥（microAppIpcBridge.js）的契约测试。
 *
 * 路径：
 *   子应用 bus.$emit('microapp:parse:request', { requestId, payload })
 *     → 主应用 bus.$on(handler)
 *       → parseVueSfc(payload)  (= ipcRenderer.invoke('vue-sfc:parse'))
 *     → bus.$emit('microapp:parse:response', { requestId, ok, result | error })
 *
 * 重点：
 *   1) requestId 严格透传
 *   2) parseVueSfc 抛错 → 响应里 ok=false + 错误带 code
 *   3) 缺 requestId 的请求被丢弃，不发响应也不挂
 *   4) uninstall() 之后 bus.$off，handler 不再被触发
 *   5) install() 幂等
 *   6) 事件名常量字面契约（与 _plugins/vue2-sfc-playground/src/parseClient.ts 同步）
 */

const mockBusEvents = new Map() // event -> Set<fn>

const mockBus = {
  $on (event, fn) {
    if (!mockBusEvents.has(event)) mockBusEvents.set(event, new Set())
    mockBusEvents.get(event).add(fn)
    return mockBus
  },
  $off (event, fn) {
    if (fn === undefined) mockBusEvents.delete(event)
    else mockBusEvents.get(event)?.delete(fn)
    return mockBus
  },
  $emit (event, ...args) {
    const set = mockBusEvents.get(event)
    if (set) for (const fn of set) fn(...args)
    return mockBus
  },
  _clear () { mockBusEvents.clear() }
}

const mockWujie = { bus: mockBus }

// 关键：mock- 前缀让 jest hoisting 满意
const mockParseVueSfc = jest.fn()

jest.mock('wujie-vue2', () => mockWujie, { virtual: true })
jest.mock('src/ApiInvoker', () => ({
  parseVueSfc: (...args) => mockParseVueSfc(...args)
}), { virtual: true })
jest.mock('src/utils/debugLogger', () => ({
  Warn: () => {},
  Info: () => {}
}), { virtual: true })

const bridge = require('../../../src/components/microApp/microAppIpcBridge.js')

const REQ = 'microapp:parse:request'
const RES = 'microapp:parse:response'

beforeEach(() => {
  mockBus._clear()
  // 清理 bridge 单例，避免上一次 install 状态泄漏到下一个 case
  if (bridge.isMicroAppParseBridgeInstalled()) {
    bridge.installMicroAppParseBridge()()
  }
  mockParseVueSfc.mockReset()
})

afterEach(() => {
  if (bridge.isMicroAppParseBridgeInstalled()) {
    bridge.installMicroAppParseBridge()()
  }
})

describe('microAppIpcBridge', () => {
  test('install 之后是 idempotent，第二次 install 返回的是第一次的 uninstall', () => {
    const un1 = bridge.installMicroAppParseBridge()
    const un2 = bridge.installMicroAppParseBridge()
    expect(bridge.isMicroAppParseBridgeInstalled()).toBe(true)
    expect(un1).toBe(un2)

    un1()
    expect(bridge.isMicroAppParseBridgeInstalled()).toBe(false)
  })

  test('正常请求：parseVueSfc 成功 → ok=true + result 回写，并透传 requestId', async () => {
    mockParseVueSfc.mockResolvedValueOnce({
      template: 't', script: { content: 's' }, style: 'css'
    })
    bridge.installMicroAppParseBridge()

    const responses = []
    mockBus.$on(RES, (env) => responses.push(env))
    mockBus.$emit(REQ, {
      requestId: 'r-1',
      payload: { source: '<template/>', filename: 'A.vue', options: { id: 'foo' } }
    })

    await new Promise(r => setTimeout(r, 0))

    expect(mockParseVueSfc).toHaveBeenCalledTimes(1)
    const [sourceArg, optionsArg] = mockParseVueSfc.mock.calls[0]
    expect(sourceArg).toBe('<template/>')
    // bridge 用 `...payload.options` 平铺（保持与 vue-sfc:parse handler 兼容）
    expect(optionsArg).toMatchObject({ filename: 'A.vue', sourceMap: false, id: 'foo' })

    expect(responses).toHaveLength(1)
    expect(responses[0]).toMatchObject({
      requestId: 'r-1',
      ok: true,
      result: { template: 't', script: { content: 's' }, style: 'css' }
    })
  })

  test('parseVueSfc 抛错 → ok=false + error 带 code', async () => {
    const err = new Error('compiler boom')
    err.code = 'VUE_SFC_TEMPLATE_FAILED'
    mockParseVueSfc.mockRejectedValueOnce(err)
    bridge.installMicroAppParseBridge()

    const responses = []
    mockBus.$on(RES, (env) => responses.push(env))
    mockBus.$emit(REQ, { requestId: 'r-2', payload: { source: 'bad' } })

    await new Promise(r => setTimeout(r, 0))

    expect(responses).toHaveLength(1)
    expect(responses[0].requestId).toBe('r-2')
    expect(responses[0].ok).toBe(false)
    expect(responses[0].error).toMatchObject({
      message: 'compiler boom',
      code: 'VUE_SFC_TEMPLATE_FAILED'
    })
  })

  test('缺 requestId 的请求被静默丢弃（不发响应）', async () => {
    bridge.installMicroAppParseBridge()

    const responses = []
    mockBus.$on(RES, (env) => responses.push(env))
    mockBus.$emit(REQ, { payload: { source: 'x' } }) // 缺 requestId

    await new Promise(r => setTimeout(r, 0))
    expect(responses).toHaveLength(0)
    expect(mockParseVueSfc).not.toHaveBeenCalled()
  })

  test('uninstall 之后 handler 不再被触发', async () => {
    mockParseVueSfc.mockResolvedValueOnce({ ok: 1 })
    const uninstall = bridge.installMicroAppParseBridge()

    mockBus.$emit(REQ, { requestId: 'r-3', payload: { source: 'a' } })
    await new Promise(r => setTimeout(r, 0))
    expect(mockParseVueSfc).toHaveBeenCalledTimes(1)

    uninstall()
    expect(bridge.isMicroAppParseBridgeInstalled()).toBe(false)

    mockBus.$emit(REQ, { requestId: 'r-4', payload: { source: 'b' } })
    await new Promise(r => setTimeout(r, 0))
    expect(mockParseVueSfc).toHaveBeenCalledTimes(1)
  })

  test('WujieVue.bus 不可用时 install 安全降级（返回 noop uninstall）', () => {
    const originalBus = mockWujie.bus
    delete mockWujie.bus

    const uninstall = bridge.installMicroAppParseBridge()
    expect(typeof uninstall).toBe('function')
    uninstall()

    mockWujie.bus = originalBus
  })

  test('PARSE_REQUEST_EVENT / PARSE_RESPONSE_EVENT 字面值固定', () => {
    expect(bridge.PARSE_REQUEST_EVENT).toBe('microapp:parse:request')
    expect(bridge.PARSE_RESPONSE_EVENT).toBe('microapp:parse:response')
  })
})