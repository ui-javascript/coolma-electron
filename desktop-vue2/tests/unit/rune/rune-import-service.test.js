// ============================================================================
// tests/unit/rune/rune-import-service.test.js
//
// 锁定 RuneImportService 的契约（v2026-08-01 对齐 EchoImportService）：
//   1) 顶层必须为 { format: 'memocast.rune-pack', version: 1, exportedAt, runes }
//   2) 字段归一化：name / desc / category / color / icon / template
//   3) 不导出数据库审计字段（id / isBuiltin / sort_order / created_at / updated_at）
//   4) 与 Echo 的互斥检测：拒裸数组、拒 Echo Pack 对象、拒 echo 风格的数组
//   5) 非法 category fallback 到 'general'，不阻塞整批
// ============================================================================

// 静默 console 噪音
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

const path = require('path')
const RuneImportService = require(path.resolve(__dirname, '../../../src/services/RuneImportService.js'))

const { parseRunePack, buildRunePack, RUNE_PACK, __testOnly__ } = RuneImportService
const { normalizeRuneEntry, isValidCategory, VALID_CATEGORY_KEYS } = __testOnly__

// ============================================================================
// 顶层 schema 解析
// ============================================================================
describe('RuneImportService.parseRunePack — 顶层 schema', () => {
  test('合法 Rune Pack v1 → 通过', () => {
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1,
      exportedAt: '2026-08-01T00:00:00.000Z',
      runes: [
        { name: 'A', template: '<div>A</div>', category: 'general' }
      ]
    })
    const result = parseRunePack(text)
    expect(result.success).toBe(true)
    expect(result.format).toBe('memocast.rune-pack')
    expect(result.version).toBe(1)
    expect(result.entries.length).toBe(1)
    expect(result.invalidItems.length).toBe(0)
  })

  test('旧版裸数组（v2026-08-01 之前）→ 拒绝（RUNE_PACK_FORMAT）', () => {
    const result = parseRunePack('[]')
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT')
    expect(result.message).toMatch(/格式不匹配/)
  })

  test('非空裸数组 → 同样拒绝（RUNE_PACK_FORMAT）', () => {
    const result = parseRunePack(JSON.stringify([
      { name: '符文A', template: '<div>A</div>' }
    ]))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT')
  })

  test('顶层对象但无 format 头 → 拒绝（RUNE_PACK_FORMAT_MISMATCH）', () => {
    const result = parseRunePack(JSON.stringify({ foo: 'bar' }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT_MISMATCH')
  })

  test('顶层 format = memocast.echo-pack → 拒绝（RUNE_PACK_FORMAT_MISMATCH）', () => {
    const result = parseRunePack(JSON.stringify({
      format: 'memocast.echo-pack',
      version: 1,
      echoes: [{ name: 'A', anno_source: 'export default {}' }]
    }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT_MISMATCH')
    expect(result.message).toMatch(/Echo/)
  })

  test('format 不匹配 → 拒绝', () => {
    const result = parseRunePack(JSON.stringify({ format: 'memocast.foo-pack', version: 1, runes: [] }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT_MISMATCH')
  })

  test('version 不匹配 → 拒绝', () => {
    const result = parseRunePack(JSON.stringify({ format: 'memocast.rune-pack', version: 99, runes: [] }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_VERSION_UNSUPPORTED')
  })

  test('runes 字段缺失 → 拒绝', () => {
    const result = parseRunePack(JSON.stringify({ format: 'memocast.rune-pack', version: 1 }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_INVALID')
  })

  test('文件超大 → 拒绝', () => {
    const big = 'a'.repeat(6 * 1024 * 1024)
    const result = parseRunePack(big)
    expect(result.success).toBe(false)
    expect(result.code).toBe('FILE_TOO_LARGE')
  })

  test('非 JSON 文本 → 拒绝', () => {
    const result = parseRunePack('not json')
    expect(result.success).toBe(false)
    expect(result.code).toBe('JSON_PARSE_FAILED')
  })

  test('runes 超过 500 条 → 拒绝', () => {
    const arr = []
    for (let i = 0; i < 501; i++) arr.push({ name: 'A_' + i, template: '<div>x</div>' })
    const result = parseRunePack(JSON.stringify({ format: 'memocast.rune-pack', version: 1, runes: arr }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_TOO_MANY')
  })
})

// ============================================================================
// 字段归一化契约
// ============================================================================
describe('RuneImportService.parseRunePack — 字段归一化', () => {
  function build (entry) {
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1,
      runes: [entry]
    })
    return parseRunePack(text)
  }

  test('name 缺失 → 标记 INVALID', () => {
    const result = build({ template: '<div>x</div>' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('EMPTY_NAME')
  })

  test('template 缺失 → 标记 INVALID', () => {
    const result = build({ name: 'A', desc: 'd' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('EMPTY_TEMPLATE')
  })

  test('name 超长 → 标记 NAME_TOO_LONG', () => {
    const result = build({ name: 'A'.repeat(200), template: '<div>x</div>' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('NAME_TOO_LONG')
  })

  test('template 超大 → 标记 TEMPLATE_TOO_LARGE', () => {
    const result = build({ name: 'A', template: 'a'.repeat(600 * 1024) })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('TEMPLATE_TOO_LARGE')
  })

  test('非法 category → fallback 到 general（不阻塞）', () => {
    const result = build({ name: 'A', template: '<div>x</div>', category: '__poll__' })
    expect(result.entries.length).toBe(1)
    expect(result.entries[0].normalized.category).toBe('general')
  })

  test('合法条目 → 字段归一化（color / icon / category fallback）', () => {
    const result = build({ name: '  A ', desc: 'd', template: '<div>x</div>' })
    expect(result.entries.length).toBe(1)
    const item = result.entries[0].normalized
    expect(item.name).toBe('A') // trim
    expect(item.color).toBe('#7E57C2')
    expect(item.icon).toBe('star')
    expect(item.category).toBe('general')
    expect(item.template).toBe('<div>x</div>')
  })

  test('显式 color / icon / category 透传', () => {
    const result = build({
      name: 'A',
      template: '<div>x</div>',
      color: '#FF00FF',
      icon: 'bolt',
      category: 'gaming'
    })
    const item = result.entries[0].normalized
    expect(item.color).toBe('#FF00FF')
    expect(item.icon).toBe('bolt')
    expect(item.category).toBe('gaming')
  })
})

// ============================================================================
// normalizeRuneEntry 单元
// ============================================================================
describe('RuneImportService normalizeRuneEntry', () => {
  test('非对象 → NOT_OBJECT', () => {
    expect(normalizeRuneEntry(null).reason).toBe('NOT_OBJECT')
    expect(normalizeRuneEntry('s').reason).toBe('NOT_OBJECT')
    expect(normalizeRuneEntry([]).reason).toBe('NOT_OBJECT')
  })

  test('白名单 category 校验', () => {
    expect(isValidCategory('general')).toBe(true)
    expect(isValidCategory('gaming')).toBe(true)
    expect(isValidCategory('__poll__')).toBe(false)
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory(null)).toBe(false)
  })

  test('VALID_CATEGORY_KEYS 与 RuneCategoryEnum.items 同步', () => {
    expect(VALID_CATEGORY_KEYS.has('general')).toBe(true)
    expect(VALID_CATEGORY_KEYS.has('resume')).toBe(true)
    expect(VALID_CATEGORY_KEYS.has('environment')).toBe(true)
  })
})

// ============================================================================
// buildRunePack：导出字段白名单
// ============================================================================
describe('RuneImportService.buildRunePack', () => {
  test('导出字段白名单：name / desc / category / color / icon / template', () => {
    const json = buildRunePack([
      {
        id: 'rune-001',
        name: 'A',
        desc: 'd',
        category: 'gaming',
        color: '#7E57C2',
        icon: 'star',
        template: '<div>x</div>',
        is_builtin: 1,
        created_at: 123,
        updated_at: 456,
        sort_order: 99,
        inherit_from_previous: 0
      }
    ])
    const parsed = JSON.parse(json)
    expect(parsed.format).toBe('memocast.rune-pack')
    expect(parsed.version).toBe(1)
    expect(Array.isArray(parsed.runes)).toBe(true)
    expect(parsed.runes.length).toBe(1)
    expect(Object.keys(parsed.runes[0]).sort()).toEqual([
      'category', 'color', 'desc', 'icon', 'name', 'template'
    ])
    // 不应携带数据库审计字段
    expect(parsed.runes[0]).not.toHaveProperty('id')
    expect(parsed.runes[0]).not.toHaveProperty('is_builtin')
    expect(parsed.runes[0]).not.toHaveProperty('sort_order')
    expect(parsed.runes[0]).not.toHaveProperty('created_at')
  })

  test('空名称 / 非法 category / 缺字段项 → 静默剔除或 fallback', () => {
    const json = buildRunePack([
      { name: '  A  ', category: 'gaming', template: '<div>x</div>' },
      { name: '', category: 'general', template: '<div>y</div>' }, // 剔除
      { name: 'B', category: '__poll__', template: '<div>z</div>' }, // category fallback
      null
    ])
    const parsed = JSON.parse(json)
    expect(parsed.runes.length).toBe(2)
    expect(parsed.runes[0].name).toBe('A')
    expect(parsed.runes[0].category).toBe('gaming')
    expect(parsed.runes[1].name).toBe('B')
    expect(parsed.runes[1].category).toBe('general') // 非法值 fallback
  })

  test('空入参 → 仍生成合法 Pack（空 runes）', () => {
    const json = buildRunePack([])
    const parsed = JSON.parse(json)
    expect(parsed.format).toBe('memocast.rune-pack')
    expect(parsed.version).toBe(1)
    expect(Array.isArray(parsed.runes)).toBe(true)
    expect(parsed.runes.length).toBe(0)
  })

  test('导出后重新解析 → 等价（round-trip）', () => {
    const original = [
      { name: 'AAA', desc: 'a', category: 'general', color: '#7E57C2', icon: 'star', template: '<div>A</div>' },
      { name: 'BBB', desc: 'b', category: 'gaming', color: '#FF00FF', icon: 'bolt', template: '<div>B</div>' }
    ]
    const json = buildRunePack(original)
    const parsed = parseRunePack(json)
    expect(parsed.success).toBe(true)
    expect(parsed.entries.length).toBe(2)
    expect(parsed.entries.map(e => e.normalized.name).sort()).toEqual(['AAA', 'BBB'])
  })

  test('exportedAt 字段是 ISO 字符串', () => {
    const json = buildRunePack([{ name: 'A', template: '<div>x</div>' }])
    const parsed = JSON.parse(json)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// ============================================================================
// 解析混合批：合法 + 非法
// ============================================================================
describe('RuneImportService 解析混合批', () => {
  test('非法 + 合法混合 → 合法进 entries，非法进 invalidItems', () => {
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1,
      runes: [
        { name: 'A', template: '<div>A</div>' },
        { name: '', template: '<div>x</div>' },
        { name: 'B', desc: 'missing template' },
        { name: 'C', template: '<div>C</div>' }
      ]
    })
    const result = parseRunePack(text)
    expect(result.entries.length).toBe(2)
    expect(result.invalidItems.length).toBe(2)
    const reasons = result.invalidItems.map(i => i.reason).sort()
    expect(reasons).toEqual(['EMPTY_NAME', 'EMPTY_TEMPLATE'])
  })
})

// ============================================================================
// RUNE_PACK 常量
// ============================================================================
describe('RUNE_PACK 常量', () => {
  test('FORMAT / VERSION 锁定', () => {
    expect(RUNE_PACK.FORMAT).toBe('memocast.rune-pack')
    expect(RUNE_PACK.VERSION).toBe(1)
  })
})
