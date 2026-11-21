// echoBuiltinsDiff —— diff（标记差异对比内容）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'diff', name: 'diff', icon: 'difference', color: '#7E57C2', category: 'builtin', type: 'echo-chant',
  desc: '标记差异对比内容',
  banner: ['【diff】 —— 标记差异对比内容',
    '参数：mode=add|remove|change（默认 change）',
    'CSS 钩子：ag-rune-diff, ag-rune-diff-add, ag-rune-diff-remove, ag-rune-diff-change',
    '示例：@diff{mode: "add"}(新增内容)'],
  handlerDesc: '添加 diff 标记样式',
  handlerBody: `
    const mergedProps = Object.assign({ mode: 'change' }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const diffMode = String(mergedProps.mode || 'change').toLowerCase()
    $block.addClass('ag-rune-diff ag-rune-diff-' + diffMode)
    return () => {
      $block.removeClass('ag-rune-diff ag-rune-diff-add ag-rune-diff-remove ag-rune-diff-change')
    }`
}

export default buildEchoCard(META)
