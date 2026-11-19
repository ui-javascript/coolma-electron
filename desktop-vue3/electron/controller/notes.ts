import type { NoteListResult, NoteRecord, NoteStats } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { fail, ok } from '../shared/ipc/result';
import {
  noteCreateSchema,
  notePngExportSchema,
  noteIdSchema,
  noteListSchema,
  noteUpdateSchema,
} from '../shared/ipc/schemas';
import { notesRepository } from '../service/db/notes-repository';
import { markdownFileName, sanitizeFileName, stripDataUrlBase64 } from '../service/export-utils';
import { templatesRepository } from '../service/db/templates-repository';
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
      const { templateId, ...rest } = noteCreateSchema.parse(args ?? {});
      let templateContent: string | undefined;
      if (templateId) {
        const body = templatesRepository.contentOf(templateId);
        if (body === null) {
          console.warn('[notes.create] template not found, fallback to empty:', templateId);
        } else {
          templateContent = body;
        }
      }
      return ok(notesRepository.create({ ...rest, templateContent }));
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

  /**
   * 导出单篇为 Markdown 文件（对齐 vue2：弹保存框 → 写文件 → 回路径）。
   */
  async exportMarkdown(args?: unknown): Promise<IpcResult<{ canceled: boolean; filePath: string }>> {
    try {
      const { id } = noteIdSchema.parse(args);
      const note = notesRepository.get(id);
      if (!note) {
        return fail('NOTE_NOT_FOUND', `Note ${id} was not found`);
      }
      const { dialog, app } = await import('electron');
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const defaultPath = path.join(app.getPath('documents'), markdownFileName(note.title));
      const result = await dialog.showSaveDialog({
        title: 'export',
        defaultPath,
        filters: [{ name: 'Markdown File', extensions: ['md', 'markdown'] }],
      });
      if (result.canceled || !result.filePath) {
        return ok({ canceled: true, filePath: '' });
      }
      await fs.writeFile(result.filePath, note.content ?? '', 'utf-8');
      return ok({ canceled: false, filePath: result.filePath });
    } catch (error) {
      return failFromError(error, 'NOTE_EXPORT_ERROR');
    }
  }

  /**
   * 导出整篇长图为 PNG（对齐 vue2 export-png：前端 html2canvas 出 dataURL，这里只负责落盘）。
   */
  async exportPng(args?: unknown): Promise<IpcResult<{ canceled: boolean; filePath: string }>> {
    try {
      const { id } = noteIdSchema.parse(args);
      const note = notesRepository.get(id);
      if (!note) {
        return fail('NOTE_NOT_FOUND', `Note ${id} was not found`);
      }
      const { dataUrl } = notePngExportSchema.parse(args);
      const { dialog, app } = await import('electron');
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const result = await dialog.showSaveDialog({
        title: 'export',
        defaultPath: path.join(app.getPath('pictures'), markdownFileName(note.title).replace(/\.md$/, '.png')),
        filters: [{ name: 'Portable Network Graphics', extensions: ['png'] }],
      });
      if (result.canceled || !result.filePath) {
        return ok({ canceled: true, filePath: '' });
      }
      await fs.writeFile(result.filePath, Buffer.from(stripDataUrlBase64(dataUrl), 'base64'));
      return ok({ canceled: false, filePath: result.filePath });
    } catch (error) {
      return failFromError(error, 'NOTE_EXPORT_PNG_ERROR');
    }
  }

  /**
   * 按文件夹批量导出（对齐 vue2 的 export-markdown-files）。
   */
  async exportMarkdownFolder(
    args?: unknown,
  ): Promise<IpcResult<{ canceled: boolean; directory: string; written: number }>> {
    try {
      const { category } = noteListSchema.parse(args ?? {});
      const notes = notesRepository.list({ category, limit: 5000, offset: 0 }).items;
      const { dialog, app } = await import('electron');
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const result = await dialog.showOpenDialog({
        title: 'export',
        defaultPath: app.getPath('documents'),
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Confirm',
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return ok({ canceled: true, directory: '', written: 0 });
      }
      const directory = path.join(result.filePaths[0], sanitizeFileName(category || 'notes'));
      await fs.mkdir(directory, { recursive: true });
      for (const note of notes) {
        const full = notesRepository.get(note.id);
        await fs.writeFile(path.join(directory, markdownFileName(note.title)), full?.content ?? '', 'utf-8');
      }
      return ok({ canceled: false, directory, written: notes.length });
    } catch (error) {
      return failFromError(error, 'NOTE_EXPORT_FOLDER_ERROR');
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
