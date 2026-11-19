import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppInfo, IpcResult } from '@shared/ipc/contract';
import type {
  CategoryRecord,
  DatabaseStatus,
  ImportResult,
  EchoCard,
  IntegrityReport,
  PendingSyncSummary,
  RuneCard,
  SyncLogEntry,
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

/** 只读数据体检：返回差异报告，不做任何修复。 */
export const runDiagnostics = (): Promise<IpcResult<IntegrityReport>> =>
  invoke(IPC_CHANNELS.diagnostics.run);

/** 本地变更队列快照（outbox），后续同步引擎与设置页共用。 */
/** 符文卡片列表（@ 快捷面板的「符文」分组）。 */
export const listRunes = (): Promise<IpcResult<RuneCard[]>> => invoke(IPC_CHANNELS.library.runes);

/** 回响卡片列表（@ 快捷面板的「回响」分组）。 */
export const listEchoes = (): Promise<IpcResult<EchoCard[]>> => invoke(IPC_CHANNELS.library.echoes);

export const getPendingSync = (): Promise<
  IpcResult<{ summary: PendingSyncSummary; items: SyncLogEntry[] }>
> => invoke(IPC_CHANNELS.sync.pending);

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

export function createCategory(category: string, parent?: string): Promise<IpcResult<CategoryRecord>> {
  return invoke<CategoryRecord>(IPC_CHANNELS.categories.create, { category, parent });
}

export function removeCategory(category: string): Promise<IpcResult<{ deleted: boolean }>> {
  return invoke<{ deleted: boolean }>(IPC_CHANNELS.categories.remove, { category });
}

export function listTags(): Promise<IpcResult<TagRecord[]>> {
  return invoke<TagRecord[]>(IPC_CHANNELS.tags.list);
}

export function createTag(name: string, color?: string): Promise<IpcResult<TagRecord>> {
  return invoke<TagRecord>(IPC_CHANNELS.tags.create, { name, color });
}

export function removeTag(id: number): Promise<IpcResult<{ deleted: boolean }>> {
  return invoke<{ deleted: boolean }>(IPC_CHANNELS.tags.remove, { id });
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

