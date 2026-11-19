import type { TagRecord } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { tagCreateSchema, tagRemoveSchema } from '../shared/ipc/schemas';
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
