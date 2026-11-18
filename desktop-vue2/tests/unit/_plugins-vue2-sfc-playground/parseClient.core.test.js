/**
 * _plugins/vue2-sfc-playground/src/parseClient.core.cjs 的契约测试。
 *
 * 这个模块是跨进程桥（playground iframe <-> 主应用 <-> 主进程 IPC）的核心逻辑；
 * 必须保证：requestId 配对正确 / 超时不挂死 / 错误透传 code / 多并发不串。
 *
 * 桥整体形态：
 *   src/parseClient.ts
 *     ↕ wujie bus
 *   src/components/microApp/microAppIpcBridge.js
 *     ↕ ipcRenderer.invoke('vue-sfc:parse')
 *   src-electron/main-process/api.js -> parseVueSfc()
 *
 * 这一组测试只覆盖 src 这一侧（playground 端核心），主应用侧单独跑。
 */

const path = require('path')

// 绝对路径 require，避开 __dirname 在 jest 跨域时的差异
// tests/unit/<x>/<y>.test.js  → 根目录需要往上 3 级
const corePath = path.join(
  __dirname, '..', '..', '..', '..', '_plugins', 'vue2-sfc-playground', 'src', 'parseClient.core.cjs'
)
const core = require(corePath)

const REQ = 'microapp:parse:request'
const RES = 'microapp:parse:response'

/**
 * 极简 bus mock：实现 wujie bus $on / $off / $emit / $clear 的最小表面。
 * 不真的做去重，但允许同一 event 注册多个 listener（与 wujie 一致）。
 */
function makeBus () {
  const handlers = new Map() // event -> Set<fn>
  const bus = {
    $on (event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(fn)
      return bus
    },
    $off (event, fn) {
      if (fn === undefined) handlers.delete(event)
      else handlers.get(event)?.delete(fn)
      return bus
    },
    $emit (event, ...args) {
      const set = handlers.get(event)
      if (set) for (const fn of set) fn(...args)
      return bus
    },
    $clear () { handlers.clear(); return bus },
    _listenerCount (event) { return handlers.get(event)?.size || 0 }
  }
  return bus
}

/**
 * 在测试里同时"扮演主应用 bridge"：监听 requestEvent，把响应回写到 responseEvent。
 * 让单测可以端到端走完一次"playground 发 → 主应用 → 回响应"。
 */
function attachRequestRecorder (bus) {
  const captured = []
  bus.$on(REQ, (env) => captured.push(env))
  return captured
}

beforeEach(() => {
  core.resetAllPending()
})

describe('parseClient.core: payload 归一化', () => {
  test('字符串 payload → {source: 字符串, options: {}, filename: inline.vue, sourceMap: false}', () => {
    expect(core.normalizePayload('<template/>')).toEqual({
      source: '<template/>',
      options: {},
      filename: 'inline.vue',
      sourceMap: false
    })
  })

  test('对象 payload 透传 options / filename / sourceMap', () => {
    const out = core.normalizePayload({
      source: '<template/>',
      options: { id: 'foo' },
      filename: 'App.vue',
      sourceMap: true
    })
    expect(out).toEqual({
      source: '<template/>',
      options: { id: 'foo' },
      filename: 'App.vue',
      sourceMap: true
    })
  })

  test('null / undefined 都不抛', () => {
    expect(() => core.normalizePayload(null)).not.toThrow()
    expect(() => core.normalizePayload(undefined)).not.toThrow()
    expect(core.normalizePayload(null)).toMatchObject({ source: '', filename: 'inline.vue' })
  })
})

describe('parseClient.core: requestId 生成', () => {
  test('每次调用返回不同字符串', () => {
    const ids = new Set()
    for (let i = 0; i < 50; i++) ids.add(core.makeRequestId())
    expect(ids.size).toBe(50)
  })

  test('以 "pc-" 前缀', () => {
    expect(core.makeRequestId()).toMatch(/^pc-/)
  })
})

