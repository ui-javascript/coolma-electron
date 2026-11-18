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
