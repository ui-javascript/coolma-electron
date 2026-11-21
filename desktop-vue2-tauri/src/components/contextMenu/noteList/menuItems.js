import * as contextMenu from './actions.js'

export const RENAME = {
  label: 'rename',
  id: 'renameMenuItem',
  click: contextMenu.rename()
}

export const COPY_NOTE = {
  label: 'copyNote',
  id: 'copyNoteMenuItem',
  click: contextMenu.copyNote()
}

export const COPY_MARKDOWN_CONTENT = {
  label: 'copyMarkdownContent',
  id: 'copyMarkdownContentMenuItem',
  click: contextMenu.copyMarkdownContent()
}

export const MOVE = {
  label: 'move',
  id: 'moveNoteMenuItem',
  click: contextMenu.move()
}

export const EXPORT = {
  label: 'export',
  id: 'exportNoteMenuItem', // not used yet!
  submenu: [
    {
      label: 'Markdown',
      id: 'exportAsMarkdownMenuItem',
      click: contextMenu.exportAsMarkdown()
    },
    {
      label: 'PNG',
      id: 'exportAsPNGMenuItem',
      click: contextMenu.exportAsPNG()
    }
  ]
}

export const OPEN_TIER_RANKING_FOR_NOTE = {
  label: 'openTierRankingForNote',
  id: 'openTierRankingForNoteMenuItem',
  click: contextMenu.openTierRankingForNote()
}

export const DELETE = {
  label: 'delete',
  id: 'deleteNoteMenuItem',
  click: contextMenu.deleteNote()
}

export const SEPARATOR = {
  type: 'separator'
}
