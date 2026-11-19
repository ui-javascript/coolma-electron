import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { templatesRepository, type NoteTemplateRow } from '../service/db/templates-repository';
import { noteTemplateSaveSchema } from '../shared/ipc/schemas';
import { failFromError } from './controller-utils';
import { z } from 'zod';

const saveManySchema = z.object({ templates: z.array(noteTemplateSaveSchema).max(200) });
const removeSchema = z.object({ id: z.string().trim().min(1).max(100) });

/** 笔记模板（复刻 vue2 db:getNoteTemplates / db:saveNoteTemplate / db:deleteNoteTemplate）。 */
class TemplatesController {
  async list(): Promise<IpcResult<NoteTemplateRow[]>> {
    try {
      return ok(templatesRepository.listAll());
    } catch (error) {
      return failFromError(error, 'TEMPLATES_LIST_ERROR');
    }
  }

  async save(args?: unknown): Promise<IpcResult<NoteTemplateRow>> {
    try {
      return ok(templatesRepository.saveOne(noteTemplateSaveSchema.parse(args ?? {})));
    } catch (error) {
      return failFromError(error, 'TEMPLATE_SAVE_ERROR');
    }
  }

  async saveMany(args?: unknown): Promise<IpcResult<number>> {
    try {
      const { templates } = saveManySchema.parse(args ?? {});
      for (const template of templates) {
        templatesRepository.saveOne(template);
      }
      return ok(templates.length);
    } catch (error) {
      return failFromError(error, 'TEMPLATES_SAVE_MANY_ERROR');
    }
  }

  async remove(args?: unknown): Promise<IpcResult<boolean>> {
    try {
      const { id } = removeSchema.parse(args ?? {});
      return ok(templatesRepository.remove(id));
    } catch (error) {
      return failFromError(error, 'TEMPLATE_REMOVE_ERROR');
    }
  }
}

TemplatesController.toString = () => '[class TemplatesController]';

export default TemplatesController;
