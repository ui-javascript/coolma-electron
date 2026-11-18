import { defineStore } from 'pinia';
import type {
  CategoryRecord,
  NoteRecord,
  NoteSummary,
  TagRecord,
} from '@shared/types/domain';
import {
  createNote as createNoteIpc,
  getNote,
  listCategories,
  listNotes,
  listTags,
  removeNote as removeNoteIpc,
  updateNote as updateNoteIpc,
  type NoteCreateInput,
  type NoteUpdateInput,
} from '@/services/ipc';

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
  },
});
