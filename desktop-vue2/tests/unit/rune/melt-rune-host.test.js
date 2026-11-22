// ============================================================================
// tests/unit/rune/melt-rune-host.test.js
//
// 锁定 melt-js 壳组件（src/components/rune/meltRuneHost.js）的契约（v2026-11-22）：
//   1) 非 melt 定义返回 null（老 SFC 路径完全不受影响）
//   2) 配置不合法（缺 dep.name）→ 壳直接渲染错误卡，不做网络请求
//   3) 加载中 → 骨架；error → 错误卡 + 重试
//   4) ready → 渲染远端组件，value 注入 valueProp，schema 里的 props 按类型强转
//   5) 同依赖的多个实例共享一次加载（引用计数），全部卸载才 dispose
//   6) 远端组件 emit valueEvent → 壳 $emit('input', 归一化后的值) 并回调 onValueChange
//   7) Vue 3 组件包（带 setup / __vccOpts）直接判错，不去 h() 渲染
//
// 依赖 @melt-js/libs-core-vue2 是 ESM 包，Jest 默认不转译 node_modules，
// 这里用 jest.mock 工厂整体替身，只验证我们自己的壳逻辑。
// ============================================================================

const mockResource = {
  load: jest.fn(),
  retry: jest.fn(),
  fail: jest.fn(),
  dispose: jest.fn(),
  getState: jest.fn(() => ({ status: 'loading', component: null, error: null }))
}

const mockLoader = {
  loadHelLib: jest.fn(() => Promise.resolve({ TierRanking: {} })),
  loadHelLibsSerial: jest.fn(),
  preloadHelLibs: jest.fn()
}

jest.mock('@melt-js/libs-core-vue2', () => ({
  createHelComponentResource: jest.fn(() => mockResource),
  createHelLoader: jest.fn(() => mockLoader),
  resolveHelDep: jest.fn((ref, options = {}) => ({ name: ref, host: `https://unpkg.com/${ref}/dist/hel-meta.json`, ...options }))
}))

jest.mock('hel-micro', () => ({
  appMetaSrv: { clearDiskCachedApp: jest.fn(() => Promise.resolve()) }
}))

const meltLibs = require('@melt-js/libs-core-vue2')
const {
  createMeltRuneRendererCtor,
  getMeltResourceKey,
  getMeltPoolKey,
  getMeltDepKey,
  buildMetaUrlCandidates,
  assertHelMetaShape,
  buildMeltLoadSpec,
  preloadMeltRunes,
  coerceMeltProp,
  normalizeMeltEmitValue,
  clearMeltRuneCaches,
  clearAllMeltCaches
} = require('src/components/rune/meltRuneHost')

const makeRune = (config = {}) => ({
  id: 'r-melt',
  name: 'Melt 卡片',
  template: JSON.stringify({
    $type: 'melt-js',
    dep: { name: 'comps-vue2-meme', type: 'unpkg' },
    exportName: 'TierRanking',
    props: {
      value: { type: 'string' },
      maxHeight: { type: 'number' },
      disabled: { type: 'boolean' },
      config: { type: 'json' }
    },
    ...config
  })
})

const mountCtor = (Ctor, propsData = {}) => {
  const vm = new Ctor({ propsData })
  vm.$mount()
  return vm
}

afterEach(() => {
  clearMeltRuneCaches()
  jest.clearAllMocks()
  mockResource.getState.mockReturnValue({ status: 'loading', component: null, error: null })
})

describe('createMeltRuneRendererCtor 分流', () => {
  test('SFC 定义返回 null', () => {
    expect(createMeltRuneRendererCtor({ id: 'x', template: '<template><div/></template>' })).toBeNull()
    expect(meltLibs.createHelComponentResource).not.toHaveBeenCalled()
  })

  test('同定义命中壳缓存，不重复 Vue.extend', () => {
    const rune = makeRune()
    const a = createMeltRuneRendererCtor(rune)
    const b = createMeltRuneRendererCtor({ ...rune })
    expect(a).toBe(b)
  })

  test('配置变了重建壳', () => {
    const a = createMeltRuneRendererCtor(makeRune())
    const b = createMeltRuneRendererCtor(makeRune({ exportName: 'Other' }))
    expect(a).not.toBe(b)
  })
})

describe('配置不合法', () => {
  test('缺 dep.name 直接错误卡，不碰网络', () => {
    const Ctor = createMeltRuneRendererCtor(makeRune({ dep: { type: 'unpkg' } }))
    const vm = mountCtor(Ctor)
    expect(vm.$el.textContent).toContain('melt-js 定义不合法')
    expect(vm.$el.getAttribute('data-melt-rune-state')).toBe('error')
    expect(meltLibs.createHelComponentResource).not.toHaveBeenCalled()
    vm.$destroy()
  })
})

