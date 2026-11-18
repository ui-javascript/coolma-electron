// ============================================================================
// tests/unit/parsing/parsing-rules.test.js
// 锁定 Settings 弹框「语法解析」两个开关的纯函数契约（v2026-07-31 起）：
//
//   - hasEchoParens(annoSource, echoName)
//       * @<name>(...) 必须命中至少一处才算合规
//       * @<name>{...}(...)（含 props）也算合规
//       * 空 annoSource / 空 name → false（防御性）
//       * name 含 regex 元字符（`.` `(` `)` `+` `[` `]` 等）必须被转义，不能炸
//
//   - hasRuneTemplateDiv(source)
//       * <template>...</template> 块内至少出现一个 <div（后跟空白/'>'/'/'）
//       * 没有 <template> 块 → false
//       * 注释里的 <div> 不算（避免 <!-- <div> --> 假阳性）
//       * 字符串字面量里的 <div> 不算（避免 <img alt="<div>" /> 假阳性）
//       * <TEMPLATE ...>...</template> 大小写不敏感
//       * 多 div / div 嵌套 / 带属性 / 自闭合 div 都算
//       * <divider> 这种前缀相似的标签不算
// ============================================================================
const { hasEchoParens, hasRuneTemplateDiv } = require('../../../src/utils/parsing/parsingRules.js')

describe('parsing/parsing-rules — hasEchoParens', () => {
  test('命中 @<name>(...) 单行 prompt', () => {
    expect(hasEchoParens('// demo\n@wizard()', 'wizard')).toBe(true)
  })

  test('命中 @<name>(multi word prompt)', () => {
    expect(hasEchoParens('demo: @wizard(buy a wand)', 'wizard')).toBe(true)
  })

  test('命中 @<name>{props}(prompt)', () => {
    expect(hasEchoParens('@wizard{color:"red"}(say hi)', 'wizard')).toBe(true)
  })

  test('命中 @<name>{}() 空 props + 空 prompt', () => {
    expect(hasEchoParens('@wizard{}()', 'wizard')).toBe(true)
  })

  test('只有 {} 没有 () → false', () => {
    expect(hasEchoParens('@wizard{}', 'wizard')).toBe(false)
  })

  test('完全没有 @<name> → false', () => {
    expect(hasEchoParens('nothing here', 'wizard')).toBe(false)
  })

  test('name 含 regex 元字符 . 必须转义', () => {
    // 如果不转义，".wi" 会误匹配 "@wizard..."
    expect(hasEchoParens('@.wi()', '.wi')).toBe(true)
    expect(hasEchoParens('@wizard()', '.wi')).toBe(false)
  })

  test('name 含 () 也必须转义', () => {
    expect(hasEchoParens('@x(y)()', 'x(y)')).toBe(true)
  })

  test('name 含 [ ] 必须转义', () => {
    expect(hasEchoParens('@a[1]()', 'a[1]')).toBe(true)
  })

  test('空 annoSource / 空 name → false', () => {
    expect(hasEchoParens('', 'wizard')).toBe(false)
    expect(hasEchoParens(null, 'wizard')).toBe(false)
    expect(hasEchoParens('@wizard()', '')).toBe(false)
    expect(hasEchoParens('@wizard()', null)).toBe(false)
  })

  test('大小写敏感（name 不区分大小写，但要求严格匹配 name 字符串）', () => {
    // 解析正则的 name 段是 ([^\s{}()@]+)，原样匹配。这里锁「同名」行为
    expect(hasEchoParens('@Wizard()', 'wizard')).toBe(false)
    expect(hasEchoParens('@Wizard()', 'Wizard')).toBe(true)
  })

  test('命名空间场景：不同 name 互不串扰', () => {
    const src = '@wizard() and @knight(say)'
    expect(hasEchoParens(src, 'wizard')).toBe(true)
    expect(hasEchoParens(src, 'knight')).toBe(true)
    expect(hasEchoParens(src, 'rogue')).toBe(false)
  })
})

describe('parsing/parsing-rules — hasRuneTemplateDiv', () => {
  const tpl = (body) => `<template>\n${body}\n</template>`

  test('template 内一个裸 div', () => {
    expect(hasRuneTemplateDiv(tpl('<div>hi</div>'))).toBe(true)
  })

  test('template 内 div 带属性', () => {
    expect(hasRuneTemplateDiv(tpl('<div class="x" data-a="1">x</div>'))).toBe(true)
  })

  test('template 内 div 自闭合', () => {
    expect(hasRuneTemplateDiv(tpl('<div/>'))).toBe(true)
  })

  test('template 内嵌套 div 也算', () => {
    expect(hasRuneTemplateDiv(tpl('<section><div class="inner">x</div></section>'))).toBe(true)
  })

  test('template 内只有 span → false', () => {
    expect(hasRuneTemplateDiv(tpl('<span>x</span>'))).toBe(false)
  })

  test('完全没有 <template> → false', () => {
    expect(hasRuneTemplateDiv('<div>orphan</div>')).toBe(false)
  })

  test('只有 <template/> 自闭合 → false', () => {
    expect(hasRuneTemplateDiv('<template/>')).toBe(false)
  })

  test('空 source → false', () => {
    expect(hasRuneTemplateDiv('')).toBe(false)
    expect(hasRuneTemplateDiv(null)).toBe(false)
  })

  test('<TEMPLATE> 大小写不敏感', () => {
    expect(hasRuneTemplateDiv('<TEMPLATE><div/></TEMPLATE>')).toBe(true)
    expect(hasRuneTemplateDiv('<Template><div/></Template>')).toBe(true)
  })

  test('注释里的 <div> 不算', () => {
    expect(hasRuneTemplateDiv(tpl('<!-- <div>fake</div> -->'))).toBe(false)
    expect(hasRuneTemplateDiv(tpl('<div>real</div><!-- <div>fake</div> -->'))).toBe(true)
  })

  test('字符串字面量里的 <div> 不算', () => {
    expect(hasRuneTemplateDiv(tpl('<img alt="<div/>"/>'))).toBe(false)
    expect(hasRuneTemplateDiv(tpl("<img alt='<div>'/>"))).toBe(false)
    expect(hasRuneTemplateDiv(tpl('<img alt="<div/>"/><div>real</div>'))).toBe(true)
  })

  test('<divider> 前缀相似的标签不算', () => {
    // 防止 <div 后紧跟 i 这种伪 div 命中
    expect(hasRuneTemplateDiv(tpl('<divider>x</divider>'))).toBe(false)
    expect(hasRuneTemplateDiv(tpl('<div>ok</div>'))).toBe(true)
  })

  test('多 template 块：任一块有 div 即合规', () => {
    const src = `<template><span>a</span></template>
<template><div>b</div></template>`
    expect(hasRuneTemplateDiv(src)).toBe(true)
  })

  test('多 template 块且都没有 div → false', () => {
    const src = `<template><span>a</span></template>
<template><p>b</p></template>`
    expect(hasRuneTemplateDiv(src)).toBe(false)
  })
})