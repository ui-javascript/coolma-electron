export const EVENTS = Object.freeze({
  REQUEST_ERROR: 'request.error',
  RELOGIN: 'relogin',
  INSERT_IMAGE: 'insert.image',
  INSERT_IMAGES: 'insert.images',
  INSERT_TEXT: 'insert.text',
  INSERT_AI_TEXT: 'insert.ai.text',
  REQUEST_AI_ECHO_HELP: 'request.ai.echo.help',
  REQUEST_AI_RUNE_HELP: 'request.ai.rune.help',
  SCROLL_TO_HEADER: 'scroll.to.header',
  SCROLL_DOWN: 'scroll.down',
  GENERATE_MINDMAP: 'generate.mindmap',
  UPDATE_WORD_COUNT: 'update.word.count',
  PARAGRAPH_SHORTCUT_CALL: 'paragraph.shortcut.call',
  EDIT_SHORTCUT_CALL: Object.freeze({
    undo: 'edit.shortcut.undo.call',
    redo: 'edit.shortcut.redo.call',
    save: 'edit.shortcut.save.call',
    copyAsMarkdown: 'edit.shortcut.copy.as.markdown.call',
    copyAsHtml: 'edit.shortcut.copy.as.html.call',
    pasteAsPlainText: 'edit.shortcut.paste.as.plainText.call',
    selectAll: 'edit.shortcut.selectAll.call',
    duplicate: 'edit.shortcut.duplicate.call',
    createParagraph: 'edit.shortcut.create.paragraph.call',
    deleteParagraph: 'edit.shortcut.delete.paragraph.call',
    insertParagraph: 'edit.shortcut.insert.paragraph.call',
    formatDocumentByPangu: 'edit.shortcut.format.document.by.pangu.call'
  }),
  FORMAT_SHORTCUT_CALL: 'format.shortcut.call',
  VIEW_SHORTCUT_CALL: Object.freeze({
    switchView: 'view.shortcut.switch.view.call',
    sourceMode: 'view.shortcut.source.code.call',
    lockMode: 'view.shortcut.lock.code.call'
  }),
  NOTE_SHORTCUT_CALL: Object.freeze({
    save: 'note.shortcut.save.call',
    searchNote: 'note.shortcut.search.note',
    exportNoteAsMarkdown: 'note.shortcut.export.markdown.call',
    exportNoteAsPNG: 'note.shortcut.export.png.call'
  }),
  UPDATE_EVENTS: Object.freeze({
    updateAvailable: 'update.events.update.available',
    updateNotAvailable: 'update.events.update.not.available',
    updateDownloading: 'update.events.update.downloading',
    updateDownloaded: 'update.events.update.downloaded',
    updateError: 'update.events.update.error'
  }),
  EDITOR_SCROLL: 'editor.scroll',
  NOTE_ITEM_CONTEXT_MENU: Object.freeze({
    rename: 'note.item.context.menu.rename',
    copyNote: 'note.item.context.menu.copyNote',
    copyMarkdownContent: 'note.item.context.menu.copyMarkdownContent',
    move: 'note.item.context.menu.move',
    exportNote: Object.freeze({
      markdown: 'note.item.context.menu.export.markdown',
      png: 'note.item.context.menu.export.png'
    }),
    flomo: 'note.item.context.menu.flomo',
    delete: 'note.item.context.menu.delete',
    openTierRankingForNote: 'note.item.context.menu.open.tier.ranking.for.note'
  }),
  SIDE_DRAWER_CONTEXT_MENU: Object.freeze({
    renameCategory: 'side.drawer.context.menu.rename.category',
    createCategory: 'side.drawer.context.menu.create.category',
    createNote: 'side.drawer.context.menu.create.note',
    delete: 'side.drawer.context.menu.delete.category',
    exportCategory: Object.freeze({
      markdown: 'side.drawer.context.menu.export.markdown'
    }),
    exportToBlog: 'side.drawer.context.menu.export.to.blog',
    copyMarkdown: 'side.drawer.context.menu.copy.markdown',
    openTierRanking: 'side.drawer.context.menu.open.tier.ranking',
    openTierRankingForCategory: 'side.drawer.context.menu.open.tier.ranking.for.category',
    openImport: 'side.drawer.context.menu.open.import'
  }),
  TAG_TREEMAP_RESIZE: 'tag.treemap.resize',
  MARK_MAP_CONTEXT_MENU: Object.freeze({
    saveAsPNG: 'mark.map.context.menu.save.as.png',
    saveAsSVG: 'mark.map.context.menu.save.as.svg',
    saveAsHTML: 'mark.map.context.menu.save.as.html'
  }),
  RENDER_EVENTS: Object.freeze({
    codeStyleUpdate: 'render.events.code.style.update'
  }),
  ECHO_EVENTS: Object.freeze({
    openManager: 'echo.events.open.manager',
    openInstanceEditor: 'echo.events.open.instance.editor',
    commitInstance: 'echo.events.commit.instance'
  }),
  UI_EVENTS: Object.freeze({
    playFireEffect: 'ui.events.play.fire.effect',
    playHeartEffect: 'ui.events.play.heart.effect',
    playButterflyEffect: 'ui.events.play.butterfly.effect'
  })
})