// ============================================================================
// tests/unit/echo/inherit-from-previous.test.js
// 从 scripts/verify-inherit-from-previous.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约（echoCore 聚合入口）：
//   1) isInheritFromPreviousEnabled 各种 truthy 形式判断
//   2) echoInheritFromPrevious 多挂载位置（顶层 + echo.props）
//   3) extractPrevEchoTokenValue 提取上一 echo token 的 value
//   4) encode/decode payload round-trip（新结构 prompt + props）
//   5) createEchoPlaceholderPayload 注入 definitionId / title / inheritFromPrevious 标记
// ============================================================================
const echoCore = require('../../../src/components/echo/echoCore.js')

const {
  isInheritFromPreviousEnabled,
  echoInheritFromPrevious,
  extractPrevEchoTokenValue,
  encodeEchoPayload,
  decodeEchoPayload,
  createEchoPlaceholderPayload
} = echoCore

describe('echo/「上一节点 value 继承」helper', () => {
  describe('isInheritFromPreviousEnabled 各种 truthy 形式', () => {
    test('默认 false（空对象）', () => {
      expect(isInheritFromPreviousEnabled({})).toBe(false)
    })
    test('{value: "abc"} === false', () => {
      expect(isInheritFromPreviousEnabled({ value: 'abc' })).toBe(false)
    })
    test('{inheritFromPrevious: true}', () => {
      expect(isInheritFromPreviousEnabled({ inheritFromPrevious: true })).toBe(true)
    })
    test('{inheritFromPrevious: "true"} 字符串', () => {
      expect(isInheritFromPreviousEnabled({ inheritFromPrevious: 'true' })).toBe(true)
    })
    test('{inheritFromPrevious: "yes"} 字符串', () => {
      expect(isInheritFromPreviousEnabled({ inheritFromPrevious: 'yes' })).toBe(true)
    })
    test('{inheritFromPrevious: "false"} 字符串 false', () => {
      expect(isInheritFromPreviousEnabled({ inheritFromPrevious: 'false' })).toBe(false)
    })
    test('{inherit_from_previous: true} 蛇形命名', () => {
      expect(isInheritFromPreviousEnabled({ inherit_from_previous: true })).toBe(true)
    })
  })

  describe('echoInheritFromPrevious 多挂载位置', () => {
    test('顶层字段', () => {
      expect(echoInheritFromPrevious({ inheritFromPrevious: true })).toBe(true)
    })
    test('echo.props 字段', () => {
      expect(echoInheritFromPrevious({ props: { inheritFromPrevious: true } })).toBe(true)
    })
    test('顶层 + props 双 false', () => {
      expect(echoInheritFromPrevious({ props: {} })).toBe(false)
    })
  })

  describe('extractPrevEchoTokenValue 提取上一节点 value', () => {
    const md = [
      '前面一段普通 markdown。',
      '',
      '@笔记摘录{value: "今天读了浪潮之巅", definitionId: "d1", id: "a"}(这是 prompt A)',
      '',
      '@笔记摘录{id: "b"}(这是 prompt B)',
      '',
      '末尾段。'
    ].join('\n')

    const target = '@笔记摘录{id: "b"}'
    const targetIdx = md.indexOf(target)

    test('prev 提取任意 echo token (id=b 之前)', () => {
      const prev = extractPrevEchoTokenValue(md, targetIdx)
      expect(prev).toBe('今天读了浪潮之巅')
    })

    test('prev 按 echoName 过滤', () => {
      const prev = extractPrevEchoTokenValue(md, targetIdx, { echoName: '笔记摘录' })
      expect(prev).toBe('今天读了浪潮之巅')
    })

    test('prev echoName 不匹配返回空', () => {
      const prev = extractPrevEchoTokenValue(md, targetIdx, { echoName: '不存在的' })
      expect(prev).toBe('')
    })
  })

  describe('encode/decode payload round-trip', () => {
    test('round-trip: prompt + props 一致', () => {
      const enc = encodeEchoPayload({ prompt: 'prompt X', props: { value: 'v1', n: 2 } })
      const dec = decodeEchoPayload(enc)
      expect(dec.prompt).toBe('prompt X')
      expect(dec.props).toBeDefined()
      expect(dec.props.value).toBe('v1')
    })
  })

  describe('createEchoPlaceholderPayload 含基础设施字段', () => {
    test('inherit=true + prevValue 注入 props.value/prompt', () => {
      const echo = { id: 'd1', name: '笔记摘录', inheritFromPrevious: true }
      const ph = createEchoPlaceholderPayload(echo, { inheritFromPrevious: true, inheritedValue: '继承段落前文' })
      const decoded = decodeEchoPayload(ph)
      expect(decoded.prompt).toBe('继承段落前文')
      expect(decoded.props.value).toBe('继承段落前文')
      expect(decoded.props.inheritFromPrevious).toBe(true)
    })

    test('output 携带 definitionId', () => {
      const echo = { id: 'd1', name: '笔记摘录', inheritFromPrevious: true }
      const ph = createEchoPlaceholderPayload(echo, { inheritFromPrevious: true, inheritedValue: 'x' })
      const decoded = decodeEchoPayload(ph)
      expect(decoded.props.definitionId).toBe('d1')
    })

    test('echo 名片层未声明时默认不开启', () => {
      const plain = { id: 'd2', name: 'nice' }
      const ph2 = createEchoPlaceholderPayload(plain)
      const decoded2 = decodeEchoPayload(ph2)
      expect(decoded2.props.inheritFromPrevious).toBe(false)
      expect(decoded2.props.value).toBe('')
    })
  })
})