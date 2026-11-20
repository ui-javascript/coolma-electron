import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { z } from 'zod';
import { saveAttachmentBuffer, saveImageAttachment } from '../service/attachments';
import { uploadImageByPicGo } from '../service/image/upload';
import { uploadImageResource } from '../service/sync/wiznote';
import { failFromError } from './controller-utils';

const saveImageSchema = z.object({
  base64: z.string().min(1),
  ext: z.string().trim().max(8).optional(),
  kbGuid: z.string().trim().max(100).nullable().optional(),
  docGuid: z.string().trim().max(100).nullable().optional(),
  noteId: z.number().int().positive().nullable().optional(),
});

const uploadImageSchema = saveImageSchema.extend({
  name: z.string().trim().max(200).optional(),
  service: z.enum(['picgoServer', 'wizOfficialImageUploadService', 'none']).default('none'),
});

function base64Buffer(raw: string): Buffer {
  const value = raw.includes(',') && raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  return Buffer.from(value, 'base64');
}

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

  /**
   * 贴图上传：先本地落盘（失败/未配置图床时的回退），再按设置走 PicGo 或为知官方图床。
   * 上传失败不抛错，返回本地 url + error，编辑器照常插图并提示。
   */
  async uploadImage(args?: unknown): Promise<
    IpcResult<{ url: string; localUrl: string; uploaded: boolean; service: string; error?: string }>
  > {
    try {
      const input = uploadImageSchema.parse(args);
      const { app } = await import('electron');
      const root = app.getPath('temp');
      const local = await saveImageAttachment({
        root,
        base64: input.base64,
        ext: input.ext,
        kbGuid: input.kbGuid,
        docGuid: input.docGuid,
        noteId: input.noteId,
      });

      if (input.service === 'picgoServer') {
        try {
          const url = await uploadImageByPicGo(local.filePath);
          return ok({ url, localUrl: local.url, uploaded: true, service: input.service });
        } catch (error) {
          return ok({
            url: local.url,
            localUrl: local.url,
            uploaded: false,
            service: input.service,
            error: String((error as Error)?.message || error),
          });
        }
      }

      if (input.service === 'wizOfficialImageUploadService') {
        try {
          const buffer = base64Buffer(input.base64);
          const uploaded = await uploadImageResource({
            buffer,
            name: input.name || local.name,
            docGuid: input.docGuid || '',
          });
          const saved = uploaded.name === local.name
            ? local
            : await saveAttachmentBuffer({
                root,
                buffer,
                name: uploaded.name,
                kbGuid: input.kbGuid,
                docGuid: input.docGuid,
                noteId: input.noteId,
              });
          return ok({ url: saved.url, localUrl: local.url, uploaded: true, service: input.service });
        } catch (error) {
          return ok({
            url: local.url,
            localUrl: local.url,
            uploaded: false,
            service: input.service,
            error: String((error as Error)?.message || error),
          });
        }
      }

      return ok({ url: local.url, localUrl: local.url, uploaded: false, service: 'none' });
    } catch (error) {
      return failFromError(error, 'ATTACHMENT_UPLOAD_ERROR');
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
