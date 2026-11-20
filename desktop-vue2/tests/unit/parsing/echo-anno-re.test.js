// ============================================================================
// tests/unit/parsing/echo-anno-re.test.js
// 锁定 Muya parser 的 inlineRules.echo_anno 工厂契约（v2026-07-31 起）：
//
//   - createEchoAnnoRule({ requireParens }) 是 libs-muya-vue2/lib/parser/rules.js 的导出。
//   - 它也是 libs-muya-vue2/lib 通过 re-export 暴露给主项目（Muya.vue）使用的入口。
//   - 锁定：
//       * requireParens=true（默认） → () 必填，捕获组 [name, propsRaw, promptRaw]
//       * requireParens=false         → () 可选，捕获组顺序必须保持同构
//       * 两种形态都必须满足：
//         · /^@/ 起、$/ 终，line-anchored
//         · name 段字符类不变：`[^\s{}()@]+`
//         · prompt 段字符类不变：`[^)]*`
//
//   这里的契约必须跟 muya 源码同步，任何字符类 / 锚点 / 分组顺序的变化都会
//   破坏下游 parser/index.js 的 to[1]/to[2]/to[3] 取值（同时波及
//   contentState/backspaceCtrl + deleteCtrl + inputCtrl + formatCtrl + ...）。
//
//   测试路径策略：
//     - muya 源码（lib/parser/rules.js、lib/parser/index.js）是 ES modules，
//       Jest 走 babel-jest（preset-env targets.node current）会转成 CJS，
//       所以这里直接 require()/同步拿 exports 即可，避免 dynamic import 跨平台麻烦。
// ============================================================================
const muyaRules = require('libs-muya-vue2/lib/parser/rules.js')
const muyaParser = require('libs-muya-vue2/lib/parser/index.js')

const createEchoAnnoRule = muyaRules.createEchoAnnoRule
const inlineRules = muyaParser.inlineRules
const setEchoAnnoRule = muyaParser.setEchoAnnoRule

const sample = (re, str) => {
  const m = re.exec(str)
  return m
}

describe('parsing/echo-anno-re — requireParens=true（默认）', () => {
  test('() 必填形态产出 RegExp', () => {
    const re = createEchoAnnoRule({ requireParens: true })
    expect(re).toBeInstanceOf(RegExp)
  })

  test('默认参数等价于 requireParens=true', () => {
    const explicit = createEchoAnnoRule({ requireParens: true })
    const implicit = createEchoAnnoRule({})
    const empty = createEchoAnnoRule()
    expect(String(explicit)).toBe(String(implicit))
    expect(String(explicit)).toBe(String(empty))
  })

  test('捕获组顺序与原 echo_anno 一致：[name, propsRaw, promptRaw]', () => {
    const re = createEchoAnnoRule({ requireParens: true })
    const m = sample(re, '@wizard{color:"red"}(say hi)')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBe('color:"red"')
    expect(m[3]).toBe('say hi')
  })

  test('() 必填：@name(prompt) 命中，prompt 非空', () => {
    const re = createEchoAnnoRule({ requireParens: true })
    const m = sample(re, '@wizard(buy a wand)')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBeUndefined()
    expect(m[3]).toBe('buy a wand')
  })

  test('() 必填：@name{}()（空 props + 空 prompt）命中', () => {
    const re = createEchoAnnoRule({ requireParens: true })
    const m = sample(re, '@wizard{}()')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBe('')
    expect(m[3]).toBe('')
  })

  test('() 必填：@name{}（无 ()）不命中', () => {
    const re = createEchoAnnoRule({ requireParens: true })
    expect(sample(re, '@wizard{}')).toBeNull()
    expect(sample(re, '@wizard')).toBeNull()
  })

  test('() 必填：@name(props) 没 {} 也没 () → 不命中', () => {
    const re = createEchoAnnoRule({ requireParens: true })
    expect(sample(re, '@wizard')).toBeNull()
    expect(sample(re, '@wizard something')).toBeNull()
  })

  test('与历史 ABI 一致：inlineRules.echo_anno 默认就是 requireParens=true', () => {
    // src/components/echo/echoBuiltinsShared.js 的 CURRENT_ECHO_PLACEHOLDER_RE 与
    // inlineRules.echo_anno 形态完全同源。
    const reInline = inlineRules.echo_anno
    const reTrue = createEchoAnnoRule({ requireParens: true })
    expect(String(reInline)).toBe(String(reTrue))
  })

  test('line-anchored：^…$，所以 @name(foo)bar 不命中', () => {
    const re = createEchoAnnoRule({ requireParens: true })
    expect(sample(re, '@wizard(foo)bar')).toBeNull()
  })
})

