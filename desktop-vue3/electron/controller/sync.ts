import type { IpcResult } from '../shared/ipc/contract';
import { syncLoginSchema, syncPullSchema, syncPushSchema, syncResolveConflictsSchema } from '../shared/ipc/schemas';
import { fail, ok } from '../shared/ipc/result';
import { failFromError } from './controller-utils';
import { syncLogRepository, type PendingSyncSummary, type SyncLogEntry } from '../service/db/sync-log-repository';
import { notesRepository } from '../service/db/notes-repository';
import type { SyncConflictRecord } from '../shared/types/domain';
import {
  autoLogin,
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

  /** 启动自动登录；没有记住密码时返回 null，由渲染层决定走本地离线。 */
  async autoLogin(): Promise<IpcResult<ReturnType<typeof getPublicConfig> | null>> {
    try {
      return ok(await autoLogin());
    } catch (error) {
      return failFromError(error, 'SYNC_AUTO_LOGIN_ERROR');
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

  /** 冲突队列（两侧完整快照，可离线二选一）。 */
  async conflicts(): Promise<IpcResult<{ items: SyncConflictRecord[]; total: number }>> {
    try {
      const items = notesRepository.listConflicts();
      return ok({ items, total: items.length });
    } catch (error) {
      return failFromError(error, 'SYNC_CONFLICTS_ERROR');
    }
  }

  /** 批量处理冲突：local=保留本地并等待下次推送覆盖；remote=用云端；skip=两边各留各的。 */
  async resolveConflicts(args?: unknown): Promise<IpcResult<{ resolved: number; remaining: number }>> {
    try {
      const input = syncResolveConflictsSchema.parse(args ?? {});
      const conflicts = new Map(notesRepository.listConflicts().map((item) => [item.noteId, item]));
      let resolved = 0;
      for (const item of input.resolutions) {
        const conflict = conflicts.get(item.noteId);
        if (!conflict) continue;
        if (notesRepository.resolveConflict(conflict, item.resolution)) resolved += 1;
      }
      return ok({ resolved, remaining: notesRepository.conflictCount() });
    } catch (error) {
      return failFromError(error, 'SYNC_RESOLVE_CONFLICTS_ERROR');
    }
  }
}

SyncController.toString = () => '[class SyncController]';

export default SyncController;
