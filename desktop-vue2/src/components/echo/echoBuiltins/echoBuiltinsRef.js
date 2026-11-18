// echoBuiltinsRef —— ref（标记为参考资料，可跳转链接）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'ref', name: 'ref', icon: 'link', color: '#29B6F6', category: 'builtin', type: 'echo-chant',
  desc: '标记为参考资料，可跳转链接',
  banner: ['【ref】 —— 标记为参考资料，可跳转链接',
    '参数：url=外部链接（可选），title=标题（可选）',
    'CSS 钩子：ag-rune-ref',
    '示例：@ref{url: "https://..."}(参考资料)'],
  handlerDesc: '添加参考标记样式，可点击跳转',
  handlerBody: `
    const mergedProps = Object.assign({ url: '', title: '' }, props || {})
    const $rune = $(node)
    $rune.addClass('ag-rune-ref')
    if (mergedProps.url) {
      $rune.css('cursor', 'pointer')
      $rune.on('click', (e) => {
        e.preventDefault()
        window.open(mergedProps.url, '_blank')
      })
    }
    return () => { $rune.removeClass('ag-rune-ref').css('cursor', '').off('click') }`
}

export default buildEchoCard(META)
