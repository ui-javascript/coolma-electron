// ============================================================================
// tests/unit/rune/rune-props-collect.test.js
//
// 锁定「宿主 DOM → 符文 props」的采集契约（v2026-11-22 补齐自然属性）：
//   1) data-rune-prop-* 优先（历史 ABI，可写任意字符串/布尔）
//   2) 自然属性兜底：prop 名按 kebab-case 读（maxHeight → max-height）
//   3) 空值属性（<div disabled>）归一为 true，与 Vue 布尔属性直觉一致
//   4) 系统属性黑名单（class/style/contenteditable/hidden/spellcheck/draggable/tabindex）
//      不参与映射，避免和宿主标记撞车
// ============================================================================
// 说明：采集逻辑已抽到 libs-muya-vue2/lib/rune/runeProps.js（纯函数）。
// 不去 require render/index.js —— 它会拉起 katex.min.css / i18n，在 Jest 下无法解析。

const { collectRunePropsFromHost } = require('libs-muya-vue2/lib/rune/runeProps')
const { resolveRunePropDefs } = require('libs-muya-vue2/lib/rune/runePropDefs')

const makeHost = (html) => {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  return wrapper.firstElementChild
}

const DEFS = [
  { name: 'maxHeight', type: 'number' },
  { name: 'title', type: 'string' },
  { name: 'disabled', type: 'boolean' }
]

describe('collectRunePropsFromHost', () => {
  test('dataset 通道优先，自然属性兜底', () => {
    const host = makeHost(
      '<div data-rune-prop-title="来自dataset" title="来自属性" data-rune-prop-max-height="200" disabled></div>'
    )
    const props = collectRunePropsFromHost(host, DEFS)
    expect(props.title).toBe('来自dataset')
    expect(props.maxHeight).toBe('200')
    expect(props.disabled).toBe(true)
  })

  test('只写自然属性时也能采集到', () => {
    const host = makeHost('<div max-height="180" title="自然属性"></div>')
    const props = collectRunePropsFromHost(host, DEFS)
    expect(props.maxHeight).toBe('180')
    expect(props.title).toBe('自然属性')
    expect(props).not.toHaveProperty('disabled')
  })

  test('布尔字符串归一：true/false/1/0', () => {
    expect(collectRunePropsFromHost(makeHost('<div data-rune-prop-disabled="true"></div>'), DEFS).disabled).toBe(true)
    expect(collectRunePropsFromHost(makeHost('<div data-rune-prop-disabled="false"></div>'), DEFS).disabled).toBe(false)
    expect(collectRunePropsFromHost(makeHost('<div data-rune-prop-disabled="1"></div>'), DEFS).disabled).toBe(true)
    expect(collectRunePropsFromHost(makeHost('<div data-rune-prop-disabled="0"></div>'), DEFS).disabled).toBe(false)
  })

  test('系统属性不参与 prop 映射', () => {
    const host = makeHost('<div class="x" style="color:red" contenteditable="true" hidden></div>')
    const defs = [{ name: 'class' }, { name: 'style' }, { name: 'contenteditable' }, { name: 'hidden' }]
    expect(collectRunePropsFromHost(host, defs)).toEqual({})
  })

  test('propDefs 为空或 host 缺失时返回空对象', () => {
    expect(collectRunePropsFromHost(makeHost('<div title="x"></div>'), [])).toEqual({})
    expect(collectRunePropsFromHost(null, DEFS)).toEqual({})
  })
})

describe('resolveRunePropDefs', () => {
  const sfc = [
    '<template><div>{{ value }}</div></template>',
    '<script>',
    'export default {',
    '  props: {',
    "    value: { type: String, default: '' },",
    '    maxHeight: { type: Number, default: 320 }',
    '  }',
    '}',
    '</script>'
  ].join('\n')

  test('vue-sfc 从 SFC 解析 props', () => {
    const defs = resolveRunePropDefs({ template: sfc })
    expect(defs.map(d => d.name)).toEqual(['value', 'maxHeight'])
  })

  test('melt-js 从配置 schema 取 props', () => {
    const defs = resolveRunePropDefs({
      template: JSON.stringify({
        $type: 'melt-js',
        dep: { name: 'comps-vue2-meme' },
        exportName: 'TierRanking',
        props: {
          value: { type: 'string' },
          maxHeight: { type: 'number', default: 320 }
        }
      })
    })
    expect(defs.map(d => d.name)).toEqual(['value', 'maxHeight'])
  })

  test('宿主归一化带上的 type 优先（template 是 SFC 但 type 标了 melt 时按 melt 走）', () => {
    const defs = resolveRunePropDefs({
      type: 'melt-js',
      template: JSON.stringify({ $type: 'melt-js', dep: { name: 'x' }, exportName: 'Y', props: { a: {} } })
    })
    expect(defs.map(d => d.name)).toEqual(['a'])
  })

  test('melt-js 配置坏掉时返回空数组而不是抛异常', () => {
    expect(resolveRunePropDefs({ template: JSON.stringify({ $type: 'melt-js' }) })).toEqual([])
  })

  test('rune 为空时返回空数组', () => {
    expect(resolveRunePropDefs(null)).toEqual([])
  })
})
