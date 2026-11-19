/**
 * 测试专用适配器：把 Node 内置 node:sqlite 包装成仓储层认识的 SqlDatabase。
 *
 * 生产环境仍走 better-sqlite3（Electron 的 ABI 只有 Electron 进程能加载），
 * 这里的存在意义是：仓储逻辑（唯一标题、事务、sync_log 折叠）终于可以在纯 Node 里断言。
 */
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlStatement } from '../electron/service/db/connection';

export interface NodeSqliteHandle {
  database: SqlDatabase;
  raw: DatabaseSync;
}

export function createNodeSqliteDatabase(filePath = ':memory:'): NodeSqliteHandle {
  const raw = new DatabaseSync(filePath);
  raw.exec('PRAGMA foreign_keys = ON');

  const database: SqlDatabase = {
    prepare(sql: string): SqlStatement {
      const stmt = raw.prepare(sql);
      return {
        run: (...params: unknown[]) => stmt.run(...(params as never[])) as unknown as { changes: number; lastInsertRowid: number | bigint },
        get: (...params: unknown[]) => stmt.get(...(params as never[])),
        all: (...params: unknown[]) => stmt.all(...(params as never[])),
      };
    },
    exec(sql: string): void {
      raw.exec(sql);
    },
    pragma(source: string, options?: { simple?: boolean }): unknown {
      // 与 better-sqlite3 对齐：取值用 SELECT，设值用 PRAGMA 赋值语句
      if (/=/.test(source)) {
        raw.exec(`PRAGMA ${source}`);
        return undefined;
      }
      const row = raw.prepare(`PRAGMA ${source}`).get() as Record<string, unknown> | undefined;
      if (!row) {
        return undefined;
      }
      const values = Object.values(row);
      return options?.simple ? values[0] : row;
    },
    transaction<T, A extends unknown[]>(fn: (...args: A) => T): (...args: A) => T {
      return (...args: A): T => {
        raw.exec('BEGIN');
        try {
          const result = fn(...args);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      };
    },
    close(): void {
      raw.close();
    },
  };

  return { database, raw };
}
