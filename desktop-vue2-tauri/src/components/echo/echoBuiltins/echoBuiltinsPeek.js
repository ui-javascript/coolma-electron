// echoBuiltinsPeek —— peek（高亮展示内容，支持折叠展开）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'peek', name: 'peek', icon: 'visibility', color: '#FF7043', category: 'builtin', type: 'echo-chant',
  desc: '高亮展示内容，支持折叠展开',
  banner: ['【peek】 —— 高亮展示内容，支持折叠展开',
    '参数：collapsed=true|false（默认 false），level=1-3（高亮强度）',
    'CSS 钩子：ag-rune-peek, ag-rune-peek-collapsed',
    '示例：@peek{collapsed: true}(折叠展示)'],
  handlerDesc: '添加高亮 class，可交互折叠',
  handlerBody: `
    const mergedProps = Object.assign({ collapsed: false, level: 1 }, props || {})
    const $rune = $(node)
    const level = Math.max(1, Math.min(3, Number(mergedProps.level) || 1))
    $rune.addClass('ag-rune-peek ag-rune-peek-level-' + level)
    if (mergedProps.collapsed) $rune.addClass('ag-rune-peek-collapsed')
    return () => {
      $rune.removeClass('ag-rune-peek ag-rune-peek-collapsed ag-rune-peek-level-1 ag-rune-peek-level-2 ag-rune-peek-level-3')
    }`
}

export default buildEchoCard(META)
