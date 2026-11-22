/**
 * Rune 专用尺寸调整器（移植 vue2 `runeTransformer.js`）。
 *
 * 交互与 vue2 一致：点击 Rune 卡片 → 四角出现控制点 → 拖动改 host 尺寸 →
 * 松手把 `data-rune-width/height` 写回 Markdown，其它属性保持不动。
 *
 * 与 Muya 图片 Transformer 的区别：这里不碰 ContentState，拖动期间只改 DOM，
 * 落点在应用层回调，避免尺寸变更进入图片节点的撤销/重做栈。
 */

const HANDLE_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
type HandlePosition = (typeof HANDLE_POSITIONS)[number]

const HANDLE_RADIUS = 6
const MIN_WIDTH = 80
const MIN_HEIGHT = 40
const RUNE_HOST_SELECTOR = '.ag-rune-placeholder-host'
const RUNE_TRANSFORMER_SELECTOR = '.ag-rune-transformer'

export interface RuneResizePayload {
  nodeId: string
  width: number
  height: number
  /** 相对文档流的视觉位移，写回 data-rune-offset-x/y；0 表示无偏移。 */
  offsetX: number
  offsetY: number
}

export interface RuneTransformerOptions {
  /** 只读 / 锁定态下仍显示控制点会让人误以为可改，这里交给应用判断。 */
  canEdit?: () => boolean
  /** 返回 true 表示尺寸已写回正文；false 时把拖动期间的 DOM 尺寸复原。 */
  onCommit?: (payload: RuneResizePayload) => boolean
  /** 编辑器实际滚动容器，滚动时重新贴齐控制点。 */
  scrollContainer?: HTMLElement | null
}

const toPositiveNumber = (value: unknown): number | null => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

const toInteger = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : null
}

// SVG 图表内部常有 SVG <a>；它不是 HTML 超链接，不应阻止用户选中外层 Rune。
// 只有真实表单控件、contenteditable 和 HTML <a> 保留自身交互。
const isInteractiveRuneTarget = (target: Element | null, host: HTMLElement): boolean => {
  if (!target || !host) return false
  let current: Element | null = target
  while (current && current !== host) {
    const tag = current.tagName
    if (/^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(tag)) return true
    if (current.getAttribute && current.getAttribute('contenteditable') === 'true') return true
    if (typeof HTMLAnchorElement !== 'undefined' && current instanceof HTMLAnchorElement) return true
    current = current.parentElement
  }
  return false
}

interface OriginGeometry {
  widthStyle: string
  heightStyle: string
  translateStyle: string
  widthAttr: string | null
  heightAttr: string | null
  offsetXAttr: string | null
  offsetYAttr: string | null
}

export class RuneTransformer {
  private readonly options: RuneTransformerOptions
  private readonly container: HTMLElement
  private reference: HTMLElement | null = null
  private nodeId = ''
  private status = false
  private resizing = false
  private moved = false
  private movingAnchor: HandlePosition | null = null
  private startRect: DOMRect | null = null
  private baseLeft = 0
  private baseTop = 0
  private offsetX = 0
  private offsetY = 0
  private width = 0
  private height = 0
  private origin: OriginGeometry | null = null
  private suppressClickUntil = 0
  private readonly scrollContainer: HTMLElement | null

  constructor(muya: any, options: RuneTransformerOptions = {}) {
    this.options = options
    this.scrollContainer = options.scrollContainer || (muya?.container as HTMLElement | null) || null

    this.container = document.createElement('div')
    this.container.className = 'ag-rune-transformer'
    this.container.setAttribute('aria-hidden', 'true')
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
    window.addEventListener('blur', this.handleMouseUp)
    this.scrollContainer?.addEventListener('scroll', this.handleScroll, { passive: true })
  }

  private canEdit(): boolean {
    return this.options.canEdit ? this.options.canEdit() : true
  }

