/**
 * 数据库连接抽象：仓储层只认这个最小接口，不直接依赖 better-sqlite3 / Electron。
 *
 * 这样两条链路可以复用同一套仓储代码：
 *   - 生产：database.ts 用 better-sqlite3 打开文件库；
 *   - 测试：scripts/db-test.ts 用 Node 内置 node:sqlite 打开内存库。
 */
export interface SqlRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqlStatement {
  // rows 的形状由 SQL 决定，仓储层在调用处做 assert，这里不引入泛型噪音
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  run(...params: any[]): SqlRunResult;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  get(...params: any[]): any;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  all(...params: any[]): any[];
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  exec(sql: string): void;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  /** 与 better-sqlite3 的语义一致：返回一个可重复调用的包装函数 */
  transaction<T, A extends unknown[]>(fn: (...args: A) => T): (...args: A) => T;
  close(): void;
}

let current: SqlDatabase | null = null;

export function setDatabase(db: SqlDatabase): void {
  current = db;
}

export function getDatabase(): SqlDatabase {
  if (!current) {
    throw new Error('Database is not initialized');
  }
  return current;
}

export function clearDatabase(): void {
  current = null;
}