describe('parsing/echo-anno-re — requireParens=false', () => {
  test('() 可选形态产出 RegExp', () => {
    const re = createEchoAnnoRule({ requireParens: false })
    expect(re).toBeInstanceOf(RegExp)
  })

  test('捕获组顺序同 requireParens=true：[name, propsRaw, promptRaw]', () => {
    const re = createEchoAnnoRule({ requireParens: false })
    const m = sample(re, '@wizard{color:"red"}(say hi)')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBe('color:"red"')
    expect(m[3]).toBe('say hi')
  })

  test('() 可选：@name 纯名命中（to[3]=undefined）', () => {
    const re = createEchoAnnoRule({ requireParens: false })
    const m = sample(re, '@wizard')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBeUndefined()
    expect(m[3]).toBeUndefined()
  })

  test('() 可选：@name{} 命中（to[2]= 空）', () => {
    const re = createEchoAnnoRule({ requireParens: false })
    const m = sample(re, '@wizard{}')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBe('')
    expect(m[3]).toBeUndefined()
  })

  test('() 可选：@name(prompt) 命中', () => {
    const re = createEchoAnnoRule({ requireParens: false })
    const m = sample(re, '@wizard(buy a wand)')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBeUndefined()
    expect(m[3]).toBe('buy a wand')
  })

  test('() 可选：@name{...} 不带 () 命中', () => {
    const re = createEchoAnnoRule({ requireParens: false })
    const m = sample(re, '@wizard{kind:1}')
    expect(m).not.toBeNull()
    expect(m[1]).toBe('wizard')
    expect(m[2]).toBe('kind:1')
  })

  test('两组形态 RE 字符串不同（证明分流生效）', () => {
    const reTrue = createEchoAnnoRule({ requireParens: true })
    const reFalse = createEchoAnnoRule({ requireParens: false })
    expect(String(reTrue)).not.toBe(String(reFalse))
  })

  test('两形态的 name 段字符类一致：[^\s{}()@]+', () => {
    // 把字符类 chunk 抠出来比对，锁定下游 tokenizer 仍认得同样的 name 字符
    const reTrue = createEchoAnnoRule({ requireParens: true })
    const reFalse = createEchoAnnoRule({ requireParens: false })
    const chunk = /\(\[\^\\s\{\}\(\)\@\]\+\)/
    expect(String(reTrue)).toMatch(chunk)
    expect(String(reFalse)).toMatch(chunk)
  })

  test('line-anchored：^…$ 在两个形态下都生效', () => {
    const reTrue = createEchoAnnoRule({ requireParens: true })
    const reFalse = createEchoAnnoRule({ requireParens: false })
    expect(String(reTrue).startsWith('/^')).toBe(true)
    expect(String(reTrue).endsWith('$/')).toBe(true)
    expect(String(reFalse).startsWith('/^')).toBe(true)
    expect(String(reFalse).endsWith('$/')).toBe(true)
  })
})

describe('parsing/echo-anno-re — setEchoAnnoRule mutate', () => {
  test('setEchoAnnoRule({requireParens:false}) 让 inlineRules.echo_anno 切换为可选版', () => {
    // 拿一个干净 baseline（restoreSnapshot 是为了不污染其它 test）
    const baseline = String(inlineRules.echo_anno)
    try {
      setEchoAnnoRule({ requireParens: false })
      const after = String(inlineRules.echo_anno)
      const expected = String(createEchoAnnoRule({ requireParens: false }))
      expect(after).toBe(expected)
      // 可选版下纯 @name 能命中
      const m = sample(inlineRules.echo_anno, '@wizard')
      expect(m).not.toBeNull()
    } finally {
      // 恢复（其他 test 不应该看到被 mutate 过的全局状态）
      setEchoAnnoRule({ requireParens: true })
      expect(String(inlineRules.echo_anno)).toBe(baseline)
    }
  })

  test('setEchoAnnoRule({requireParens:true}) 切回 () 必填后，纯 @name 不再命中', () => {
    const baseline = String(inlineRules.echo_anno)
    try {
      setEchoAnnoRule({ requireParens: true })
      expect(sample(inlineRules.echo_anno, '@wizard')).toBeNull()
      expect(sample(inlineRules.echo_anno, '@wizard(prompt)')).not.toBeNull()
    } finally {
      setEchoAnnoRule({ requireParens: true })
      expect(String(inlineRules.echo_anno)).toBe(baseline)
    }
  })
})
