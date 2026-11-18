// ============================================================================
// tests/unit/microApp/microAppService.test.js
// 锁定的契约（v2026-08-08 起微应用 schema 演进）：
//   1) buildDefaultMicroApps 包含内置条目 echo-monster-deleter（displayMode=fullscreen, isBuiltIn=true）
//   2) BUILTIN_APPS 只能由代码注入（不在 export 给用户的 UI 里暴露）
//   3) normalizeMicroApp 对内置条目保留用户输入（url / devUrl / displayMode 均可编辑），
//      仅在 displayMode 缺省时用注册表默认值
//   4) normalizeMicroApp 对非内置条目保留原值，displayMode 合法化
//   5) mergeBuiltInApps：现有列表追加缺失的内置条目，已存在的内置条目保留用户修改
//   6) diffMicroAppsForReload：displayMode 变化也算 dirty
// ============================================================================

const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'microApp')

const {
  buildDefaultMicroApps,
  normalizeMicroApp,
  normalizeMicroApps,
  mergeBuiltInApps,
  diffMicroAppsForReload,
  registerBuiltinApps,
  _resetBuiltinAppsRegistry,
  getBuiltinApps,
  MICRO_APP_DISPLAY_MODES
} = require(path.join(ROOT, 'microAppService.js'))

describe('microAppService — schema 演进契约', () => {
  beforeEach(() => {
    // 每个 case 之间清空注册表，确保互不污染
    _resetBuiltinAppsRegistry()
  })

  test('1) MICRO_APP_DISPLAY_MODES 包含 drawer / fullscreen', () => {
    expect(MICRO_APP_DISPLAY_MODES.DRAWER).toBe('drawer')
    expect(MICRO_APP_DISPLAY_MODES.FULLSCREEN).toBe('fullscreen')
  })

  test('2) registerBuiltinApps 默认注册表为空，buildDefaultMicroApps 不含内置条目', () => {
    expect(getBuiltinApps()).toEqual([])
    const list = buildDefaultMicroApps()
    expect(list.every(a => !a.isBuiltIn)).toBe(true)
  })

  test('3) registerBuiltinApps 注册后 buildDefaultMicroApps 含该条目（独立实例）', () => {
    registerBuiltinApps([{
      id: 'test-builtin',
      name: '测试内置',
      displayMode: 'fullscreen',
      isBuiltIn: true,
      enabled: false
    }])
    const list = buildDefaultMicroApps()
    const builtinEntry = list.find(a => a.id === 'test-builtin')
    expect(builtinEntry).toBeTruthy()
    expect(builtinEntry.displayMode).toBe('fullscreen')
    // 防御：注册表与 buildDefaultMicroApps 返回的实例不共享引用
    expect(builtinEntry).not.toBe(getBuiltinApps()[0])
  })

  test('4) normalizeMicroApp 对已注册的内置条目：isBuiltIn=true，displayMode 用户优先 / 缺省用注册表', () => {
    registerBuiltinApps([{
      id: 'test-builtin',
      name: '测试内置',
      displayMode: 'fullscreen',
      isBuiltIn: true
    }])
    // 用户未指定 displayMode → 用注册表默认值（fullscreen）
    const out = normalizeMicroApp({ id: 'test-builtin', displayMode: undefined, isBuiltIn: false })
    expect(out.isBuiltIn).toBe(true)
    expect(out.displayMode).toBe('fullscreen')

    // 用户指定了 displayMode → 尊重用户输入
    const out2 = normalizeMicroApp({ id: 'test-builtin', displayMode: 'drawer' })
    expect(out2.displayMode).toBe('drawer')
  })

  test('5) normalizeMicroApp 非内置条目：displayMode 合法化（未知值 → drawer）', () => {
    const out = normalizeMicroApp({
      id: 'coolma',
      displayMode: 'unknown-mode'
    })
    expect(out.displayMode).toBe('drawer')
    expect(out.isBuiltIn).toBe(false)
  })

  test('6) normalizeMicroApp 非内置条目：displayMode=fullscreen 保留', () => {
    const out = normalizeMicroApp({
      id: 'coolma',
      displayMode: 'fullscreen'
    })
    expect(out.displayMode).toBe('fullscreen')
    expect(out.isBuiltIn).toBe(false)
  })

  test('7) normalizeMicroApp 缺字段时补齐默认值', () => {
    const out = normalizeMicroApp({ id: 'foo' })
    expect(out.displayMode).toBe('drawer')
    expect(out.isBuiltIn).toBe(false)
    expect(out.isMobile).toBe(false)
    expect(out.isDefault).toBe(false)
    expect(out.enabled).toBe(true)
    expect(out.url).toBe('')
    expect(out.devUrl).toBe('')
  })

  test('8) normalizeMicroApps 保留 isDefault 唯一性', () => {
    const list = normalizeMicroApps([
      { id: 'a', isDefault: true },
      { id: 'b', isDefault: true },
      { id: 'c', isDefault: false }
    ])
    const defaults = list.filter(a => a.isDefault)
    expect(defaults.length).toBe(1)
    expect(defaults[0].id).toBe('a')
  })

  test('9) mergeBuiltInApps：缺内置条目时追加，已存在时保留', () => {
    registerBuiltinApps([{
      id: 'test-builtin',
      displayMode: 'fullscreen',
      isBuiltIn: true,
      enabled: false
    }])
    const userList = [{ id: 'box-im', name: '聊天', enabled: true }]
    const merged = mergeBuiltInApps(userList)
    expect(merged.length).toBe(2)
    const builtinEntry = merged.find(a => a.id === 'test-builtin')
    expect(builtinEntry).toBeTruthy()
    expect(builtinEntry.isBuiltIn).toBe(true)
    expect(merged.find(a => a.id === 'box-im').name).toBe('聊天')
  })

  test('10) mergeBuiltInApps：已存在内置条目时保留用户修改', () => {
    registerBuiltinApps([{
      id: 'test-builtin',
      displayMode: 'fullscreen',
      isBuiltIn: true,
      enabled: false
    }])
    const userList = [{ id: 'test-builtin', enabled: true, url: 'http://custom.example/' }]
    const merged = mergeBuiltInApps(userList)
    expect(merged.length).toBe(1)
    expect(merged[0].enabled).toBe(true)
    expect(merged[0].url).toBe('http://custom.example/')
  })

  test('11) diffMicroAppsForReload：displayMode 变化算 dirty', () => {
    const oldList = [{ id: 'a', url: '', devUrl: '', displayMode: 'drawer' }]
    const newList = [{ id: 'a', url: '', devUrl: '', displayMode: 'fullscreen' }]
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('12) diffMicroAppsForReload：url 变化算 dirty', () => {
    const oldList = [{ id: 'a', url: 'http://old', devUrl: '', displayMode: 'drawer' }]
    const newList = [{ id: 'a', url: 'http://new', devUrl: '', displayMode: 'drawer' }]
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('13) diffMicroAppsForReload：displayMode 默认值差异算 dirty', () => {
    const oldList = [{ id: 'a', url: '', devUrl: '' }]
    const newList = [{ id: 'a', url: '', devUrl: '', displayMode: 'fullscreen' }]
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('14) diffMicroAppsForReload：被删的 id 算 dirty', () => {
    const oldList = [{ id: 'a', url: '', devUrl: '', displayMode: 'drawer' }]
    const newList = []
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('15) 完整 normalizeMicroApps + 已注册内置条目场景', () => {
    // 内置条目与普通条目一样允许编辑：url / devUrl / displayMode 均来自用户输入。
    // 注册表仅在 isBuiltIn 身份识别和 displayMode 缺省值时使用。
    registerBuiltinApps([{
      id: 'test-builtin',
      url: '',
      devUrl: '',
      displayMode: 'fullscreen',
      isBuiltIn: true
    }])
    const list = normalizeMicroApps([
      { id: 'box-im', name: '聊天', displayMode: 'drawer' },
      { id: 'test-builtin', enabled: true, url: 'http://user-custom/' }
    ])
    // 内置条目 url 保留用户输入
    const builtinEntry = list.find(a => a.id === 'test-builtin')
    expect(builtinEntry.url).toBe('http://user-custom/')
    expect(builtinEntry.isBuiltIn).toBe(true)
    expect(builtinEntry.enabled).toBe(true)
  })

  test('16) registerBuiltinApps 同 id 覆盖语义', () => {
    registerBuiltinApps([{ id: 'test-builtin', name: 'v1', enabled: false, displayMode: 'fullscreen', isBuiltIn: true }])
    registerBuiltinApps([{ id: 'test-builtin', name: 'v2', enabled: true, displayMode: 'drawer', isBuiltIn: false }])
    const reg = getBuiltinApps()
    expect(reg.length).toBe(1)
    expect(reg[0].name).toBe('v2')
    // 即使业务方传了 isBuiltIn=false，注册表里也是最新一条
    expect(reg[0].isBuiltIn).toBe(false)
  })
})