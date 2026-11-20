import type { CategoryRecord } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { fail, ok } from '../shared/ipc/result';
import { categoryCreateSchema, categoryRemoveSchema } from '../shared/ipc/schemas';
import { categoriesRepository } from '../service/db/categories-repository';
import { createRemoteCategory, getPublicConfig } from '../service/sync/wiznote';
import { failFromError } from './controller-utils';

class CategoriesController {
  async list(): Promise<IpcResult<CategoryRecord[]>> {
    try {
      return ok(categoriesRepository.list());
    } catch (error) {
      return failFromError(error, 'CATEGORIES_LIST_ERROR');
    }
  }

  async create(args?: unknown): Promise<IpcResult<CategoryRecord>> {
    try {
      const input = categoryCreateSchema.parse(args);
      const config = getPublicConfig();
      // vue2 在线时先建云端目录再落本地；离线只落本地并标 local_only，等推送时补建。
      if (config.loggedIn && config.kbGuid) {
        await createRemoteCategory({ category: input.category, kbGuid: config.kbGuid });
        return ok(
          categoriesRepository.create({
            ...input,
            kbGuid: config.kbGuid,
            localOnly: false,
          }),
        );
      }
      return ok(
        categoriesRepository.create({
          ...input,
          kbGuid: config.kbGuid || '',
          localOnly: true,
        }),
      );
    } catch (error) {
      return failFromError(error, 'CATEGORY_CREATE_ERROR');
    }
  }

  async remove(args?: unknown): Promise<IpcResult<{ deleted: boolean }>> {
    try {
      const { category } = categoryRemoveSchema.parse(args);
      // 非空校验放在主进程，渲染层只是提示；即便绕过 UI 也删不掉有笔记的文件夹。
      const noteCount = categoriesRepository.countNotes(category);
      if (noteCount > 0) {
        return fail('CATEGORY_NOT_EMPTY', `Category ${category} still has ${noteCount} note(s)`);
      }
      return ok({ deleted: categoriesRepository.remove(category) });
    } catch (error) {
      return failFromError(error, 'CATEGORY_REMOVE_ERROR');
    }
  }
}

CategoriesController.toString = () => '[class CategoriesController]';

export default CategoriesController;
