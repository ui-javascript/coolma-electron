import * as contextMenu from './actions.js'

export const OPEN_TIER_RANKING = {
  label: 'openTierRanking',
  id: 'openTierRankingMenuItem',
  click: contextMenu.openTierRanking()
}

export const OPEN_TIER_RANKING_FOR_CATEGORY = {
  label: 'openTierRankingForCategory',
  id: 'openTierRankingForCategoryMenuItem',
  click: contextMenu.openTierRankingForCategory()
}

export const RENAME = {
  label: 'rename',
  id: 'renameCategoryMenuItem',
  click: contextMenu.renameCategory()
}

export const CREATE_CATEGORY = {
  label: 'createCategory',
  id: 'createCategoryMenuItem',
  click: contextMenu.createCategory()
}

export const CREATE_NOTE = {
  label: 'createNote',
  id: 'createNoteMenuItem',
  click: contextMenu.createNote()
}

export const OPEN_IMPORT = {
  label: 'import',
  id: 'openImportMenuItem',
  click: contextMenu.openImport()
}

export const EXPORT = {
  label: 'export',
  id: 'exportCategoryMenuItem',
  submenu: [
    {
      label: 'Markdown',
      id: 'exportCategoryAsMarkdownMenuItem',
      click: contextMenu.exportCategoryAsMarkdown()
    }
  ]
}

export const EXPORT_TO_BLOG = {
  label: 'exportToBlog',
  id: 'exportToBlogMenuItem',
  click: contextMenu.exportToBlog()
}

export const COPY_MARKDOWN = {
  label: 'copyMarkdown',
  id: 'copyMarkdownMenuItem',
  click: contextMenu.copyMarkdown()
}

export const DELETE = {
  label: 'delete',
  id: 'deleteFolderMenuItem',
  click: contextMenu.deleteCategory()
}

export const SEPARATOR = {
  type: 'separator'
}