describe('parseClient.core: handleResponse 单例分发', () => {
  test('ok=true → resolve({data: result})', async () => {
    const bus = makeBus()
    const recorder = attachRequestRecorder(bus)
    const promise = core.postParseRequest(
      { bus, requestEvent: REQ, responseEvent: RES },
      { source: '<template/>' }
    )
    expect(recorder.length).toBe(1)
    const req = recorder[0]
    expect(req.requestId).toBeDefined()

    bus.$emit(RES, {
      requestId: req.requestId,
      ok: true,
      result: { template: 't', script: { content: 's' }, style: 'css' }
    })

    await expect(promise).resolves.toEqual({
      data: { template: 't', script: { content: 's' }, style: 'css' }
    })
  })

  test('ok=false, error.code → reject(Error with code)', async () => {
    const bus = makeBus()
    const recorder = attachRequestRecorder(bus)
    const promise = core.postParseRequest(
      { bus, requestEvent: REQ, responseEvent: RES },
      { source: 'bad' }
    )
    const req = recorder[0]
    bus.$emit(RES, {
      requestId: req.requestId,
      ok: false,
      error: { message: 'boom', code: 'VUE_SFC_PARSE_FAILED' }
    })
    await expect(promise).rejects.toMatchObject({
      message: 'boom',
      code: 'VUE_SFC_PARSE_FAILED'
    })
  })

  test('对未知 requestId 调用 handleResponse 返回 false 且无副作用', () => {
    expect(core.handleResponse({ requestId: 'nope', ok: true })).toBe(false)
    expect(core.handleResponse(null)).toBe(false)
    expect(core.handleResponse({ requestId: 'nope', ok: false, error: { message: 'x' } })).toBe(false)
  })
})

describe('parseClient.core: 并发不串 / 超时清理', () => {
  test('两个并发请求各自配对，互不干扰', async () => {
    const bus = makeBus()
    const recorder = attachRequestRecorder(bus)

    const p1 = core.postParseRequest({ bus, requestEvent: REQ, responseEvent: RES }, { source: 'a' })
    const p2 = core.postParseRequest({ bus, requestEvent: REQ, responseEvent: RES }, { source: 'b' })

    expect(recorder.length).toBe(2)
    expect(recorder[0].requestId).not.toBe(recorder[1].requestId)

    // 错配：先发 r2 的响应，p1 不应被串为完成
    bus.$emit(RES, { requestId: recorder[1].requestId, ok: true, result: { tag: 'second' } })
    let p1Settled = false
    p1.then(() => { p1Settled = true }, () => { p1Settled = true })
    // 让浏览器把已 reject/resolve 的微任务排空
    await new Promise(r => setTimeout(r, 0))
    expect(p1Settled).toBe(false)

    bus.$emit(RES, { requestId: recorder[0].requestId, ok: true, result: { tag: 'first' } })

    const [out1, out2] = await Promise.all([p1, p2])
    expect(out1.data).toEqual({ tag: 'first' })
    expect(out2.data).toEqual({ tag: 'second' })
    expect(p1Settled).toBe(true)
  })

  test('超时 reject + 不残留 pending', async () => {
    const bus = makeBus()
    attachRequestRecorder(bus)
    const before = core._pendingSnapshot().length

    const promise = core.postParseRequest(
      { bus, requestEvent: REQ, responseEvent: RES, timeoutMs: 30 },
      { source: 'a' }
    )

    await expect(promise).rejects.toMatchObject({ code: 'VUE_SFC_PARSE_BRIDGE_TIMEOUT' })
    expect(core._pendingSnapshot().length).toBe(before)
  })

  test('resetAllPending 把所有 pending 全部 reject 掉', async () => {
    const bus = makeBus()
    attachRequestRecorder(bus)
    const settled = []
    core.postParseRequest({ bus, requestEvent: REQ, responseEvent: RES }, { source: 'a' }).then(
      () => settled.push('ok'),
      err => settled.push(err.message)
    )
    core.postParseRequest({ bus, requestEvent: REQ, responseEvent: RES }, { source: 'b' }).then(
      () => settled.push('ok'),
      err => settled.push(err.message)
    )

    expect(core._pendingSnapshot().length).toBe(2)
    core.resetAllPending()
    expect(core._pendingSnapshot().length).toBe(0)
    // 让微任务 flush 完
    await new Promise(r => setTimeout(r, 0))
    expect(settled.length).toBe(2)
    expect(settled.every(s => /reset/.test(s))).toBe(true)
  })

  test('bus $emit 抛错时 promise reject 且不残留', async () => {
    const brokenBus = {
      $on: () => brokenBus,
      $off: () => brokenBus,
      $emit () { throw new Error('bus dead') }
    }
    const promise = core.postParseRequest(
      { bus: brokenBus, requestEvent: REQ, responseEvent: RES },
      { source: 'a' }
    )
    await expect(promise).rejects.toThrow(/bus dead/)
    expect(core._pendingSnapshot().length).toBe(0)
  })
})