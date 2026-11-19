import { app, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import {
  commitImport,
  previewImport,
  type CommitInput,
  type PackKind,
  type PreviewGroup,
} from '../service/packs-service';
import { fetchRemoteText } from '../service/remote-fetch';
import {
  packCommitSchema,
  packExportSchema,
  packPreviewSchema,
  packRemoteSchema,
} from '../shared/ipc/schemas';
import { failFromError } from './controller-utils';

/** 符文/回响 Pack v1：预览分组、提交写入、远程抓取、导出落盘。 */
class PacksController {
  async preview(args?: unknown): Promise<IpcResult<PreviewGroup>> {
    try {
      const { kind, entries, targetCategory } = packPreviewSchema.parse(args ?? {});
      return ok(previewImport(kind as PackKind, entries, targetCategory ?? ''));
    } catch (error) {
      return failFromError(error, 'PACK_PREVIEW_ERROR');
    }
  }

  async commit(args?: unknown): Promise<IpcResult<{ created: number; replaced: number; skipped: Array<{ name: string; reason: string }> }>> {
    try {
      const parsed = packCommitSchema.parse(args ?? {});
      const input: CommitInput = {
        createNames: parsed.createNames,
        replaceNames: parsed.replaceNames,
        targetCategory: parsed.targetCategory ?? '',
        previewAt: parsed.previewAt,
        sourceByName: parsed.sourceByName as CommitInput['sourceByName'],
      };
      return ok(commitImport(parsed.kind as PackKind, input));
    } catch (error) {
      return failFromError(error, 'PACK_COMMIT_ERROR');
    }
  }

  async fetchRemote(args?: unknown): Promise<IpcResult<{ text: string; finalUrl: string }>> {
    try {
      const { sourceUrl } = packRemoteSchema.parse(args ?? {});
      const result = await fetchRemoteText(sourceUrl);
      if (!result.success) {
        return {
          ok: false,
          error: { code: result.code ?? 'FETCH_FAILED', message: result.message ?? '抓取失败' },
        };
      }
      return ok({ text: result.text ?? '', finalUrl: result.finalUrl ?? '' });
    } catch (error) {
      return failFromError(error, 'PACK_FETCH_REMOTE_ERROR');
    }
  }

  async exportFile(args?: unknown): Promise<IpcResult<string>> {
    try {
      const { fileName, content } = packExportSchema.parse(args ?? {});
      const result = await dialog.showSaveDialog({
        title: 'export',
        defaultPath: join(app.getPath('documents'), fileName),
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) {
        return ok('');
      }
      await writeFile(result.filePath, content, 'utf-8');
      return ok(result.filePath);
    } catch (error) {
      return failFromError(error, 'PACK_EXPORT_ERROR');
    }
  }
}

PacksController.toString = () => '[class PacksController]';

export default PacksController;
