import type { CategoryRecord } from '../../shared/types/domain';
import { getDatabase } from './database';
import { normalizeCategory } from './notes-repository';

interface CategoryRow {
  category: string;
  parent: string | null;
  kb_guid: string | null;
  local_only: number | null;
  note_count: number | null;
}

export const categoriesRepository = {
  list(): CategoryRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT
           c.category,
           c.parent,
           c.kb_guid,
           c.local_only,
           (SELECT COUNT(*) FROM notes n WHERE n.category = c.category) AS note_count
         FROM local_categories c
         ORDER BY c.parent ASC, c.category ASC`,
      )
      .all() as CategoryRow[];

    return rows.map((row) => ({
      category: row.category,
      parent: row.parent ?? '',
      kbGuid: row.kb_guid ?? '',
      localOnly: row.local_only ?? 0,
      noteCount: Number(row.note_count) || 0,
    }));
  },

  create(input: {
    category: string;
    parent?: string;
    kbGuid?: string;
    localOnly?: boolean;
  }): CategoryRecord {
    const db = getDatabase();
    const now = Date.now();
    const category = normalizeCategory(input.category);
    if (!category || category === '/') {
      throw new Error('Category is required');
    }
    // 父路径由规范化后的 category 推导，避免调用方传入不一致的 parent。
    const parent = input.parent !== undefined ? normalizeCategory(input.parent) : parentOf(category);

    db.prepare(
      `INSERT INTO local_categories (category, parent, kb_guid, local_only, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(category) DO UPDATE SET
         parent = excluded.parent,
         kb_guid = excluded.kb_guid,
         local_only = excluded.local_only,
         updated_at = excluded.updated_at`,
    ).run(
      category,
      parent,
      input.kbGuid ?? '',
      input.localOnly ? 1 : 0,
      now,
      now,
    );

    const noteCount = this.countNotes(category);

    return {
      category,
      parent,
      kbGuid: input.kbGuid ?? '',
      localOnly: input.localOnly ? 1 : 0,
      noteCount,
    };
  },

  /** 该 category 下真实笔记数量；控制器据此拒绝删除非空文件夹。 */
  countNotes(category: string): number {
    const row = getDatabase()
      .prepare('SELECT COUNT(*) AS count FROM notes WHERE category = ?')
      .get(normalizeCategory(category)) as { count: number };
    return Number(row.count) || 0;
  },

  remove(category: string): boolean {
    const normalized = normalizeCategory(category);
    if (normalized === '/') {
      return false;
    }
    const info = getDatabase()
      .prepare('DELETE FROM local_categories WHERE category = ?')
      .run(normalized);
    return info.changes > 0;
  },

  /** 父目录；根目录下的一级文件夹父路径为 '/'。 */
  parentOf(category: string): string {
    return parentOf(normalizeCategory(category));
  },
};

function parentOf(category: string): string {
  const parts = category.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return '/';
  }
  return `/${parts.slice(0, -1).join('/')}`;
}
