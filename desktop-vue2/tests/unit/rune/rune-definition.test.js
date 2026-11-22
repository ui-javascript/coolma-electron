// ============================================================================
// tests/unit/rune/rune-definition.test.js
//
// 锁定「符文定义类型判定 + melt-js 配置解析」的契约（v2026-11-22）：
//   1) 类型判定只认 template JSON 里的 `"$type": "melt-js"`；其它一律当 vue-sfc
//      —— 老机制（SFC 字符串）必须零行为变化，宁可误判 vue-sfc 也不能误判 melt-js
//   2) melt 配置归一化：dep / exportName / valueProp / valueEvent / style / props 默认值
//   3) 校验返回 [{ field, message }]：缺 dep.name、缺 exportName、custom 缺 host、
//      prop 名非法、prop 类型非法
//   4) props schema 是 **对象 map**（{ name: { type, default, label } }），
//      与 SFC 版 parseSfcPropsDef 的数组输出通过 listMeltPropDefs 对齐
// ============================================================================

const {
  RUNE_TYPE_VUE_SFC,
  RUNE_TYPE_MELT_JS,
  detectRuneType,
  parseMeltRuneConfig,
  validateMeltRuneConfig,
  listMeltPropDefs,
  resolveRuneDefinition
} = require('libs-muya-vue2/lib/rune/runeDefinition')

const meltTemplate = (patch = {}) => JSON.stringify({
  $type: 'melt-js',
  dep: { name: 'comps-vue2-meme', type: 'github', version: '2026.11.16' },
  exportName: 'TierRanking',
  props: {
    value: { type: 'string', label: '内容' },
    maxHeight: { type: 'number', default: 320 }
  },
  ...patch
})

describe('detectRuneType', () => {
  test('SFC 字符串 → vue-sfc', () => {
    expect(detectRuneType('<template><div/></template>')).toBe(RUNE_TYPE_VUE_SFC)
  })

  test('空值 / null → vue-sfc', () => {
    expect(detectRuneType('')).toBe(RUNE_TYPE_VUE_SFC)
    expect(detectRuneType(null)).toBe(RUNE_TYPE_VUE_SFC)
  })

  test('$type: melt-js 的 JSON → melt-js', () => {
    expect(detectRuneType(meltTemplate())).toBe(RUNE_TYPE_MELT_JS)
  })

  test('JSON 但不是 melt 标记 → vue-sfc（老机制不被误伤）', () => {
    expect(detectRuneType(JSON.stringify({ foo: 1 }))).toBe(RUNE_TYPE_VUE_SFC)
    expect(detectRuneType(JSON.stringify({ $type: 'other', dep: { name: 'x' } }))).toBe(RUNE_TYPE_VUE_SFC)
  })

  test('残缺 JSON → vue-sfc', () => {
    expect(detectRuneType('{ "$type": "melt-js"')).toBe(RUNE_TYPE_VUE_SFC)
  })
})

describe('parseMeltRuneConfig', () => {
  test('归一化默认值', () => {
    const cfg = parseMeltRuneConfig(meltTemplate())
    expect(cfg.dep.name).toBe('comps-vue2-meme')
    expect(cfg.dep.type).toBe('github')
    expect(cfg.exportName).toBe('TierRanking')
    expect(cfg.valueProp).toBe('value')
    expect(cfg.valueEvent).toBe('input')
    expect(Object.keys(cfg.props)).toEqual(['value', 'maxHeight'])
  })

  test('也接受 rune 行对象（取 .template）', () => {
    expect(parseMeltRuneConfig({ template: meltTemplate() }).exportName).toBe('TierRanking')
  })

  test('非 melt 定义返回 null', () => {
    expect(parseMeltRuneConfig('<template><div/></template>')).toBeNull()
    expect(parseMeltRuneConfig({ template: '<template><div/></template>' })).toBeNull()
  })

  test('未知 dep.type 回落 unpkg', () => {
    const cfg = parseMeltRuneConfig(meltTemplate({ dep: { name: 'x', type: 'ftp' } }))
    expect(cfg.dep.type).toBe('unpkg')
  })
})

describe('validateMeltRuneConfig', () => {
  test('合法配置无错误', () => {
    expect(validateMeltRuneConfig(parseMeltRuneConfig(meltTemplate()))).toEqual([])
  })

  test('缺 dep.name / exportName', () => {
    const errs = validateMeltRuneConfig(parseMeltRuneConfig(meltTemplate({ dep: { type: 'github' }, exportName: '' })))
    expect(errs.map(e => e.field)).toEqual(['dep.name', 'exportName'])
  })

  test('custom 地址缺 host', () => {
    const errs = validateMeltRuneConfig({ dep: { name: 'x', type: 'custom', host: '' }, exportName: 'Y' })
    expect(errs.map(e => e.field)).toEqual(['dep.host'])
  })

  test('prop 名 / 类型非法', () => {
    const errs = validateMeltRuneConfig({
      dep: { name: 'x' },
      exportName: 'Y',
      props: { 'bad name!': { type: 'date' } }
    })
    expect(errs.map(e => e.field)).toEqual(['props.bad name!', 'props.bad name!.type'])
  })

  test('传 null 表示缺 dep/exportName，但不抛异常', () => {
    const errs = validateMeltRuneConfig(null)
    expect(errs.map(e => e.field)).toEqual(['dep.name', 'exportName'])
  })
})

describe('listMeltPropDefs', () => {
  test('输出 shape 与 label / default 缺省', () => {
    const cfg = parseMeltRuneConfig(meltTemplate())
    expect(listMeltPropDefs(cfg)).toEqual([
      { name: 'value', type: 'string', default: undefined, label: '内容' },
      { name: 'maxHeight', type: 'number', default: 320, label: 'maxHeight' }
    ])
  })

  test('label 缺省回落 prop 名', () => {
    const cfg = parseMeltRuneConfig(meltTemplate({ props: { title: { type: 'string' } } }))
    expect(listMeltPropDefs(cfg)[0].label).toBe('title')
  })

  test('props 写成数组（坏配置）时不炸，返回空数组', () => {
    const cfg = parseMeltRuneConfig(meltTemplate({ props: [{ name: 'a' }] }))
    expect(listMeltPropDefs(cfg)).toEqual([])
  })
})

describe('resolveRuneDefinition', () => {
  test('vue-sfc 行：type 正确且无 config', () => {
    const def = resolveRuneDefinition({ template: '<template><div/></template>' })
    expect(def.type).toBe(RUNE_TYPE_VUE_SFC)
    expect(def.config).toBeNull()
    expect(def.errors).toEqual([])
  })

  test('melt 行：带 config 且合法则 errors 为空', () => {
    const def = resolveRuneDefinition({ template: meltTemplate() })
    expect(def.type).toBe(RUNE_TYPE_MELT_JS)
    expect(def.config.exportName).toBe('TierRanking')
    expect(def.errors).toEqual([])
  })
})
