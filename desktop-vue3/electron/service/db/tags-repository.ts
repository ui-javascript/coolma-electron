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

  /**
   * 删除标签。
   *
   * notes.tags 是标签的权威来源（字符串），note_tags 只是派生索引。
   * 只删 tags 行会让字符串里留下"幽灵标签"，所以这里必须同时清理：
   *   1. 从每条笔记的 tags 字符串里摘掉该标签
   *   2. 删掉指向它的 note_tags 关系
   *   3. 最后删标签本体
   */
  remove(id: number): boolean {
    const db = getDatabase();
    const row = db.prepare('SELECT name FROM tags WHERE id = ?').get(id) as { name: string } | undefined;
    if (!row) {
      return false;
    }
    const name = row.name;

    const write = db.transaction(() => {
      const noteRows = db
        .prepare('SELECT id, tags FROM notes WHERE tags IS NOT NULL AND TRIM(tags) != \'\'')
        .all() as Array<{ id: number; tags: string }>;

      const update = db.prepare('UPDATE notes SET tags = ?, updated_at = ? WHERE id = ?');
      let touched = 0;
      for (const note of noteRows) {
        const next = note.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag && tag !== name)
          .join(',');
        if (next !== note.tags) {
          update.run(next, Date.now(), note.id);
          touched += 1;
        }
      }

      db.prepare('DELETE FROM note_tags WHERE tag_id = ?').run(id);
      const removed = db.prepare('DELETE FROM tags WHERE id = ?').run(id).changes > 0;
      return { removed, touched };
    });

    const result = write();
    return result.removed;
  },

  /**
   * 改名。
   *
   * 同样以 notes.tags 字符串为权威：改名必须把字符串里的旧名换成新名，
   * 否则 note_tags 重建后旧名会复活成幽灵标签。
   * 撞名（大小写无关）返回 { success: false, code: 'TAG_DUPLICATE_NAME' }，对齐 vue2。
   */
  rename(id: number, rawName: string): { success: boolean; code?: string; name?: string } {
    const db = getDatabase();
    const clean = String(rawName ?? '').trim();
    if (!clean) {
      return { success: false, code: 'TAG_EMPTY_NAME' };
    }
    const row = db.prepare('SELECT name FROM tags WHERE id = ?').get(id) as { name: string } | undefined;
    if (!row) {
      return { success: false, code: 'TAG_NOT_FOUND' };
    }
    const oldName = row.name;
    if (clean === oldName) {
      return { success: true, name: clean };
    }
    const dup = db
      .prepare('SELECT id FROM tags WHERE LOWER(name) = LOWER(?) AND id != ?')
      .get(clean, id) as { id: number } | undefined;
    if (dup) {
      return { success: false, code: 'TAG_DUPLICATE_NAME' };
    }

    const write = db.transaction(() => {
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(clean, id);
      const noteRows = db
        .prepare("SELECT id, tags FROM notes WHERE tags IS NOT NULL AND TRIM(tags) != ''")
        .all() as Array<{ id: number; tags: string }>;
      const update = db.prepare('UPDATE notes SET tags = ?, updated_at = ? WHERE id = ?');
      let touched = 0;
      for (const note of noteRows) {
        const parts = note.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
        if (!parts.includes(oldName)) {
          continue;
        }
        const next = Array.from(new Set(parts.map((tag) => (tag === oldName ? clean : tag)))).join(',');
        update.run(next, Date.now(), note.id);
        touched += 1;
      }
      return touched;
    });

    write();
    return { success: true, name: clean };
  },

  /** 批量删除（单事务内逐个走 remove 语义，返回实际删除条数）。 */
  removeMany(ids: number[]): number {
    let deleted = 0;
    for (const id of ids) {
      if (this.remove(id)) {
        deleted += 1;
      }
    }
    return deleted;
  },

  /** 清理未被任何笔记引用的标签（count = 0）。返回删除条数。 */
  cleanupUnused(): number {
    const rows = getDatabase()
      .prepare(
        `SELECT t.id FROM tags t
          WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.id)`,
      )
      .all() as Array<{ id: number }>;
    return this.removeMany(rows.map((row) => row.id));
  },

  /**
   * 用 notes.tags 重建 note_tags 索引（幂等，可反复执行）。
   *
   * 这是「一致性治理」的修复动作：体检发现 TAG_DRIFT / 关系缺失时，
   * 以字符串为准重算关系表，不反向改字符串 —— 字符串才是导出与同步的依据。
   */
  syncFromNotes(): { notes: number; links: number; tagsAdded: number } {
    const db = getDatabase();
    const noteRows = db
      .prepare(
        `SELECT id, tags FROM notes
          WHERE tags IS NOT NULL AND TRIM(tags) != ''`,
      )
      .all() as Array<{ id: number; tags: string }>;

    const ensureTag = db.prepare('INSERT OR IGNORE INTO tags (name, color, created_at) VALUES (?, ?, ?)');
    const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
    const attach = db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)');
    const clearNote = db.prepare('DELETE FROM note_tags WHERE note_id = ?');

    const write = db.transaction(() => {
      let links = 0;
      let tagsAdded = 0;
      const knownTags = new Set(
        (db.prepare('SELECT name FROM tags').all() as Array<{ name: string }>).map((row) => row.name),
      );

      for (const note of noteRows) {
        clearNote.run(note.id);
        const names = Array.from(
          new Set(
            note.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        );
        for (const name of names) {
          if (!knownTags.has(name)) {
            ensureTag.run(name, '#1890ff', Date.now());
            knownTags.add(name);
            tagsAdded += 1;
          }
          const tagRow = findTag.get(name) as { id: number } | undefined;
          if (tagRow) {
            attach.run(note.id, tagRow.id);
            links += 1;
          }
        }
      }
      return { notes: noteRows.length, links, tagsAdded };
    });

    return write();
  },
};
