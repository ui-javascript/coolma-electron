import type { EchoCard, RuneCard } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { echoesRepository, runesRepository } from '../service/db/library-repository';
import { failFromError } from './controller-utils';

class LibraryController {
  /** 符文列表：@ 快捷面板的数据源之一。 */
  async runes(): Promise<IpcResult<RuneCard[]>> {
    try {
      return ok(runesRepository.list());
    } catch (error) {
      return failFromError(error, 'RUNES_LIST_ERROR');
    }
  }

  /** 回响列表：@ 快捷面板的数据源之一。 */
  async echoes(): Promise<IpcResult<EchoCard[]>> {
    try {
      return ok(echoesRepository.list());
    } catch (error) {
      return failFromError(error, 'ECHOES_LIST_ERROR');
    }
  }
}

LibraryController.toString = () => '[class LibraryController]';

export default LibraryController;
