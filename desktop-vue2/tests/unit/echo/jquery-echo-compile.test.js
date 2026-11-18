// ============================================================================
// tests/unit/echo/jquery-echo-compile.test.js
// 从 scripts/verify-jquery-echo-compile.js 迁移而来（v2026-07-29 接入 Jest，2026-07-29 适配拆分）。
//
// 锁定的契约（v2026-07-28 起 echo 新结构）：
//   1) 16 张内置 anno_source 都能被 new Function(prelude + source) 编译
//   2) 顶层 type/field/title/version/props 元数据齐全
//   3) render(props) 必须返回 string
//   4) kind 字段已合并到 type（不应再出现独立 kind 字段）
//   5) type=echo-chant 必须有 afterRender
//   6) jQuery 化的 helper 不抛 ReferenceError
//
// === 拆分后的源文件位置 ===
//   拆分前是 src/components/echo/echoBuiltins.js（单文件）。
//   拆分后是 src/components/echo/echoBuiltins/ 子目录，入口 ./echoBuiltins.js
//   （聚合 ./echoBuiltinsBase.js 工厂 + 16 张 ./echoBuiltins*.js 卡片）。
// ============================================================================

const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'echo')

// === 注入 jQuery 化后的 prelude（jsdom 环境下 window.jQuery 已由 tests/fixtures/jquery-setup.js 注入）===
const HANDLER_PRELUDE_SOURCE = [
  "const __safeDollarRuntime = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null",
  "const $ = __safeDollarRuntime"
].join('\n')

// === 直接 require() 新入口拿到 16 张卡片 ===
//  拆分前曾是"读源文件 + new Function() 剥离 import/export + 现场执行"。
//  拆分后源文件分散到子目录，硬拼 import 字符串容易坏；用 require() 拿 frozen 数组更稳。
const { BUILTIN_ECHO_CARDS } = require(path.join(ROOT, 'echoBuiltins', 'echoBuiltins.js'))

// 静默 echoBaseRender 的 FALLBACK 警告 log（运行时噪音，不影响契约）
let logSpy
beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  logSpy.mockRestore()
})

describe('echo/renderer 端 16 张内置 anno_source 编译', () => {
  test('BUILTIN_ECHO_CARDS 是 17 项数组', () => {
    expect(Array.isArray(BUILTIN_ECHO_CARDS)).toBe(true)
    expect(BUILTIN_ECHO_CARDS.length).toBe(17)
  })

  describe.each(BUILTIN_ECHO_CARDS.map(ec => [ec.metaId, ec]))('[%s]', (id, ec) => {
    let def
    beforeAll(() => {
      const normalized = ec.anno_source.replace(/export\s+default/, 'return')
      const code = HANDLER_PRELUDE_SOURCE + '\n' + normalized + '\n'
      // eslint-disable-next-line no-new-func
      const fn = new Function(code)
      def = fn()
    })

    test('anno_source 能被 new Function() 编译', () => {
      expect(typeof def).toBe('object')
    })

    test('顶层 type 必须是 echo / echo-chant / echo-tbd 之一', () => {
      expect(['echo', 'echo-chant', 'echo-tbd']).toContain(def.type)
    })

    test('definition 不应再含顶层 kind 字段（已合并到 type）', () => {
      expect('kind' in def).toBe(false)
    })

    test('顶层 field / title / version 存在', () => {
      expect(def.field).toBeTruthy()
      expect(def.title).toBeTruthy()
      expect(typeof def.version).toBe('number')
    })

    test('render 是 function', () => {
      expect(typeof def.render).toBe('function')
    })

    test('render({}) 必须返回 string', () => {
      expect(typeof def.render({})).toBe('string')
    })

    test('type=echo-chant 必须有 afterRender', () => {
      if (def.type === 'echo-chant') {
        expect(typeof def.afterRender).toBe('function')
      }
    })

    test('render({}) 输出被 ag-echo-placeholder-marker 外壳包裹（v2026-07-29 起锁定）', () => {
      // 锁定契约：baseRender 输出的 HTML 必须是 <span class="ag-echo-placeholder-marker"> 内外两层结构，
      // outer marker 与 echoAnno 的 marker vnode 同 tag/class，确保 snabbdom patch 时 marker 不会被
      // removeVnodes/addVnodes 全替换 —— 这样聚焦/失焦切换下 marker 胶囊不会"时有时无"。
      const html = def.render({})
      expect(typeof html).toBe('string')
      expect(html.startsWith('<span class="ag-echo-placeholder-marker">')).toBe(true)
      expect(html).toContain('ag-echo-anno-at')
      expect(html).toContain('ag-echo-anno-name')
      expect(html).toContain('ag-rune ag-rune--')
      expect(html).toContain('data-echo-chant-id=')
    })
  })
})
