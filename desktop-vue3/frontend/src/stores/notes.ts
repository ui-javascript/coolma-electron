import { defineStore } from 'pinia';
import type {
  CategoryRecord,
  NoteRecord,
  NoteSummary,
  TagRecord,
} from '@shared/types/domain';
import {
  createCategory as createCategoryIpc,
  createNote as createNoteIpc,
  createTag as createTagIpc,
  getNote,
  listCategories,
  listNotes,
  listTags,
  removeCategory as removeCategoryIpc,
  removeNote as removeNoteIpc,
  removeTag as removeTagIpc,
  updateNote as updateNoteIpc,
  type NoteCreateInput,
  type NoteTemplate,
  type NoteTemplateInput,
  type NoteUpdateInput,
  listTemplates as listTemplatesIpc,
  saveTemplate as saveTemplateIpc,
  removeTemplate as removeTemplateIpc,
} from '@/services/ipc';
import { getSyncCategories, getSyncStatus, syncPull } from '@/services/sync';

function toSummary(note: NoteRecord): NoteSummary {
  return {
    id: note.id,
    docGuid: note.docGuid,
    kbGuid: note.kbGuid,
    title: note.title,
    excerpt: note.excerpt,
    category: note.category,
    tags: note.tags,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    dirty: note.dirty,
  };
}

