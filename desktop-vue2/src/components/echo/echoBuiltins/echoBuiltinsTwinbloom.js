// echoBuiltinsTwinbloom —— 双生花（复制前/后一个 block 并生成占位副本）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'twinbloom', name: '双生花', icon: 'local_florist', color: '#8E24AA', category: 'showy', type: 'echo-chant',
  desc: '复制前/后一个 block 并生成占位副本',
  banner: ['【双生花 / twinbloom】 —— 用 jQuery .clone() 复制「上一个元素 / 上一行」作占位',
    '【核心】影响范围 source：',
    '  - prev-sibling(默认) 同行上一个 inline / element 兄弟节点',
    '  - prev-line          上一行 block 节点',
    '  - next-line          下一行 block 节点',
    '参数：placeholderText=占位文本（若被克隆节点没有可见文本则用此填充）',
    '示例：@twinbloom{source: "prev-line"}(克隆上一行)'],
  handlerDesc: 'jQuery .clone()：按 source 复制 prev-sibling / prev-line / next-line；cleanup 时移除克隆块',
  handlerBody: `
    const $rune = $(node)
    if (!$rune.length) return () => {}
    const mergedProps = Object.assign({ source: 'prev-sibling', placeholderText: '双生节点' }, props || {})
    const source = String(mergedProps.source || 'prev-sibling').toLowerCase()
    const placeholderText = mergedProps.placeholderText || '双生节点'
    const twinId = $rune.attr('data-echo-chant-id') || 'twinbloom'
    const $block = $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    let $src, $target, insertBefore = false
    if (source === 'prev-line' || source === 'prev-block') {
      $src = $block.prev(); $target = $block
    } else if (source === 'next-line' || source === 'next-block') {
      $src = $block.next(); $target = $block; insertBefore = true
    } else {
      $src = $rune.prevAll(':not([data-echo-chant-id]):not(mark):not(.ag-rune)').first()
      if (!$src.length) $src = $block
      $target = $rune
    }
    if (!$src.length) return () => {}
    const $neighbor = insertBefore ? $target.prev() : $target.next()
    let $clone = $neighbor.filter(function () { return this.getAttribute('data-twinbloom-of') === twinId })
    let existedBefore = $clone.length > 0
    if (!existedBefore) {
      $clone = $src.clone(true)
        .attr('data-twinbloom-of', twinId)
        .attr('data-twinbloom-source', source)
        .attr('contenteditable', 'false')
        .addClass('ag-rune-twinbloom-clone')
        .css({ outline: '2px dashed #8E24AA', 'outline-offset': '2px',
          'background-color': 'rgba(142,36,170,0.06)', 'border-radius': '6px',
          padding: '8px 12px' })
      if (!$clone.find('[data-twinbloom-badge]').length) {
        $clone.prepend(
          $('<span></span>').attr('data-twinbloom-badge', twinId)
            .text('🌸 双生花 · ' + placeholderText)
            .css({ 'font-size': '11px', color: '#8E24AA',
              padding: '2px 8px', 'background-color': 'rgba(142,36,170,.12)',
              border: '1px solid rgba(142,36,170,.4)', 'border-radius': '4px',
              display: 'inline-block', 'margin-bottom': '6px' })
        )
      }
      if (!$clone.text().replace(/🌸.*$/, '').trim()) {
        $clone.append($('<span></span>').attr('data-twinbloom-placeholder', 'true').text(placeholderText))
      }
      insertBefore ? $target.before($clone) : $target.after($clone)
    }
    $rune.addClass('ag-rune-twinbloom-active')
    return () => {
      if (!existedBefore) $clone.remove()
      $rune.removeClass('ag-rune-twinbloom-active')
    }`
}

export default buildEchoCard(META)
