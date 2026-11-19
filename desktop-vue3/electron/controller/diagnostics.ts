import type { IntegrityReport } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { runIntegrityCheck } from '../service/db/diagnostics';
import { failFromError } from './controller-utils';

class DiagnosticsController {
  /** 只读体检：不修数据，只报告差异，用于旧库导入后与日常排查。 */
  async run(): Promise<IpcResult<IntegrityReport>> {
    try {
      return ok(runIntegrityCheck());
    } catch (error) {
      return failFromError(error, 'DIAGNOSTICS_ERROR');
    }
  }
}

DiagnosticsController.toString = () => '[class DiagnosticsController]';

export default DiagnosticsController;
