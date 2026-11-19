import type { TagRecord } from '../../shared/types/domain';
import { getDatabase } from './connection';

interface TagRow {
  id: number;
  name: string;
  color: string | null;
  note_count: number | null;
}

export const tagsRepository = {
  list(): TagRecord[] {
    const rows = getDatabase()
      .prepare(
        `SELECT
           t.id,
           t.name,
           t.color,
           (SELECT COUNT(*) FROM note_tags nt WHERE nt.tag_id = t.id) AS note_count
         FROM tags t
         ORDER BY note_count DESC, t.name ASC`,
      )
      .all() as TagRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color ?? '#1890ff',
      noteCount: Number(row.note_count) || 0,
    }));
  },

  create(name: string, color = '#1890ff'): TagRecord {
    const db = getDatabase();
    const clean = name.trim();
    if (!clean) {
      throw new Error('Tag name is required');
    }

    db.prepare('INSERT OR IGNORE INTO tags (name, color, created_at) VALUES (?, ?, ?)').run(
      clean,
      color,
      Date.now(),
    );
    const row = db
      .prepare(
        `SELECT
           t.id,
           t.name,
           t.color,
           (SELECT COUNT(*) FROM note_tags nt WHERE nt.tag_id = t.id) AS note_count
         FROM tags t WHERE t.name = ?`,
      )
      .get(clean) as TagRow | undefined;

    if (!row) {
      throw new Error('Failed to create tag');
    }

    return {
      id: row.id,
      name: row.name,
      color: row.color ?? color,
      noteCount: Number(row.note_count) || 0,
    };
  },

  remove(id: number): boolean {
    const info = getDatabase().prepare('DELETE FROM tags WHERE id = ?').run(id);
    return info.changes > 0;
  },
};
