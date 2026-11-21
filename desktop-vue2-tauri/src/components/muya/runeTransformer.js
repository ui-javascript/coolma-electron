import './runeTransformer.css'

const HANDLE_POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
]

const HANDLE_RADIUS = 6
const MIN_WIDTH = 80
const MIN_HEIGHT = 40

const toPositiveNumber = value => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

// SVG 图表（例如 JSXGraph）内部常带 SVG <a> 节点；它不是普通 HTML 超链接，
// 不应阻止用户选中外层 Rune。只有真实的表单/编辑控件和 HTML <a> 自身保留交互。
const isInteractiveRuneTarget = (target, host) => {
  if (!target || !host) return false
  let current = target.nodeType === 1 ? target : target.parentElement
  while (current && current !== host) {
    if (/^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(current.tagName)) return true
    if (current.getAttribute && current.getAttribute('contenteditable') === 'true') return true
    if (typeof HTMLAnchorElement !== 'undefined' && current instanceof HTMLAnchorElement) return true
    current = current.parentElement
  }
  return false
}

/**
 * Rune 专用尺寸调整器。
 *
 * 和 Muya 的图片 Transformer 保持同样的交互方式，但不触碰
 * ContentState 的图片逻辑：拖动期间只改 Rune host 的 DOM 尺寸，松手后
 * 通过 onCommit 把尺寸写回 Rune 占位符 Markdown。
 */
class RuneTransformer {
  constructor (muya, { onCommit } = {}) {
    this.muya = muya
    this.onCommit = typeof onCommit === 'function' ? onCommit : null
    this.reference = null
    this.nodeId = ''
    this.status = false
    this.resizing = false
    this.movingAnchor = null
    this.startRect = null
    this.width = null
    this.height = null

    this.container = document.createElement('div')
    this.container.className = 'ag-rune-transformer'
    document.body.appendChild(this.container)

    this.handleClick = this.handleClick.bind(this)
    this.handleMouseDown = this.handleMouseDown.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleMouseUp = this.handleMouseUp.bind(this)
    this.handleScroll = this.handleScroll.bind(this)

    document.addEventListener('click', this.handleClick, true)
    document.addEventListener('mousedown', this.handleMouseDown, true)
    document.addEventListener('mousemove', this.handleMouseMove, true)
    document.addEventListener('mouseup', this.handleMouseUp, true)
    window.addEventListener('resize', this.handleScroll)
    this.muya?.container?.addEventListener('scroll', this.handleScroll)
    this.muya?.eventCenter?.dispatch('muya-float', this, false)
    console.info('[RuneTransformer] installed', {
      hasCommitCallback: !!this.onCommit,
      hasMemoMuya: !!this.muya?.options?.memoMuya
    })
  }

  handleClick (event) {
    if (this.resizing) return
    const target = event.target
    const host = target && typeof target.closest === 'function'
      ? target.closest('.ag-rune-placeholder-host')
      : null

    if (host && host.isConnected) {
      event.preventDefault()
      event.stopPropagation()
      console.info('[RuneTransformer] rune host clicked', {
        nodeId: host.dataset.runeNodeId || '',
        runeName: host.dataset.runeName || '',
        target: target.tagName,
        hostClassName: host.className
      })
      // Rune SFC 内的按钮、输入框等仍然交给组件自己处理。
      if (isInteractiveRuneTarget(target, host)) {
        console.info('[RuneTransformer] skipped interactive child')
        return
      }
      this.show(host)
      return
    }

    if (!target || !target.closest || !target.closest('.ag-rune-transformer')) {
      this.hide()
    }
  }

  handleMouseDown (event) {
    const target = event.target
    const handle = target && target.closest
      ? target.closest('.ag-rune-transformer .circle')
      : null
    if (!handle || !this.reference) return

    event.preventDefault()
    event.stopPropagation()
    this.movingAnchor = handle.getAttribute('data-position')
    this.startRect = this.reference.getBoundingClientRect()
    this.width = this.startRect.width
    this.height = this.startRect.height
    this.resizing = true
    console.info('[RuneTransformer] resize started', {
      nodeId: this.nodeId,
      anchor: this.movingAnchor,
      width: Math.round(this.width),
      height: Math.round(this.height)
    })
    this.muya?.eventCenter?.dispatch('muya-float', this, true)
  }

  handleMouseMove (event) {
    if (!this.resizing || !this.startRect || !this.movingAnchor || !this.reference) return

    const { left, right, top, bottom } = this.startRect
    const rawWidth = this.movingAnchor.indexOf('left') > -1
      ? right - event.clientX
      : event.clientX - left
    const height = this.movingAnchor.indexOf('top') > -1
      ? bottom - event.clientY
      : event.clientY - top

    const boundary = this.getResizeBoundary()
    const maxWidth = this.movingAnchor.indexOf('left') > -1
      ? right - boundary.left
      : boundary.right - left

    this.width = Math.max(MIN_WIDTH, Math.min(Math.round(rawWidth), Math.round(maxWidth)))
    this.height = Math.max(MIN_HEIGHT, Math.round(height))
    this.reference.style.width = `${this.width}px`
    this.reference.style.height = `${this.height}px`
    this.update()
  }

