// echoBuiltinsSkywalk —— 天行健（强化排版并指定某种主题）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'skywalk', name: '天行健', icon: 'auto_awesome', color: '#1E88E5', category: 'showy', type: 'echo-chant',
  desc: '强化排版并指定某种主题',
  banner: ['【天行健 / skywalk】 —— 强化排版并切换主题（document 级别）',
    '参数：theme(light/dark/sepia/auto) + layout(compact/enhanced/luxe)',
    'CSS 钩子：data-skywalk-theme / data-skywalk-layout',
    '示例：@天行健{theme: "sepia", layout: "luxe"}(本文走浓郁路线)'],
  handlerDesc: 'document scope：记忆原 theme/layout，cleanup 时还原',
  handlerBody: `
    const mergedProps = Object.assign({ theme: 'auto', layout: 'enhanced' }, props || {})
    const $root = $(node).closest('[data-echo-document], .mu-editor, article, [data-doc-id]').first()
    if (!$root.length) return () => {}
    const root = $root.get(0)
    const prev = {
      theme: root.getAttribute('data-skywalk-theme'),
      layout: root.getAttribute('data-skywalk-layout')
    }
    $root.attr('data-skywalk-theme', mergedProps.theme).attr('data-skywalk-layout', mergedProps.layout)
    $(node).addClass('ag-rune-skywalk-active')
    return () => {
      if (prev.theme === null) $root.removeAttr('data-skywalk-theme')
      else $root.attr('data-skywalk-theme', prev.theme)
      if (prev.layout === null) $root.removeAttr('data-skywalk-layout')
      else $root.attr('data-skywalk-layout', prev.layout)
      $(node).removeClass('ag-rune-skywalk-active')
    }`
}

export default buildEchoCard(META)
