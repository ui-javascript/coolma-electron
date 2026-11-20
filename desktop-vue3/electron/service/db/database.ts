import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { logger } from 'ee-core/log';
import type { DatabaseStatus } from '../../shared/types/domain';
import { runMigrations } from './migrations';
import { syncBuiltinCatalog } from './builtins';
import { clearDatabase, getDatabase as getCurrentDatabase, setDatabase, type SqlDatabase } from './connection';

type DB = Database.Database;

let db: DB | null = null;
let dbPath = '';
let quitHookRegistered = false;

export function resolveDatabasePath(): string {
  if (process.env.COOLMA_DB_PATH) {
    return path.resolve(process.env.COOLMA_DB_PATH);
  }
  return path.join(app.getPath('userData'), 'coolma.db');
}

export function initDatabase(options: { filePath?: string } = {}): DB {
  if (db) {
    return db;
  }

  const filePath = options.filePath ? path.resolve(options.filePath) : resolveDatabasePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const database = new Database(filePath);
  try {
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('synchronous = NORMAL');
    database.pragma('wal_autocheckpoint = 1000');

    const schemaVersion = runMigrations(database as unknown as SqlDatabase);
    // 每次启动对账内置回响，JSON 里删掉的项无需新迁移版本即可下线。
    syncBuiltinCatalog(database as unknown as SqlDatabase);
    setDatabase(database as unknown as SqlDatabase);
    db = database;
    dbPath = filePath;
    logger.info('[db] ready:', filePath, 'schemaVersion:', schemaVersion);

    if (!quitHookRegistered) {
      quitHookRegistered = true;
      app.on('before-quit', () => closeDatabase());
    }

    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function getDatabase(): SqlDatabase {
  return getCurrentDatabase();
}

export function closeDatabase(): void {
  if (!db) {
    return;
  }
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    logger.info('[db] closed:', dbPath);
  } finally {
    db = null;
    dbPath = '';
    clearDatabase();
  }
}

export function getDatabaseStatus(): DatabaseStatus {
  const database = getDatabase();
  const currentPath = dbPath || resolveDatabasePath();
  const count = (table: string): number => {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    return Number(row?.count ?? 0);
  };
  const tables = database
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .get() as { count: number };

  const mainSize = fs.existsSync(currentPath) ? fs.statSync(currentPath).size : 0;
  const walPath = `${currentPath}-wal`;
  const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

  return {
    ready: true,
    path: currentPath,
    schemaVersion: Number(database.pragma('user_version', { simple: true })) || 0,
    tables: Number(tables.count) || 0,
    noteCount: count('notes'),
    tagCount: count('tags'),
    runeCount: count('runes'),
    echoCount: count('echoes'),
    sizeBytes: mainSize + walSize,
    walMode: String(database.pragma('journal_mode', { simple: true })),
  };
}