describe('加载态', () => {
  test('loading 渲染骨架', () => {
    const Ctor = createMeltRuneRendererCtor(makeRune())
    const vm = mountCtor(Ctor)
    expect(vm.$el.getAttribute('data-melt-rune-state')).toBe('loading')
    expect(vm.$el.textContent).toContain('正在加载远端组件 TierRanking')
    vm.$destroy()
  })

  test('error 渲染原因与重试按钮，点重试回到 loading', async () => {
    const Ctor = createMeltRuneRendererCtor(makeRune())
    const vm = mountCtor(Ctor)
    const entryState = { status: 'error', component: null, error: new Error('meta 404') }
    mockResource.getState.mockReturnValue(entryState)
    vm.state = entryState
    await vm.$nextTick()
    expect(vm.$el.textContent).toContain('加载失败（comps-vue2-meme）：meta 404')
    const button = vm.$el.querySelector('button')
    expect(button).not.toBeNull()
    button.click()
    // 刷新 = 换该 dep 的 loader（清 hel 内存缓存）+ 世代 +1 换新池 key
    expect(meltLibs.createHelLoader).toHaveBeenCalledTimes(2)
    expect(mockResource.load).toHaveBeenCalledTimes(2)
    expect(getMeltPoolKey(require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig(makeRune()))).toContain('#1')
    vm.$destroy()
  })
})

describe('ready 渲染与 props', () => {
  test('value 注入 valueProp，schema props 强转后传给远端组件', async () => {
    const remote = { props: ['value', 'maxHeight', 'disabled', 'config'], render (h) { return h('div', {}, String(this.value)) } }
    const Ctor = createMeltRuneRendererCtor(makeRune())
    const vm = mountCtor(Ctor, { value: '46', maxHeight: '320', disabled: '1', config: '{"a":1}' })
    vm.state = { status: 'ready', component: remote, error: null }
    await vm.$nextTick()
    expect(vm.buildProps()).toEqual({ maxHeight: 320, disabled: true, config: { a: 1 }, value: '46' })
    expect(vm.$el.textContent).toBe('46')
  })

  test('值为空 / 非法时不下发 prop，交给远端 default', () => {
    const Ctor = createMeltRuneRendererCtor(makeRune())
    const vm = mountCtor(Ctor, { value: 'x', maxHeight: '', disabled: '', config: 'not-json' })
    expect(vm.buildProps()).toEqual({ value: 'x' })
    vm.$destroy()
  })

  test('Vue 3 组件包判错，不渲染', async () => {
    const Ctor = createMeltRuneRendererCtor(makeRune())
    const vm = mountCtor(Ctor)
    vm.state = { status: 'ready', component: { setup () {} }, error: null }
    await vm.$nextTick()
    expect(vm.$el.textContent).toContain('Vue 3 组件')
    vm.$destroy()
  })
})

describe('事件回写', () => {
  test('远端 emit 字符串 → 壳 emit input 并回调 onValueChange', () => {
    const onValueChange = jest.fn()
    const Ctor = createMeltRuneRendererCtor(makeRune())
    const vm = mountCtor(Ctor, { runeId: 'r1', nodeId: 'n1', onValueChange })
    vm.handleValueEmit('48')
    expect(onValueChange).toHaveBeenCalledWith({ runeId: 'r1', nodeId: 'n1', value: '48' })
  })

  test('远端 emit 事件对象 → 取 target.value', () => {
    expect(normalizeMeltEmitValue({ target: { value: 12 } })).toBe('12')
    expect(normalizeMeltEmitValue(null)).toBe('')
  })
})

describe('资源池引用计数', () => {
  test('两个实例共享一次加载，先卸载一个不 dispose，全卸载才 dispose', () => {
    const rune = makeRune()
    const A = mountCtor(createMeltRuneRendererCtor(rune))
    const B = mountCtor(createMeltRuneRendererCtor(rune))
    expect(meltLibs.createHelComponentResource).toHaveBeenCalledTimes(1)
    A.$destroy()
    expect(mockResource.dispose).not.toHaveBeenCalled()
    B.$destroy()
    expect(mockResource.dispose).toHaveBeenCalledTimes(1)
  })

  test('不同 exportName / 不同来源各自独立', () => {
    mountCtor(createMeltRuneRendererCtor(makeRune())).$destroy()
    mountCtor(createMeltRuneRendererCtor(makeRune({ exportName: 'Other' })))
    mountCtor(createMeltRuneRendererCtor(makeRune({ dep: { name: 'comps-vue2-meme', type: 'custom', host: 'https://my.example.com' } })))
    expect(meltLibs.createHelComponentResource).toHaveBeenCalledTimes(3)
    // 前两个同 dep 共用一个 loader，第三个是不同来源 → 第二个 loader
    expect(meltLibs.createHelLoader).toHaveBeenCalledTimes(2)
  })
})

