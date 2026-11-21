/* eslint-env jest */
// 正文图片地址形态转换：落库规范形态（coolma://coolma.app/...），读出来换成运行形态。
import { CANONICAL_PREFIX, toCanonicalResources, toRenderableResources } from '../src/desktop/noteResources'

const RUNTIME = 'http://coolma-resource.localhost/'
const PATH = 'eee30b70-25a3-11f1-b878-8559ff8d8de9/a3753ac0-620a-11f1-ab25-b5d3fc020517/1795264290758-yqx.jpg'

describe('toCanonicalResources', () => {
  test('把 Tauri 运行形态换成规范形态', () => {
    expect(toCanonicalResources(`![](${RUNTIME}${PATH})`))
      .toBe(`![](${CANONICAL_PREFIX}${PATH})`)
  })

  test('一条正文里多张图全部替换', () => {
    const body = `a ![](${RUNTIME}a/1.png) b ![](${RUNTIME}b/2.png)`
    expect(toCanonicalResources(body)).toBe(`a ![](${CANONICAL_PREFIX}a/1.png) b ![](${CANONICAL_PREFIX}b/2.png)`)
  })

  test('https 与 macOS 方言都归到同一个规范形态', () => {
    expect(toCanonicalResources('https://coolma-resource.localhost/x/1.png')).toBe(`${CANONICAL_PREFIX}x/1.png`)
    expect(toCanonicalResources('coolma-resource://localhost/x/1.png')).toBe(`${CANONICAL_PREFIX}x/1.png`)
  })

  test('规范形态原样返回（幂等）', () => {
    const body = `![](${CANONICAL_PREFIX}${PATH})`
    expect(toCanonicalResources(body)).toBe(body)
    expect(toCanonicalResources(toCanonicalResources(body))).toBe(body)
  })

  test('index_files 相对引用与普通链接不受影响', () => {
    const body = '![](index_files/a.png) [站外](https://example.com/coolma://coolma.app/x)'
    expect(toCanonicalResources(body)).toBe(body)
  })

  test('空值与非字符串原样返回', () => {
    expect(toCanonicalResources(null)).toBe(null)
    expect(toCanonicalResources(undefined)).toBe(undefined)
    expect(toCanonicalResources('')).toBe('')
    expect(toCanonicalResources(12)).toBe(12)
  })
})

describe('toRenderableResources', () => {
  test('规范形态换成当前平台运行形态', () => {
    const body = `![](${CANONICAL_PREFIX}${PATH})`
    expect(toRenderableResources(body, RUNTIME)).toBe(`![](${RUNTIME}${PATH})`)
  })

  test('base 末尾缺斜杠时自动补齐', () => {
    expect(toRenderableResources(`![](${CANONICAL_PREFIX}a/1.png)`, 'coolma-resource://localhost'))
      .toBe('![](coolma-resource://localhost/a/1.png)')
  })

  test('其他平台的运行形态也收敛到当前 base', () => {
    expect(toRenderableResources('![](coolma-resource://localhost/a/1.png)', RUNTIME)).toBe(`![](${RUNTIME}a/1.png)`)
    expect(toRenderableResources('![](https://coolma-resource.localhost/a/1.png)', RUNTIME)).toBe(`![](${RUNTIME}a/1.png)`)
  })

  test('写库再读出来可以还原（往返一致）', () => {
    const original = `![](${RUNTIME}${PATH})`
    const stored = toCanonicalResources(original)
    expect(toRenderableResources(stored, RUNTIME)).toBe(original)
  })

  test('迁移过来的老笔记（coolma://）能立刻渲染', () => {
    const legacy = `![](${CANONICAL_PREFIX}${PATH})`
    expect(toRenderableResources(legacy, RUNTIME)).toBe(`![](${RUNTIME}${PATH})`)
  })

  test('缺 base 或空值原样返回', () => {
    const body = `![](${CANONICAL_PREFIX}a/1.png)`
    expect(toRenderableResources(body, '')).toBe(body)
    expect(toRenderableResources(body)).toBe(body)
    expect(toRenderableResources(null, RUNTIME)).toBe(null)
  })
})
