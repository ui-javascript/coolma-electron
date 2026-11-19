import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { failFromError } from './controller-utils';
import { syncLogRepository, type PendingSyncSummary, type SyncLogEntry } from '../service/db/sync-log-repository';

class SyncController {
  /** 本地变更队列快照：给设置页和后续同步引擎共用。 */
  async pending(): Promise<IpcResult<{ summary: PendingSyncSummary; items: SyncLogEntry[] }>> {
    try {
      return ok({ summary: syncLogRepository.summary(), items: syncLogRepository.listPending(200) });
    } catch (error) {
      return failFromError(error, 'SYNC_PENDING_ERROR');
    }
  }
}

SyncController.toString = () => '[class SyncController]';

export default SyncController;
