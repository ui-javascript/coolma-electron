import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcResult } from '@shared/ipc/contract';
import { invoke } from '@/services/ipc';

export interface SyncStatus {
  baseUrl: string;
  kbGuid: string;
  kbServer: string;
  email: string;
  displayName: string;
  userGuid: string;
  lastSyncAt?: number;
  loggedIn: boolean;
}

export interface SyncCategory {
  category: string;
  parent: string;
}

export interface PullResult {
  imported: number;
  skipped: number;
  backfilled: number;
  failed: number;
  total: number;
  errors: string[];
}

export interface PushResult {
  pushed: number;
  created: number;
  failed: number;
  errors: string[];
}

export const getSyncStatus = (): Promise<IpcResult<SyncStatus>> => invoke<SyncStatus>(IPC_CHANNELS.sync.status);

export const syncLogin = (input: {
  userId: string;
  password: string;
  baseUrl?: string;
  rememberPassword?: boolean;
}): Promise<IpcResult<SyncStatus>> => invoke<SyncStatus>(IPC_CHANNELS.sync.login, input);

export const syncLogout = (): Promise<IpcResult<SyncStatus>> => invoke<SyncStatus>(IPC_CHANNELS.sync.logout);

export const getSyncCategories = (): Promise<IpcResult<SyncCategory[]>> =>
  invoke<SyncCategory[]>(IPC_CHANNELS.sync.categories);

export const syncPull = (input: { category?: string; limit?: number } = {}): Promise<IpcResult<PullResult>> =>
  invoke<PullResult>(IPC_CHANNELS.sync.pull, input);

export const syncPush = (input: { limit?: number } = {}): Promise<IpcResult<PushResult>> =>
  invoke<PushResult>(IPC_CHANNELS.sync.push, input);