let openRequest = 0;

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [] as NoteSummary[],
    total: 0,
    categories: [] as CategoryRecord[],
    tags: [] as TagRecord[],
    activeNote: null as NoteRecord | null,
    loading: false,
    saving: false,
    templates: [] as NoteTemplate[],
    error: '',
  }),

  actions: {
    async loadAll(): Promise<boolean> {
      this.loading = true;
      this.error = '';

      const [notesResult, categoriesResult, tagsResult] = await Promise.all([
        listNotes({ limit: 5000 }),
        listCategories(),
        listTags(),
      ]);

      if (notesResult.ok) {
        this.notes = notesResult.data.items;
        this.total = notesResult.data.total;
      } else {
        this.error = notesResult.error.message;
      }

      if (categoriesResult.ok) {
        this.categories = categoriesResult.data;
      }
      if (tagsResult.ok) {
        this.tags = tagsResult.data;
      }

      this.loading = false;
      return notesResult.ok;
    },

    /**
     * 手动刷新（对齐 vue2 refreshNoteListHandler）：
     * - 当前选中文件夹且为知已登录 → 先拉该分类，再重载 SQLite；
     * - 其它筛选（标签/日历/全部）只重载本地库，不猜云端分类。
     */
    async refresh(category?: string): Promise<boolean> {
      let syncError = '';
      if (category) {
        const status = await getSyncStatus();
        if (status.ok && status.data.loggedIn) {
          const result = await syncPull({ category, limit: 200 });
          if (!result.ok) {
            syncError = result.error.message;
          }
        }
      }
      const ok = await this.loadAll();
      if (syncError) {
        this.error = syncError;
      }
      return ok;
    },

    /**
     * 登录/启动后刷新云端目录：
     * - 目录接口会顺手把远端目录落到 SQLite（见 wiznote.fetchCategories）；
     * - 再重载本地笔记/目录/标签，侧栏才能看到云端文件夹。
     */
    async refreshCloudTree(): Promise<boolean> {
      const status = await getSyncStatus();
      if (status.ok && status.data.loggedIn) {
        const categories = await getSyncCategories();
        if (!categories.ok) {
          this.error = categories.error.message;
        }
      }
      return this.loadAll();
    },

    /** 笔记模板列表（设置页卡片 + 新建笔记下拉共用）。 */
    async loadTemplates(): Promise<void> {
      const result = await listTemplatesIpc();
      if (result.ok) {
        this.templates = result.data;
      }
    },

    async saveTemplate(input: NoteTemplateInput): Promise<NoteTemplate | null> {
      const result = await saveTemplateIpc(input);
      if (!result.ok) {
        this.error = result.error.message;
        return null;
      }
      await this.loadTemplates();
      return result.data;
    },

    async removeTemplate(id: string): Promise<boolean> {
      const result = await removeTemplateIpc(id);
      if (!result.ok) {
        this.error = result.error.message;
        return false;
      }
      await this.loadTemplates();
      return result.data;
    },

    async openNote(id: number): Promise<NoteRecord | null> {
      if (this.activeNote?.id === id) {
        return this.activeNote;
      }

      const token = ++openRequest;
      const result = await getNote(id);
      if (!result.ok) {
        this.error = result.error.message;
        return null;
      }
      if (token !== openRequest) {
        return null;
      }

      this.activeNote = result.data;
      return result.data;
    },

    clearActive(): void {
      ++openRequest;
      this.activeNote = null;
    },

    async create(input: NoteCreateInput): Promise<NoteRecord | null> {
      this.error = '';
      const result = await createNoteIpc(input);
      if (!result.ok) {
        this.error = result.error.message;
        return null;
      }

      await this.loadAll();
      this.activeNote = result.data;
      return result.data;
    },

    async save(id: number, input: NoteUpdateInput): Promise<NoteRecord | null> {
      this.saving = true;
      this.error = '';
      try {
        const result = await updateNoteIpc(id, input);
        if (!result.ok) {
          this.error = result.error.message;
          return null;
        }

        const summary = toSummary(result.data);
        const index = this.notes.findIndex((note) => note.id === id);
        if (index >= 0) {
          this.notes[index] = summary;
        } else {
          this.notes.unshift(summary);
          this.total += 1;
        }
        if (this.activeNote?.id === id) {
          this.activeNote = result.data;
        }
        return result.data;
      } finally {
        this.saving = false;
      }
    },

    async remove(id: number): Promise<boolean> {
      this.error = '';
      const result = await removeNoteIpc(id);
      if (!result.ok || !result.data.deleted) {
        this.error = result.ok ? '' : result.error.message;
        return false;
      }

      const index = this.notes.findIndex((note) => note.id === id);
      if (index >= 0) {
        this.notes.splice(index, 1);
        this.total = Math.max(0, this.total - 1);
      }
      if (this.activeNote?.id === id) {
        this.clearActive();
      }
      return true;
    },

    /** 批量删除：逐条走同一 remove 通道，汇总成功数量后一次扣减 total。 */
    async removeMany(ids: number[]): Promise<number> {
      this.error = '';
      let removed = 0;

      for (const id of ids) {
        const result = await removeNoteIpc(id);
        if (!result.ok || !result.data.deleted) {
          if (!result.ok) {
            this.error = result.error.message;
          }
          continue;
        }
        removed += 1;
        const index = this.notes.findIndex((note) => note.id === id);
        if (index >= 0) {
          this.notes.splice(index, 1);
        }
        if (this.activeNote?.id === id) {
          this.clearActive();
        }
      }

      this.total = Math.max(0, this.total - removed);
      return removed;
    },

    /** 批量移动：复用单条 save 的校验与时间戳语义，逐条改 category。 */
    async moveMany(ids: number[], category: string): Promise<number> {
      let moved = 0;
      for (const id of ids) {
        const note = await this.save(id, { category });
        if (note) {
          moved += 1;
        }
      }
      return moved;
    },

    /** 重命名：只改标题，走同一条 update 通道，保持 dirty/时间戳语义一致。 */
    async rename(id: number, title: string): Promise<boolean> {
      const note = await this.save(id, { title });
      return Boolean(note);
    },

    /** 移动：改 category 字段；文件夹计数由 notes 派生，无需额外刷新。 */
    async move(id: number, category: string): Promise<boolean> {
      const note = await this.save(id, { category });
      return Boolean(note);
    },

    /** 标签编辑：按逗号落库，note_tags 关联由主进程重建。 */
    async setTags(id: number, tags: string[]): Promise<boolean> {
      const note = await this.save(id, { tags: tags.join(',') });
      if (note) {
        await this.refreshIndexes();
      }
      return Boolean(note);
    },

    async refreshIndexes(): Promise<void> {
      const [categoriesResult, tagsResult] = await Promise.all([listCategories(), listTags()]);
      if (categoriesResult.ok) {
        this.categories = categoriesResult.data;
      }
      if (tagsResult.ok) {
        this.tags = tagsResult.data;
      }
    },

    async createFolder(category: string): Promise<boolean> {
      this.error = '';
      const result = await createCategoryIpc(category);
      if (!result.ok) {
        this.error = result.error.message;
        return false;
      }
      await this.refreshIndexes();
      return true;
    },

    async deleteFolder(category: string): Promise<boolean> {
      this.error = '';
      const result = await removeCategoryIpc(category);
      if (!result.ok || !result.data.deleted) {
        this.error = result.ok ? '' : result.error.message;
        return false;
      }
      await this.refreshIndexes();
      return true;
    },

    async createTag(name: string): Promise<boolean> {
      this.error = '';
      const result = await createTagIpc(name);
      if (!result.ok) {
        this.error = result.error.message;
        return false;
      }
      await this.refreshIndexes();
      return true;
    },

    async deleteTag(id: number): Promise<boolean> {
      this.error = '';
      const result = await removeTagIpc(id);
      if (!result.ok || !result.data.deleted) {
        this.error = result.ok ? '' : result.error.message;
        return false;
      }
      await this.refreshIndexes();
      return true;
    },
  },
});
