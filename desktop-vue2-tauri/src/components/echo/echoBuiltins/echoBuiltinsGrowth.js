// echoBuiltinsGrowth —— 生生不息（为附近符合条件的元素加上生长的动画特效）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'growth', name: '生生不息', icon: 'park', color: '#43A047', category: 'showy', type: 'echo-chant',
  desc: '为附近符合条件的元素加上生长的动画特效',
  banner: ['【生生不息 / growth】 —— 给附近符合条件的元素加上"生长"的动画特效',
    '影响范围（scope）：',
    '  - siblings(默认)   同段落或同 block 的兄弟节点',
    '  - prev-block       前一块兄弟节点',
    '  - block            当前 block（含自身）',
    '  - document         整篇容器',
    '命中元素（target）：CSS 选择器，默认 p/pre/h1~h6/li/blockquote/table',
    '触发方式（trigger）：auto=自动 stagger；manual=需要外部触发器',
    '示例：@生生不息{scope: "siblings", trigger: "manual", target: "p, li"}(春风吹又生)'],
  handlerDesc: '自动给目标元素加生长动画；trigger=auto 时按 index 设置 stagger delay',
  propsDefaults: { scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' },
  handlerBody: `
    const mergedProps = Object.assign({ scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' }, props || {})
    const targetSelector = mergedProps.target
    const $container = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').parent()
    if (!$container.length) return () => {}
    const container = $container.get(0)
    const $targets = $(container).find(targetSelector)
    $targets.each((i, el) => {
      $(el).addClass('ag-rune-growth-target')
      if (mergedProps.trigger === 'auto') $(el).css('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')
    })
    $(node).addClass('ag-rune-growth-active')
    return () => {
      $targets.removeClass('ag-rune-growth-target').css('--ag-rune-growth-delay', '')
      $(node).removeClass('ag-rune-growth-active')
    }`
}

export default buildEchoCard(META)
