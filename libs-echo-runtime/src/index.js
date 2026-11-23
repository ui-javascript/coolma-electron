// ============================================================================
// libs-echo-runtime —— 博客端回响效果（纯 DOM，无框架 / 无 jQuery / 无 eval）
//
// 桌面端回响是 anno_source 里的 render/afterRender（依赖 jQuery 操作 DOM）。
// 博客端不执行任意 JS，只按 field 走内置渲染器：
//   - typewriter：目标文本逐字展开，隐藏占位撑住布局，避免抖动
//   - barrage：克隆目标文本为固定定位弹幕，从右向左飘过
//
// 目标解析口径（博客适配）：
//   1) 标记所在块内的前一个元素兄弟（inline 场景）
//   2) 标记所在块的上一个块（整段场景，VuePress/VitePress 最常见）
//   3) next-line / next-block 取下一个块
//   4) 目标包含标记本身时放弃，绝不把标记一起清掉
// ============================================================================

const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th'
const ECHO_CHIP_SELECTOR = '.ag-echo-live'
const TYPEWRITER_STYLE_ID = 'ag-typewriter-style'
const BARRAGE_STYLE_ID = 'ag-danmaku-style'

/** "speed: 60, scope: prev-line" → { speed: 60, scope: 'prev-line' } */
export function parseEchoAttrs(raw) {
  const out = {}
  const source = String(raw || '').trim()
  if (!source) return out
  const parts = source.split(',')
  for (const part of parts) {
    const index = part.indexOf(':')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    let value = part.slice(index + 1).trim()
    if (!key) continue
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (value !== '' && !Number.isNaN(Number(value))) value = Number(value)
    out[key] = value
  }
  return out
}

function closestBlock(el) {
  return el && typeof el.closest === 'function' ? el.closest(BLOCK_SELECTOR) : null
}

export function resolveEchoTarget(hostEl, scope = 'prev-sibling') {
  if (!hostEl) return null
  const block = closestBlock(hostEl)
  const mode = String(scope || 'prev-sibling').toLowerCase()

  if (mode === 'next-line' || mode === 'next-block') {
    const next = block ? block.nextElementSibling : hostEl.nextElementSibling
    return next && !next.matches(ECHO_CHIP_SELECTOR) ? next : null
  }

  // inline 场景：标记前一个元素兄弟
  let target = hostEl.previousElementSibling
  if (target && target.matches(ECHO_CHIP_SELECTOR)) target = null

  // 整段场景：标记所在块的上一个块
  if (!target && block) target = block.previousElementSibling

  if (!target) return null
  // 目标包含标记时放弃，避免把标记清掉
  if (target.contains(hostEl)) return null
  return target
}

function ensureStyle(id, css) {
  if (typeof document === 'undefined') return
  let style = document.getElementById(id)
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  if (style.textContent !== css) style.textContent = css
}

function snapshotStyles(el) {
  const keys = ['display', 'position', 'width', 'height', 'overflow', 'whiteSpace', 'minHeight']
  const saved = {}
  keys.forEach(key => {
    saved[key] = el.style[key] || ''
  })
  return saved
}

function restoreStyles(el, saved) {
  Object.keys(saved).forEach(key => {
    el.style[key] = saved[key]
  })
}