  private handleClick(event: MouseEvent): void {
    if (this.resizing || Date.now() < this.suppressClickUntil) return
    const target = event.target instanceof Element
      ? event.target
      : (event.target as Node | null)?.parentElement ?? null
    if (!target) return

    const host = target.closest(RUNE_HOST_SELECTOR) as HTMLElement | null
    if (host && host.isConnected) {
      if (!this.canEdit()) return
      // 卡片里的按钮/输入框/链接先放行，避免 SFC 自身交互被吃掉。
      if (isInteractiveRuneTarget(target, host)) return
      event.preventDefault()
      event.stopPropagation()
      this.show(host)
      return
    }

    if (!target.closest(RUNE_TRANSFORMER_SELECTOR)) {
      this.hide()
    }
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : null
    const handle = target?.closest(`${RUNE_TRANSFORMER_SELECTOR} .circle`) as HTMLElement | null
    if (!handle || !this.reference) return

    event.preventDefault()
    event.stopPropagation()
    this.movingAnchor = handle.getAttribute('data-position') as HandlePosition | null
    if (!this.movingAnchor) return

    this.startRect = this.reference.getBoundingClientRect()
    this.width = this.startRect.width
    this.height = this.startRect.height
    this.offsetX = toInteger(this.reference.dataset.runeOffsetX) ?? 0
    this.offsetY = toInteger(this.reference.dataset.runeOffsetY) ?? 0
    // getBoundingClientRect 已包含 translate；减掉它得到文档流里的未偏移左上角。
    this.baseLeft = this.startRect.left - this.offsetX
    this.baseTop = this.startRect.top - this.offsetY
    this.origin = {
      widthStyle: this.reference.style.width,
      heightStyle: this.reference.style.height,
      translateStyle: this.reference.style.translate,
      widthAttr: this.reference.getAttribute('data-rune-width'),
      heightAttr: this.reference.getAttribute('data-rune-height'),
      offsetXAttr: this.reference.getAttribute('data-rune-offset-x'),
      offsetYAttr: this.reference.getAttribute('data-rune-offset-y'),
    }
    this.resizing = true
    this.moved = false
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.resizing || !this.startRect || !this.movingAnchor || !this.reference) return

    const { right, bottom } = this.startRect
    const boundary = this.getResizeBoundary()

    if (this.movingAnchor.indexOf('left') > -1) {
      // 左边跟手：右边界留在原地，宽度减少多少，就向左位移多少。
      const minLeft = boundary.left
      const maxLeft = right - MIN_WIDTH
      const nextLeft = Math.max(minLeft, Math.min(Math.round(event.clientX), Math.round(maxLeft)))
      this.width = Math.max(MIN_WIDTH, Math.round(right - nextLeft))
      this.offsetX = Math.round(nextLeft - this.baseLeft)
    } else {
      // 右边跟手：左边保持不动，只改宽度。
      const visualLeft = this.baseLeft + this.offsetX
      const maxWidth = Math.max(MIN_WIDTH, Math.round(boundary.right - visualLeft))
      this.width = Math.max(MIN_WIDTH, Math.min(Math.round(event.clientX - visualLeft), maxWidth))
    }

    if (this.movingAnchor.indexOf('top') > -1) {
      // 上边跟手：下边界留在原地，高度减少多少，就向上位移多少。
      const maxTop = bottom - MIN_HEIGHT
      const nextTop = Math.max(boundary.top, Math.min(Math.round(event.clientY), Math.round(maxTop)))
      this.height = Math.max(MIN_HEIGHT, Math.round(bottom - nextTop))
      this.offsetY = Math.round(nextTop - this.baseTop)
    } else {
      // 下边跟手：上边保持不动，只改高度。
      const visualTop = this.baseTop + this.offsetY
      this.height = Math.max(MIN_HEIGHT, Math.round(event.clientY - visualTop))
    }

