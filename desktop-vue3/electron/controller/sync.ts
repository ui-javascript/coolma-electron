import type { IpcResult } from '../shared/ipc/contract';
import { syncLoginSchema, syncPullSchema, syncPushSchema } from '../shared/ipc/schemas';
import { fail, ok } from '../shared/ipc/result';
import { failFromError } from './controller-utils';
import { syncLogRepository, type PendingSyncSummary, type SyncLogEntry } from '../service/db/sync-log-repository';
import {
  fetchCategories,
  getPublicConfig,
  login,
  logout,
  pull,
  push,
  type PullResult,
  type PushResult,
  type WizCategory,
} from '../service/sync/wiznote';

class SyncController {
  /** 本地变更队列快照。 */
  async pending(): Promise<IpcResult<{ summary: PendingSyncSummary; items: SyncLogEntry[] }>> {
    try {
      return ok({ summary: syncLogRepository.summary(), items: syncLogRepository.listPending(200) });
    } catch (error) {
      return failFromError(error, 'SYNC_PENDING_ERROR');
    }
  }

  /** 当前为知登录态（不含 token/password）。 */
  async status(): Promise<IpcResult<ReturnType<typeof getPublicConfig>>> {
    try {
      return ok(getPublicConfig());
    } catch (error) {
      return failFromError(error, 'SYNC_STATUS_ERROR');
    }
  }

  async login(args?: unknown): Promise<IpcResult<ReturnType<typeof getPublicConfig>>> {
    try {
      const input = syncLoginSchema.parse(args);
      return ok(await login(input));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (typeof code === 'number') {
        return fail(`WIZ_${code}`, String((error as Error).message));
      }
      return failFromError(error, 'SYNC_LOGIN_ERROR');
    }
  }

  async logout(): Promise<IpcResult<ReturnType<typeof getPublicConfig>>> {
    try {
      return ok(await logout());
    } catch (error) {
      return failFromError(error, 'SYNC_LOGOUT_ERROR');
    }
  }

  async categories(): Promise<IpcResult<WizCategory[]>> {
    try {
      return ok(await fetchCategories());
    } catch (error) {
      return failFromError(error, 'SYNC_CATEGORIES_ERROR');
    }
  }

  async pull(args?: unknown): Promise<IpcResult<PullResult>> {
    try {
      return ok(await pull(syncPullSchema.parse(args ?? {})));
    } catch (error) {
      return failFromError(error, 'SYNC_PULL_ERROR');
    }
  }

  async push(args?: unknown): Promise<IpcResult<PushResult>> {
    try {
      return ok(await push(syncPushSchema.parse(args ?? {})));
    } catch (error) {
      return failFromError(error, 'SYNC_PUSH_ERROR');
    }
  }
}

SyncController.toString = () => '[class SyncController]';

export default SyncController;
