import {
  RENAME,
  COPY_NOTE,
  COPY_MARKDOWN_CONTENT,
  MOVE,
  EXPORT,
  OPEN_TIER_RANKING_FOR_NOTE,
  DELETE,
  SEPARATOR
} from './menuItems.js'
import { i18n } from 'boot/i18n'
import { popContextMenu } from 'src/ApiInvoker'

/**
 * Show note item context menu.
 *
 * @param {MouseEvent} event The native mouse event.
 * @param {string} isCurrentNote
 * @param {Object} noteData - Optional note data for tier ranking
 */
export const showContextMenu = (event, isCurrentNote, noteData = {}) => {
  const ITEMS = [
    RENAME,
    COPY_NOTE,
    COPY_MARKDOWN_CONTENT,
    SEPARATOR,
    MOVE,
    EXPORT,
    SEPARATOR,
    OPEN_TIER_RANKING_FOR_NOTE,
    SEPARATOR,
    DELETE
  ]
  EXPORT.enabled = isCurrentNote
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
    contextData: { noteData }
  }).then(console.log)
}