    this.moved = true
    this.applyHostGeometry(this.reference, this.width, this.height, this.offsetX, this.offsetY)
    this.update()
  }

  private handleMouseUp(): void {
    if (!this.resizing) return
    this.resizing = false
    this.suppressClickUntil = Date.now() + 250

    const host = this.reference
    const nodeId = this.nodeId
    if (host && nodeId && this.width && this.height && this.moved) {
      try {
        const committed = this.options.onCommit?.({
          nodeId,
          width: this.width,
          height: this.height,
          offsetX: this.offsetX,
          offsetY: this.offsetY,
        })
        if (committed === false) {
          this.restoreOriginGeometry(host)
        }
      } catch (error) {
        this.restoreOriginGeometry(host)
        console.error('[RuneTransformer] resize commit failed', error)
      }
    }

    this.movingAnchor = null
    this.startRect = null
    this.baseLeft = 0
    this.baseTop = 0
    this.offsetX = 0
    this.offsetY = 0
    this.width = 0
    this.height = 0
    this.moved = false
    this.origin = null
    this.hide()
  }

  private handleScroll(): void {
    if (this.status) this.update()
  }

  private getResizeBoundary(): { left: number; right: number; top: number } {
    const host = this.reference
    const parent = host?.parentElement || this.scrollContainer
    const rect = parent?.getBoundingClientRect?.()
    const scrollRect = this.scrollContainer?.getBoundingClientRect?.()
    if (!rect && !scrollRect) {
      return {
        left: 0,
        right: document.documentElement?.clientWidth || window.innerWidth,
        top: 0,
      }
    }
    const scrollComputed = scrollRect && this.scrollContainer
      ? window.getComputedStyle(this.scrollContainer)
      : null
    const scrollPaddingLeft = parseFloat(scrollComputed?.paddingLeft || '0') || 0
    const scrollPaddingRight = parseFloat(scrollComputed?.paddingRight || '0') || 0
    const scrollPaddingTop = parseFloat(scrollComputed?.paddingTop || '0') || 0
    // 横向用编辑器可视区而不是段落正文列：正文列居中留白，左/上拖拽需要这块留白才跟得动。
    if (scrollRect) {
      return {
        left: scrollRect.left + scrollPaddingLeft,
        right: scrollRect.right - scrollPaddingRight,
        top: scrollRect.top + scrollPaddingTop,
      }
    }
    const computed = window.getComputedStyle(parent as Element)
    const paddingLeft = parseFloat(computed.paddingLeft) || 0
    const paddingRight = parseFloat(computed.paddingRight) || 0
    return {
      left: rect!.left + paddingLeft,
      right: rect!.right - paddingRight,
      top: rect!.top,
    }
  }

  private applyHostGeometry(
    host: HTMLElement,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
  ): void {
    host.style.boxSizing = 'border-box'
    host.style.width = `${width}px`
    host.style.height = `${height}px`
    // 让 CSS 的 [data-rune-width] > * 在拖动过程中立即把内层卡片铺满。
    host.dataset.runeWidth = String(width)
    host.dataset.runeHeight = String(height)
    host.style.translate = offsetX || offsetY ? `${offsetX}px ${offsetY}px` : ''
  }

  private restoreOriginGeometry(host: HTMLElement): void {
    if (!this.origin) return
    host.style.width = this.origin.widthStyle
    host.style.height = this.origin.heightStyle
    host.style.translate = this.origin.translateStyle
    if (this.origin.widthAttr === null) delete host.dataset.runeWidth
    else host.dataset.runeWidth = this.origin.widthAttr
    if (this.origin.heightAttr === null) delete host.dataset.runeHeight
    else host.dataset.runeHeight = this.origin.heightAttr
    if (this.origin.offsetXAttr === null) delete host.dataset.runeOffsetX
    else host.dataset.runeOffsetX = this.origin.offsetXAttr
    if (this.origin.offsetYAttr === null) delete host.dataset.runeOffsetY
    else host.dataset.runeOffsetY = this.origin.offsetYAttr
  }

  private show(host: HTMLElement): void {
    if (this.reference === host && this.status) {
      this.update()
      return
    }
    this.hide()

    const nodeId = String(host.dataset.runeNodeId || '').trim()
    if (!nodeId) return

    this.reference = host
    this.nodeId = nodeId
    const width = toPositiveNumber(host.dataset.runeWidth)
    const height = toPositiveNumber(host.dataset.runeHeight)
    const offsetX = toInteger(host.dataset.runeOffsetX) ?? 0
    const offsetY = toInteger(host.dataset.runeOffsetY) ?? 0
    if (width) host.style.width = `${width}px`
    if (height) host.style.height = `${height}px`
    host.style.translate = offsetX || offsetY ? `${offsetX}px ${offsetY}px` : ''

    if (!this.container.childElementCount) {
      HANDLE_POSITIONS.forEach((position) => {
        const circle = document.createElement('div')
        circle.className = `circle ${position}`
        circle.setAttribute('data-position', position)
        this.container.appendChild(circle)
      })
    }

    this.status = true
    this.update()
  }

  private update(): void {
    if (!this.reference || !this.status) return
    const rect = this.reference.getBoundingClientRect()
    HANDLE_POSITIONS.forEach((position) => {
      const circle = this.container.querySelector(`.${position}`) as HTMLElement | null
      if (!circle) return
      const isLeft = position.indexOf('left') > -1
      const isTop = position.indexOf('top') > -1
      circle.style.left = `${(isLeft ? rect.left : rect.right) - HANDLE_RADIUS}px`
      circle.style.top = `${(isTop ? rect.top : rect.bottom) - HANDLE_RADIUS}px`
    })
  }

  hide(): void {
    Array.from(this.container.querySelectorAll('.circle')).forEach((circle) => circle.remove())
    this.status = false
    this.resizing = false
    this.reference = null
    this.nodeId = ''
    this.baseLeft = 0
    this.baseTop = 0
    this.offsetX = 0
    this.offsetY = 0
    this.origin = null
  }

  destroy(): void {
    document.removeEventListener('click', this.handleClick, true)
    document.removeEventListener('mousedown', this.handleMouseDown, true)
    document.removeEventListener('mousemove', this.handleMouseMove, true)
    document.removeEventListener('mouseup', this.handleMouseUp, true)
    window.removeEventListener('resize', this.handleScroll)
    window.removeEventListener('blur', this.handleMouseUp)
    this.scrollContainer?.removeEventListener('scroll', this.handleScroll)
    this.hide()
    this.container.remove()
  }
}

export default RuneTransformer
