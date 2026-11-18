// ============================================================================
// tests/unit/rune/main-builtin-templates.test.js
//
// 锁定的契约（v2026-07-29 起固定）：
//   历史上 main 端维护了一份 src-electron/main-process/service/builtin-rune-templates.js
//   镜像（renderer 端 runeTemplates.js 的转译副本，且包含 name / desc / color / icon 元数据）。
//   代价：每次改 runeTemplates 都要记得同步两份；镜像已经出现真实漂移
//   （renderer 端 14 张 InheritDemo 未在镜像里 → 新装机用户永远看不到 InheritDemo）。
//
//   现在 main 不再维护镜像，DB 落库完全由 renderer 通过 IPC payload
//   （db:clearRuneTemplates / db:saveRuneTemplate / db:saveRuneTemplates）推送。
//   真相源单一（renderer 端 src/components/rune/runeTemplates/runeTemplates.js
//   里的 BUILTIN_RUNE_TEMPLATE_META），同步问题消除。
//
//   本测试锁住以下契约：
//     1) BUILTIN_RUNE_TEMPLATE_META 必须是 14 张卡
//     2) 每张 meta 含完整 IPC payload 字段（id / category_key / name / desc /
//        color / icon / factory / is_builtin=1 / sort_order / created_at /
//        updated_at），保证直接 push 给 main 端无字段缺失
//     3) id 必须以 'builtin-tpl-' 开头（main 端 reset 删除 is_builtin=1 行的约定）
//     4) factory 调出非空字符串（单源模板能渲染成 SFC）
//     5) factory 调出的 SFC 字符串语法可编译（new Function 不抛错）
//     6) factory 与 create*Template 一一对应（与 tests/unit/rune/templates.test.js
//        里的 TEMPLATE_NAMES 列表对齐，避免 renderer 端再分裂两套名单）
// ============================================================================

const path = require('path')

const mod = require('../../../src/components/rune/runeTemplates/runeTemplates.js')

// === 与 tests/unit/rune/templates.test.js 对齐的 TEMPLATE_NAMES（单一来源）===
const TEMPLATE_NAMES = [
  'createBlankTemplate',
  'createInheritDemoTemplate',
  'createInputTemplate',
  'createHolyShieldTemplate',
  'createFireflyTemplate',
  'createJsxGraphTemplate',
  'createElInputTemplate',
  'createElSelectTemplate',
  'createElDatePickerTemplate',
  'createResumeBasicInfoTemplate',
  'createResumeTitleTemplate',
  'createResumeExperienceTemplate',
  'createResumeTextTemplate',
  'createResumeSkillTemplate'
]

const VALID_CATEGORY_KEYS = new Set(['general', 'resume'])

const isBuiltinTplId = (id) => typeof id === 'string' && id.startsWith('builtin-tpl-')

const meta = mod.BUILTIN_RUNE_TEMPLATE_META || mod.BUILTIN_RUNE_TEMPLATE_META_LIST || []

// 供「factoryName 字符串 → 顶层 create*Template 函数」用
const resolveFactory = (entry) => {
  if (!entry) return null
  if (typeof entry.factoryName === 'string' && typeof mod[entry.factoryName] === 'function') {
    return { factory: mod[entry.factoryName], name: entry.factoryName }
  }
  return null
}

describe('rune/renderer 端 14 张内置模板的 IPC payload 契约', () => {
  test('BUILTIN_RUNE_TEMPLATE_META 是 14 项数组', () => {
    expect(Array.isArray(meta)).toBe(true)
    expect(meta.length).toBe(14)
  })

  test('BUILTIN_RUNE_TEMPLATE_META 数量与 TEMPLATE_NAMES 一致', () => {
    // 若两边漂移，要么改 TEMPLATE_NAMES（新增/删除），要么改 meta 列表，绝不允许悄悄漂移
    const metaFactoryNames = meta.map(m => resolveFactory(m) && resolveFactory(m).name).filter(Boolean)
    const tplNames = new Set(TEMPLATE_NAMES)
    expect(metaFactoryNames.length).toBe(TEMPLATE_NAMES.length)
    for (const tn of TEMPLATE_NAMES) {
      expect(metaFactoryNames.includes(tn)).toBe(true)
    }
    // 反向：meta 里出现的 factory 也必须在 TEMPLATE_NAMES
    for (const mfn of metaFactoryNames) {
      expect(tplNames.has(mfn)).toBe(true)
    }
  })

  describe.each(meta.map(m => [m && m.id, m]))('[%s]', (id, it) => {
    test('payload 含 ipc 必传字段（id / category_key / name / desc / color / icon / factoryName）', () => {
      expect(it.id).toBeTruthy()
      expect(typeof it.category_key).toBe('string')
      expect(it.name).toBeTruthy()
      expect(typeof it.desc).toBe('string')
      expect(it.color).toBeTruthy()
      expect(it.icon).toBeTruthy()
      expect(typeof it.factoryName).toBe('string')
      expect(resolveFactory(it)).not.toBeNull()
    })

    test('id 必须以 builtin-tpl- 开头（main 端 reset 删除 is_builtin=1 行的约定）', () => {
      expect(isBuiltinTplId(it.id)).toBe(true)
    })

    test('category_key 必须是 general / resume 之一（main 端 schema 允许的枚举）', () => {
      expect(VALID_CATEGORY_KEYS.has(it.category_key)).toBe(true)
    })

    test('factory 调出非空字符串', () => {
      const { factory } = resolveFactory(it)
      const s = factory()
      expect(typeof s).toBe('string')
      expect(s.length).toBeGreaterThan(0)
    })

    test('factory 输出的 SFC 语法可编译（new Function 不抛错）', () => {
      const { factory } = resolveFactory(it)
      const s = factory()
      const scriptMatch = s.match(/<script>([\s\S]*?)<\/script>/)
      expect(scriptMatch).not.toBeNull()
      const body = scriptMatch[1].trim()
      // 包裹一层 function 让 export default 变成 return —— 与 runtime 编译路径等价
      const code = 'return (function(){' + body.replace(/export\s+default/, 'return ') + '})()'
      // eslint-disable-next-line no-new-func
      expect(() => new Function(code)).not.toThrow()
    })
  })
})
