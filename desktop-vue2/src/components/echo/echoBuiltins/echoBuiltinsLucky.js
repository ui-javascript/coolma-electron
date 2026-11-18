// echoBuiltinsLucky —— 强运（点击后触发 AI 识别当前 Markdown 的错别字并修正）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'lucky', name: '强运', icon: 'casino', color: '#FB8C00', category: 'showy', type: 'echo-chant',
  desc: '点击后触发 AI 识别当前 Markdown 的错别字并修正',
  banner: ['【强运 / lucky】 —— 点击触发 AI 校对，是"事件型 echo-chant"样板',
    '事件流：handler 给节点加 role=button / tabindex=0；点击时调用',
    '  window.__memocastEchoChantHandlers.lucky({node, props})，由应用层注册回调',
    '示例：@强运{model: "gpt-4o-mini", action: "ai-proofread"}(一键润色)'],
  handlerDesc: '事件型：cleanup 必须解绑 + 移除属性；callback 走 window.__memocastEchoChantHandlers.lucky（应用层注册）',
  handlerBody: `
    const mergedProps = Object.assign({ label: '点击触发 AI 校对' }, props || {})
    const $rune = $(node)
    $rune.css('cursor', 'pointer').attr('role', 'button').attr('tabindex', '0')
      .attr('title', mergedProps.label).addClass('ag-rune-lucky-active')
    const trigger = async (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      $rune.addClass('ag-rune-lucky-loading')
      try {
        const handler = (typeof window !== 'undefined')
          ? (window.__memocastEchoChantHandlers && window.__memocastEchoChantHandlers.lucky)
          : null
        if (typeof handler === 'function') await handler({ node, props })
        else console.info('[lucky] no window.__memocastEchoChantHandlers.lucky registered')
      } catch (err) { console.error('[lucky] handler failed:', err) }
      finally { $rune.removeClass('ag-rune-lucky-loading') }
    }
    const onClick = (ev) => trigger(ev)
    const onKey = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') trigger(ev) }
    $rune.on('click', onClick).on('keydown', onKey)
    return () => {
      $rune.off('click', onClick).off('keydown', onKey)
        .removeClass('ag-rune-lucky-active ag-rune-lucky-loading')
        .css('cursor', '').removeAttr('role').removeAttr('tabindex').removeAttr('title')
    }`
}

export default buildEchoCard(META)
