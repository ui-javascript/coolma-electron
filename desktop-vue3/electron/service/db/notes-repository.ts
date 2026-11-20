import { randomUUID } from 'node:crypto';
import type {
  NoteListResult,
  NoteRecord,
  NoteStats,
  NoteSummary,
} from '../../shared/types/domain';
import { getDatabase } from './connection';
import { syncLogRepository } from './sync-log-repository';

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
  /** 模板正文（不含 H1），仓储拼成「# 标题\n\n正文」；与 vue2 createNote 一致。 */
  templateContent?: string;
  category?: string;
  tags?: string;
  /** 已登录时的当前账号；离线创建传 null / 不传。 */
  kbGuid?: string | null;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  dirty?: number;
}

/** 根目录的几种历史写法，全部归一到 `'/'`，避免同一层级被拆成多个文件夹。 */
const ROOT_CATEGORY_ALIASES = new Set(['', '/', 'OFFLINE_ROOT_CATEGORY', '/我的笔记/', '/My Notes/']);

export function normalizeCategory(category?: string | null): string {
  const raw = String(category ?? '').trim();
  if (!raw || ROOT_CATEGORY_ALIASES.has(raw)) {
    return '/';
  }
  const withPrefix = raw.startsWith('/') ? raw : `/${raw}`;
  const trimmed = withPrefix.replace(/\/+$/g, '');
  return trimmed || '/';
}

