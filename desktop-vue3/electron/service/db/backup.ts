import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from 'ee-core/log';
import type { BackupEntry, RestoreResult } from '../../shared/types/domain';
import {
  backupFileName,
  listBackups as listBackupFiles,
  pruneBackups as pruneBackupFiles,
  timestamp,
} from './backup-files';
import {
  closeDatabase,
  getDatabase,
  getDatabaseStatus,
  initDatabase,
  resolveDatabasePath,
} from './database';

export { backupFileName, isManagedBackupFile } from './backup-files';

/**
 * 与 legacy 导入共用同一个备份目录：<库所在目录>/backups
 * 唯二需要 Electron 的地方就是这里和 createBackup/restore，纯逻辑已下沉到 backup-files.ts。
 */
export function backupDirectory(): string {
  const directory = path.join(path.dirname(resolveDatabasePath()), 'backups');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export function listBackups(): BackupEntry[] {
  return listBackupFiles(backupDirectory());
}

export function pruneBackups(keep = 7): string[] {
  return pruneBackupFiles(keep, backupDirectory());
}

/** 立即备份当前库（先把 WAL 落盘再复制，避免拷到半截数据）。 */
export function createBackup(prefix = 'coolma'): string {
  const db = getDatabase();
  const target = resolveDatabasePath();
  db.pragma('wal_checkpoint(TRUNCATE)');
  const backupPath = path.join(backupDirectory(), backupFileName(prefix));
  fs.copyFileSync(target, backupPath);
  logger.info('[db] backup created:', backupPath);
  return backupPath;
}

export interface AutoBackupOptions {
  intervalMs?: number;
  keep?: number;
  now?: number;
}

/**
 * 启动时的自动备份：距最近一份备份超过 intervalMs 才做，避免每次启动都堆一份。
 * 默认 24 小时 + 保留 7 份。
 */
export function autoBackupIfDue(options: AutoBackupOptions = {}): string | null {
  const intervalMs = options.intervalMs ?? 24 * 60 * 60 * 1000;
  const keep = options.keep ?? 7;
  const now = options.now ?? Date.now();
  const latest = listBackups().find((entry) => entry.kind === 'manual');
  if (latest && now - latest.createdAt < intervalMs) {
    return null;
  }
  const backupPath = createBackup();
  pruneBackups(keep);
  return backupPath;
}

function removeSidecars(target: string): void {
  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${target}${suffix}`, { force: true });
  }
}

/** 打开候选备份做体检：完整性 + 关键表 + 笔记数。 */
export function inspectBackupDb(sourcePath: string): { counts: Record<string, number>; schemaVersion: number } {
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (String(integrity).toLowerCase() !== 'ok') {
      throw new Error(`BACKUP_INTEGRITY_FAILED: ${String(integrity)}`);
    }
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const names = new Set(tables.map((row) => row.name));
    if (!names.has('notes')) {
      throw new Error('BACKUP_NOT_COOLMA_DB: missing notes table');
    }
    const count = (table: string): number =>
      names.has(table)
        ? Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count) || 0
        : 0;
    return {
      counts: {
        notes: count('notes'),
        tags: count('tags'),
        categories: count('local_categories'),
        runes: count('runes'),
        echoes: count('echoes'),
      },
      schemaVersion: Number(db.pragma('user_version', { simple: true })) || 0,
    };
  } finally {
    db.close();
  }
}

/**
 * 用一份备份覆盖当前库。
 *
 * 顺序刻意与 legacy 导入一致：
 *   1. 校验候选文件（完整性 + 是 Coolma 库）
 *   2. 先给当前库打一份 `pre-restore` 回滚点
 *   3. 关库 → 清 WAL/SHM → 写入（先经 better-sqlite3 backup 做一份干净副本）
 *   4. 重新 init（会跑 migration 把旧版本升级上来）→ 核对笔记数
 *   5. 任何一步失败：回滚到 `pre-restore` 并重新 init
 */
export async function restoreDatabase(sourcePath: string): Promise<RestoreResult> {
  const source = path.resolve(sourcePath);
  const target = resolveDatabasePath();
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`BACKUP_NOT_FOUND: ${source}`);
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    throw new Error('BACKUP_IS_CURRENT_DB: source equals current database');
  }

  const inspected = inspectBackupDb(source);

  const currentExists = fs.existsSync(target);
  const rollbackPath = currentExists ? createBackup('pre-restore') : null;

  // 候选文件自己可能带 WAL，先落成一份干净副本再覆盖
  const stagingPath = path.join(backupDirectory(), `import-${timestamp()}.db`);
  const stagingDb = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await stagingDb.backup(stagingPath);
  } finally {
    stagingDb.close();
  }

  closeDatabase();
  removeSidecars(target);

  try {
    fs.copyFileSync(stagingPath, target);
    initDatabase({ filePath: target });
    const after = getDatabaseStatus();
    if (after.noteCount !== inspected.counts.notes) {
      throw new Error(
        `RESTORE_COUNT_MISMATCH: expected ${inspected.counts.notes}, got ${after.noteCount}`,
      );
    }
    logger.info('[db] restore complete:', source, inspected.counts);
    return {
      restored: true,
      sourcePath: source,
      backupPath: rollbackPath,
      counts: after.noteCount,
      schemaVersion: after.schemaVersion,
      previousSchemaVersion: inspected.schemaVersion,
    };
  } catch (error) {
    closeDatabase();
    fs.rmSync(target, { force: true });
    removeSidecars(target);
    if (rollbackPath) {
      fs.copyFileSync(rollbackPath, target);
      initDatabase({ filePath: target });
      logger.warn('[db] restore failed, rolled back to:', rollbackPath);
    }
    throw error;
  } finally {
    fs.rmSync(stagingPath, { force: true });
  }
}
