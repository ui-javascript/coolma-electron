import { dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getLogDir } from 'ee-core/ps';
import type { BackupEntry, DatabaseStatus, ImportResult, RestoreResult } from '../shared/types/domain';
import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { databaseImportSchema, databaseRestoreSchema, emptyPayloadSchema } from '../shared/ipc/schemas';
import { getDatabaseStatus, resolveDatabasePath } from '../service/db/database';
import { importLegacyDatabase } from '../service/db/legacy-import';
import { createBackup, listBackups, restoreDatabase } from '../service/db/backup';
import { resetBuiltinEchoes, resetBuiltinRunes, resetDatabase } from '../service/db/maintenance';
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

  /** 打开日志文件（vue2 `open-log-files`：定位当天/最新日志）。 */
  async openLogFile(): Promise<IpcResult<{ opened: boolean; path: string }>> {
    try {
      emptyPayloadSchema.parse(undefined);
      const dir = getLogDir();
      const logs = fs.existsSync(dir)
        ? fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
            .map((entry) => entry.name)
        : [];
      logs.sort((a, b) => {
        const statA = fs.statSync(path.join(dir, a)).mtimeMs;
        const statB = fs.statSync(path.join(dir, b)).mtimeMs;
        return statB - statA;
      });
      const latest = logs[0];
      if (latest) {
        const filePath = path.join(dir, latest);
        shell.showItemInFolder(filePath);
        return ok({ opened: true, path: filePath });
      }
      if (fs.existsSync(dir)) {
        await shell.openPath(dir);
        return ok({ opened: true, path: dir });
      }
      throw new Error(`LOG_DIRECTORY_NOT_FOUND: ${dir}`);
    } catch (error) {
      return failFromError(error, 'DATABASE_OPEN_LOG_ERROR');
    }
  }

  /** 打开 sqlite 文件（vue2 `open-sqlite-file`）。 */
  async openSqliteFile(): Promise<IpcResult<{ opened: boolean; path: string }>> {
    try {
      emptyPayloadSchema.parse(undefined);
      const filePath = resolveDatabasePath();
      shell.showItemInFolder(filePath);
      return ok({ opened: true, path: filePath });
    } catch (error) {
      return failFromError(error, 'DATABASE_OPEN_SQLITE_ERROR');
    }
  }

  /** 清空本地缓存库（vue2 `db:resetDatabase`）。 */
  async reset(): Promise<IpcResult<{ success: boolean }>> {
    try {
      emptyPayloadSchema.parse(undefined);
      return ok({ success: resetDatabase() });
    } catch (error) {
      return failFromError(error, 'DATABASE_RESET_ERROR');
    }
  }

  /** 重置内置符文，保留自定义符文。 */
  async resetRunes(): Promise<IpcResult<{ success: boolean; count: number; customKept: number }>> {
    try {
      emptyPayloadSchema.parse(undefined);
      return ok(resetBuiltinRunes());
    } catch (error) {
      return failFromError(error, 'DATABASE_RESET_RUNES_ERROR');
    }
  }

  /** 重置内置回响，保留自定义回响。 */
  async resetEchoes(): Promise<IpcResult<{ success: boolean; count: number; customKept: number }>> {
    try {
      emptyPayloadSchema.parse(undefined);
      return ok(resetBuiltinEchoes());
    } catch (error) {
      return failFromError(error, 'DATABASE_RESET_ECHOES_ERROR');
    }
  }
}

DatabaseController.toString = () => '[class DatabaseController]';

export default DatabaseController;
