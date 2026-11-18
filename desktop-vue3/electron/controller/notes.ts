import type { NoteListResult, NoteRecord, NoteStats } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { fail, ok } from '../shared/ipc/result';
import {
  noteCreateSchema,
  noteIdSchema,
  noteListSchema,
  noteUpdateSchema,
} from '../shared/ipc/schemas';
import { notesRepository } from '../service/db/notes-repository';
import { failFromError } from './controller-utils';

class NotesController {
  async list(args?: unknown): Promise<IpcResult<NoteListResult>> {
    try {
      return ok(notesRepository.list(noteListSchema.parse(args ?? {})));
    } catch (error) {
      return failFromError(error, 'NOTES_LIST_ERROR');
    }
  }

  async stats(): Promise<IpcResult<NoteStats>> {
    try {
      return ok(notesRepository.stats());
    } catch (error) {
      return failFromError(error, 'NOTES_STATS_ERROR');
    }
  }

  async get(args?: unknown): Promise<IpcResult<NoteRecord>> {
    try {
      const { id } = noteIdSchema.parse(args);
      const note = notesRepository.get(id);
      return note ? ok(note) : fail('NOTE_NOT_FOUND', `Note ${id} was not found`);
    } catch (error) {
      return failFromError(error, 'NOTE_GET_ERROR');
    }
  }

  async create(args?: unknown): Promise<IpcResult<NoteRecord>> {
    try {
      return ok(notesRepository.create(noteCreateSchema.parse(args ?? {})));
    } catch (error) {
      return failFromError(error, 'NOTE_CREATE_ERROR');
    }
  }

  async update(args?: unknown): Promise<IpcResult<NoteRecord>> {
    try {
      const { id, ...changes } = noteUpdateSchema.parse(args);
      const note = notesRepository.update(id, changes);
      return note ? ok(note) : fail('NOTE_NOT_FOUND', `Note ${id} was not found`);
    } catch (error) {
      return failFromError(error, 'NOTE_UPDATE_ERROR');
    }
  }

  async remove(args?: unknown): Promise<IpcResult<{ deleted: boolean }>> {
    try {
      const { id } = noteIdSchema.parse(args);
      return ok({ deleted: notesRepository.remove(id) });
    } catch (error) {
      return failFromError(error, 'NOTE_REMOVE_ERROR');
    }
  }
}

NotesController.toString = () => '[class NotesController]';

export default NotesController;
