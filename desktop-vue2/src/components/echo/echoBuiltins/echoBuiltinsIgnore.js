// echoBuiltinsIgnore —— ignore（标记为可忽略内容，视觉淡化）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'ignore', name: 'ignore', icon: 'visibility_off', color: '#90A4AE', category: 'builtin', type: 'echo-chant',
  desc: '标记为可忽略内容，视觉淡化',
  banner: ['【ignore】 —— 标记为可忽略内容，视觉淡化',
    '参数：opacity=0.1-1（淡化透明度，默认 0.4）',
    'CSS 钩子：ag-rune-ignore',
    '示例：@ignore{opacity: 0.3}(淡化次要内容)'],
  handlerDesc: '降低 block 透明度，cleanup 时还原',
  handlerBody: `
    const mergedProps = Object.assign({ opacity: 0.4 }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const prevOpacity = $block.css('opacity') || '1'
    $block.addClass('ag-rune-ignore').css('opacity', mergedProps.opacity)
    return () => {
      $block.removeClass('ag-rune-ignore').css('opacity', prevOpacity)
    }`
}

export default buildEchoCard(META)
