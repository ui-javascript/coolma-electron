// echoBuiltinsScapegoat —— 替罪（在作用域内接住后续 echo / DOM 抛出的错误，并以受伤态提示）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'scapegoat', name: '替罪', icon: 'shield', color: '#6D4C41', category: 'showy', type: 'echo-chant',
  desc: '在作用域内接住后续 echo / DOM 抛出的错误，并以受伤态提示',
  banner: ['【替罪 / scapegoat】 —— 作用域内的"救场位"',
    '回响种类：echo-chant（影响附近元素、做防灾 / 占位 / 兜底）',
    '语义：把最近 block 标为 standby；后续 echo / DOM 抛错时把 standby 转 injured，错误写到 data-scapegoat-error',
    '模仿提示：把 props.intensity 改成 0.5 可以让 standby 默认变 injured（模拟"已知错误"）'],
  handlerDesc: 'cleanup：移除监听 + 移除 standby/injured 状态',
  handlerBody: `
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').first()
    if (!$block.length) return () => {}
    const intensity = Number(props.intensity) || 0
    if (intensity > 0) {
      $block.addClass('ag-rune-scapegoat-injured').attr('data-scapegoat-error', props.error || 'pre-injured by intensity')
    } else {
      $block.addClass('ag-rune-scapegoat-standby')
    }
    const onError = (event) => {
      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured')
        .attr('data-scapegoat-error', (event && event.message) || 'unknown error')
    }
    const onRuneError = (event) => {
      const detail = event && event.detail
      if (!detail) return
      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured')
        .attr('data-scapegoat-rune-error', String(detail.id || 'unknown'))
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('error', onError, true)
      window.addEventListener('ag:rune:error', onRuneError)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', onError, true)
        window.removeEventListener('ag:rune:error', onRuneError)
      }
      $block.removeClass('ag-rune-scapegoat-standby ag-rune-scapegoat-injured')
        .removeAttr('data-scapegoat-error').removeAttr('data-scapegoat-rune-error')
    }`
}

export default buildEchoCard(META)