describe('远端产物的加载方式', () => {
  test('资源用 loader 拉产物，而不是把 dep 交给上游', () => {
    mountCtor(createMeltRuneRendererCtor(makeRune()))
    const options = meltLibs.createHelComponentResource.mock.calls[0][0]
    expect(typeof options.loader).toBe('function')
    expect(options.dep).toBeUndefined()
    // 真调用一次 loader，确认它确实走 hel 的 loadHelLib
    return options.loader().then(lib => {
      expect(mockLoader.loadHelLib).toHaveBeenCalled()
      expect(lib).toEqual({ TierRanking: {} })
    })
  })

  test('同 dep 多实例只建一个 loader（自带请求合并）', () => {
    const A = mountCtor(createMeltRuneRendererCtor(makeRune()))
    const B = mountCtor(createMeltRuneRendererCtor(makeRune()))
    expect(meltLibs.createHelLoader).toHaveBeenCalledTimes(1)
    expect(getMeltDepKey({ dep: { name: 'x' } })).toContain('x')
    A.$destroy()
    B.$destroy()
  })
})

describe('配置 → hel 加载描述', () => {
  test('版本拼进包引用，platform / requiredExports 透传', () => {
    const config = require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig({
      template: JSON.stringify({
        $type: 'melt-js',
        dep: { name: 'comps-vue2-meme', type: 'unpkg', version: '2026.11.16', platform: 'pc', requiredExports: ['TierRanking'] },
        exportName: 'TierRanking'
      })
    })
    const spec = buildMeltLoadSpec(config)
    expect(spec.name).toBe('comps-vue2-meme@2026.11.16')
    expect(spec.platform).toBe('pc')
    expect(spec.requiredExports).toEqual(['TierRanking'])
  })

  test('custom 来源用 host 作为 base', () => {
    const config = require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig({
      template: JSON.stringify({
        $type: 'melt-js',
        dep: { name: 'comps-vue2-meme', type: 'custom', host: 'https://my.example.com/tools' },
        exportName: 'TierRanking'
      })
    })
    expect(buildMeltLoadSpec(config).base).toBe('https://my.example.com/tools')
  })

  test('直连 hel-meta.json 原样作为 dep，不拼 ref 路径', () => {
    const config = require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig({
      template: JSON.stringify({
        $type: 'melt-js',
        dep: { name: 'comps-vue2-meme', host: 'http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json' },
        exportName: 'TierRanking'
      })
    })
    buildMeltLoadSpec(config)
    const firstArg = meltLibs.resolveHelDep.mock.calls.pop()[0]
    expect(typeof firstArg).toBe('object')
    expect(firstArg.host).toBe('http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json')
    expect(firstArg.name).toBe('comps-vue2-meme')
  })

  test('站点根 + scoped 名，版本写进 ref', () => {
    const config = require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig({
      template: JSON.stringify({
        $type: 'melt-js',
        dep: { name: '@melt-js/comps-vue2-meme', host: 'http://82.156.212.243', version: '2026.11.18' },
        exportName: 'TierRanking'
      })
    })
    buildMeltLoadSpec(config)
    const last = meltLibs.resolveHelDep.mock.calls.pop()
    expect(last[0]).toBe('@melt-js/comps-vue2-meme@2026.11.18')
    expect(last[1].base).toBe('http://82.156.212.243')
    expect(last[1].type).toBe('custom')
  })

  test('设置里的远程组件源命中时补上 host（同名后者覆盖前者）', () => {
    const { saveRuneSources, MELT_SOURCES_STORAGE_KEY } = require('libs-muya-vue2/lib/rune/runeSourceRegistry')
    saveRuneSources([
      { name: 'comps-vue2-meme', type: 'sftp', base: 'https://old.example.com' },
      { name: '@melt-js/comps-vue2-meme', type: 'sftp', base: 'http://82.156.212.243' }
    ])
    const config = require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig({
      template: JSON.stringify({ $type: 'melt-js', dep: { name: 'comps-vue2-meme' }, exportName: 'TierRanking' })
    })
    buildMeltLoadSpec(config)
    const spec = meltLibs.resolveHelDep.mock.calls.pop()[0]
    expect(spec.host).toBe('http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json')
    localStorage.removeItem(MELT_SOURCES_STORAGE_KEY)
  })

  test('资源池 key 区分 origin', () => {
    const base = getMeltResourceKey({ dep: { name: 'x' }, exportName: 'Y' })
    const custom = getMeltResourceKey({ dep: { name: 'x', host: 'https://a.com' }, exportName: 'Y' })
    expect(base).not.toBe(custom)
  })

  test('coerce 各类型', () => {
    expect(coerceMeltProp('12', { type: 'number' })).toBe(12)
    expect(coerceMeltProp('abc', { type: 'number' })).toBeUndefined()
    expect(coerceMeltProp('0', { type: 'boolean' })).toBe(false)
    expect(coerceMeltProp('yes', { type: 'boolean' })).toBeUndefined()
    expect(coerceMeltProp('{"a":1}', { type: 'json' })).toEqual({ a: 1 })
    expect(coerceMeltProp('', { type: 'string' })).toBeUndefined()
  })

  test('clearAllMeltCaches 清 loader/世代，下一个实例重新建 loader', () => {
    mountCtor(createMeltRuneRendererCtor(makeRune())).$destroy()
    expect(meltLibs.createHelLoader).toHaveBeenCalledTimes(1)
    const cleared = clearAllMeltCaches()
    expect(cleared).toBe(1)
    mountCtor(createMeltRuneRendererCtor(makeRune())).$destroy()
    expect(meltLibs.createHelLoader).toHaveBeenCalledTimes(2)
    expect(getMeltPoolKey(require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig(makeRune()))).not.toContain('#')
  })

  test('全局刷新后旧实例卸载仍会 dispose（退役池不泄漏 hel 实例）', () => {
    const vm = mountCtor(createMeltRuneRendererCtor(makeRune()))
    clearAllMeltCaches({ clearDisk: false })
    expect(mockResource.dispose).not.toHaveBeenCalled()
    vm.$destroy()
    expect(mockResource.dispose).toHaveBeenCalledTimes(1)
  })

  test('meta 兜底地址候选：直连优先，站点根再按包目录约定', () => {
    expect(buildMetaUrlCandidates({ host: 'http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json' }))
      .toEqual(['http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json'])
    const candidates = buildMetaUrlCandidates({ name: '@melt-js/comps-vue2-meme', host: 'http://82.156.212.243/' })
    expect(candidates[0]).toBe('http://82.156.212.243/hel-meta.json')
    expect(candidates).toContain('http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json')
    expect(buildMetaUrlCandidates({ name: 'x' })).toEqual([])
  })

  test('加载描述挂上 onFetchMetaFailed（CORS 兜底），不破坏原有字段', () => {
    const config = require('libs-muya-vue2/lib/rune/runeDefinition').parseMeltRuneConfig({
      template: JSON.stringify({
        $type: 'melt-js',
        dep: { name: 'comps-vue2-meme', host: 'http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json' },
        exportName: 'TierRanking'
      })
    })
    const spec = buildMeltLoadSpec(config)
    expect(typeof spec.custom.onFetchMetaFailed).toBe('function')
    expect(spec.host).toContain('hel-meta.json')
  })

  test('远端组件渲染抛错 → 壳落到错误卡，不白屏', async () => {
    const bad = { render () { throw new Error('boom in remote') } }
    const Ctor = createMeltRuneRendererCtor(makeRune())
    const vm = mountCtor(Ctor)
    vm.state = { status: 'ready', component: bad, error: null }
    await vm.$nextTick()
    await vm.$nextTick()
    expect(vm.$el.getAttribute('data-melt-rune-state')).toBe('error')
    expect(vm.$el.textContent).toContain('boom in remote')
  })

  test('meta 形状校验：缺版本 / 缺资源都给出可读错因', () => {
    const ok = { app: { name: 'x', online_version: '1' }, version: { sub_app_version: '1', src_map: { webDirPath: 'http://a/b' } } }
    expect(assertHelMetaShape(ok)).toBe(ok)
    expect(() => assertHelMetaShape({ app: { name: 'x' }, version: { src_map: { webDirPath: 'http://a' } } }))
      .toThrow('缺版本号')
    expect(() => assertHelMetaShape({ app: { name: 'x' }, version: { sub_app_version: '1', src_map: {} } }))
      .toThrow('src_map')
  })

  test('启动预热：同依赖只拉一次，非 melt / 坏定义跳过', async () => {
    const runeA = makeRune()
    const runeB = makeRune()
    const sfcRune = { id: 'sfc', name: 'SFC', template: '<template><div/></template>' }
    const broken = makeRune({ dep: { type: 'unpkg' } })
    await preloadMeltRunes([runeA, runeB, sfcRune, broken])
    expect(mockLoader.loadHelLib).toHaveBeenCalledTimes(1)
    expect(meltLibs.createHelLoader).toHaveBeenCalledTimes(1)
  })
})
