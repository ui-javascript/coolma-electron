import { EVENTS as events } from 'src/utils/const/eventsConst'
import { packClickFunction } from 'src/components/contextMenu/utils'

export const saveAsPNG = (menuItem, browserWindow) => {
  return packClickFunction(events.MARK_MAP_CONTEXT_MENU.saveAsPNG)
}

export const saveAsSVG = (menuItem, browserWindow) => {
  return packClickFunction(events.MARK_MAP_CONTEXT_MENU.saveAsSVG)
}

export const saveAsHTML = (menuItem, browserWindow) => {
  return packClickFunction(events.MARK_MAP_CONTEXT_MENU.saveAsHTML)
}
