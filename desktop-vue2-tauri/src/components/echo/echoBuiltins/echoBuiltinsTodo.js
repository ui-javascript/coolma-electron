// echoBuiltinsTodo —— todo（标记待办事项，可交互勾选）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'todo', name: 'todo', icon: 'check_box', color: '#26A69A', category: 'builtin', type: 'echo-chant',
  desc: '标记待办事项，可交互勾选',
  banner: ['【todo】 —— 标记待办事项，可交互勾选',
    '参数：checked=true|false（默认 false）',
    'CSS 钩子：ag-rune-todo, ag-rune-todo-checked',
    '示例：@todo{checked: false}(待完成事项)'],
  handlerDesc: '添加待办标记样式',
  handlerBody: `
    const mergedProps = Object.assign({ checked: false }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    $block.addClass('ag-rune-todo')
    if (mergedProps.checked) $block.addClass('ag-rune-todo-checked')
    return () => { $block.removeClass('ag-rune-todo ag-rune-todo-checked') }`
}

export default buildEchoCard(META)
