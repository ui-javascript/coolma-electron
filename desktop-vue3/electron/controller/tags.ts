import type { TagRecord } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { tagCreateSchema, tagRemoveManySchema, tagRemoveSchema, tagRenameSchema } from '../shared/ipc/schemas';
import { tagsRepository } from '../service/db/tags-repository';
import {
  getPublicConfig,
  syncCreateRemoteTag,
  syncDeleteRemoteTag,
  syncRenameRemoteTag,
} from '../service/sync/wiznote';
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
      const existing = tagsRepository.list().find((tag) => tag.name.toLowerCase() === input.name.trim().toLowerCase());
      if (existing) {
        return ok(existing);
      }
      // 照 vue2：在线时标签先落云端，本地仍保留名称索引。
      if (getPublicConfig().loggedIn) {
        await syncCreateRemoteTag(input.name);
      }
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
      const current = tagsRepository.list().find((tag) => tag.id === input.id);
      if (!current) {
        return ok({ success: false, code: 'TAG_NOT_FOUND' });
      }
      const nextName = input.name.trim();
      const duplicate = tagsRepository
        .list()
        .some((tag) => tag.id !== input.id && tag.name.toLowerCase() === nextName.toLowerCase());
      if (duplicate) {
        return ok({ success: false, code: 'TAG_DUPLICATE_NAME', name: nextName });
      }
      // 云端按旧名找 GUID 改名；改名失败就整体失败，避免本地与云端各叫一个名。
      if (getPublicConfig().loggedIn) {
        await syncRenameRemoteTag(current.name, nextName);
      }
      return ok(tagsRepository.rename(input.id, input.name));
    } catch (error) {
      return failFromError(error, 'TAG_RENAME_ERROR');
    }
  }

  async removeMany(args?: unknown): Promise<IpcResult<{ deleted: number }>> {
    try {
      const { ids } = tagRemoveManySchema.parse(args);
      if (getPublicConfig().loggedIn) {
        const selected = tagsRepository.list().filter((tag) => ids.includes(tag.id));
        for (const tag of selected) {
          try {
            await syncDeleteRemoteTag(tag.name);
          } catch (error) {
            // 批量删除是本地面板增强入口；单个云端失败只记日志，不阻断其余标签。
            console.warn('[tags] 云端标签删除失败', tag.name, (error as Error).message);
          }
        }
      }
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
      const current = tagsRepository.list().find((tag) => tag.id === id);
      if (current && getPublicConfig().loggedIn) {
        await syncDeleteRemoteTag(current.name);
      }
      return ok({ deleted: tagsRepository.remove(id) });
    } catch (error) {
      return failFromError(error, 'TAG_REMOVE_ERROR');
    }
  }
}

TagsController.toString = () => '[class TagsController]';

export default TagsController;
