// ============================================================================
// tests/unit/echo/batch-import-dialog.test.js
//
// 锁定 EchoBatchImportDialog 的解析契约（v2026-08-01）：
//   1) JSON 顶层必须为 { format: 'memocast.echo-pack', version: 1, exportedAt, echoes }
//      裸数组或 Rune Pack 格式都会立即拒绝。
//   2) builtinNames 命中的条目 → builtinBlocked 列表（不显示在「未重名 / 重名」两栏里）。
//   3) 文件内同名重复 → 单独标记为 fileDuplicates（取每组首条进入预览）。
//   4) commit 走 createNames / replaceNames 两条路径，previewAt 留痕。
//
// 这里只测纯逻辑（替代 .vue 内的关键方法），不挂载 .vue 组件。
// ============================================================================

const path = require('path')

// 加载 EchoImportService。注意：service 内部 import 了 BUILTIN_ECHO_CARDS / DatabaseClient，
// 我们在测试里用 jest.mock 把它们隔离掉，专注于 JSON 解析 / 字段归一化 / 分组契约。
jest.mock('src/utils/DatabaseClient', () => ({
  __esModule: true,
  default: {
    echoes: {
      previewImport: jest.fn(),
      importMany: jest.fn()
    }
  }
}))

// service 真正 import 的是 src/components/echo/echoCore（barrel），会顺带拉起 16 张内置 echo 工厂。
// 这里仅 mock 掉 barrel 层（保证 BUILTIN_ECHO_CARDS 是轻量 fixture，不会触发 jQuery 化模板拼装）
jest.mock('src/components/echo/echoCore', () => ({
  __esModule: true,
  BUILTIN_ECHO_CARDS: [
    { id: '__builtin_resona__', name: '内置回响示例', desc: '内置', category: 'builtin' }
  ]
}))

const EchoImportService = require(path.resolve(__dirname, '../../../src/services/EchoImportService.js'))

const { parseEchoPack, buildEchoPack, __testOnly__ } = EchoImportService

const { normalizeEchoEntry, computeFileDuplicates, computeNameKey } = __testOnly__

// 静默 console 噪音
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

