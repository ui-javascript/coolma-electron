import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppInfo, IpcResult } from '@shared/ipc/contract';
import type {
  CategoryRecord,
  DatabaseStatus,
  ImportResult,
  NoteListResult,
  NoteRecord,
  TagRecord,
} from '@shared/types/domain';

export interface NoteListInput {
  query?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface NoteCreateInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
}

export interface NoteUpdateInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  dirty?: number;
}

export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
}

export const hasIpc = (): boolean => Boolean(window.coolma);

export async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  const api = window.coolma;
  if (!api) {
    return {
      ok: false,
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'Electron preload bridge is not available (browser preview).',
      },
    };
  }

  return api.invoke<T>(channel, payload);
}

export function getAppInfo(): Promise<IpcResult<AppInfo>> {
  return invoke<AppInfo>(IPC_CHANNELS.app.info);
}

export function getWindowState(): Promise<IpcResult<WindowState>> {
  return invoke<WindowState>(IPC_CHANNELS.window.state);
}

export function minimizeWindow(): Promise<IpcResult<null>> {
  return invoke<null>(IPC_CHANNELS.window.minimize);
}

export function toggleMaximizeWindow(): Promise<IpcResult<boolean>> {
  return invoke<boolean>(IPC_CHANNELS.window.toggleMaximize);
}

export function closeWindow(): Promise<IpcResult<null>> {
  return invoke<null>(IPC_CHANNELS.window.close);
}

export function listNotes(input: NoteListInput = {}): Promise<IpcResult<NoteListResult>> {
  return invoke<NoteListResult>(IPC_CHANNELS.notes.list, input);
}

export function getNote(id: number): Promise<IpcResult<NoteRecord>> {
  return invoke<NoteRecord>(IPC_CHANNELS.notes.get, { id });
}

export function createNote(input: NoteCreateInput = {}): Promise<IpcResult<NoteRecord>> {
  return invoke<NoteRecord>(IPC_CHANNELS.notes.create, input);
}

export function updateNote(id: number, input: NoteUpdateInput): Promise<IpcResult<NoteRecord>> {
  return invoke<NoteRecord>(IPC_CHANNELS.notes.update, { id, ...input });
}

export function removeNote(id: number): Promise<IpcResult<{ deleted: boolean }>> {
  return invoke<{ deleted: boolean }>(IPC_CHANNELS.notes.remove, { id });
}

export function listCategories(): Promise<IpcResult<CategoryRecord[]>> {
  return invoke<CategoryRecord[]>(IPC_CHANNELS.categories.list);
}

export function listTags(): Promise<IpcResult<TagRecord[]>> {
  return invoke<TagRecord[]>(IPC_CHANNELS.tags.list);
}

export function getDatabaseStatus(): Promise<IpcResult<DatabaseStatus>> {
  return invoke<DatabaseStatus>(IPC_CHANNELS.database.status);
}

export function importLegacyDatabase(): Promise<IpcResult<ImportResult | null>> {
  return invoke<ImportResult | null>(IPC_CHANNELS.database.importLegacy, {});
}

export function backupDatabase(): Promise<IpcResult<{ path: string }>> {
  return invoke<{ path: string }>(IPC_CHANNELS.database.backup);
}

export function openDatabaseFolder(): Promise<IpcResult<{ opened: boolean }>> {
  return invoke<{ opened: boolean }>(IPC_CHANNELS.database.openFolder);
}

