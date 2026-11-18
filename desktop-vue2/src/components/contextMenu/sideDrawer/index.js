import {
  OPEN_TIER_RANKING,
  OPEN_TIER_RANKING_FOR_CATEGORY,
  // RENAME,
  CREATE_CATEGORY,
  CREATE_NOTE,
  OPEN_IMPORT,
  EXPORT,
  EXPORT_TO_BLOG,
  COPY_MARKDOWN,
  DELETE,
  SEPARATOR
} from './menuItems.js'
import { i18n } from 'boot/i18n'
import helper from 'src/utils/helper'
import { popContextMenu } from 'src/ApiInvoker'

/**
 * Show editor context menu.
 *
 * @param {MouseEvent} event The native mouse event.
 * @param {boolean} isCurrentCategory
 * @param {string} category
 * @param {boolean} isLogin Whether user is logged in
 */
export const showContextMenu = (event, isCurrentCategory, category, isLogin, options = {}) => {
  const isRootCategory = helper.isNullOrEmpty(category)
  const {
    hideCreateCategory = false,
    hideCreateNote = false
  } = options

  // 根目录禁用导出和删除
  EXPORT.enabled = !isRootCategory
  DELETE.enabled = !isRootCategory

  const ITEMS = []

  // 离线未登录时，隐藏创建文件夹、导入、导出选项
  if (isLogin) {
    // ✅ 第一组：创建操作（创建文件夹 + 创建笔记）
    if (!hideCreateCategory) {
      ITEMS.push(CREATE_CATEGORY)
    }
    if (!hideCreateNote) {
      ITEMS.push(CREATE_NOTE)
    }

    // ✅ 第二组：导入导出（独立组，加分隔线）
    ITEMS.push(SEPARATOR)
    ITEMS.push(OPEN_IMPORT)
    ITEMS.push(EXPORT)
  } else {
    // 未登录时只显示创建笔记和创建文件夹（均走本地 SQLite）
    if (!hideCreateCategory) {
      ITEMS.push(CREATE_CATEGORY)
    }
    if (!hideCreateNote) {
      ITEMS.push(CREATE_NOTE)
    }
  }

  // ✅ 第三组：从夯到拉（独立组，加分隔线）
  if (isLogin) {
    ITEMS.push(SEPARATOR)
    // 文件夹模式：带文件夹路径参数
    ITEMS.push(OPEN_TIER_RANKING_FOR_CATEGORY)
  }

  // ✅ 第四组：导出到博客（独立组，加分隔线）
  if (isLogin) {
    ITEMS.push(SEPARATOR)
    ITEMS.push(EXPORT_TO_BLOG)
    ITEMS.push(COPY_MARKDOWN)
  }

  // ✅ 第五组：删除（独立组，加分隔线）
  if (!isRootCategory) {
    ITEMS.push(SEPARATOR)
    ITEMS.push(DELETE)
  }

  const MENU_ITEM = ITEMS.map(item => {
    if (item.type === 'separator') return item
    return {
      ...item,
      label: i18n.t(item.label)
    }
  })

  popContextMenu({
    x: event.clientX,
    y: event.clientY,
    menuItems: MENU_ITEM,
    contextData: { category }
  }).then(console.log)
}
