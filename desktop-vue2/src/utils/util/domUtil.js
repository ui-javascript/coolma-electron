/**
 * 通用 DOM 工具
 *
 * 滚动 / 平台判定 / 文件名提取等 DOM/平台相关方法。
 * 任何 .vue / .js 中都可以通过 `this.$utils.domUtil.xxx()` 调用。
 */

import { Platform } from 'quasar'

/**
 * 兼容 Windows 与 macOS 的 Ctrl 键判断
 * @param {KeyboardEvent | MouseEvent} event
 * @returns {boolean}
 */
export function isCtrl (event) {
  if (Platform.is.mac) {
    return event.metaKey && !event.ctrlKey
  }
  return !event.metaKey && event.ctrlKey
}

/**
 * 获取文件名（含扩展名）
 * @param {string} filePath
 * @returns {string}
 */
export function getFileNameWithExt (filePath) {
  if (!filePath) return ''
  const index = filePath.lastIndexOf('/')
  return filePath.substr(index + 1)
}

/**
 * 缓动动画滚动
 * @param {HTMLElement} element
 * @param {number} to
 * @param {number} duration
 * @param {() => void} [callback]
 */
export function animatedScrollTo (element, to, duration, callback) {
  const start = element.scrollTop
  const change = to - start
  const animationStart = +new Date()
  let animating = true
  let lastPos = null
  const easeInOutQuad = function (t, b, c, d) {
    t /= d / 2
    if (t < 1) return c / 2 * t * t + b
    t--
    return -c / 2 * (t * (t - 2) - 1) + b
  }

  const animateScroll = function () {
    if (!animating) return
    requestAnimationFrame(animateScroll)
    const now = +new Date()
    const val = Math.floor(easeInOutQuad(now - animationStart, start, change, duration))
    if (lastPos) {
      if (lastPos === element.scrollTop) {
        lastPos = val
        element.scrollTop = val
      } else {
        animating = false
      }
    } else {
      lastPos = val
      element.scrollTop = val
    }
    if (now > animationStart + duration) {
      element.scrollTop = to
      animating = false
      if (callback) callback()
    }
  }
  requestAnimationFrame(animateScroll)
}