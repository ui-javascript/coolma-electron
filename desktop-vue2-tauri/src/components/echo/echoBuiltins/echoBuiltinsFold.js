// echoBuiltinsFold —— 折叠（将当前标题至下一个标题之间的内容折叠 / 展开，状态持久化）
// 类别：builtin ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'fold',
  name: 'fold',
  icon: 'unfold_more',
  color: '#5C6BC0',
  category: 'builtin',
  type: 'echo-chant',
  desc: '把当前标题到下一个标题之间的内容折叠（类似 <details>）',
  propsDefaults: { collapsed: true },
  banner: [
    '【fold / 折叠】 —— 将当前标题至下一个标题之间的内容折叠（类似 <details>）',
    '触发方式：将 @fold 放置在标题行内（h1 - h6）',
    '参数：collapsed = true/false（默认 true，并可通过 localStorage 持久化偏好）',
    '  localStorage 键：echo-fold-{echoId|nodeId|heading-index}',
    '示例：# 第一章内容 @fold{collapsed:false}(点击折叠)'
  ],
  handlerDesc: '包裹标题之后兄弟节点并切换折叠，图标与标题文字同行，持久化折叠状态',
  handlerBody: `
    const $rune = $(node)
    if (!$rune.length) return () => {}

    // 找到包含该回响的标题元素
    const $heading = $rune.closest('h1, h2, h3, h4, h5, h6')
    if (!$heading.length) return () => {}

    // Per-instance 幂等（挂在 $rune[0] 上，而不是 $heading 上）
    //   - 同一 heading 行内允许多个 @fold 实例，各自独立
    //   - Muya 重渲染 cleanup 时会清掉这个标记，下一次 afterRender 重装（这是正确的）
    if ($rune[0].__agFoldInstalled) return () => {}

    // === 显式找下一个 heading tag（替代 nextUntil，更可预期） ===
    // nextUntil 的边界判断对 whitespace 文本节点 / comment / 内部 marker
    // 节点的兼容性差；用 nextAll + findIndex 显式找下一个 h1-h6 tag，
    // 避免吞掉下面不属于"until" 的兄弟节点。
    const headingRe = /^h[1-6]$/i
    const siblings = $heading.nextAll().toArray()
    const nextHeadingIdx = siblings.findIndex(el => headingRe.test(el.tagName))
    const $siblingsToWrap = nextHeadingIdx === -1
      ? $(siblings)
      : $(siblings.slice(0, nextHeadingIdx))
    if (!$siblingsToWrap.length) return () => {}

    // 读取 props 偏好；localStorage 中保存的偏好覆盖默认 collapsed
    const mergedProps = Object.assign({ collapsed: true }, props || {})
    // storageKey 三段降级：echoId（rune-style 稳定实例 id）> nodeId（向下兼容）>
    //   heading 在同级 heading 集合里的索引 > 'fold'。
    // 每行 heading 的 fold 是独立的偏好存储。
    let headingIndex = ''
    try {
      const $allHeadings = $heading.parent().children('h1, h2, h3, h4, h5, h6')
      headingIndex = String($allHeadings.index($heading[0]))
    } catch (e) {}
    const storageKey = 'echo-fold-' + (props.echoId || props.nodeId || headingIndex || 'fold')
    let stored = null
    try { stored = localStorage.getItem(storageKey) } catch (e) {}
    if (stored !== null) {
      mergedProps.collapsed = (stored === 'true')
    }

    // 包裹容器
    const wrapperId = 'fold-container-' + Math.random().toString(36).substr(2, 9)
    $siblingsToWrap.wrapAll('<div class="ag-fold-wrapper" id="' + wrapperId + '"></div>')
    const $wrapper = $('#' + wrapperId)

    // 确保标题支持图标绝对定位，并预留右侧空间
    const prevPosition = $heading.css('position')
    const prevPaddingRight = $heading.css('paddingRight')
    if (prevPosition === 'static') $heading.css('position', 'relative')
    $heading.css('padding-right', '28px')

    // 创建折叠图标，绝对定位到标题右侧
    const $toggleIcon = $(
      '<span class="ag-fold-toggle-icon" style="'
      + 'position: absolute;'
      + 'right: 4px;'
      + 'top: 50%;'
      + 'transform: translateY(-50%);'
      + 'cursor: pointer;'
      + 'font-size: 0.8em;'
      + 'user-select: none;'
      + 'line-height: 1;'
      + '">▼</span>'
    )
    $heading.append($toggleIcon)

    // 折叠 / 展开逻辑
    const toggleFold = (collapse) => {
      if (collapse) {
        $wrapper.slideUp(200)
        $toggleIcon.text('▶')
        $wrapper.addClass('ag-fold-collapsed')
      } else {
        $wrapper.slideDown(200)
        $toggleIcon.text('▼')
        $wrapper.removeClass('ag-fold-collapsed')
      }
    }

    // 图标点击事件，同时更新 localStorage
    const iconClickHandler = () => {
      const nowCollapsed = $wrapper.hasClass('ag-fold-collapsed')
      const newCollapsed = !nowCollapsed
      toggleFold(newCollapsed)
      try { localStorage.setItem(storageKey, newCollapsed ? 'true' : 'false') } catch (e) {}
    }
    $toggleIcon.on('click', iconClickHandler)

    // 设置初始状态（已由 localStorage 调整）
    toggleFold(!!mergedProps.collapsed)

    // 给回响标记自身加激活样式
    $rune.addClass('ag-rune-fold-active')

    // 在 $rune 上挂 per-instance 已装标记（让 cleanup / 下次重渲染能识别）
    $rune[0].__agFoldInstalled = true

    // cleanup 函数：恢复所有改动，不清除 localStorage 偏好
    return () => {
      $toggleIcon.off('click', iconClickHandler)
      $toggleIcon.remove()
      if ($wrapper.length) {
        $wrapper.children().unwrap()
        $wrapper.remove()
      }
      $heading
        .css('position', prevPosition === 'static' ? '' : prevPosition)
        .css('padding-right', prevPaddingRight)
      $rune.removeClass('ag-rune-fold-active')
      try { delete $rune[0].__agFoldInstalled } catch (e) {}
    }
  `
}

export default buildEchoCard(META)
