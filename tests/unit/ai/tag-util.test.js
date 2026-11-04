// ============================================================================
// tests/unit/ai/tag-util.test.js
//
// 锁定「AI 打标 / 标签维护」依赖的纯工具契约（src/utils/tagUtil.js）：
//   1) notes.tags 字符串（`*` 分隔 tagGuid）的拆分 / 拼装 / 去重
//   2) AI 输出 → 标签名：JSON 数组、```json 包裹、逐行、逗号 / 顿号分隔都要能解析
//   3) 标签名规范化：去掉 # 前缀、列表符号、引号、结尾标点，长度截断
//   4) 标签池合并：本地优先于云端（本地行才能写 note_tags），同名大小写无关去重
//   5) 正文压缩：图片 / 代码块 / HTML 不进 prompt，且按上限截断
// ============================================================================

const path = require('path')
const tagUtil = require(path.resolve(__dirname, '../../../src/utils/tagUtil.js'))

const {
  splitTagGuids,
  buildTagsString,
  isLocalTagGuid,
  parseLocalTagGuidId,
  normalizeTagName,
  parseTagNames,
  buildTagPool,
  findTagInPool,
  pickTagColor,
  condenseNoteContent,
  clampNumber,
  MAX_TAG_NAME_LENGTH
} = tagUtil

describe('tagUtil — notes.tags 拆分与拼装', () => {
  test('splitTagGuids 按 * 拆分并丢弃空串', () => {
    expect(splitTagGuids('local_tag_1*local_tag_2')).toEqual(['local_tag_1', 'local_tag_2'])
    expect(splitTagGuids('*local_tag_1**')).toEqual(['local_tag_1'])
    expect(splitTagGuids('')).toEqual([])
    expect(splitTagGuids(null)).toEqual([])
  })

  test('splitTagGuids 兼容数组入参', () => {
    expect(splitTagGuids(['a', ' b ', ''])).toEqual(['a', 'b'])
  })

  test('buildTagsString 去重且保持顺序', () => {
    expect(buildTagsString(['b', 'a', 'b'])).toBe('b*a')
    expect(buildTagsString([])).toBe('')
    expect(buildTagsString(null)).toBe('')
  })

  test('本地 tagGuid 识别', () => {
    expect(isLocalTagGuid('local_tag_12')).toBe(true)
    expect(isLocalTagGuid('cloud-guid-abc')).toBe(false)
    expect(parseLocalTagGuidId('local_tag_12')).toBe(12)
    expect(parseLocalTagGuidId('local_tag_abc')).toBe(null)
    expect(parseLocalTagGuidId('cloud-guid-abc')).toBe(null)
  })
})

describe('tagUtil — 标签名规范化', () => {
  test('去掉 # 前缀、列表符号、序号与首尾引号', () => {
    expect(normalizeTagName('#读书笔记')).toBe('读书笔记')
    expect(normalizeTagName('- 效率工具')).toBe('效率工具')
    expect(normalizeTagName('1. 项目管理')).toBe('项目管理')
    expect(normalizeTagName('"AI 工具"')).toBe('AI 工具')
    expect(normalizeTagName('`代码`')).toBe('代码')
  })

  test('去掉结尾标点、折叠空白', () => {
    expect(normalizeTagName('读书笔记，')).toBe('读书笔记')
    expect(normalizeTagName('时间   管理')).toBe('时间 管理')
  })

  test('松散数组片段的括号 / 引号会被剥掉', () => {
    expect(normalizeTagName("[ 'a'")).toBe('a')
    expect(normalizeTagName("'b']")).toBe('b')
  })

  test('超长名称按上限截断', () => {
    const long = '标'.repeat(MAX_TAG_NAME_LENGTH + 10)
    expect(normalizeTagName(long).length).toBe(MAX_TAG_NAME_LENGTH)
  })

  test('空值 / 纯噪音返回空串', () => {
    expect(normalizeTagName('')).toBe('')
    expect(normalizeTagName(null)).toBe('')
    expect(normalizeTagName(' # ')).toBe('')
  })
})

