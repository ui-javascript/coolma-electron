import { dialog, shell } from 'electron';
import type { BackupEntry, DatabaseStatus, ImportResult, RestoreResult } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { databaseImportSchema, databaseRestoreSchema } from '../shared/ipc/schemas';
import { getDatabaseStatus } from '../service/db/database';
import { importLegacyDatabase } from '../service/db/legacy-import';
import { createBackup, listBackups, restoreDatabase } from '../service/db/backup';
import { failFromError } from './controller-utils';

class DatabaseController {
  async status(): Promise<IpcResult<DatabaseStatus>> {
    try {
      return ok(getDatabaseStatus());
    } catch (error) {
      return failFromError(error, 'DATABASE_STATUS_ERROR');
    }
  }

  async importLegacy(args?: unknown): Promise<IpcResult<ImportResult | null>> {
    try {
      const input = databaseImportSchema.parse(args ?? {});
      let sourcePath = input.path;

      if (!sourcePath) {
        const result = await dialog.showOpenDialog({
          title: '选择 Coolma 旧数据库',
          properties: ['openFile'],
          filters: [
            { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return ok(null);
        }
        sourcePath = result.filePaths[0];
      }

      return ok(await importLegacyDatabase(sourcePath));
    } catch (error) {
      return failFromError(error, 'DATABASE_IMPORT_ERROR');
    }
  }

  async backup(): Promise<IpcResult<{ path: string }>> {
    try {
      return ok({ path: createBackup() });
    } catch (error) {
      return failFromError(error, 'DATABASE_BACKUP_ERROR');
    }
  }

  /** 备份列表（只列本应用产出的文件，按时间倒序）。 */
  async backups(): Promise<IpcResult<BackupEntry[]>> {
    try {
      return ok(listBackups());
    } catch (error) {
      return failFromError(error, 'DATABASE_BACKUPS_ERROR');
    }
  }

  /**
   * 从备份恢复：不传 path 就弹选择框。
   * 恢复前会自动打一份 pre-restore 回滚点，失败时自动回滚。
   */
  async restore(args?: unknown): Promise<IpcResult<RestoreResult | null>> {
    try {
      const input = databaseRestoreSchema.parse(args ?? {});
      let sourcePath = input.path;
      if (!sourcePath) {
        const result = await dialog.showOpenDialog({
          title: '选择备份文件',
          properties: ['openFile'],
          filters: [
            { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return ok(null);
        }
        sourcePath = result.filePaths[0];
      }
      return ok(await restoreDatabase(sourcePath));
    } catch (error) {
      return failFromError(error, 'DATABASE_RESTORE_ERROR');
    }
  }

  async openFolder(): Promise<IpcResult<{ opened: boolean }>> {
    try {
      shell.showItemInFolder(getDatabaseStatus().path);
      return ok({ opened: true });
    } catch (error) {
      return failFromError(error, 'DATABASE_OPEN_FOLDER_ERROR');
    }
  }
}

DatabaseController.toString = () => '[class DatabaseController]';

export default DatabaseController;
