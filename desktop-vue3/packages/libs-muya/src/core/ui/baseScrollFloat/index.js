import BaseFloat from '../baseFloat'
import { EVENT_KEYS } from '../../config'

class BaseScrollFloat extends BaseFloat {
  constructor (muya, name, options = {}) {
    super(muya, name, options)
    this.scrollElement = null
    this.reference = null
    this.activeItem = null
    this.columnsCount = 1 // Default to 1 column, override in subclasses
    this.createScrollElement()
  }

  createScrollElement () {
    const { container } = this
    const scrollElement = document.createElement('div')
    container.appendChild(scrollElement)
    this.scrollElement = scrollElement
  }

  activeEleScrollIntoView (ele) {
    if (ele) {
      ele.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'start'
      })
    }
  }

  listen () {
    super.listen()
    const { eventCenter, container } = this.muya
    const handler = event => {
      if (!this.status) return
      switch (event.key) {
        case EVENT_KEYS.ArrowUp:
          this.step('previous')
          event.preventDefault()
          event.stopPropagation()
          break
        case EVENT_KEYS.ArrowDown:
        case EVENT_KEYS.Tab:
          this.step('next')
          event.preventDefault()
          event.stopPropagation()
          break
        case EVENT_KEYS.ArrowLeft:
          this.step('left')
          event.preventDefault()
          event.stopPropagation()
          break
        case EVENT_KEYS.ArrowRight:
          this.step('right')
          event.preventDefault()
          event.stopPropagation()
          break
        case EVENT_KEYS.Enter:
          event.preventDefault()
          event.stopPropagation()
          this.selectItem(this.activeItem)
          return false
        default:
          break
      }
    }

    eventCenter.attachDOMEvent(container, 'keydown', handler)
  }

  hide () {
    super.hide()
    this.reference = null
  }

  show (reference, cb) {
    this.cb = cb
    if (reference instanceof HTMLElement) {
      if (this.reference && this.reference === reference && this.status) return
    } else {
      if (this.reference && this.reference.id === reference.id && this.status) return
    }

    this.reference = reference
    super.show(reference, cb)
  }

  step (direction) {
    let index = this.renderArray.findIndex(item => {
      return item === this.activeItem
    })

    const columns = this.columnsCount || 1
    const sectionOffsets = this.sectionOffsets || [0]
    const totalItems = this.renderArray.length

    // ============ 通用：计算当前位置信息 ============
    // 找到当前所在的分区
    let currentSectionIndex = 0
    for (let i = sectionOffsets.length - 1; i >= 0; i--) {
      if (index >= sectionOffsets[i]) {
        currentSectionIndex = i
        break
      }
    }

    const sectionStart = sectionOffsets[currentSectionIndex]
    const sectionEnd = currentSectionIndex + 1 < sectionOffsets.length
      ? sectionOffsets[currentSectionIndex + 1] - 1
      : totalItems - 1
    const sectionLength = sectionEnd - sectionStart + 1

    // 当前项在分区内的相对索引和行列位置
    const innerIndex = index - sectionStart
    const currentRow = Math.floor(innerIndex / columns)
    const currentCol = innerIndex % columns
    // 当前行有多少列（最后一行可能不满）
    const colsInCurrentRow = Math.min(columns, sectionLength - currentRow * columns)

    switch (direction) {
      // 上：跳到上一行同列
      case 'previous': {
        let targetIndex = index - columns
        if (targetIndex < sectionStart) {
          // 跳到上一分区末尾
          const prevSectionIndex = currentSectionIndex - 1
          if (prevSectionIndex >= 0) {
            const prevSectionStart = sectionOffsets[prevSectionIndex]
            const prevSectionEnd = sectionOffsets[currentSectionIndex] - 1
            const prevSectionLength = prevSectionEnd - prevSectionStart + 1
            const targetCol = Math.min(currentCol, prevSectionLength - 1)
            targetIndex = prevSectionEnd - targetCol
          }
        }
        if (targetIndex >= 0) index = targetIndex
        break
      }

      // 下：跳到下一行同列
      case 'next': {
        let targetIndex = index + columns
        if (targetIndex > sectionEnd) {
          // 跳到下一分区第一个
          const nextSectionIndex = currentSectionIndex + 1
          if (nextSectionIndex < sectionOffsets.length) {
            targetIndex = sectionOffsets[nextSectionIndex]
          } else {
            // 循环到开头
            targetIndex = sectionOffsets[0]
          }
        }
        if (targetIndex < totalItems) index = targetIndex
        break
      }

      // 左：跳到同行左边一列（跨分区时回到上一分区末尾）
      case 'left': {
        let newCol = currentCol - 1
        let targetRow = currentRow
        let targetSection = currentSectionIndex

        if (newCol < 0) {
          // 移到上一行
          targetRow = currentRow - 1
          if (targetRow < 0) {
            // 移到上一分区末尾
            targetSection = currentSectionIndex - 1
            if (targetSection < 0) {
              // 循环到底部最后一个分区
              targetSection = sectionOffsets.length - 1
            }
          }
        }

        if (targetSection !== currentSectionIndex) {
          // 跨分区：计算目标分区的行数和最后一行列数
          const targetSectionStart = sectionOffsets[targetSection]
          const targetSectionEnd = targetSection + 1 < sectionOffsets.length
            ? sectionOffsets[targetSection + 1] - 1
            : totalItems - 1
          const targetSectionLength = targetSectionEnd - targetSectionStart + 1
          const targetColsInRow = Math.min(columns, targetSectionLength - targetRow * columns)
          newCol = targetColsInRow - 1 // 取该行最后一列
          index = targetSectionEnd
        } else {
          index = sectionStart + targetRow * columns + newCol
        }
        break
      }

      // 右：跳到同行右边一列（跨分区时进入下一分区开头）
      case 'right': {
        let newCol = currentCol + 1
        let targetRow = currentRow
        let targetSection = currentSectionIndex

        if (newCol >= colsInCurrentRow) {
          // 移到下一行
          targetRow = currentRow + 1
          newCol = 0
          // 检查是否超出当前分区
          if (targetRow * columns + newCol >= sectionLength) {
            // 移到下一分区开头
            targetSection = currentSectionIndex + 1
            if (targetSection >= sectionOffsets.length) {
              // 循环到开头
              targetSection = 0
              newCol = 0
              targetRow = 0
            } else {
              newCol = 0
              targetRow = 0
            }
          }
        }

        if (targetSection !== currentSectionIndex) {
          index = sectionOffsets[targetSection]
        } else {
          index = sectionStart + targetRow * columns + newCol
        }
        break
      }

      default:
        return
    }

    if (index >= 0 && index < totalItems) {
      this.activeItem = this.renderArray[index]
      this.render()
      const activeEle = this.getItemElement(this.activeItem)
      this.activeEleScrollIntoView(activeEle)
    }
  }

  selectItem (item) {
    const { cb } = this
    cb(item)
    // delay hide to avoid dispatch enter hander
    setTimeout(this.hide.bind(this))
  }

  getItemElement () {}
}

export default BaseScrollFloat
