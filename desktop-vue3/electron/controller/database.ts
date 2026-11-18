import { dialog, shell } from 'electron';
import type { DatabaseStatus, ImportResult } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { databaseImportSchema } from '../shared/ipc/schemas';
import { getDatabaseStatus } from '../service/db/database';
import { backupDatabase, importLegacyDatabase } from '../service/db/legacy-import';
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
      return ok({ path: backupDatabase() });
    } catch (error) {
      return failFromError(error, 'DATABASE_BACKUP_ERROR');
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
