// echoBuiltinsAd —— ad（插入广告占位或标注为广告内容）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'ad', name: 'ad', icon: 'campaign', color: '#FFB300', category: 'builtin', type: 'echo-chant',
  desc: '插入广告占位或标注为广告内容',
  banner: ['【ad】 —— 插入广告占位或标注为广告内容',
    '参数：type=banner|inline|sidebar（默认 banner）',
    'CSS 钩子：ag-rune-ad, ag-rune-ad-banner, ag-rune-ad-inline, ag-rune-ad-sidebar',
    '示例：@ad{type: "inline"}(内联广告标注)'],
  handlerDesc: '添加广告标记样式',
  handlerBody: `
    const mergedProps = Object.assign({ type: 'banner' }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const adType = String(mergedProps.type || 'banner').toLowerCase()
    $block.addClass('ag-rune-ad ag-rune-ad-' + adType)
    return () => {
      $block.removeClass('ag-rune-ad ag-rune-ad-banner ag-rune-ad-inline ag-rune-ad-sidebar')
    }`
}

export default buildEchoCard(META)
