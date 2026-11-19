import type { TagRecord } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { tagCreateSchema, tagRemoveManySchema, tagRemoveSchema, tagRenameSchema } from '../shared/ipc/schemas';
import { tagsRepository } from '../service/db/tags-repository';
import { failFromError } from './controller-utils';

class TagsController {
  async list(): Promise<IpcResult<TagRecord[]>> {
    try {
      return ok(tagsRepository.list());
    } catch (error) {
      return failFromError(error, 'TAGS_LIST_ERROR');
    }
  }

  async create(args?: unknown): Promise<IpcResult<TagRecord>> {
    try {
      const input = tagCreateSchema.parse(args);
      return ok(tagsRepository.create(input.name, input.color));
    } catch (error) {
      return failFromError(error, 'TAG_CREATE_ERROR');
    }
  }

  /**
   * 以 notes.tags 字符串为准重建 note_tags 索引（幂等）。
   * 只做索引修复，不反向改字符串：字符串是导出与同步的依据。
   */
  async syncIndex(): Promise<IpcResult<{ notes: number; links: number; tagsAdded: number }>> {
    try {
      return ok(tagsRepository.syncFromNotes());
    } catch (error) {
      return failFromError(error, 'TAG_SYNC_INDEX_ERROR');
    }
  }

  /** 改名：同时改写 notes.tags 字符串里的旧名，撞名返回 code=TAG_DUPLICATE_NAME。 */
  async rename(args?: unknown): Promise<IpcResult<{ success: boolean; code?: string; name?: string }>> {
    try {
      const input = tagRenameSchema.parse(args);
      return ok(tagsRepository.rename(input.id, input.name));
    } catch (error) {
      return failFromError(error, 'TAG_RENAME_ERROR');
    }
  }

  async removeMany(args?: unknown): Promise<IpcResult<{ deleted: number }>> {
    try {
      const { ids } = tagRemoveManySchema.parse(args);
      return ok({ deleted: tagsRepository.removeMany(ids) });
    } catch (error) {
      return failFromError(error, 'TAG_REMOVE_MANY_ERROR');
    }
  }

  /** 清理未使用（note_tags 无引用）的标签，返回删除条数。 */
  async cleanupUnused(): Promise<IpcResult<{ deleted: number }>> {
    try {
      return ok({ deleted: tagsRepository.cleanupUnused() });
    } catch (error) {
      return failFromError(error, 'TAG_CLEANUP_UNUSED_ERROR');
    }
  }

  async remove(args?: unknown): Promise<IpcResult<{ deleted: boolean }>> {
    try {
      const { id } = tagRemoveSchema.parse(args);
      return ok({ deleted: tagsRepository.remove(id) });
    } catch (error) {
      return failFromError(error, 'TAG_REMOVE_ERROR');
    }
  }
}

TagsController.toString = () => '[class TagsController]';

export default TagsController;
