import { contextBridge, ipcRenderer } from 'electron';
import type { CoolmaApi, IpcResult } from '../shared/ipc/contract';

/**
 * This preload runs with `sandbox: true`, so it must not require local modules.
 * Keep the allowlist inline and mirror it in `electron/shared/ipc/channels.ts`.
 */
const INVOKE_CHANNELS = new Set<string>([
  'controller/app/info',
  'controller/app/updateCheck',
  'controller/app/updateDownload',
  'controller/app/updateInstall',
  'controller/app/openExternal',
  'controller/app/pickDirectory',
  'controller/app/pickFile',
  'controller/microapp/parse',
  'controller/window/minimize',
  'controller/window/state',
  'controller/window/toggleMaximize',
  'controller/window/close',
  'controller/window/openDevTools',
  'controller/notes/list',
  'controller/notes/stats',
  'controller/notes/get',
  'controller/notes/create',
  'controller/notes/update',
  'controller/notes/remove',
  'controller/notes/exportMarkdown',
  'controller/notes/exportText',
  'controller/notes/exportMarkdownFolder',
  'controller/notes/exportPng',
  'controller/categories/list',
  'controller/categories/create',
  'controller/categories/remove',
  'controller/attachments/saveImage',
  'controller/attachments/uploadImage',
  'controller/attachments/dir',
  'controller/tags/list',
  'controller/tags/create',
  'controller/tags/remove',
  'controller/tags/rename',
  'controller/tags/removeMany',
  'controller/tags/cleanupUnused',
  'controller/tags/syncIndex',
  'controller/settings/all',
  'controller/settings/get',
  'controller/settings/set',
  'controller/settings/remove',
  'controller/diagnostics/run',
  'controller/sync/pending',
  'controller/sync/status',
  'controller/sync/login',
  'controller/sync/autoLogin',
  'controller/sync/logout',
  'controller/sync/categories',
  'controller/sync/pull',
  'controller/sync/push',
  'controller/library/runes',
  'controller/library/echoes',
  'controller/library/runeSave',
  'controller/library/runeSaveMany',
  'controller/library/runeRemove',
  'controller/library/echoSave',
  'controller/library/echoSaveMany',
  'controller/library/echoRemove',
  'controller/blog/export',
  'controller/blog/exportCi',
  'controller/blog/build',
  'controller/blog/cancel',
  'controller/blog/dispatchGitHub',
  'controller/blog/sftpTest',
  'controller/blog/sftpUpload',
  'controller/blog/sftpCancel',
  'controller/cloudfn/invoke',
  'controller/ai/models',
  'controller/ai/saveModel',
  'controller/ai/removeModel',
  'controller/ai/setDefaultModel',
  'controller/ai/testModel',
  'controller/ai/skills',
  'controller/ai/saveSkill',
  'controller/ai/removeSkill',
  'controller/ai/chat',
  'controller/ai/chatStream',
  'controller/ai/chatCancel',
  'controller/packs/preview',
  'controller/packs/commit',
  'controller/packs/fetchRemote',
  'controller/packs/exportFile',
  'controller/templates/list',
  'controller/templates/save',
  'controller/templates/saveMany',
  'controller/templates/remove',
  'controller/database/status',
  'controller/database/importLegacy',
  'controller/database/backup',
  'controller/database/backups',
  'controller/database/restore',
  'controller/database/openFolder',
]);







const EVENT_CHANNELS = new Set<string>(['blog-deploy-progress', 'ai-chat-stream', 'updater-event']);

const api: CoolmaApi = {
  async invoke<T = unknown>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    if (!INVOKE_CHANNELS.has(channel)) {
      return {
        ok: false,
        error: {
          code: 'IPC_CHANNEL_DENIED',
          message: `IPC channel is not allowed: ${channel}`,
        },
      };
    }

    return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>;
  },

  on(channel: string, listener: (payload: unknown) => void): () => void {
    if (!EVENT_CHANNELS.has(channel)) {
      throw new Error(`IPC event is not allowed: ${channel}`);
    }

    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('coolma', api);
