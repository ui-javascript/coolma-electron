import { EVENTS as events } from 'src/utils/const/eventsConst'
import { packClickFunction } from 'src/components/contextMenu/utils'

export const rename = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_ITEM_CONTEXT_MENU.rename)
}

export const copyNote = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_ITEM_CONTEXT_MENU.copyNote)
}

export const copyMarkdownContent = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_ITEM_CONTEXT_MENU.copyMarkdownContent)
}

export const move = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_ITEM_CONTEXT_MENU.move)
}

export const exportAsMarkdown = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_SHORTCUT_CALL.exportNoteAsMarkdown)
}

export const exportAsPNG = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_SHORTCUT_CALL.exportNoteAsPNG)
}

export const deleteNote = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_ITEM_CONTEXT_MENU.delete)
}

export const openTierRankingForNote = (menuItem, browserWindow) => {
  return packClickFunction(events.NOTE_ITEM_CONTEXT_MENU.openTierRankingForNote)
}