export function normalizeTitle(title?: string | null): string {
  const normalized = String(title ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'Untitled';
}

/**
 * 与 vue2 的 `generateUniqueNoteTitleInCategory` 对齐：
 * 同类目下若已存在同名标题，追加 ` (2)`、` (3)`，并保留扩展名。
 * 旧库上的唯一索引会直接抛 SQLITE_CONSTRAINT，这里提前收敛掉。
 */
export function generateUniqueTitle(category: string, baseTitle: string, excludeId?: number): string {
  const title = normalizeTitle(baseTitle);
  const rows = getDatabase()
    .prepare('SELECT id, title FROM notes WHERE category = ?')
    .all(category) as Array<{ id: number; title: string }>;

  const taken = new Set(
    rows
      .filter((row) => row.id !== excludeId)
      .map((row) => normalizeTitle(row.title).toLowerCase()),
  );

  if (!taken.has(title.toLowerCase())) {
    return title;
  }

  let counter = 2;
  const lastDot = title.lastIndexOf('.');
  const base = lastDot > 0 ? title.slice(0, lastDot) : title;
  const ext = lastDot > 0 ? title.slice(lastDot) : '';
  while (taken.has(`${base} (${counter})${ext}`.toLowerCase())) {
    counter += 1;
  }
  return `${base} (${counter})${ext}`;
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

  if (tags.length === 0) {
    return;
  }

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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildWhere(input: ListNotesInput): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (input.query?.trim()) {
    const like = `%${escapeLike(input.query.trim())}%`;
    clauses.push("(n.title LIKE ? ESCAPE '\\' OR n.content LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }

  if (input.category) {
    clauses.push('n.category = ?');
    params.push(normalizeCategory(input.category));
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

  getByDocGuid(docGuid: string): NoteRecord | null {
    const row = getDatabase().prepare('SELECT * FROM notes WHERE doc_guid = ?').get(docGuid) as
      | NoteRow
      | undefined;
    return row ? toRecord(row) : null;
  },

  /**
   * 拉取去重：同分类 + 同标题 + 当前账号（含未归属的 NULL / 空串）。
   * vue2 `_buildRestorePreviewStats` 用 `title|归一分类|kbGuid` 建本地集合，
   * 云端同 key 的笔记直接跳过，永不覆盖本地。
   */
  findByTitleCategory(input: {
    category: string;
    title: string;
    kbGuid?: string | null;
  }): NoteRecord | null {
    const category = normalizeCategory(input.category);
    const title = normalizeTitle(input.title);
    const kbGuid = input.kbGuid ?? '';
    const row = getDatabase()
      .prepare(
        `SELECT * FROM notes
          WHERE category = ? AND title = ?
            AND (kb_guid = ? OR kb_guid IS NULL OR kb_guid = '')
          ORDER BY id ASC LIMIT 1`,
      )
      .get(category, title, kbGuid) as NoteRow | undefined;
    return row ? toRecord(row) : null;
  },

  /**
   * 登录成功后把离线笔记归属到当前账号，照 vue2 `db:migrateOfflineNotes`。
   * 只改 kb_guid 并保持 dirty=1，下次推送按当前账号上传。
   */
  migrateOffline(kbGuid: string): number {
    if (!kbGuid) {
      return 0;
    }
    return getDatabase()
      .prepare("UPDATE notes SET kb_guid = ?, dirty = 1 WHERE kb_guid IS NULL OR kb_guid = ''")
      .run(kbGuid).changes;
  },

  /**
   * 待推送笔记。
   * vue2 `getPendingSyncNotesByKbGuid` 只取当前账号，防止跨账号污染。
   * v3 新建笔记的 kb_guid 是 NULL（离线笔记也是），所以把 NULL / 空串一并算作「当前账号待归属」。
   */
  listDirty(limit = 200, kbGuid?: string): NoteRecord[] {
    const max = Math.min(Math.max(limit, 1), 5000);
    const rows = kbGuid
      ? (getDatabase()
        .prepare(
          `SELECT * FROM notes
            WHERE dirty = 1 AND (kb_guid = ? OR kb_guid IS NULL OR kb_guid = '')
            ORDER BY COALESCE(local_modified, updated_at) ASC LIMIT ?`,
        )
        .all(kbGuid, max) as NoteRow[])
      : (getDatabase()
        .prepare(
          `SELECT * FROM notes WHERE dirty = 1
            ORDER BY COALESCE(local_modified, updated_at) ASC LIMIT ?`,
        )
        .all(max) as NoteRow[]);
    return rows.map(toRecord);
  },

  /**
   * 云同步拉取落库（轻量 upsert）：
   * - 已有同 docGuid → 覆盖服务端字段，dirty 归 0；
   * - 没有 → 插一条 dirty=0 的远端笔记，docGuid/kbGuid 原样保留。
   * 不写 outbox（拉取不是本地变更）。
   */
  upsertRemote(input: {
    docGuid: string;
    kbGuid?: string | null;
    title: string;
    content: string;
    category?: string;
    tags?: string;
    serverModified?: number | null;
  }): NoteRecord {
    const db = getDatabase();
    const now = Date.now();
    const category = normalizeCategory(input.category);
    const tags = splitTags(input.tags).join(',');
    const existing = this.getByDocGuid(input.docGuid);
    if (existing) {
      db.prepare(
        `UPDATE notes SET title = ?, content = ?, category = ?, tags = ?, kb_guid = ?, server_modified = ?, updated_at = ?, dirty = 0
         WHERE id = ?`,
      ).run(input.title, input.content, category, tags, input.kbGuid ?? existing.kbGuid, input.serverModified ?? now, now, existing.id);
      replaceNoteTags(existing.id, tags);
      return this.get(existing.id) as NoteRecord;
    }
    const info = db
      .prepare(
        `INSERT INTO notes (
           doc_guid, kb_guid, title, content, category, tags,
           data_created, data_modified, local_modified, server_modified,
           created_at, updated_at, dirty
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        input.docGuid,
        input.kbGuid ?? null,
        input.title,
        input.content,
        category,
        tags,
        now,
        now,
        now,
        input.serverModified ?? now,
        now,
        now,
      );
    const id = Number(info.lastInsertRowid);
    replaceNoteTags(id, tags);
    return this.get(id) as NoteRecord;
  },

  /**
   * 云端保存成功后，把本地 docGuid 换成服务端 guid 并清 dirty。
   * vue2 同步完成会同时写 `server_modified = Date.now()`，这里保持一致。
   */
  rebindDocGuid(id: number, docGuid: string, kbGuid: string | null): void {
    const now = Date.now();
    getDatabase()
      .prepare(
        'UPDATE notes SET doc_guid = ?, kb_guid = ?, server_modified = ?, dirty = 0, updated_at = ?, local_modified = ? WHERE id = ?',
      )
      .run(docGuid, kbGuid, now, now, now, id);
  },

  /** 推送中途失败时把 dirty 打回去，避免「已绑定远端 guid 但内容没存上」被当成已同步。 */
  markDirty(id: number): void {
    getDatabase().prepare('UPDATE notes SET dirty = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
  },

  create(input: CreateNoteInput = {}): NoteRecord {
    const db = getDatabase();
    const now = Date.now();
    const category = normalizeCategory(input.category);
    const title = generateUniqueTitle(category, input.title ?? 'Untitled');
    const templateBody = String(input.templateContent ?? '').trim();
    const content =
      input.content !== undefined && input.content !== ''
        ? input.content
        : templateBody
          ? `# ${title}\n\n${templateBody}`
          : `# ${title}`;
    const tags = splitTags(input.tags).join(',');

    const docGuid = `local_${randomUUID()}`;

    const write = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO notes (
             doc_guid, kb_guid, title, content, category, tags,
             data_created, data_modified, local_modified, server_modified,
             created_at, updated_at, dirty
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)`,
        )
        .run(docGuid, input.kbGuid ?? null, title, content, category, tags, now, now, now, now, now);

      const id = Number(info.lastInsertRowid);
      replaceNoteTags(id, tags);
      syncLogRepository.record({ noteId: id, action: 'create', docGuid, kbGuid: input.kbGuid ?? null });
      return id;
    });

    const id = write();
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

    const category = input.category !== undefined ? normalizeCategory(input.category) : current.category;

    if (input.title !== undefined) {
      set('title', generateUniqueTitle(category, input.title, id));
    }
    if (input.content !== undefined) set('content', input.content);
    if (input.category !== undefined) set('category', category);
    if (input.tags !== undefined) set('tags', splitTags(input.tags).join(','));
    if (input.dirty !== undefined) set('dirty', input.dirty ? 1 : 0);

    const now = Date.now();
    set('updated_at', now);
    set('local_modified', now);
    if (input.dirty === undefined) {
      set('dirty', 1);
    }

    const nextDirty = input.dirty === undefined ? 1 : input.dirty ? 1 : 0;

    const write = db.transaction(() => {
      db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
      if (input.tags !== undefined) {
        replaceNoteTags(id, input.tags);
      }
      // dirty=0 表示调用方已确认服务端一致（如导入/回填），不应再进队列。
      if (nextDirty === 1) {
        syncLogRepository.record({
          noteId: id,
          action: 'update',
          docGuid: current.docGuid,
          kbGuid: current.kbGuid,
        });
      }
    });

    write();
    return this.get(id);
  },

  remove(id: number): boolean {
    const db = getDatabase();
    const snapshot = this.get(id);
    if (!snapshot) {
      return false;
    }
    // 从未同步过的本地笔记（local_ 前缀）服务端根本不存在，删除不需要通知服务端。
    const needsRemoteDelete = Boolean(snapshot.docGuid) && !snapshot.docGuid!.startsWith('local_');

    const remove = db.transaction(() => {
      // 外键已是 ON DELETE CASCADE，这里显式清一次作为兜底（旧库可能没有开外键）。
      db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id);
      const removed = db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
      if (removed && needsRemoteDelete) {
        // note_id 必须为 NULL：CASCADE 会连同日志一起删掉，删除事件只能靠 doc_guid 定位。
        syncLogRepository.record({
          noteId: null,
          action: 'delete',
          docGuid: snapshot.docGuid,
          kbGuid: snapshot.kbGuid,
        });
      }
      return removed;
    });
    return remove();
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
