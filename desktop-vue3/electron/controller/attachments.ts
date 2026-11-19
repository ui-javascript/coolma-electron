import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { z } from 'zod';
import { saveImageAttachment } from '../service/attachments';
import { failFromError } from './controller-utils';

const saveImageSchema = z.object({
  base64: z.string().min(1),
  ext: z.string().trim().max(8).optional(),
  kbGuid: z.string().trim().max(100).nullable().optional(),
  docGuid: z.string().trim().max(100).nullable().optional(),
  noteId: z.number().int().positive().nullable().optional(),
});

/**
 * 附件（图片）落盘：粘贴/拖入图片时由渲染进程调用，
 * 返回 coolma:// 地址写进 markdown（对齐 vue2 的 save-temp-image）。
 */
class AttachmentsController {
  async saveImage(args?: unknown): Promise<IpcResult<{ url: string; filePath: string; name: string }>> {
    try {
      const input = saveImageSchema.parse(args);
      const { app } = await import('electron');
      const result = await saveImageAttachment({
        ...input,
        root: app.getPath('temp'),
      });
      return ok(result);
    } catch (error) {
      return failFromError(error, 'ATTACHMENT_SAVE_ERROR');
    }
  }

  async dir(args?: unknown): Promise<IpcResult<{ dir: string }>> {
    try {
      const input = saveImageSchema.partial({ base64: true }).parse(args ?? {});
      const { app } = await import('electron');
      const { attachmentDir } = await import('../service/attachments');
      return ok({ dir: attachmentDir(app.getPath('temp'), input.kbGuid, input.docGuid, input.noteId) });
    } catch (error) {
      return failFromError(error, 'ATTACHMENT_DIR_ERROR');
    }
  }
}

AttachmentsController.toString = () => '[class AttachmentsController]';

export default AttachmentsController;
