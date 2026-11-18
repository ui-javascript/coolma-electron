import { contextBridge, ipcRenderer } from 'electron';
import type { CoolmaApi, IpcResult } from '../shared/ipc/contract';

/**
 * This preload runs with `sandbox: true`, so it must not require local modules.
 * Keep the allowlist inline and mirror it in `electron/shared/ipc/channels.ts`.
 */
const INVOKE_CHANNELS = new Set<string>([
  'controller/app/info',
  'controller/window/minimize',
  'controller/window/state',
  'controller/window/toggleMaximize',
  'controller/window/close',
  'controller/notes/list',
  'controller/notes/stats',
  'controller/notes/get',
  'controller/notes/create',
  'controller/notes/update',
  'controller/notes/remove',
  'controller/categories/list',
  'controller/categories/create',
  'controller/categories/remove',
  'controller/tags/list',
  'controller/tags/create',
  'controller/tags/remove',
  'controller/settings/all',
  'controller/settings/get',
  'controller/settings/set',
  'controller/settings/remove',
  'controller/database/status',
  'controller/database/importLegacy',
  'controller/database/backup',
  'controller/database/openFolder',
]);

const EVENT_CHANNELS = new Set<string>();

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
