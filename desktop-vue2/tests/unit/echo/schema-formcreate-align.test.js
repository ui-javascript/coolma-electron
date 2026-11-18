// ============================================================================
// tests/unit/echo/schema-formcreate-align.test.js
// 从 scripts/verify-echo-schema-formcreate-align.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约（v2026-07-28 起 echo schema 形态）：
//   1) BUILTIN_ECHO_PROPS_SCHEMA 16 张卡的 schema 项里，**禁止**出现 form-create 不认的
//      自造字段（典型反例：placeholder 作为顶层 schema 元数据）
//   2) 每一项 schema 都至少声明 type + field
//   3) buildFormCreateRule 输出的 rule 字段全部是 form-create 标准字段
//   4) buildFormCreateRule 把 schemaItem.defaultValue 作为默认值，但实例 props 优先覆盖
// ============================================================================
const schemaMod = require('../../../src/components/echo/echoPropsSchema.js')

const { BUILTIN_ECHO_PROPS_SCHEMA, resolvePropsSchema, buildFormCreateRule } = schemaMod

// form-create rule 公认的标准字段（白名单）
const FORM_CREATE_STANDARD_FIELDS = new Set([
  'type', 'field', 'title', 'value',
  'props', 'on', 'options', 'info',
  'hidden', 'col', 'control', 'component',
  'validate', 'inject', 'sync', 'emit', 'emitPrefix',
  'effect', 'update', 'computed', 'cache',
  'children', 'renderSlots', 'hook'
])

// 反面教材字段名（echo 历史上自造、非 form-create 标准的）
const FORBIDDEN_AT_TOP_LEVEL = new Set(['placeholder'])

describe('echo/propsSchema 贴合 form-create rule', () => {
  test('BUILTIN_ECHO_PROPS_SCHEMA 至少有一张卡', () => {
    const cardIds = Object.keys(BUILTIN_ECHO_PROPS_SCHEMA)
    expect(cardIds.length).toBeGreaterThan(0)
  })

  describe('逐个 schema 项契约', () => {
    const cardIds = Object.keys(BUILTIN_ECHO_PROPS_SCHEMA)
    let totalItems = 0

    beforeAll(() => {
      for (const cardId of cardIds) {
        const items = BUILTIN_ECHO_PROPS_SCHEMA[cardId] || []
        totalItems += items.length
      }
    })

    test('BUILTIN_ECHO_PROPS_SCHEMA 至少包含一组 schema 项', () => {
      expect(totalItems).toBeGreaterThan(0)
    })

    test.each(
      cardIds.flatMap(cardId =>
        (BUILTIN_ECHO_PROPS_SCHEMA[cardId] || []).map(item => [cardId, item])
      )
    )('[%s] schema 项不含顶层字段 placeholder', (cardId, item) => {
      for (const banned of FORBIDDEN_AT_TOP_LEVEL) {
        expect(banned in item).toBe(false)
      }
    })

    test.each(
      cardIds.flatMap(cardId =>
        (BUILTIN_ECHO_PROPS_SCHEMA[cardId] || []).map(item => [cardId, item])
      )
    )('[%s] schema 项含 type 字段', (cardId, item) => {
      expect(typeof item.type).toBe('string')
      expect(item.type.length).toBeGreaterThan(0)
    })

    test.each(
      cardIds.flatMap(cardId =>
        (BUILTIN_ECHO_PROPS_SCHEMA[cardId] || []).map(item => [cardId, item])
      )
    )('[%s] schema 项含 field 字段', (cardId, item) => {
      expect(typeof item.field).toBe('string')
      expect(item.field.length).toBeGreaterThan(0)
    })
  })

  describe('buildFormCreateRule 行为', () => {
    test('resolvePropsSchema 拿得到 growth schema', () => {
      const sampleEcho = { id: 'growth' }
      const schemaItems = resolvePropsSchema(sampleEcho)
      expect(Array.isArray(schemaItems)).toBe(true)
      expect(schemaItems.length).toBeGreaterThan(0)
    })

    test('无 props 时 value 用 schema.defaultValue', () => {
      const echo = { id: 'growth', name: '生生不息' }
      const rule = buildFormCreateRule(echo, {})
      expect(rule.length).toBeGreaterThan(0)
      expect(rule.every(r => r.value !== undefined)).toBe(true)
    })

    test('实例 props.scope 覆盖 schema.defaultValue', () => {
      const echo = { id: 'growth', name: '生生不息' }
      const rule = buildFormCreateRule(echo, { scope: 'document', trigger: 'manual' })
      const scopeRule = rule.find(r => r.field === 'scope')
      expect(scopeRule).toBeDefined()
      expect(scopeRule.value).toBe('document')
    })

    test('实例 props.trigger 覆盖 schema.defaultValue', () => {
      const echo = { id: 'growth', name: '生生不息' }
      const rule = buildFormCreateRule(echo, { scope: 'document', trigger: 'manual' })
      const triggerRule = rule.find(r => r.field === 'trigger')
      expect(triggerRule).toBeDefined()
      expect(triggerRule.value).toBe('manual')
    })

    test('未覆盖字段保留 schema.defaultValue', () => {
      const echo = { id: 'growth', name: '生生不息' }
      const rule = buildFormCreateRule(echo, { scope: 'document', trigger: 'manual' })
      const targetRule = rule.find(r => r.field === 'target')
      expect(targetRule).toBeDefined()
      expect(targetRule.value).toBe('p, li, h1, h2, h3')
    })

    test('rule 字段必须是 form-create 标准字段', () => {
      const echo = { id: 'growth', name: '生生不息' }
      const rule = buildFormCreateRule(echo, { scope: 'document', trigger: 'manual' })
      for (const r of rule) {
        for (const key of Object.keys(r)) {
          expect(FORM_CREATE_STANDARD_FIELDS.has(key)).toBe(true)
        }
      }
    })

    test('growth.target 是 input 类型未声明 props，rule 就不该有 props 键', () => {
      const echo = { id: 'growth', name: '生生不息' }
      const rule = buildFormCreateRule(echo, { scope: 'document', trigger: 'manual' })
      const targetRule = rule.find(r => r.field === 'target')
      expect(targetRule).toBeDefined()
      expect(targetRule.props).toBeUndefined()
    })

    test('ref 卡的 url 应当透传 props.placeholder', () => {
      const refRule = buildFormCreateRule({ id: 'ref' }, {})[0]
      expect(refRule).toBeDefined()
      expect(refRule.props).toBeDefined()
      expect(refRule.props.placeholder).toBe('https://...')
    })
  })

  describe('options 与控件类型配套', () => {
    const optionsTypes = ['select', 'radio', 'checkbox', 'radio-group', 'checkbox-group', 'cascader', 'tree-select']

    test.each(
      Object.keys(BUILTIN_ECHO_PROPS_SCHEMA).flatMap(cardId =>
        (BUILTIN_ECHO_PROPS_SCHEMA[cardId] || []).map(item => [cardId, item])
      )
    )('[%s/%s] select/radio/checkbox 类控件应当含 options', (cardId, item) => {
      if (optionsTypes.includes(item.type)) {
        expect(Array.isArray(item.options)).toBe(true)
      }
    })
  })
})