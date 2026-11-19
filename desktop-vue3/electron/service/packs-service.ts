import { randomUUID } from 'node:crypto';
import { getDatabase } from './db/connection';

/**
 * 符文 / 回响 Pack v1 导入比对与提交（复刻 vue2 db:previewEchoImport / db:importEchoes）。
 *
 * 预览只读不写；提交时对 DB 重新核对（stale 防护）：
 *   - createNames 必须仍然无同名；
 *   - replaceNames 必须命中现存非内置行（vue2：BUILTIN_PROTECTED / NOT_FOUND / NAME_TAKEN）。
 * 内置保护约定：DB 中 id 以 __builtin_ 开头的行视为内置，禁止覆盖/删除。
 */

export type PackKind = 'runes' | 'echoes';

export interface PackEntry {
  name: string;
  desc: string;
  [key: string]: unknown;
}

export interface PreviewGroup {
  previewAt: number;
  targetCategory: string;
  newItems: Array<{ index: number; name: string; selected: boolean }>;
  conflictItems: Array<{ index: number; name: string; selected: boolean }>;
  builtinBlocked: Array<{ index: number; name: string }>;
  invalidItems: Array<{ index: number; reason: string; name: string }>;
  dbNameCount: number;
}

interface DbRow {
  id: string;
  name: string;
}

function nameKey(name: string): string {
  return String(name ?? '').trim().toLowerCase();
}

function isBuiltinRow(row: DbRow): boolean {
  return String(row.id ?? '').startsWith('__builtin_');
}

function normalizeEntry(kind: PackKind, raw: unknown): { ok: boolean; item?: PackEntry; reason?: string; name?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'NOT_OBJECT', name: '' };
  }
  const record = raw as Record<string, unknown>;
  const name = String(record.name ?? '').trim();
  if (!name) {
    return { ok: false, reason: 'EMPTY_NAME', name: '' };
  }
  if (name.length > 100) {
    return { ok: false, reason: 'NAME_TOO_LONG', name };
  }
  const item: PackEntry = {
    name,
    desc: String(record.desc ?? '').slice(0, 2000),
  };
  if (kind === 'echoes') {
    const annoSource = String(record.anno_source ?? '');
    item.anno_source = annoSource;
    item.render_type = String(record.render_type ?? 'anno');
    if (!annoSource.trim()) {
      return { ok: false, reason: 'EMPTY_ANNO_SOURCE', name };
    }
    item.color = String(record.color ?? '#26A69A');
    item.icon = String(record.icon ?? 'graphic_eq');
  } else {
    const template = String(record.template ?? '');
    item.template = template;
    if (!template.trim()) {
      return { ok: false, reason: 'EMPTY_TEMPLATE', name };
    }
    item.color = String(record.color ?? '#7E57C2');
    item.icon = String(record.icon ?? 'auto_awesome');
    item.inherit_from_previous = record.inherit_from_previous ? 1 : 0;
  }
  return { ok: true, item };
}

/** 预览：把规范化条目按 DB 现状分组，只读不写。 */
export function previewImport(
  kind: PackKind,
  entries: unknown[],
  targetCategory: string,
): PreviewGroup {
  const db = getDatabase();
  const rows = db.prepare(`SELECT id, name FROM ${kind}`).all() as DbRow[];
  const byKey = new Map<string, DbRow>();
  for (const row of rows) {
    byKey.set(nameKey(row.name), row);
  }

  const group: PreviewGroup = {
    previewAt: Date.now(),
    targetCategory: targetCategory || (kind === 'echoes' ? 'marker' : 'general'),
    newItems: [],
    conflictItems: [],
    builtinBlocked: [],
    invalidItems: [],
    dbNameCount: rows.length,
  };

  for (let index = 0; index < entries.length; index += 1) {
    const normalized = normalizeEntry(kind, entries[index]);
    if (!normalized.ok || !normalized.item) {
      group.invalidItems.push({ index, reason: normalized.reason ?? 'INVALID', name: normalized.name ?? '' });
      continue;
    }
    const name = normalized.item.name;
    const existing = byKey.get(nameKey(name));
    if (existing && isBuiltinRow(existing)) {
      group.builtinBlocked.push({ index, name });
      continue;
    }
    if (existing) {
      group.conflictItems.push({ index, name, selected: true });
    } else {
      group.newItems.push({ index, name, selected: true });
    }
  }
  return group;
}

