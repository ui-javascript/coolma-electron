// ============================================================================
// tests/unit/echo/main-builtin-echoes.test.js
//
// 锁定的契约（v2026-07-29 起固定）：
//   历史上 main 端维护了一份 src-electron/main-process/service/builtin-echoes.js
//   镜像（renderer 端 echoBuiltins.js 的转译副本），由 scripts/transform-main-builtin-echoes.js
//   生成。代价：每次改 echoBuiltins 都要记得跑 transform + 同步两份。
//
//   现在 main 不再维护镜像，DB 落库完全由 renderer 通过 IPC payload（db:clearEchoes / db:saveEcho
//   / db:saveEchoes）推送内置 echo 列表。真相源单一（renderer），同步问题消除。
//
//   本测试锁住以下契约：
//     1) BUILTIN_ECHO_CARDS 必须是 16 张卡片
//     2) 每张卡片含完整 IPC payload 字段（id / name / desc / icon / color /
//        category / anno_source / isBuiltin），保证直接 push 给 main 端无字段缺失
//     3) category 必须是 'showy' / 'builtin' 之一（main 端 saveEcho / saveEchoes
//        不再做强制覆盖，读 echo.category 兜底是 'builtin' 或 'marker'）
//     4) id 必须以 '__builtin_' 开头并以 '__' 结尾（main 端 isBuiltin 判断约定）
//     5) anno_source 顶层 type 必须是 echo / echo-chant / echo-tbd 之一，且
//        kind 字段不再出现（已合并到 type）
//     6) anno_source 能被 new Function(prelude + source) 编译（语法正确性）
//
//   === 测试入口迁移 ===
//   旧测试 require('src-electron/main-process/service/builtin-echoes.js')
//   新测试 require('src/components/echo/echoBuiltins/echoBuiltins.js')（renderer
//   真相源），验证渲染端 BUILTIN_ECHO_CARDS 自身具备 IPC 推送所需的全部契约字段。
// ============================================================================

const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'echo')

// === 直接 require() renderer 端真相源 ===
const { BUILTIN_ECHO_CARDS } = require(path.join(ROOT, 'echoBuiltins', 'echoBuiltins.js'))

// === 模拟 main 端对 payload 的判别 ===
//  与 electron-main.js 的 db:saveEcho / db:saveEchoes 内部判定一致：
//  内置 echo 通过 id 前缀 '__builtin_' 识别；category 兜底值约定。
const isBuiltinId = (id) => typeof id === 'string' && id.startsWith('__builtin_')
const VALID_CATEGORIES = new Set(['showy', 'builtin'])
const VALID_TYPES = new Set(['echo', 'echo-chant', 'echo-tbd'])

// 静默 echoBaseRender 的 FALLBACK 警告 log（运行时噪音，不影响契约）
let logSpy
beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  logSpy.mockRestore()
})

// === jQuery 注入的 handler prelude（与 main 端契约一致） ===
const HANDLER_PRELUDE_SOURCE = [
  "const __safeDollar = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null",
  "const $ = __safeDollar",
  ""
].join('\n')

describe('echo/renderer 端 17 张内置卡片的 IPC payload 契约', () => {
  test('BUILTIN_ECHO_CARDS 是 17 项数组', () => {
    expect(Array.isArray(BUILTIN_ECHO_CARDS)).toBe(true)
    expect(BUILTIN_ECHO_CARDS.length).toBe(17)
  })

  test('BUILTIN_ECHO_CARDS 已 Object.freeze（防 renderer 运行时意外修改）', () => {
    expect(Object.isFrozen(BUILTIN_ECHO_CARDS)).toBe(true)
  })

  describe.each(BUILTIN_ECHO_CARDS.map(c => [c.id, c]))('[%s]', (id, card) => {
    // ===== IPC payload 字段完整性 =====
    test('payload 含 ipc 必传字段（id / name / desc / icon / color / category / anno_source）', () => {
      expect(card.id).toBeTruthy()
      expect(card.name).toBeTruthy()
      expect(typeof card.desc).toBe('string')
      expect(card.icon).toBeTruthy()
      expect(card.color).toBeTruthy()
      expect(typeof card.category).toBe('string')
      expect(typeof card.anno_source).toBe('string')
      expect(card.anno_source.length).toBeGreaterThan(0)
    })

    test('payload 含 isBuiltin=true / metaId', () => {
      expect(card.isBuiltin).toBe(true)
      expect(card.metaId).toBeTruthy()
    })

    test('id 必须以 __builtin_ 开头并以 __ 结尾（main 端 isBuiltin 判断约定）', () => {
      expect(isBuiltinId(card.id)).toBe(true)
      expect(card.id.endsWith('__')).toBe(true)
    })

    test('category 必须是 showy / builtin 之一（main 端不做强制覆盖）', () => {
      expect(VALID_CATEGORIES.has(card.category)).toBe(true)
    })

    // ===== anno_source 编译契约 =====
    test('anno_source 能被 new Function(prelude + source) 编译', () => {
      const normalized = card.anno_source.replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
      const obj = fn()
      expect(typeof obj).toBe('object')
    })

    test('anno_source 顶层 type 必须是 echo / echo-chant / echo-tbd 之一', () => {
      const normalized = card.anno_source.replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
      const obj = fn()
      expect(VALID_TYPES.has(obj.type)).toBe(true)
    })

    test('anno_source 不应再含顶层 kind 字段（已合并到 type）', () => {
      const normalized = card.anno_source.replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
      const obj = fn()
      expect('kind' in obj).toBe(false)
    })

    test('anno_source 顶层 field == metaId、title == name', () => {
      const normalized = card.anno_source.replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
      const obj = fn()
      expect(obj.field).toBe(card.metaId)
      expect(obj.title).toBe(card.name)
    })

    test('render({}) 必须返回 string', () => {
      const normalized = card.anno_source.replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
      const obj = fn()
      expect(typeof obj.render({})).toBe('string')
    })

    test('type=echo-chant 必须有 afterRender', () => {
      const normalized = card.anno_source.replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
      const obj = fn()
      if (obj.type === 'echo-chant') {
        expect(typeof obj.afterRender).toBe('function')
      }
    })
  })
})
