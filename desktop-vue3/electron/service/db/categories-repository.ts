import type { CategoryRecord } from '../../shared/types/domain';
import { getDatabase } from './database';

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
    const category = input.category.trim();
    if (!category) {
      throw new Error('Category is required');
    }

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
      input.parent?.trim() ?? '',
      input.kbGuid ?? '',
      input.localOnly ? 1 : 0,
      now,
      now,
    );

    return {
      category,
      parent: input.parent?.trim() ?? '',
      kbGuid: input.kbGuid ?? '',
      localOnly: input.localOnly ? 1 : 0,
      noteCount: 0,
    };
  },

  remove(category: string): boolean {
    const info = getDatabase().prepare('DELETE FROM local_categories WHERE category = ?').run(category);
    return info.changes > 0;
  },
};
