/** 更新事件与命令（对齐 vue2 memocast.js 的 updater-* 事件 + ApiInvoker）。 */
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc/channels';
import type { IpcResult } from '@shared/ipc/contract';
import { invoke } from '@/services/ipc';

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; info: unknown }
  | { type: 'not-available'; info: unknown }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; info: unknown }
  | { type: 'error'; message: string };

export function checkUpdate(): Promise<IpcResult<{ checking: boolean }>> {
  return invoke<{ checking: boolean }>(IPC_CHANNELS.app.updateCheck);
}

export function downloadUpdate(): Promise<IpcResult<{ downloading: boolean }>> {
  return invoke<{ downloading: boolean }>(IPC_CHANNELS.app.updateDownload);
}

export function installUpdate(): Promise<IpcResult<true>> {
  return invoke<true>(IPC_CHANNELS.app.updateInstall);
}

export function onUpdaterEvent(listener: (event: UpdaterEvent) => void): () => void {
  const api = window.coolma;
  if (!api) {
    return () => undefined;
  }
  return api.on(IPC_EVENTS.updater, (payload) => listener(payload as UpdaterEvent));
}
