/**
 * 新旧两套符文渲染机制并存：
 *   - vue-sfc：template 是一段 SFC，走 runeSfcRendererFactory（原有逻辑）
 *   - melt-js：template 是 JSON 配置，走 meltRuneHost 远端壳
 * 这里锁住「分流正确 + 同一棵组件树里两种 ctor 都能挂载 + 互不污染」。
 */
jest.mock('@melt-js/libs-core-vue2', () => {
  const state = { status: 'loading', component: null, error: null }
  return {
    createHelComponentResource: jest.fn(() => ({
      getState: () => state,
      load: jest.fn(() => Promise.resolve()),
      retry: jest.fn(),
      dispose: jest.fn()
    })),
    createHelLoader: jest.fn(() => ({
      loadHelLib: jest.fn(() => Promise.resolve({ TierRanking: {} }))
    })),
    resolveHelDep: jest.fn(dep => (typeof dep === 'string' ? { name: dep } : { ...dep }))
  }
})

const Vue = require('vue')
const { createRuneRendererCtor } = require('src/components/muya/runeSfcRendererFactory')
const { createMeltRuneRendererCtor } = require('src/components/rune/meltRuneHost')

const SFC_TEMPLATE = `<template><div class="sfc-rune">{{ value }}</div></template>
<script>
export default {
  props: { value: { type: String, default: '' } }
}
</script>`

const MELT_TEMPLATE = JSON.stringify({
  $type: 'melt-js',
  dep: { name: 'comps-vue2-meme', host: 'http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json' },
  exportName: 'TierRanking'
})

const mount = (ctor, propsData = {}) => {
  const vm = new ctor({ propsData })
  vm.$mount()
  return vm
}

describe('新旧符文机制并存', () => {
  test('SFC 符文仍按原逻辑编译，melt 工厂不认领', () => {
    const sfcCtor = createRuneRendererCtor({ id: 'r-sfc', template: SFC_TEMPLATE })
    expect(typeof sfcCtor).toBe('function')
    expect(createMeltRuneRendererCtor({ id: 'r-sfc', template: SFC_TEMPLATE })).toBeNull()
  })

  test('melt 符文不进 SFC 编译，交给远端壳', () => {
    expect(createRuneRendererCtor({ id: 'r-melt', template: MELT_TEMPLATE })).toBeNull()
    const meltCtor = createMeltRuneRendererCtor({ id: 'r-melt', template: MELT_TEMPLATE })
    expect(typeof meltCtor).toBe('function')
  })

  test('同一棵组件树里两种符文同时挂载，互不干扰', () => {
    const sfcVm = mount(createRuneRendererCtor({ id: 'r-sfc', template: SFC_TEMPLATE }), { value: '占位符值' })
    const meltVm = mount(createMeltRuneRendererCtor({ id: 'r-melt', template: MELT_TEMPLATE }), {
      runeId: 'r-melt', nodeId: 'n-melt', value: '', onValueChange: () => {}
    })

    expect(sfcVm.$el.textContent).toBe('占位符值')
    expect(sfcVm.$el.getAttribute('data-melt-rune-state')).toBeNull()
    expect(meltVm.$el.getAttribute('data-melt-rune-state')).toBe('loading')

    sfcVm.$destroy()
    meltVm.$destroy()
  })

  test('坏掉的 melt JSON 退回 SFC 判定（历史数据零迁移）', () => {
    const broken = '{"$type":"melt-js",'
    expect(createMeltRuneRendererCtor({ id: 'r-bad', template: broken })).toBeNull()
    // 非法 JSON 不是 SFC，也编译不出东西 —— 关键是不要抛异常
    expect(() => createRuneRendererCtor({ id: 'r-bad', template: broken })).not.toThrow()
  })

  test('空 template 两种工厂都返回 null（占位卡片分支）', () => {
    expect(createRuneRendererCtor({ id: 'r-empty', template: '' })).toBeNull()
    expect(createMeltRuneRendererCtor({ id: 'r-empty', template: '' })).toBeNull()
  })
})