// ============================================================================
// JSON Pack 顶级解析契约
// ============================================================================
describe('EchoImportService.parseEchoPack — 顶层 schema', () => {
  test('合法 Echo Pack v1 → 通过', () => {
    const text = JSON.stringify({
      format: 'memocast.echo-pack',
      version: 1,
      exportedAt: '2026-08-01T00:00:00.000Z',
      echoes: [
        { name: 'A', desc: 'd', category: 'marker', anno_source: 'export default {}' }
      ]
    })
    const result = parseEchoPack(text)
    expect(result.success).toBe(true)
    expect(result.format).toBe('memocast.echo-pack')
    expect(result.version).toBe(1)
    expect(result.entries.length).toBe(1)
    expect(result.invalidItems.length).toBe(0)
  })

  test('裸数组 → 拒绝（Rune Pack 格式不兼容）', () => {
    const result = parseEchoPack('[]')
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT')
    expect(result.message).toMatch(/格式不匹配/)
    expect(result.message).not.toMatch(/请使用/)
  })

  test('Rune 风格的非空裸数组 → 同样拒绝（RUNE_PACK_FORMAT）', () => {
    const result = parseEchoPack(JSON.stringify([
      { name: '符文A', template: '<div>a</div>' }
    ]))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT')
  })

  test('顶层裸数组 + 元素有 template 无 anno_source → 明确归类为 Rune 误传', () => {
    const result = parseEchoPack(JSON.stringify([
      { name: '符文A', template: '<div>a</div>', category: 'general' },
      { name: '符文B', template: '<div>b</div>', category: 'gaming' }
    ]))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_FORMAT')
    expect(result.message).toMatch(/符文/)
  })

  test('非空非数组对象（无 format 头）→ 拒绝（ECHO_PACK_FORMAT_MISMATCH）', () => {
    const result = parseEchoPack(JSON.stringify({ foo: 'bar' }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('ECHO_PACK_FORMAT_MISMATCH')
  })

  test('format = memocast.rune-pack → 拒绝（RUNE_PACK_OBJECT）', () => {
    const result = parseEchoPack(JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1,
      runes: [{ name: '符文A', template: '<div>x</div>' }]
    }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('RUNE_PACK_OBJECT')
    expect(result.message).toMatch(/符文/)
  })

  test('format 不匹配（非 Rune Pack 也非 Echo Pack）→ 拒绝', () => {
    const result = parseEchoPack(JSON.stringify({ format: 'memocast.foo-pack', version: 1, echoes: [] }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('ECHO_PACK_FORMAT_MISMATCH')
  })

  test('version 不匹配 → 拒绝', () => {
    const result = parseEchoPack(JSON.stringify({ format: 'memocast.echo-pack', version: 99, echoes: [] }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('ECHO_PACK_VERSION_UNSUPPORTED')
  })

  test('echoes 字段缺失 → 拒绝', () => {
    const result = parseEchoPack(JSON.stringify({ format: 'memocast.echo-pack', version: 1 }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('ECHO_PACK_INVALID')
  })

  test('文件超大 → 拒绝', () => {
    const big = 'a'.repeat(6 * 1024 * 1024)
    const result = parseEchoPack(big)
    expect(result.success).toBe(false)
    expect(result.code).toBe('FILE_TOO_LARGE')
  })

  test('非 JSON 文本 → 拒绝', () => {
    const result = parseEchoPack('not json')
    expect(result.success).toBe(false)
    expect(result.code).toBe('JSON_PARSE_FAILED')
  })

  test('echoes 超过 500 条 → 拒绝', () => {
    const arr = []
    for (let i = 0; i < 501; i++) arr.push({ name: 'A_' + i, anno_source: 'export default {}' })
    const result = parseEchoPack(JSON.stringify({ format: 'memocast.echo-pack', version: 1, echoes: arr }))
    expect(result.success).toBe(false)
    expect(result.code).toBe('ECHO_PACK_TOO_MANY')
  })
})

// ============================================================================
// 字段归一化契约
// ============================================================================
describe('EchoImportService.parseEchoPack — 字段归一化', () => {
  function build (entry) {
    const text = JSON.stringify({
      format: 'memocast.echo-pack',
      version: 1,
      echoes: [entry]
    })
    return parseEchoPack(text)
  }

  test('name 缺失 → 标记 INVALID', () => {
    const result = build({ desc: 'd', anno_source: 'export default {}' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('EMPTY_NAME')
  })

  test('anno_source 缺失 → 标记 INVALID', () => {
    const result = build({ name: 'A', desc: 'd' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('EMPTY_ANNO_SOURCE')
  })

  test('category === builtin → 标记 BUILTIN_CATEGORY_NOT_ALLOWED', () => {
    const result = build({ name: '伪装内置', anno_source: 'export default {}', category: 'builtin' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('BUILTIN_CATEGORY_NOT_ALLOWED')
  })

  test('非法 category → 标记 INVALID_CATEGORY', () => {
    const result = build({ name: 'A', anno_source: 'export default {}', category: '__poll__' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('INVALID_CATEGORY')
  })

  test('非法 render_type → 标记 INVALID_RENDER_TYPE', () => {
    const result = build({ name: 'A', anno_source: 'export default {}', render_type: 'js-string' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('INVALID_RENDER_TYPE')
  })

  test('name 超长 → 标记 NAME_TOO_LONG', () => {
    const result = build({ name: 'A'.repeat(200), anno_source: 'export default {}' })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('NAME_TOO_LONG')
  })

  test('anno_source 超大 → 标记 ANNO_SOURCE_TOO_LARGE', () => {
    const result = build({ name: 'A', anno_source: 'a'.repeat(600 * 1024) })
    expect(result.invalidItems.length).toBe(1)
    expect(result.invalidItems[0].reason).toBe('ANNO_SOURCE_TOO_LARGE')
  })

  test('合法条目 → 字段归一化（color / icon / category fallback）', () => {
    const result = build({ name: '  A ', desc: 'd', anno_source: 'export default {}' })
    expect(result.entries.length).toBe(1)
    const item = result.entries[0].normalized
    expect(item.name).toBe('A') // trim
    expect(item.color).toBe('#26A69A')
    expect(item.icon).toBe('graphic_eq')
    expect(item.category).toBe('marker')
    expect(item.render_type).toBe('anno')
  })

  test('显式 color / icon / category 透传', () => {
    const result = build({
      name: 'A',
      anno_source: 'export default {}',
      color: '#FF00FF',
      icon: 'bolt',
      category: 'showy',
      render_type: 'anno'
    })
    const item = result.entries[0].normalized
    expect(item.color).toBe('#FF00FF')
    expect(item.icon).toBe('bolt')
    expect(item.category).toBe('showy')
  })
})

// ============================================================================
// normalizeEchoEntry 单元
// ============================================================================
describe('EchoImportService normalizeEchoEntry', () => {
  test('非对象 → NOT_OBJECT', () => {
    expect(normalizeEchoEntry(null).reason).toBe('NOT_OBJECT')
    expect(normalizeEchoEntry('s').reason).toBe('NOT_OBJECT')
    expect(normalizeEchoEntry([]).reason).toBe('NOT_OBJECT')
  })
})

// ============================================================================
// computeFileDuplicates：文件内重复只标记不静默合并
// ============================================================================
describe('EchoImportService computeFileDuplicates', () => {
  function makeEntries (names) {
    return names.map((n, i) => ({
      index: i,
      raw: { name: n, anno_source: 'export default {}' },
      normalized: { name: String(n).trim(), anno_source: 'export default {}' }
    }))
  }

  test('同一名称 3 次 → 1 项 fileDuplicates，indexes 含全部下标', () => {
    const entries = makeEntries(['A', 'A', 'A', 'B'])
    const dups = computeFileDuplicates(entries)
    expect(dups.length).toBe(1)
    expect(dups[0].name).toBe('A')
    expect(dups[0].indexes).toEqual([0, 1, 2])
  })

  test('大小写不敏感视为同一名称', () => {
    const entries = makeEntries(['Aa', 'aa', 'AA'])
    const dups = computeFileDuplicates(entries)
    expect(dups.length).toBe(1)
    expect(dups[0].indexes.length).toBe(3)
  })

  test('无重复 → 返回空数组', () => {
    const entries = makeEntries(['A', 'B', 'C'])
    const dups = computeFileDuplicates(entries)
    expect(dups.length).toBe(0)
  })
})

// ============================================================================
// buildEchoPack：导出字段极其精简（不携带 id / isBuiltin / 时间戳）
// ============================================================================
describe('EchoImportService.buildEchoPack', () => {
  test('内置 echo 自动剔除', () => {
    const json = buildEchoPack([
      { id: '__builtin_resona__', name: '内置回响示例', isBuiltin: true, category: 'builtin', anno_source: 'X' },
      { id: 'echo-user-1', name: '用户自建', category: 'marker', anno_source: 'export default {}' }
    ])
    const parsed = JSON.parse(json)
    expect(parsed.format).toBe('memocast.echo-pack')
    expect(parsed.version).toBe(1)
    expect(parsed.echoes.length).toBe(1)
    expect(parsed.echoes[0].name).toBe('用户自建')
    expect(parsed.echoes[0]).not.toHaveProperty('id')
    expect(parsed.echoes[0]).not.toHaveProperty('isBuiltin')
  })

  test('导出字段白名单：name / desc / category / color / icon / anno_source / render_type', () => {
    const json = buildEchoPack([
      {
        id: 'echo-user-1',
        name: 'A',
        desc: 'd',
        category: 'marker',
        color: '#26A69A',
        icon: 'graphic_eq',
        anno_source: 'export default {}',
        render_type: 'anno',
        isBuiltin: false,
        created_at: 123,
        updated_at: 456,
        sort_order: 99
      }
    ])
    const parsed = JSON.parse(json)
    const fields = Object.keys(parsed.echoes[0]).sort()
    expect(fields).toEqual([
      'anno_source', 'category', 'color', 'desc', 'icon', 'name', 'render_type'
    ])
  })

  test('空入参 → 仍生成合法 Pack（空 echoes）', () => {
    const json = buildEchoPack([])
    const parsed = JSON.parse(json)
    expect(parsed.format).toBe('memocast.echo-pack')
    expect(parsed.version).toBe(1)
    expect(Array.isArray(parsed.echoes)).toBe(true)
    expect(parsed.echoes.length).toBe(0)
  })

  test('导出后重新解析 → 等价（round-trip）', () => {
    const original = [
      { id: 'a', name: 'AAA', desc: 'a', category: 'marker', color: '#26A69A', icon: 'graphic_eq', anno_source: 'export default {}', render_type: 'anno' },
      { id: 'b', name: 'BBB', desc: 'b', category: 'showy', color: '#FF00FF', icon: 'bolt', anno_source: 'export default {}', render_type: 'anno' }
    ]
    const json = buildEchoPack(original)
    const parsed = parseEchoPack(json)
    expect(parsed.success).toBe(true)
    expect(parsed.entries.length).toBe(2)
    expect(parsed.entries.map(e => e.normalized.name).sort()).toEqual(['AAA', 'BBB'])
  })
})

// ============================================================================
// computeNameKey 单元
// ============================================================================
describe('EchoImportService computeNameKey', () => {
  test('trim + lowercase', () => {
    expect(computeNameKey('  Hello World  ')).toBe('hello world')
    expect(computeNameKey('')).toBe('')
    expect(computeNameKey(null)).toBe('')
  })
})

// ============================================================================
// 网关契约：parseEchoPack 顶层 invalidItems 不应阻塞合法条目
// ============================================================================
describe('EchoImportService 解析混合批', () => {
  test('非法 + 合法混合 → 合法进 entries，非法进 invalidItems', () => {
    const text = JSON.stringify({
      format: 'memocast.echo-pack',
      version: 1,
      echoes: [
        { name: 'A', anno_source: 'export default {}' },
        { name: '', anno_source: 'export default {}' },
        { name: 'B', desc: 'missing anno_source' },
        { name: 'C', anno_source: 'export default {}', category: 'builtin' },
        { name: 'D', anno_source: 'export default {}' }
      ]
    })
    const result = parseEchoPack(text)
    expect(result.entries.length).toBe(2)
    expect(result.invalidItems.length).toBe(3)
    const reasons = result.invalidItems.map(i => i.reason).sort()
    expect(reasons).toEqual(['BUILTIN_CATEGORY_NOT_ALLOWED', 'EMPTY_ANNO_SOURCE', 'EMPTY_NAME'])
  })
})

// ============================================================================
// 在线 URL 抓取契约（v2026-08-01）
// 弹框新增「在线 URL」Tab：填 GitHub URL → DatabaseClient.echoPacks.fetchRemote
//   → 返回 text → 走与 file 路径完全相同的 parseEchoPack → preview。
//
// 等价复刻 onRemoteUrlSubmit 流程：fetchRemote 调用结果 → applyParsedText → preview。
// 锁定的契约：
//   1) fetchRemote 返回 success=true 时 → text 走 parseEchoPack，分类两栏 / builtinBlocked / fileDuplicates
//      与 file 路径完全一致
//   2) fetchRemote 返回 success=false 时 → errorMessage 直接透传 message，UI 不进入预览
//   3) URL 为空字符串 → 立即提示「请输入 Echo Pack URL」，不发起 IPC
//   4) fetchRemote 抛异常 → errorMessage 形如「抓取失败: <err>」
// ============================================================================

function makeRemoteFetchOk (text) {
  return jest.fn().mockResolvedValue({ success: true, text, finalUrl: 'https://raw.githubusercontent.com/o/r/master/x.json' })
}
function makeRemoteFetchFail (code, message) {
  return jest.fn().mockResolvedValue({ success: false, code, message })
}
function makeRemoteFetchThrow (err) {
  return jest.fn().mockRejectedValue(err)
}

async function runEchoRemoteUrlSubmit ({ remoteUrl, fetchRemote, parsePack }) {
  const state = {
    fetchingRemote: false,
    errorMessage: '',
    parsedEntries: [],
    sourceTab: 'url'
  }
  state.fetchingRemote = true
  if (!remoteUrl || !remoteUrl.trim()) {
    state.fetchingRemote = false
    state.errorMessage = '请输入 Echo Pack URL'
    return state
  }
  try {
    const res = await fetchRemote({ sourceUrl: remoteUrl.trim() })
    if (!res || !res.success) {
      state.errorMessage = (res && res.message) || '抓取失败'
      return state
    }
    const parsed = parsePack(res.text || '')
    if (!parsed.success) {
      state.errorMessage = parsed.message || 'JSON 解析失败'
      return state
    }
    state.parsedEntries = parsed.entries
    return state
  } catch (e) {
    state.errorMessage = '抓取失败: ' + (e && e.message ? e.message : String(e))
    return state
  } finally {
    state.fetchingRemote = false
  }
}

describe('EchoBatchImportDialog 在线 URL 抓取契约', () => {
  test('空 URL → 立即提示「请输入 Echo Pack URL」，不调 fetch', async () => {
    const fetchRemote = jest.fn()
    const state = await runEchoRemoteUrlSubmit({ remoteUrl: '', fetchRemote, parsePack: parseEchoPack })
    expect(state.errorMessage).toBe('请输入 Echo Pack URL')
    expect(fetchRemote).not.toHaveBeenCalled()
  })

  test('空白 URL → 同样立即提示', async () => {
    const fetchRemote = jest.fn()
    const state = await runEchoRemoteUrlSubmit({ remoteUrl: '   ', fetchRemote, parsePack: parseEchoPack })
    expect(state.errorMessage).toBe('请输入 Echo Pack URL')
    expect(fetchRemote).not.toHaveBeenCalled()
  })

  test('fetchRemote 成功 + text 是合法 Echo Pack → 进入 parsedEntries，errorMessage 为空', async () => {
    const text = JSON.stringify({
      format: 'memocast.echo-pack',
      version: 1,
      echoes: [{ name: 'URL回响A', anno_source: 'export default {}', category: 'marker' }]
    })
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://raw.githubusercontent.com/o/r/master/x.json',
      fetchRemote: makeRemoteFetchOk(text),
      parsePack: parseEchoPack
    })
    expect(state.errorMessage).toBe('')
    expect(state.parsedEntries.length).toBe(1)
    expect(state.parsedEntries[0].normalized.name).toBe('URL回响A')
  })

  test('fetchRemote 成功 + text 是 Rune Pack 格式（误传）→ parsePack 报 RUNE_PACK_OBJECT', async () => {
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1,
      runes: [{ name: '符文A', template: '<div>x</div>' }]
    })
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://raw.githubusercontent.com/o/r/master/x.json',
      fetchRemote: makeRemoteFetchOk(text),
      parsePack: parseEchoPack
    })
    expect(state.errorMessage).toMatch(/符文/)
    expect(state.parsedEntries.length).toBe(0)
  })

  test('fetchRemote 成功 + text 是 Rune 风格裸数组（误传）→ parsePack 报 RUNE_PACK_FORMAT', async () => {
    const text = JSON.stringify([{ name: '符文A', template: '<div>x</div>' }])
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://raw.githubusercontent.com/o/r/master/x.json',
      fetchRemote: makeRemoteFetchOk(text),
      parsePack: parseEchoPack
    })
    expect(state.errorMessage).toMatch(/格式不匹配/)
    expect(state.parsedEntries.length).toBe(0)
  })

  test('fetchRemote 返回 INVALID_URL → errorMessage 透传 message', async () => {
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://example.com/x.json',
      fetchRemote: makeRemoteFetchFail('INVALID_URL', '只支持 github.com / raw.githubusercontent.com / gist.githubusercontent.com 形式的 URL'),
      parsePack: parseEchoPack
    })
    expect(state.errorMessage).toMatch(/github\.com/)
    expect(state.parsedEntries.length).toBe(0)
  })

  test('fetchRemote 返回 TOO_LARGE → errorMessage 透传 message', async () => {
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://raw.githubusercontent.com/o/r/master/x.json',
      fetchRemote: makeRemoteFetchFail('TOO_LARGE', 'Response too large: 6291456 bytes'),
      parsePack: parseEchoPack
    })
    expect(state.errorMessage).toMatch(/too large/i)
    expect(state.parsedEntries.length).toBe(0)
  })

  test('fetchRemote 抛异常 → errorMessage 形如「抓取失败: <err>」', async () => {
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://raw.githubusercontent.com/o/r/master/x.json',
      fetchRemote: makeRemoteFetchThrow(new Error('IPC dead')),
      parsePack: parseEchoPack
    })
    expect(state.errorMessage).toBe('抓取失败: IPC dead')
    expect(state.parsedEntries.length).toBe(0)
  })

  test('抓取完成后 fetchingRemote 必须复位为 false', async () => {
    const text = JSON.stringify({ format: 'memocast.echo-pack', version: 1, echoes: [] })
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://raw.githubusercontent.com/o/r/master/x.json',
      fetchRemote: makeRemoteFetchOk(text),
      parsePack: parseEchoPack
    })
    expect(state.fetchingRemote).toBe(false)
  })

  test('抓取失败路径也必须复位 fetchingRemote', async () => {
    const state = await runEchoRemoteUrlSubmit({
      remoteUrl: 'https://example.com/x.json',
      fetchRemote: makeRemoteFetchFail('INVALID_URL', 'x'),
      parsePack: parseEchoPack
    })
    expect(state.fetchingRemote).toBe(false)
  })
})

// ============================================================================
// hasSelectedItem 禁用契约（与 rune 弹框对齐，v2026-08-01）：
// 1) 全部 conflictItems（默认不勾选）→ 禁用，强提示文案展示
// 2) 至少有 newItem selected=true → 启用
// ============================================================================

function computeEchoHasSelectedItem (newItems, conflictItems) {
  return newItems.some(it => it.selected) || conflictItems.some(it => it.selected)
}

describe('EchoBatchImportDialog hasSelectedItem 条件契约', () => {
  test('空 → 禁用', () => {
    expect(computeEchoHasSelectedItem([], [])).toBe(false)
  })

  test('newItems 默认 selected=true → 启用', () => {
    expect(computeEchoHasSelectedItem([{ name: 'A', selected: true }], [])).toBe(true)
  })

  test('全部回响都因为重名落入 conflictItems → 禁用（用户必须手动勾选）', () => {
    const conflictItems = [
      { name: '回响1', selected: false },
      { name: '回响2', selected: false },
      { name: '回响3', selected: false }
    ]
    expect(computeEchoHasSelectedItem([], conflictItems)).toBe(false)
    conflictItems.forEach(it => { it.selected = true })
    expect(computeEchoHasSelectedItem([], conflictItems)).toBe(true)
  })

  test('部分重名（3 new + 2 conflict）→ 启用', () => {
    const newItems = [{ name: 'r1', selected: true }, { name: 'r2', selected: true }, { name: 'r3', selected: true }]
    const conflictItems = [{ name: 'c1', selected: false }, { name: 'c2', selected: false }]
    expect(computeEchoHasSelectedItem(newItems, conflictItems)).toBe(true)
  })
})

describe('EchoBatchImportDialog "全部 conflict" 强提示文案契约', () => {
  function getAllConflictBannerText (newItems, conflictItems) {
    if (!(newItems.length === 0 && conflictItems.length > 0)) return null
    return `全部 ${conflictItems.length} 项与现有回响重名，默认不勾选不会导入。如需覆盖，请点击「重名」栏的「全选」按钮。`
  }

  test('全部 conflict → 返回强提示文案', () => {
    const text = getAllConflictBannerText([], [{ name: 'c1', selected: false }, { name: 'c2', selected: false }])
    expect(text).toMatch(/全部 2 项与现有回响重名/)
    expect(text).toMatch(/如需覆盖/)
    expect(text).toMatch(/全选/)
  })

  test('newItems 不为空 → 不应出现该提示', () => {
    expect(getAllConflictBannerText([{ name: 'A', selected: true }], [{ name: 'B', selected: false }])).toBeNull()
  })

  test('conflictItems 为空 → 不应出现该提示', () => {
    expect(getAllConflictBannerText([], [])).toBeNull()
  })
})
