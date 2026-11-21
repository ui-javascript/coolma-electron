// echoBuiltinsNice —— nice 回响（把所在行除 @nice 之外的文本用 <mark> 包裹）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'nice', name: 'nice', icon: 'thumb_up', color: '#4CAF50', category: 'builtin', type: 'echo-chant',
  desc: '把所在行除 @nice 之外的文本用 <mark> 包裹',
  banner: ['【nice】 —— 把所在行 / block 内除 @nice 之外的节点用 <mark> 包裹',
    '使用示例：',
    '  - 你好世界 @nice              → li 内「你好世界」被 <mark> 高亮',
    '  # 今天天气真好 @nice          → h1 文本被 <mark> 高亮',
    '  普通段落 xxx @nice            → p 文本被 <mark> 高亮'],
  handlerDesc: '把 block 内除 @nice 之外的节点用 <mark> 包起来',
  handlerBody: `
    const $rune = $(node)
    if (!$rune.length) return
    const $prev = $rune.prev()
    if (!$prev.length) return
    const $parent = $prev.parent()
    if ($parent.attr('data-nice-marked')) return
    const $mark = $('<mark class="ag-rune-nice-highlight"></mark>').append($prev.clone())
    $prev.replaceWith($mark)
    $parent.attr('data-nice-marked', 'true')`
}

export default buildEchoCard(META)
