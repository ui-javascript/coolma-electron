import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from 'ee-core/log';
import type { ImportCounts, ImportResult } from '../../shared/types/domain';
import {
  closeDatabase,
  getDatabase,
  getDatabaseStatus,
  initDatabase,
  resolveDatabasePath,
} from './database';

interface CountRow {
  count: number;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as CountRow;
  return Number(row.count) > 0;
}

function countRows(db: Database.Database, table: string): number {
  if (!tableExists(db, table)) {
    return 0;
  }
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as CountRow;
  return Number(row.count) || 0;
}

function readCounts(db: Database.Database): ImportCounts {
  return {
    notes: countRows(db, 'notes'),
    tags: countRows(db, 'tags'),
    categories: countRows(db, 'local_categories'),
    runes: countRows(db, 'runes'),
    echoes: countRows(db, 'echoes'),
  };
}

function removeSqliteSidecars(filePath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${filePath}${suffix}`, { force: true });
  }
}

function backupDirectory(): string {
  const directory = path.join(path.dirname(resolveDatabasePath()), 'backups');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function backupDatabase(): string {
  const db = getDatabase();
  const target = resolveDatabasePath();
  db.pragma('wal_checkpoint(TRUNCATE)');
  const backupPath = path.join(backupDirectory(), `coolma-${timestamp()}.db`);
  fs.copyFileSync(target, backupPath);
  logger.info('[db] backup created:', backupPath);
  return backupPath;
}

export async function importLegacyDatabase(sourcePath: string): Promise<ImportResult> {
  const source = path.resolve(sourcePath);
  const target = resolveDatabasePath();

  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Legacy database not found: ${source}`);
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    throw new Error('Source and target database are the same file');
  }

  const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
  let counts: ImportCounts;
  let tempPath = '';
  let backupPath: string | null = null;

  try {
    const integrity = sourceDb.pragma('integrity_check', { simple: true });
    if (String(integrity).toLowerCase() !== 'ok') {
      throw new Error(`Legacy database integrity check failed: ${String(integrity)}`);
    }
    counts = readCounts(sourceDb);
    if (counts.notes === 0) {
      throw new Error('Legacy database has no notes table or no notes');
    }

    tempPath = path.join(backupDirectory(), `import-${timestamp()}.db`);
    fs.rmSync(tempPath, { force: true });
    await sourceDb.backup(tempPath);
  } finally {
    sourceDb.close();
  }

  if (fs.existsSync(target)) {
    backupPath = backupDatabase();
  }

  closeDatabase();
  removeSqliteSidecars(target);

  try {
    fs.copyFileSync(tempPath, target);
    initDatabase({ filePath: target });
    const importedCounts = readCounts(getDatabase());
    if (importedCounts.notes !== counts.notes) {
      throw new Error(
        `Note count mismatch after import: expected ${counts.notes}, got ${importedCounts.notes}`,
      );
    }

    const status = getDatabaseStatus();
    logger.info('[db] legacy import complete:', source, importedCounts);

    return {
      imported: true,
      sourcePath: source,
      backupPath,
      counts: importedCounts,
      schemaVersion: status.schemaVersion,
    };
  } catch (error) {
    closeDatabase();
    fs.rmSync(target, { force: true });
    removeSqliteSidecars(target);

    if (backupPath) {
      fs.copyFileSync(backupPath, target);
      initDatabase({ filePath: target });
      logger.warn('[db] import failed, previous database restored:', backupPath);
    }

    throw error;
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}