  handleMouseUp () {
    if (!this.resizing) return

    this.resizing = false
    if (this.nodeId && this.width && this.height) {
      console.info('[RuneTransformer] resize committed', {
        nodeId: this.nodeId,
        width: this.width,
        height: this.height
      })
      try {
        const payload = {
          nodeId: this.nodeId,
          width: this.width,
          height: this.height
        }
        const memoMuya = this.muya?.options?.memoMuya
        // 优先从当前 Muya 宿主动态取方法：HMR 后旧 Transformer 实例可能仍保存旧闭包，
        // 而 options.memoMuya 始终指向当前 Muya.vue 实例。
        const commit = this.muya?.options?.onRuneResize || memoMuya?.updateRunePlaceholderSize?.bind(memoMuya) || this.onCommit
        if (typeof commit !== 'function') {
          console.error('[RuneTransformer] no Rune resize commit handler', { payload, hasMemoMuya: !!memoMuya })
          return
        }
        const result = commit(payload)
        console.info('[RuneTransformer] resize onCommit returned', result)
      } catch (error) {
        console.error('[RuneTransformer] resize onCommit failed', error)
      }
    }
    this.movingAnchor = null
    this.startRect = null
    this.width = null
    this.height = null
    this.hide()
  }

  handleScroll () {
    if (this.status) this.update()
  }

  getResizeBoundary () {
    const host = this.reference
    const preview = host && typeof host.closest === 'function'
      ? host.closest('.ag-html-preview')
      : null
    const parent = preview || host?.parentElement || this.muya?.container
    const rect = parent?.getBoundingClientRect?.()
    if (!rect) {
      return {
        left: 0,
        right: document.documentElement?.clientWidth || window.innerWidth
      }
    }
    const computed = window.getComputedStyle(parent)
    const paddingLeft = parseFloat(computed.paddingLeft) || 0
    const paddingRight = parseFloat(computed.paddingRight) || 0
    return {
      left: rect.left + paddingLeft,
      right: rect.right - paddingRight
    }
  }

  show (host) {
    if (this.reference === host && this.status) {
      this.update()
      return
    }
    this.hide()
    this.reference = host
    this.nodeId = String(host.dataset.runeNodeId || '').trim()
    if (!this.nodeId) {
      console.warn('[RuneTransformer] refusing host without data-rune-node-id', host)
      return
    }

    const width = toPositiveNumber(host.dataset.runeWidth)
    const height = toPositiveNumber(host.dataset.runeHeight)
    if (width) host.style.width = `${width}px`
    if (height) host.style.height = `${height}px`

    HANDLE_POSITIONS.forEach(position => {
      const circle = document.createElement('div')
      circle.className = `circle ${position}`
      circle.setAttribute('data-position', position)
      this.container.appendChild(circle)
    })
    this.status = true
    this.update()
    console.info('[RuneTransformer] handles shown', {
      nodeId: this.nodeId,
      handleCount: this.container.querySelectorAll('.circle').length,
      rect: (() => {
        const rect = host.getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      })()
    })
    this.muya?.eventCenter?.dispatch('muya-float', this, true)
  }

  update () {
    if (!this.reference || !this.status) return
    const rect = this.reference.getBoundingClientRect()
    HANDLE_POSITIONS.forEach(position => {
      const circle = this.container.querySelector(`.${position}`)
      if (!circle) return
      const isLeft = position.indexOf('left') > -1
      const isTop = position.indexOf('top') > -1
      circle.style.left = `${(isLeft ? rect.left : rect.right) - HANDLE_RADIUS}px`
      circle.style.top = `${(isTop ? rect.top : rect.bottom) - HANDLE_RADIUS}px`
    })
  }

  hide () {
    Array.from(this.container.querySelectorAll('.circle')).forEach(circle => circle.remove())
    this.status = false
    this.resizing = false
    this.reference = null
    this.nodeId = ''
    this.muya?.eventCenter?.dispatch('muya-float', this, false)
  }

  destroy () {
    document.removeEventListener('click', this.handleClick, true)
    document.removeEventListener('mousedown', this.handleMouseDown, true)
    document.removeEventListener('mousemove', this.handleMouseMove, true)
    document.removeEventListener('mouseup', this.handleMouseUp, true)
    window.removeEventListener('resize', this.handleScroll)
    this.muya?.container?.removeEventListener('scroll', this.handleScroll)
    this.hide()
    if (this.container && this.container.parentNode) this.container.parentNode.removeChild(this.container)
  }
}

export default RuneTransformer
