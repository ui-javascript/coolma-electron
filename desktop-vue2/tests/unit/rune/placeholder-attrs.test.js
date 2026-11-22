// ============================================================================
// tests/unit/rune/placeholder-attrs.test.js
//
// 锁定「符文占位符属性读写」的契约（v2026-11-22）：
//   1) 回写 value 时**只** patch data-rune-value 与 innerText，其它属性一律保留
//      （历史 bug：整段重建 div 会把用户手写的 data-rune-prop-* / 自然属性抹掉）
//   2) 回写尺寸不影响任何用户属性
//   3) 回写 props 时：布尔写 '1'/'0'，对象写 JSON，null 删除属性
//   4) 多个占位符只命中目标 nodeId，其余原样不动
//   5) 值写回时必须转义（& " < > 与 innerText 都要转义），避免破坏 HTML
// ============================================================================

const {
  rewriteRunePlaceholderByNodeId,
  rewriteRunePlaceholderSizeByNodeId,
  rewriteRunePlaceholderPropsByNodeId,
  readRunePlaceholderByNodeId,
  setRuneAttr,
  removeRuneAttr,
  parseRuneAttrs,
  readRuneDataAttr
} = require('src/components/muya/runePlaceholderAttrs')

const HOST_A = '<div data-rune-name="进度条" data-rune-id="progress" data-rune-node-id="n1" data-rune-value="12" data-rune-width="320" data-rune-prop-max-height="200" max-height="180" class="x">12</div>'
const HOST_B = '<div data-rune-name="待办" data-rune-id="todo" data-rune-node-id="n2" data-rune-value="a">a</div>'

describe('readRunePlaceholderByNodeId', () => {
  test('读出单个占位符的属性文本与内容文本', () => {
    const hit = readRunePlaceholderByNodeId(HOST_A, 'n1')
    expect(hit.matched).toBe(true)
    expect(hit.attrs['data-rune-id']).toBe('progress')
    expect(hit.attrs['data-rune-prop-max-height']).toBe('200')
    expect(hit.innerText).toBe('12')
  })

  test('nodeId 不存在时返回空结果（不抛错）', () => {
    const hit = readRunePlaceholderByNodeId(HOST_A, 'n404')
    expect(hit.matched).toBe(false)
    expect(hit.attrs).toEqual({})
  })
})

describe('rewriteRunePlaceholderByNodeId', () => {
  test('只改 value 与 innerText，用户属性全部保留', () => {
    const out = rewriteRunePlaceholderByNodeId(HOST_A, 'n1', '48')
    expect(out).not.toBe(HOST_A)
    expect(out).toContain('data-rune-value="48"')
    expect(out).toContain('data-rune-prop-max-height="200"')
    expect(out).toContain('max-height="180"')
    expect(out).toContain('data-rune-width="320"')
    expect(out).toContain('class="x"')
    expect(out).toContain('>48</div>')
  })

  test('不影响其它占位符', () => {
    const out = rewriteRunePlaceholderByNodeId(`${HOST_A}\n${HOST_B}`, 'n1', '48')
    expect(out).toContain('data-rune-id="todo"')
    expect(out).toContain('data-rune-value="a">a</div>')
  })

  test('回写内容做 HTML 转义', () => {
    const out = rewriteRunePlaceholderByNodeId(HOST_A, 'n1', '<b>&"')
    expect(out).toContain('data-rune-value="&lt;b&gt;&amp;&quot;"')
    expect(out).toContain('>&lt;b&gt;&amp;"</div>')
  })

  test('目标不存在时原样返回', () => {
    expect(rewriteRunePlaceholderByNodeId(HOST_A, 'n404', 'x')).toBe(HOST_A)
  })
})

describe('rewriteRunePlaceholderSizeByNodeId', () => {
  test('只改尺寸，props 与自然属性保留', () => {
    const out = rewriteRunePlaceholderSizeByNodeId(HOST_A, 'n1', { width: 480, height: 260 })
    expect(out).toContain('data-rune-width="480"')
    expect(out).toContain('data-rune-height="260"')
    expect(out).toContain('data-rune-prop-max-height="200"')
    expect(out).toContain('max-height="180"')
  })
})

describe('rewriteRunePlaceholderPropsByNodeId', () => {
  test('写字符串 / 布尔 / 对象 / null 删除', () => {
    const out = rewriteRunePlaceholderPropsByNodeId(HOST_B, 'n2', {
      title: '今日',
      readonly: true,
      disabled: false,
      config: { a: 1 },
      legacy: null
    })
    expect(out).toContain('data-rune-prop-title="今日"')
    expect(out).toContain('data-rune-prop-readonly="1"')
    expect(out).toContain('data-rune-prop-disabled="0"')
    expect(out).toContain('data-rune-prop-config="{&quot;a&quot;:1}"')
  })

  test('空 props 不改动占位符', () => {
    expect(rewriteRunePlaceholderPropsByNodeId(HOST_B, 'n2', {})).toBe(HOST_B)
  })
})

describe('属性原子操作', () => {
  test('setRuneAttr 覆盖同名属性，removeRuneAttr 删除', () => {
    const attrs = ' data-rune-id="a" data-rune-value="1"'
    const next = setRuneAttr(attrs, 'data-rune-value', '2')
    expect(next).toContain('data-rune-value="2"')
    expect(next).not.toContain('data-rune-value="1"')
    expect(removeRuneAttr(next, 'data-rune-value')).toBe(' data-rune-id="a"')
  })

  test('readRuneDataAttr 属性名大小写不敏感', () => {
    expect(readRuneDataAttr(' DATA-RUNE-VALUE="9" ', 'data-rune-value')).toBe('9')
    expect(readRuneDataAttr(' data-rune-value="9"', 'data-rune-value')).toBe('9')
    expect(readRuneDataAttr(' data-rune-id="x"', 'data-rune-value')).toBe('')
  })

  test('parseRuneAttrs 解析带引号/空值/布尔属性', () => {
    const attrs = parseRuneAttrs(' a="1" b=\'2\' c d="x&gt;y"')
    expect(attrs.a).toBe('1')
    expect(attrs.b).toBe('2')
    expect(attrs.c).toBe('')
    expect(attrs.d).toBe('x&gt;y')
  })
})
