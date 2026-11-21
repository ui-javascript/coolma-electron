import { getDatabase } from './connection';
import { syncBuiltinCatalog } from './builtins';
import { echoBuiltins } from '../../shared/builtins/catalog';
import { BUILTIN_RUNE_TEMPLATE } from './migrations';

export interface LibraryResetResult {
  success: boolean;
  /** 重置后内置项数量。 */
  count: number;
  /** 保留的自定义项数量。 */
  customKept: number;
}

interface CountRow {
  total: number | null;
}

/** 自定义行：不含 vue2 的 `__builtin_` 前缀，也不含 v3 的示例符文 id。 */
function countCustom(table: 'runes' | 'echoes'): number {
  const clause =
    table === 'runes'
      ? `id NOT LIKE '__builtin_%' AND id != 'builtin-rune-counter'`
      : `id NOT LIKE '__builtin_%' AND id != 'builtin-echo-demo'`;
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${clause}`)
    .get() as CountRow;
  return Number(row.total) || 0;
}

/**
 * 重置本地数据库（对齐 vue2 `db:resetDatabase`）：
 * 清空笔记、标签、目录、同步日志、guid 映射与回响，重建离线根目录，
 * 再把内置回响按 catalog 重新种回去。符文与模板不动。
 */
export function resetDatabase(): boolean {
  const db = getDatabase();
  const now = Date.now();
  const write = db.transaction(() => {
    db.prepare('DELETE FROM notes').run();
    db.prepare('DELETE FROM tags').run();
    db.prepare('DELETE FROM note_tags').run();
    db.prepare('DELETE FROM sync_log').run();
    db.prepare('DELETE FROM guid_mapping').run();
    db.prepare('DELETE FROM local_categories').run();
    db.prepare('DELETE FROM echoes').run();
    db.prepare(
      `INSERT INTO local_categories (category, parent, kb_guid, local_only, created_at, updated_at)
       VALUES ('/', '', '', 1, ?, ?)`,
    ).run(now, now);
  });
  write();
  syncBuiltinCatalog(db);
  return true;
}

/**
 * 用内置符文模板重置内置符文，自定义符文保留。
 * v3 的内置符文只有示例 counter；`__builtin_*` 的历史行一并清掉。
 */
export function resetBuiltinRunes(): LibraryResetResult {
  const db = getDatabase();
  const customKept = countCustom('runes');
  const now = Date.now();
  const write = db.transaction(() => {
    db.prepare(`DELETE FROM runes WHERE id LIKE '__builtin_%' OR id = 'builtin-rune-counter'`).run();
    db.prepare(
      `INSERT OR IGNORE INTO runes (id, name, "desc", color, icon, template, category, sort_order, inherit_from_previous, created_at, updated_at)
       VALUES ('builtin-rune-counter', 'counter', '点击即加一的示例符文', '#7E57C2', 'auto_awesome', ?, 'general', 0, 0, ?, ?)`,
    ).run(BUILTIN_RUNE_TEMPLATE, now, now);
  });
  write();
  const count = db
    .prepare(`SELECT COUNT(*) AS total FROM runes WHERE id LIKE '__builtin_%' OR id = 'builtin-rune-counter'`)
    .get() as CountRow;
  return { success: true, count: Number(count.total) || 0, customKept };
}

/**
 * 用内置回响重建内置回响，自定义回响保留。
 * `syncBuiltinCatalog` 本身是幂等 upsert，会把用户改过的内置字段还原。
 */
export function resetBuiltinEchoes(): LibraryResetResult {
  const db = getDatabase();
  const customKept = countCustom('echoes');
  db.transaction(() => {
    db.prepare(`DELETE FROM echoes WHERE id LIKE '__builtin_%' OR id = 'builtin-echo-demo'`).run();
  })();
  syncBuiltinCatalog(db);
  return { success: true, count: echoBuiltins().length, customKept };
}
