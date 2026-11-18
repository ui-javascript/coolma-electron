// echoBuiltinsShatter —— 破万法（使附近一行或一个块的回响作用都失效）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'shatter', name: '破万法', icon: 'block', color: '#E53935', category: 'showy', type: 'echo-chant',
  desc: '使附近一行或一个块的回响作用都失效',
  banner: ['【破万法 / shatter】 —— 让附近一行或一个块的回响作用都失效',
    '影响范围（target）：line(默认) 同段落的兄弟 echo；block 整个当前 block',
    '示例：@破万法{target: "block"}(此段一切回响失效)'],
  handlerDesc: 'target=line 时屏蔽同段 echo；target=block 时屏蔽整个 block 内的 echo',
  handlerBody: `
    const mergedProps = Object.assign({ target: 'line' }, props || {})
    const $rune = $(node)
    const $scopeRoot = mergedProps.target === 'block'
      ? $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')
      : $rune.parent()
    if (!$scopeRoot.length) return () => {}
    const $echoes = $scopeRoot.find('[data-echo-inline="true"]').filter((_i, n) => n !== node)
    $echoes.attr('data-shatter-disabled', 'true').addClass('ag-rune-shatter-disabled')
    $rune.addClass('ag-rune-shatter-active')
    return () => {
      $echoes.removeAttr('data-shatter-disabled').removeClass('ag-rune-shatter-disabled')
      $rune.removeClass('ag-rune-shatter-active')
    }`
}

export default buildEchoCard(META)
