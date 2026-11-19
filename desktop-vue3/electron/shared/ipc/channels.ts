/**
 * IPC channel registry.
 *
 * Keep this file free of Electron / Node imports: it is bundled into both the
 * main process and the renderer. Channel names follow electron-egg's
 * `controller/<file>/<method>` convention.
 */
export const IPC_CHANNELS = {
  app: {
    info: 'controller/app/info',
  },
  window: {
    minimize: 'controller/window/minimize',
    state: 'controller/window/state',
    toggleMaximize: 'controller/window/toggleMaximize',
    close: 'controller/window/close',
  },
  notes: {
    list: 'controller/notes/list',
    stats: 'controller/notes/stats',
    get: 'controller/notes/get',
    create: 'controller/notes/create',
    update: 'controller/notes/update',
    remove: 'controller/notes/remove',
    exportMarkdown: 'controller/notes/exportMarkdown',
    exportMarkdownFolder: 'controller/notes/exportMarkdownFolder',
    exportPng: 'controller/notes/exportPng',
  },
  categories: {
    list: 'controller/categories/list',
    create: 'controller/categories/create',
    remove: 'controller/categories/remove',
  },
  attachments: {
    saveImage: 'controller/attachments/saveImage',
    dir: 'controller/attachments/dir',
  },
  tags: {
    list: 'controller/tags/list',
    create: 'controller/tags/create',
    remove: 'controller/tags/remove',
    syncIndex: 'controller/tags/syncIndex',
  },
  settings: {
    all: 'controller/settings/all',
    get: 'controller/settings/get',
    set: 'controller/settings/set',
    remove: 'controller/settings/remove',
  },
  diagnostics: {
    run: 'controller/diagnostics/run',
  },
  sync: {
    pending: 'controller/sync/pending',
  },
  library: {
    runes: 'controller/library/runes',
    echoes: 'controller/library/echoes',
    runeSave: 'controller/library/runeSave',
    runeSaveMany: 'controller/library/runeSaveMany',
    runeRemove: 'controller/library/runeRemove',
    echoSave: 'controller/library/echoSave',
    echoSaveMany: 'controller/library/echoSaveMany',
    echoRemove: 'controller/library/echoRemove',
  },
  ai: {
    models: 'controller/ai/models',
    saveModel: 'controller/ai/saveModel',
    removeModel: 'controller/ai/removeModel',
    setDefaultModel: 'controller/ai/setDefaultModel',
    testModel: 'controller/ai/testModel',
    skills: 'controller/ai/skills',
    saveSkill: 'controller/ai/saveSkill',
    removeSkill: 'controller/ai/removeSkill',
  },
  packs: {
    preview: 'controller/packs/preview',
    commit: 'controller/packs/commit',
    fetchRemote: 'controller/packs/fetchRemote',
    exportFile: 'controller/packs/exportFile',
  },
  templates: {
    list: 'controller/templates/list',
    save: 'controller/templates/save',
    saveMany: 'controller/templates/saveMany',
    remove: 'controller/templates/remove',
  },
  database: {
    status: 'controller/database/status',
    importLegacy: 'controller/database/importLegacy',
    backup: 'controller/database/backup',
    backups: 'controller/database/backups',
    restore: 'controller/database/restore',
    openFolder: 'controller/database/openFolder',
  },
} as const;

export const INVOKE_CHANNELS = new Set<string>([
  IPC_CHANNELS.app.info,
  IPC_CHANNELS.window.minimize,
  IPC_CHANNELS.window.state,
  IPC_CHANNELS.window.toggleMaximize,
  IPC_CHANNELS.window.close,
  IPC_CHANNELS.notes.list,
  IPC_CHANNELS.notes.stats,
  IPC_CHANNELS.notes.get,
  IPC_CHANNELS.notes.create,
  IPC_CHANNELS.notes.update,
  IPC_CHANNELS.notes.remove,
  IPC_CHANNELS.categories.list,
  IPC_CHANNELS.categories.create,
  IPC_CHANNELS.categories.remove,
  IPC_CHANNELS.tags.list,
  IPC_CHANNELS.tags.create,
  IPC_CHANNELS.tags.remove,
  IPC_CHANNELS.settings.all,
  IPC_CHANNELS.settings.get,
  IPC_CHANNELS.settings.set,
  IPC_CHANNELS.settings.remove,
  IPC_CHANNELS.database.status,
  IPC_CHANNELS.database.importLegacy,
  IPC_CHANNELS.database.backup,
  IPC_CHANNELS.database.openFolder,
  IPC_CHANNELS.diagnostics.run,
  IPC_CHANNELS.sync.pending,
  IPC_CHANNELS.library.runes,
  IPC_CHANNELS.library.echoes,
  IPC_CHANNELS.ai.models,
  IPC_CHANNELS.ai.saveModel,
  IPC_CHANNELS.ai.removeModel,
  IPC_CHANNELS.ai.setDefaultModel,
  IPC_CHANNELS.ai.testModel,
  IPC_CHANNELS.ai.skills,
  IPC_CHANNELS.ai.saveSkill,
  IPC_CHANNELS.ai.removeSkill,
  IPC_CHANNELS.packs.preview,
  IPC_CHANNELS.packs.commit,
  IPC_CHANNELS.packs.fetchRemote,
  IPC_CHANNELS.packs.exportFile,
  IPC_CHANNELS.templates.list,
  IPC_CHANNELS.templates.save,
  IPC_CHANNELS.templates.saveMany,
  IPC_CHANNELS.templates.remove,
]);

/**
 * Main -> renderer push events. Add channels here and in the preload bridge
 * before exposing them to the renderer.
 */
export const EVENT_CHANNELS = new Set<string>();