export interface CommitInput {
  createNames: string[];
  replaceNames: string[];
  targetCategory: string;
  previewAt: number;
  sourceByName: Record<string, PackEntry>;
}

export interface CommitResult {
  created: number;
  replaced: number;
  skipped: Array<{ name: string; reason: string }>;
}

/** 提交导入：stale 重核对后事务写入。 */
export function commitImport(kind: PackKind, input: CommitInput): CommitResult {
  const db = getDatabase();
  const rows = db.prepare(`SELECT id, name FROM ${kind}`).all() as DbRow[];
  const byKey = new Map<string, DbRow>();
  for (const row of rows) {
    byKey.set(nameKey(row.name), row);
  }

  const skipped: CommitResult['skipped'] = [];
  const creates: PackEntry[] = [];
  const replaces: Array<{ id: string; entry: PackEntry }> = [];

  for (const name of input.createNames) {
    const entry = input.sourceByName[name];
    if (!entry) {
      skipped.push({ name, reason: 'NOT_FOUND' });
      continue;
    }
    const existing = byKey.get(nameKey(name));
    if (existing && isBuiltinRow(existing)) {
      skipped.push({ name, reason: 'BUILTIN_PROTECTED' });
      continue;
    }
    if (existing) {
      // 预览后又被别人占名的场景：拒掉，提示前端重预览
      skipped.push({ name, reason: 'NAME_TAKEN' });
      continue;
    }
    creates.push(entry);
  }

  for (const name of input.replaceNames) {
    const entry = input.sourceByName[name];
    if (!entry) {
      skipped.push({ name, reason: 'NOT_FOUND' });
      continue;
    }
    const existing = byKey.get(nameKey(name));
    if (!existing) {
      skipped.push({ name, reason: 'NOT_FOUND' });
      continue;
    }
    if (isBuiltinRow(existing)) {
      skipped.push({ name, reason: 'BUILTIN_PROTECTED' });
      continue;
    }
    replaces.push({ id: existing.id, entry });
  }

  const category = input.targetCategory || (kind === 'echoes' ? 'marker' : 'general');
  const now = Date.now();
  const write = db.transaction(() => {
    let created = 0;
    let replaced = 0;
    for (const entry of creates) {
      const id = `import-${randomUUID()}`;
      if (kind === 'echoes') {
        db.prepare(
          `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        ).run(id, entry.name, entry.desc, String(entry.color ?? '#26A69A'), String(entry.icon ?? 'graphic_eq'),
          String(entry.anno_source ?? ''), String(entry.render_type ?? 'anno'), category, now, now);
      } else {
        db.prepare(
          `INSERT INTO runes (id, name, "desc", color, icon, template, category, sort_order, inherit_from_previous, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        ).run(id, entry.name, entry.desc, String(entry.color ?? '#7E57C2'), String(entry.icon ?? 'auto_awesome'),
          String(entry.template ?? ''), category, entry.inherit_from_previous ? 1 : 0, now, now);
      }
      created += 1;
    }
    for (const { id, entry } of replaces) {
      if (kind === 'echoes') {
        db.prepare(
          `UPDATE echoes SET name = ?, "desc" = ?, color = ?, icon = ?, anno_source = ?, render_type = ?, category = ?, updated_at = ? WHERE id = ?`,
        ).run(entry.name, entry.desc, String(entry.color ?? '#26A69A'), String(entry.icon ?? 'graphic_eq'),
          String(entry.anno_source ?? ''), String(entry.render_type ?? 'anno'), category, now, id);
      } else {
        db.prepare(
          `UPDATE runes SET name = ?, "desc" = ?, color = ?, icon = ?, template = ?, category = ?, inherit_from_previous = ?, updated_at = ? WHERE id = ?`,
        ).run(entry.name, entry.desc, String(entry.color ?? '#7E57C2'), String(entry.icon ?? 'auto_awesome'),
          String(entry.template ?? ''), category, entry.inherit_from_previous ? 1 : 0, now, id);
      }
      replaced += 1;
    }
    return { created, replaced };
  });

  const { created, replaced } = write();
  return { created, replaced, skipped };
}
