import { getDatabase } from './connection';

/**
 * 笔记模板仓储（复刻 vue2 note-template-service）：
 * - id 为客户端生成的稳定 TEXT 主键；
 * - content 是纯正文（不含 H1 标题行），标题由 createNote 拼在最前；
 * - 列表顺序：内置优先 → sort_order 升序 → created_at 升序。
 */
export interface NoteTemplateRow {
  id: string;
  name: string;
  desc: string;
  content: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface NoteTemplateInput {
  id: string;
  name: string;
  desc?: string;
  content?: string;
  isBuiltin?: boolean | number;
  sortOrder?: number;
}

interface RawRow {
  id: string;
  name: string;
  desc: string | null;
  content: string | null;
  is_builtin: number | null;
  sort_order: number | null;
  created_at: number | null;
  updated_at: number | null;
}

function toRow(raw: RawRow): NoteTemplateRow {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    desc: String(raw.desc ?? ''),
    content: String(raw.content ?? ''),
    isBuiltin: Number(raw.is_builtin) === 1,
    sortOrder: Number(raw.sort_order) || 0,
    createdAt: Number(raw.created_at) || 0,
    updatedAt: Number(raw.updated_at) || 0,
  };
}

export const templatesRepository = {
  listAll(): NoteTemplateRow[] {
    // 读取路径防御：丢弃缺 id/name 的脏数据（与 vue2 一致）
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM note_templates
         ORDER BY is_builtin DESC, sort_order ASC, created_at ASC`,
      )
      .all() as RawRow[];
    return rows.map(toRow).filter((row) => row.id && row.name.trim());
  },

  /** upsert 单条；名称必填。返回写入后的行。 */
  saveOne(input: NoteTemplateInput): NoteTemplateRow {
    const name = String(input.name ?? '').trim();
    if (!name) {
      throw new Error('模板名称不能为空');
    }
    const db = getDatabase();
    const now = Date.now();
    const exists = db.prepare('SELECT id, created_at FROM note_templates WHERE id = ?').get(input.id) as
      | { id: string; created_at: number }
      | undefined;
    const content = String(input.content ?? '');
    const desc = String(input.desc ?? '');
    const isBuiltin = input.isBuiltin ? 1 : 0;
    const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;

    if (exists) {
      db.prepare(
        `UPDATE note_templates
            SET name = ?, "desc" = ?, content = ?, is_builtin = ?, sort_order = ?, updated_at = ?
          WHERE id = ?`,
      ).run(name, desc, content, isBuiltin, sortOrder, now, input.id);
    } else {
      db.prepare(
        `INSERT INTO note_templates (id, name, "desc", content, is_builtin, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.id, name, desc, content, isBuiltin, sortOrder, now, now);
    }

    const row = db.prepare('SELECT * FROM note_templates WHERE id = ?').get(input.id) as RawRow;
    return toRow(row);
  },

  remove(id: string): boolean {
    // 内置模板在生产语义里不可删；本地版（对齐 vue2 dev）允许删，vue3 暂无内置种子，直接删。
    const info = getDatabase().prepare('DELETE FROM note_templates WHERE id = ?').run(id);
    return info.changes > 0;
  },

  /** 按 id 取正文，给 createNote 拼模板用。 */
  contentOf(id: string): string | null {
    const row = getDatabase().prepare('SELECT content FROM note_templates WHERE id = ?').get(id) as
      | { content: string | null }
      | undefined;
    return row ? String(row.content ?? '') : null;
  },
};
