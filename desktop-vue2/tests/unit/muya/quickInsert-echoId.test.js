// ============================================================================
// tests/unit/muya/quickInsert-echoId.test.js
//
// 锁定快捷面板插入回响时自动生成 echoId 的契约（v2026-07-30 起）：
//   1) createEchoPlaceholderMarkup 输出 `@echoName{echoId: 'uuid', value: 'xxx'}()` 形态
//   2) echoId 是 uuidv4 格式
//   3) 每次调用生成新的 echoId（不同实例不共享）
//
// 对应真源：libs-muya/lib/ui/quickInsert/index.js 行 209 的 createEchoPlaceholderMarkup
//
// 历史背景：
//   quickInsert 路径下原 createEchoPlaceholderMarkup 只写 `@echoName{value: 'xxx'}()`，
//   没有 echoId 字段。runtime 解析时 token.echoId 是 undefined，data-echo-id 兜底成
//   echoName，handler 端 props.echoId === undefined。
//   v2026-07-30 起 echoId 与 rune 端 data-rune-id 角色对齐。
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const fs = require('fs')
const quickInsertSource = fs.readFileSync(
  require.resolve('libs-muya/lib/ui/quickInsert/index.js'),
  'utf8'
)

describe('quickInsert 路径 createEchoPlaceholderMarkup（v2026-07-30 起 echoId 自动生成）', () => {
  // 抽出 createEchoPlaceholderMarkup 函数体并 eval
  // 模块顶部（按行）：
  //   const escapeEchoAttrValue = (value = '') => String(value)
  //     .replace(...)
  //     ...
  //
  //   const createEchoPlaceholderMarkup = (item = {}, prompt = '') => { ... }
  let createEchoPlaceholderMarkup
  beforeAll(() => {
    // 截到 `class QuickInsert extends BaseScrollFloat` 之前
    const endIdx = quickInsertSource.indexOf('class QuickInsert extends BaseScrollFloat')
    if (endIdx === -1) {
      throw new Error('failed to locate class QuickInsert boundary')
    }
    const headSrc = quickInsertSource.slice(0, endIdx)
    // 找 escapeEchoAttrValue 起点
    const escapeStart = headSrc.indexOf('const escapeEchoAttrValue')
    if (escapeStart === -1) {
      throw new Error('failed to locate escapeEchoAttrValue')
    }
    const { v4: uuidv4 } = require('uuid')
    const fnSrc = `
      ${headSrc.slice(escapeStart)}
      return createEchoPlaceholderMarkup;
    `
    // eslint-disable-next-line no-new-func
    // 把 uuidv4 作为参数注入，避免 toString() 漏掉闭包依赖（_native 等）。
    createEchoPlaceholderMarkup = new Function('uuidv4', fnSrc)(uuidv4)
  })

  test('生成的 markdown 文本包含 echoId 字段（uuid 形态）', () => {
    const echoItem = {
      title: () => '折叠',
      meta: { type: 'echo', echoName: '折叠', color: '#5C6BC0' }
    }
    const result = createEchoPlaceholderMarkup(echoItem, '')
    // 形态：@折叠{echoId: '<uuid>', value: ''}()
    expect(result).toMatch(/^@折叠\{echoId: '([^']+)', value: ''\}\(\)$/)
    const m = result.match(/echoId: '([^']+)'/)
    expect(m).not.toBeNull()
    expect(m[1]).toMatch(UUID_REGEX)
  })

  test('两次调用生成不同的 echoId（每次插入独立实例）', () => {
    const echoItem = {
      title: () => '生生不息',
      meta: { type: 'echo', echoName: '生生不息', color: '#26A69A' }
    }
    const r1 = createEchoPlaceholderMarkup(echoItem, '')
    const r2 = createEchoPlaceholderMarkup(echoItem, '')
    const m1 = r1.match(/echoId: '([^']+)'/)
    const m2 = r2.match(/echoId: '([^']+)'/)
    expect(m1[1]).not.toBe(m2[1])
  })

  test('echoName 字段从 item.meta.echoName 提取', () => {
    const echoItem = {
      title: () => 'fallback title',
      meta: { type: 'echo', echoName: '从 meta 取', color: '#26A69A' }
    }
    const result = createEchoPlaceholderMarkup(echoItem, '')
    expect(result).toMatch(/^@从 meta 取\{/)
  })

  test('echoName 缺 meta 时回退到 item.title()', () => {
    const echoItem = {
      title: () => '从 title 取',
      meta: { type: 'echo', color: '#26A69A' }
    }
    const result = createEchoPlaceholderMarkup(echoItem, '')
    expect(result).toMatch(/^@从 title 取\{/)
  })

  test('value 字段被 escapeEchoAttrValue 正确转义', () => {
    const echoItem = {
      title: () => 'test',
      meta: { type: 'echo', echoName: 'test' }
    }
    const result = createEchoPlaceholderMarkup(echoItem, "it's a 'test'")
    // 单引号被 escape
    expect(result).toContain(`value: 'it\\'s a \\'test\\''`)
  })
})