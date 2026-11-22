/**
 * 远程组件源注册表：拼接规则 + 同名覆盖语义。
 * 拼接规则来自对方真实部署实测（http://82.156.212.243/@melt-js/<pkg>/hel_dist/hel-meta.json）。
 */
const {
  MELT_SOURCE_TYPES,
  MELT_SOURCES_STORAGE_KEY,
  buildSourceEntryUrl,
  normalizeRuneSource,
  resolveSourceForDep,
  resolveDepFromSources,
  defaultDistDirFor,
  loadRuneSources,
  saveRuneSources
} = require('libs-muya-vue2/lib/rune/runeSourceRegistry')

const SFTP_ROOT = 'http://82.156.212.243'

describe('远程组件源拼接规则', () => {
  test('sftp：站点根 + 完整包名（含 scope）+ hel_dist', () => {
    const { url, warnings } = buildSourceEntryUrl({
      name: '@melt-js/comps-vue2-meme',
      type: MELT_SOURCE_TYPES.SFTP,
      base: `${SFTP_ROOT}/`
    })
    expect(url).toBe(`${SFTP_ROOT}/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json`)
    expect(warnings).toEqual([])
  })

  test('sftp / github 不支持版本目录：version 被忽略并给 warning', () => {
    const sftp = normalizeRuneSource({ name: '@melt-js/comps-vue2-meme', type: MELT_SOURCE_TYPES.SFTP, base: SFTP_ROOT, version: '2026.11.18' })
    expect(sftp.warnings.join()).toContain('不支持版本目录')
    expect(buildSourceEntryUrl(sftp).url).toBe(`${SFTP_ROOT}/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json`)
    const gh = normalizeRuneSource({ name: '@melt-js/comps-vue2-meme', type: MELT_SOURCE_TYPES.GITHUB, base: 'https://x.github.io/repo', version: '1.0.0' })
    expect(gh.warnings.join()).toContain('不支持版本目录')
  })

  test('github pages：组织根 + 去 scope 的包名（对齐 melt-js 真实部署）', () => {
    // 实测：https://melt-js.github.io/comps-vue2-meme/hel_dist/hel-meta.json → 200
    const { url } = buildSourceEntryUrl({ name: '@melt-js/comps-vue2-meme', type: MELT_SOURCE_TYPES.GITHUB, base: 'https://melt-js.github.io' })
    expect(url).toBe('https://melt-js.github.io/comps-vue2-meme/hel_dist/hel-meta.json')
  })

  test('github pages：base 已是仓库根时只补产物目录，不重复拼包名', () => {
    const { url } = buildSourceEntryUrl({ name: '@melt-js/comps-vue2-meme', type: MELT_SOURCE_TYPES.GITHUB, base: 'https://melt-js.github.io/comps-vue2-meme/' })
    expect(url).toBe('https://melt-js.github.io/comps-vue2-meme/hel_dist/hel-meta.json')
  })

  test('直连产物地址原样使用（含 index.html）', () => {
    const meta = `${SFTP_ROOT}/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json`
    expect(buildSourceEntryUrl({ name: 'comps-vue2-meme', type: MELT_SOURCE_TYPES.SFTP, base: meta }).url).toBe(meta)
    expect(normalizeRuneSource({ name: 'x', type: MELT_SOURCE_TYPES.SFTP, base: meta }).type).toBe(MELT_SOURCE_TYPES.DIRECT)
    expect(buildSourceEntryUrl({ name: 'x', type: MELT_SOURCE_TYPES.DIRECT, base: `${SFTP_ROOT}/p/index.html` }).url).toBe(`${SFTP_ROOT}/p/index.html`)
  })

  test('unpkg：comps/tpl/demo 走 hel_dist，其余走 dist，缺版本用 latest', () => {
    expect(defaultDistDirFor('@melt-js/comps-vue2')).toBe('hel_dist')
    expect(defaultDistDirFor('tpl-blog')).toBe('hel_dist')
    expect(defaultDistDirFor('lodash')).toBe('dist')
    expect(buildSourceEntryUrl({ name: '@melt-js/comps-vue2', type: MELT_SOURCE_TYPES.UNPKG, version: '2026.11.17' }).url)
      .toBe('https://unpkg.com/@melt-js/comps-vue2@2026.11.17/hel_dist/hel-meta.json')
    expect(buildSourceEntryUrl({ name: 'some-lib', type: MELT_SOURCE_TYPES.UNPKG }).url)
      .toBe('https://unpkg.com/some-lib@latest/dist/hel-meta.json')
  })

  test('自定义 distDir 覆盖默认目录', () => {
    expect(buildSourceEntryUrl({ name: 'comps-vue2-meme', type: 'sftp', base: SFTP_ROOT, distDir: 'dist' }).url)
      .toBe(`${SFTP_ROOT}/comps-vue2-meme/dist/hel-meta.json`)
  })
})

