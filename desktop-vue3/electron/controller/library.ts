import type { EchoCard, RuneCard } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import {
  echoesRepository,
  runesRepository,
  type EchoSaveInput,
  type RuneSaveInput,
} from '../service/db/library-repository';
import {
  echoSaveSchema,
  libraryRemoveSchema,
  librarySaveManySchema,
  runeSaveSchema,
} from '../shared/ipc/schemas';
import { failFromError } from './controller-utils';

function normalizeRune(input: ReturnType<typeof runeSaveSchema.parse>): RuneSaveInput {
  const { inheritFromPrevious, ...rest } = input;
  return { ...rest, inheritFromPrevious: inheritFromPrevious ? 1 : 0 };
}

function normalizeEcho(input: ReturnType<typeof echoSaveSchema.parse>): EchoSaveInput {
  return input;
}

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

  /** 保存单个符文（新增或更新，按 id upsert；同名报 RUNE_DUPLICATE_NAME）。 */
  async runeSave(args?: unknown): Promise<IpcResult<RuneCard>> {
    try {
      const input = runeSaveSchema.parse(args);
      return ok(runesRepository.save(normalizeRune(input)));
    } catch (error) {
      return failFromError(error, 'RUNE_SAVE_ERROR');
    }
  }

  /** 批量保存符文：排序更新（重名抛错）或导入合并（skipDuplicates 跳过）。 */
  async runeSaveMany(args?: unknown): Promise<IpcResult<{ saved: number; skipped: number }>> {
    try {
      const input = librarySaveManySchema.parse(args ?? {});
      const items = input.items.map((item) => runeSaveSchema.parse(item)) as RuneSaveInput[];
      return ok(runesRepository.saveMany(items, { skipDuplicates: input.skipDuplicates }));
    } catch (error) {
      return failFromError(error, 'RUNE_SAVE_MANY_ERROR');
    }
  }

  async runeRemove(args?: unknown): Promise<IpcResult<{ deleted: boolean }>> {
    try {
      const { id } = libraryRemoveSchema.parse(args);
      return ok({ deleted: runesRepository.remove(id) });
    } catch (error) {
      return failFromError(error, 'RUNE_REMOVE_ERROR');
    }
  }

  /** 保存单个回响（按 id upsert；同名报 ECHO_DUPLICATE_NAME）。 */
  async echoSave(args?: unknown): Promise<IpcResult<EchoCard>> {
    try {
      const input = echoSaveSchema.parse(args);
      return ok(echoesRepository.save(normalizeEcho(input)));
    } catch (error) {
      return failFromError(error, 'ECHO_SAVE_ERROR');
    }
  }

  async echoSaveMany(args?: unknown): Promise<IpcResult<{ saved: number; skipped: number }>> {
    try {
      const input = librarySaveManySchema.parse(args ?? {});
      const items = input.items.map((item) => echoSaveSchema.parse(item)) as EchoSaveInput[];
      return ok(echoesRepository.saveMany(items, { skipDuplicates: input.skipDuplicates }));
    } catch (error) {
      return failFromError(error, 'ECHO_SAVE_MANY_ERROR');
    }
  }

  async echoRemove(args?: unknown): Promise<IpcResult<{ deleted: boolean }>> {
    try {
      const { id } = libraryRemoveSchema.parse(args);
      return ok({ deleted: echoesRepository.remove(id) });
    } catch (error) {
      return failFromError(error, 'ECHO_REMOVE_ERROR');
    }
  }
}

LibraryController.toString = () => '[class LibraryController]';

export default LibraryController;
