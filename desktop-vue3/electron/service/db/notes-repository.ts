import { randomUUID } from 'node:crypto';
import type {
  NoteListResult,
  NoteRecord,
  NoteStats,
  NoteSummary,
} from '../../shared/types/domain';
import { getDatabase } from './database';

interface NoteRow {
  id: number;
  doc_guid: string | null;
  kb_guid: string | null;
  title: string;
  content: string;
  category: string;
  tags: string;
  data_created: number | null;
  data_modified: number | null;
  local_modified: number | null;
  server_modified: number | null;
  created_at: number | null;
  updated_at: number | null;
  dirty: number;
}

export interface ListNotesInput {
  query?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface CreateNoteInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  dirty?: number;
}

function excerptOf(content: string): string {
  return content
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function toSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    docGuid: row.doc_guid,
    kbGuid: row.kb_guid,
    title: row.title,
    excerpt: excerptOf(row.content ?? ''),
    category: row.category,
    tags: row.tags ?? '',
    createdAt: row.created_at ?? row.data_created ?? 0,
    updatedAt: row.updated_at ?? row.data_modified ?? 0,
    dirty: row.dirty ?? 0,
  };
}

function toRecord(row: NoteRow): NoteRecord {
  return {
    ...toSummary(row),
    content: row.content ?? '',
    dataCreated: row.data_created,
    dataModified: row.data_modified,
    localModified: row.local_modified,
    serverModified: row.server_modified,
  };
}

function splitTags(raw: string | undefined): string[] {
  return Array.from(
    new Set(
      String(raw ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function replaceNoteTags(noteId: number, rawTags: string | undefined): void {
  const db = getDatabase();
  const tags = splitTags(rawTags);
  db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);

  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color, created_at) VALUES (?, ?, ?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const attach = db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)');

  for (const name of tags) {
    insertTag.run(name, '#1890ff', Date.now());
    const row = findTag.get(name) as { id: number } | undefined;
    if (row) {
      attach.run(noteId, row.id);
    }
  }
}

function buildWhere(input: ListNotesInput): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (input.query?.trim()) {
    const like = `%${input.query.trim()}%`;
    clauses.push('(n.title LIKE ? OR n.content LIKE ?)');
    params.push(like, like);
  }

  if (input.category) {
    clauses.push('n.category = ?');
    params.push(input.category);
  }

  if (input.tag) {
    clauses.push(
      'EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id AND t.name = ?)',
    );
    params.push(input.tag);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export const notesRepository = {
  list(input: ListNotesInput = {}): NoteListResult {
    const db = getDatabase();
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 5000);
    const offset = Math.max(Number(input.offset) || 0, 0);
    const where = buildWhere(input);

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS count FROM notes n ${where.sql}`)
      .get(...where.params) as { count: number };

    const rows = db
      .prepare(
        `SELECT * FROM notes n ${where.sql}
         ORDER BY COALESCE(n.updated_at, n.created_at, 0) DESC, n.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.params, limit, offset) as NoteRow[];

    return {
      items: rows.map(toSummary),
      total: Number(totalRow.count) || 0,
      limit,
      offset,
    };
  },

  get(id: number): NoteRecord | null {
    const row = getDatabase().prepare('SELECT * FROM notes WHERE id = ?').get(id) as
      | NoteRow
      | undefined;
    return row ? toRecord(row) : null;
  },

  create(input: CreateNoteInput = {}): NoteRecord {
    const db = getDatabase();
    const now = Date.now();
    const title = input.title?.trim() || 'Untitled';
    const content = input.content ?? '';
    const category = input.category?.trim() || '/';
    const tags = splitTags(input.tags).join(',');

    const info = db
      .prepare(
        `INSERT INTO notes (
           doc_guid, kb_guid, title, content, category, tags,
           data_created, data_modified, local_modified, server_modified,
           created_at, updated_at, dirty
         ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)`,
      )
      .run(`local_${randomUUID()}`, title, content, category, tags, now, now, now, now, now);

    const id = Number(info.lastInsertRowid);
    replaceNoteTags(id, tags);
    return this.get(id) as NoteRecord;
  },

  update(id: number, input: UpdateNoteInput): NoteRecord | null {
    const db = getDatabase();
    const current = this.get(id);
    if (!current) {
      return null;
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      fields.push(`${column} = ?`);
      params.push(value);
    };

    if (input.title !== undefined) set('title', input.title.trim() || 'Untitled');
    if (input.content !== undefined) set('content', input.content);
    if (input.category !== undefined) set('category', input.category.trim() || '/');
    if (input.tags !== undefined) set('tags', splitTags(input.tags).join(','));
    if (input.dirty !== undefined) set('dirty', input.dirty ? 1 : 0);

    const now = Date.now();
    set('updated_at', now);
    set('local_modified', now);
    if (input.dirty === undefined) {
      set('dirty', 1);
    }

    db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
    if (input.tags !== undefined) {
      replaceNoteTags(id, input.tags);
    }

    return this.get(id);
  },

  remove(id: number): boolean {
    const info = getDatabase().prepare('DELETE FROM notes WHERE id = ?').run(id);
    return info.changes > 0;
  },

  stats(): NoteStats {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN dirty = 1 THEN 1 ELSE 0 END) AS dirty,
           COUNT(DISTINCT category) AS categories
         FROM notes`,
      )
      .get() as { total: number; dirty: number | null; categories: number };
    const tags = db.prepare('SELECT COUNT(*) AS count FROM tags').get() as { count: number };
    return {
      total: Number(row.total) || 0,
      dirty: Number(row.dirty) || 0,
      categories: Number(row.categories) || 0,
      tags: Number(tags.count) || 0,
    };
  },
};