describe('tagUtil — AI 输出解析', () => {
  test('标准 JSON 数组', () => {
    expect(parseTagNames('["读书笔记","效率工具"]')).toEqual(['读书笔记', '效率工具'])
  })

  test('```json 代码块包裹', () => {
    const raw = '```json\n["AI","笔记"]\n```'
    expect(parseTagNames(raw)).toEqual(['AI', '笔记'])
  })

  test('带解释文字 + 对象数组', () => {
    const raw = '好的，结果如下：\n[{"name":"读书"},{"name":"笔记"}]\n以上。'
    expect(parseTagNames(raw)).toEqual(['读书', '笔记'])
  })

  test('逐行列表', () => {
    expect(parseTagNames('- 读书笔记\n- 效率工具\n')).toEqual(['读书笔记', '效率工具'])
  })

  test('逗号 / 顿号分隔', () => {
    expect(parseTagNames('读书笔记, 效率工具、时间管理')).toEqual(['读书笔记', '效率工具', '时间管理'])
  })

  test('大小写无关去重 + 截断到 maxTags', () => {
    expect(parseTagNames('["AI","ai","笔记"]', { maxTags: 3 })).toEqual(['AI', '笔记'])
    expect(parseTagNames('["a","b","c","d"]', { maxTags: 2 })).toEqual(['a', 'b'])
  })

  test('maxTags 脏数据回落默认值', () => {
    expect(parseTagNames('["a","b","c","d"]', { maxTags: 0 })).toEqual(['a', 'b', 'c'])
    expect(parseTagNames('["a","b","c","d"]', { maxTags: 'abc' })).toEqual(['a', 'b', 'c'])
  })

  test('空输出 → 空数组', () => {
    expect(parseTagNames('')).toEqual([])
    expect(parseTagNames('   ')).toEqual([])
    expect(parseTagNames('["","#"]')).toEqual([])
  })
})

describe('tagUtil — 标签池合并与复用匹配', () => {
  const localTags = [
    { id: 1, name: '读书笔记', tagGuid: 'local_tag_1' },
    { id: 2, name: '待整理', tagGuid: 'local_tag_2' }
  ]
  const cloudTags = [
    { name: '读书笔记', tagGuid: 'cloud-guid-1' },
    { name: '效率工具', tagGuid: 'cloud-guid-2' }
  ]

  test('同名标签本地优先（保证能写 note_tags）', () => {
    const pool = buildTagPool({ localTags, cloudTags })
    const hit = findTagInPool(pool, '读书笔记')
    expect(hit.tagGuid).toBe('local_tag_1')
    expect(hit.localId).toBe(1)
    expect(hit.source).toBe('local')
    expect(pool.length).toBe(3)
  })

  test('includeLocalTags=false 时只保留云端标签（登录态）', () => {
    const pool = buildTagPool({ localTags, cloudTags, includeLocalTags: false })
    expect(pool.map(t => t.tagGuid).sort()).toEqual(['cloud-guid-1', 'cloud-guid-2'])
  })

  test('匹配忽略大小写与前后的空白差异', () => {
    const pool = buildTagPool({ cloudTags: [{ name: 'AI Tools', tagGuid: 'g1' }] })
    expect(findTagInPool(pool, 'ai tools').tagGuid).toBe('g1')
    expect(findTagInPool(pool, 'AI  Tools').tagGuid).toBe('g1')
  })

  test('找不到时返回 null，脏数据被跳过', () => {
    const pool = buildTagPool({ localTags: [{ name: '', tagGuid: 'x' }, { name: 'a' }, null] })
    expect(pool).toEqual([])
    expect(findTagInPool(pool, '不存在')).toBe(null)
    expect(findTagInPool(pool, '')).toBe(null)
  })

  test('pickTagColor 同名稳定、不同名有区分', () => {
    expect(pickTagColor('读书笔记')).toBe(pickTagColor('读书笔记'))
    expect(pickTagColor('')).toBe(pickTagColor(''))
    expect(pickTagColor('读书笔记')).toMatch(/^#[0-9A-F]{6}$/i)
  })
})

describe('tagUtil — prompt 正文压缩', () => {
  test('去掉图片 / 代码块 / HTML 标签', () => {
    const content = [
      '# 标题',
      '![img](https://example.com/a.png)',
      '```js',
      'console.log(1)',
      '```',
      '<div>块</div>',
      '正文内容'
    ].join('\n')
    const condensed = condenseNoteContent(content, 200)
    expect(condensed).toContain('# 标题')
    expect(condensed).toContain('正文内容')
    expect(condensed).not.toContain('console.log')
    expect(condensed).not.toContain('example.com')
    expect(condensed).not.toContain('<div>')
  })

  test('按上限截断', () => {
    const condensed = condenseNoteContent('字'.repeat(500), 100)
    expect(condensed.length).toBe(100)
  })

  test('空值返回空串', () => {
    expect(condenseNoteContent(null)).toBe('')
    expect(condenseNoteContent('   ')).toBe('')
  })
})

describe('tagUtil — clampNumber', () => {
  test('取整并收敛到区间内', () => {
    expect(clampNumber('3', 1, 8, 3)).toBe(3)
    expect(clampNumber(3.6, 1, 8, 3)).toBe(4)
    expect(clampNumber(0, 1, 8, 3)).toBe(1)
    expect(clampNumber(99, 1, 8, 3)).toBe(8)
    expect(clampNumber('', 1, 8, 3)).toBe(3)
    expect(clampNumber('abc', 1, 8, 3)).toBe(3)
  })
})
