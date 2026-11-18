// echoBuiltinsDisperse —— 离析（使附近的元素使用更加宽松的排版）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'disperse', name: '离析', icon: 'call_split', color: '#00897B', category: 'showy', type: 'echo-chant',
  desc: '使附近的元素使用更加宽松的排版',
  banner: ['【离析 / disperse】 —— 让附近元素使用更宽松排版（block 级别）',
    '参数：density=tight|normal|loose（loose 是默认）',
    'CSS 钩子：data-disperse-density',
    '示例：@离析{density: "tight"}(回归紧凑排版)'],
  handlerDesc: 'block scope 写 data-disperse-density；CSS 据此调整 line-height/margin',
  handlerBody: `
    const mergedProps = Object.assign({ density: 'loose' }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const previous = $block.attr('data-disperse-density')
    $block.attr('data-disperse-density', mergedProps.density)
    $(node).addClass('ag-rune-disperse-active')
    return () => {
      if (previous === undefined) $block.removeAttr('data-disperse-density')
      else $block.attr('data-disperse-density', previous)
      $(node).removeClass('ag-rune-disperse-active')
    }`
}

export default buildEchoCard(META)