describe('同名组件后面的覆盖前面的', () => {
  const A = { id: 'a', name: 'comps-vue2-meme', type: 'sftp', base: 'https://a.example.com' }
  const B = { id: 'b', name: '@melt-js/comps-vue2-meme', type: 'sftp', base: SFTP_ROOT }

  test('末尾优先（scope 差异也算同名）', () => {
    expect(resolveSourceForDep([A, B], 'comps-vue2-meme').base).toBe(SFTP_ROOT)
    expect(resolveSourceForDep([B, A], 'comps-vue2-meme').base).toBe('https://a.example.com')
  })

  test('停用的条目不参与覆盖', () => {
    expect(resolveSourceForDep([A, { ...B, enabled: false }], 'comps-vue2-meme').base).toBe('https://a.example.com')
  })

  test('找不到返回 null', () => {
    expect(resolveSourceForDep([A], 'unknown')).toBeNull()
  })
})

describe('运行时依赖解析', () => {
  const sources = [{ name: '@melt-js/comps-vue2-meme', type: 'sftp', base: SFTP_ROOT }]

  test('定义里显式 host 优先，注册表不覆盖', () => {
    const explicit = resolveDepFromSources(sources, { name: 'comps-vue2-meme', host: 'https://explicit.example.com/x/hel-meta.json' })
    expect(explicit.dep.host).toBe('https://explicit.example.com/x/hel-meta.json')
    expect(explicit.source).toBeNull()
  })

  test('注册表命中：补上 host，非 unpkg 清空 version', () => {
    const { dep, source } = resolveDepFromSources(sources, { name: 'comps-vue2-meme', version: '1.0.0' })
    expect(dep.host).toBe(`${SFTP_ROOT}/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json`)
    expect(dep.version).toBe('')
    expect(source.name).toBe('@melt-js/comps-vue2-meme')
  })

  test('unpkg 来源保留版本', () => {
    const { dep } = resolveDepFromSources(
      [{ name: 'comps-vue2', type: 'unpkg', version: '2026.11.17' }],
      { name: 'comps-vue2' }
    )
    expect(dep.version).toBe('2026.11.17')
    expect(dep.host).toBe('https://unpkg.com/comps-vue2@2026.11.17/hel_dist/hel-meta.json')
  })

  test('未命中：原样返回，交给默认 unpkg 流程', () => {
    const { dep, source } = resolveDepFromSources(sources, { name: 'comps-vue2' })
    expect(dep.host).toBeUndefined()
    expect(source).toBeNull()
  })
})

describe('设置持久化', () => {
  beforeEach(() => localStorage.clear())

  test('保存后读回是规范化过的', () => {
    saveRuneSources([{ name: '@melt-js/comps-vue2-meme', type: 'sftp', base: `${SFTP_ROOT}/`, version: 'x' }])
    const list = loadRuneSources()
    expect(list).toHaveLength(1)
    expect(list[0].base).toBe(SFTP_ROOT)
    expect(list[0].version).toBe('')
    expect(JSON.parse(localStorage.getItem(MELT_SOURCES_STORAGE_KEY))).toHaveLength(1)
  })

  test('损坏数据返回空列表', () => {
    localStorage.setItem(MELT_SOURCES_STORAGE_KEY, '{oops')
    expect(loadRuneSources()).toEqual([])
  })
})