/** 打字机：目标文本逐字展开 */
export function applyTypewriter(hostEl, props = {}) {
  const target = resolveEchoTarget(hostEl, props.scope)
  if (!target) return () => {}

  const fullText = (target.textContent || '').replace(/\s+/g, ' ').trim()
  if (!fullText) return () => {}

  const speed = Math.max(10, Math.min(200, Number(props.speed) || 50))
  const originalHTML = target.innerHTML
  const savedStyles = snapshotStyles(target)
  const rect = target.getBoundingClientRect()
  const width = rect.width || target.offsetWidth
  const height = rect.height || target.offsetHeight

  ensureStyle(TYPEWRITER_STYLE_ID, `
    @keyframes ag-blink-cursor { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    .ag-typewriter-cursor { display: inline-block; margin-left: 1px; animation: ag-blink-cursor 0.8s step-end infinite; }
  `)

  target.setAttribute('data-echo-effect', 'typewriter')
  target.style.display = 'inline-block'
  target.style.position = 'relative'
  target.style.width = width ? `${width}px` : ''
  target.style.height = height ? `${height}px` : ''
  target.style.overflow = 'hidden'
  target.style.whiteSpace = 'normal'
  target.innerHTML = ''

  const placeholder = document.createElement('span')
  placeholder.className = 'ag-typewriter-placeholder'
  placeholder.textContent = fullText
  placeholder.style.visibility = 'hidden'
  placeholder.style.display = 'inline'
  placeholder.style.whiteSpace = 'pre-wrap'
  placeholder.style.wordBreak = 'break-word'

  const overlay = document.createElement('span')
  overlay.className = 'ag-typewriter-overlay'
  overlay.style.position = 'absolute'
  overlay.style.top = '0'
  overlay.style.left = '0'
  overlay.style.width = '100%'
  overlay.style.height = '100%'
  overlay.style.overflow = 'hidden'
  overlay.style.pointerEvents = 'none'

  const typing = document.createElement('span')
  typing.className = 'ag-typewriter-typing'
  typing.style.display = 'inline'
  typing.style.whiteSpace = 'pre-wrap'
  typing.style.wordBreak = 'break-word'

  const cursor = document.createElement('span')
  cursor.className = 'ag-typewriter-cursor'
  cursor.textContent = '|'

  overlay.appendChild(typing)
  overlay.appendChild(cursor)
  target.appendChild(placeholder)
  target.appendChild(overlay)

  let index = 0
  let timer = null
  const step = () => {
    if (index >= fullText.length) {
      if (cursor.parentNode) cursor.parentNode.removeChild(cursor)
      timer = null
      return
    }
    typing.textContent = fullText.slice(0, index + 1)
    index += 1
    // 标点处略停顿，接近桌面端节奏
    const pause = /[，。！？；：,.!?;:]/.test(fullText[index - 1] || '') ? speed * 2.2 : speed
    timer = setTimeout(step, pause)
  }
  timer = setTimeout(step, speed)

  return () => {
    if (timer) clearTimeout(timer)
    timer = null
    target.innerHTML = originalHTML
    target.removeAttribute('data-echo-effect')
    restoreStyles(target, savedStyles)
  }
}

/** 弹幕：克隆目标文本，固定定位从右向左飘过 */
export function applyBarrage(hostEl, props = {}) {
  const target = resolveEchoTarget(hostEl, props.scope)
  if (!target) return () => {}

  const speed = Math.max(2, Math.min(20, Number(props.speed) || 8))
  const randomTop = props.randomTop !== false
  const fixedTop = String(props.top || '50px')

  ensureStyle(BARRAGE_STYLE_ID, `
    @keyframes ag-danmaku-scroll {
      0% { transform: translateX(100vw); }
      100% { transform: translateX(-100%); }
    }
  `)

  const clone = target.cloneNode(true)
  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
  clone.querySelectorAll(ECHO_CHIP_SELECTOR).forEach(node => node.remove())
  clone.setAttribute('data-barrage', 'true')
  clone.setAttribute('contenteditable', 'false')
  clone.style.position = 'fixed'
  clone.style.left = '0'
  clone.style.top = randomTop ? `${Math.floor(Math.random() * (window.innerHeight - 100))}px` : fixedTop
  clone.style.zIndex = '9999'
  clone.style.margin = '0'
  clone.style.whiteSpace = 'nowrap'
  clone.style.pointerEvents = 'none'
  clone.style.display = 'inline-block'
  clone.style.width = 'auto'
  clone.style.animation = `ag-danmaku-scroll ${speed}s linear forwards`

  document.body.appendChild(clone)
  target.setAttribute('data-echo-effect', 'barrage')

  let removed = false
  let fallbackTimer = null
  const remove = () => {
    if (removed) return
    removed = true
    if (fallbackTimer) clearTimeout(fallbackTimer)
    fallbackTimer = null
    if (clone.parentNode) clone.parentNode.removeChild(clone)
    target.removeAttribute('data-echo-effect')
  }
  clone.addEventListener('animationend', remove)
  // 动画事件可能因为标签页不可见 / 减少动效 / headless 而不触发，超时兜底移除
  fallbackTimer = setTimeout(remove, speed * 1000 + 1500)

  return remove
}

export const ECHO_FIELD_RENDERERS = {
  typewriter: applyTypewriter,
  barrage: applyBarrage,
}

/** field + 参数 → 应用效果，返回清理函数 */
export function applyEchoEffect(hostEl, echo, attrs = '') {
  const field = echo && echo.field ? String(echo.field) : ''
  const renderer = ECHO_FIELD_RENDERERS[field]
  if (!renderer) return () => {}
  const props = { ...(echo.defaultProps || {}), ...parseEchoAttrs(attrs) }
  return renderer(hostEl, props)
}

export default {
  parseEchoAttrs,
  resolveEchoTarget,
  applyTypewriter,
  applyBarrage,
  applyEchoEffect,
  ECHO_FIELD_RENDERERS,
}
