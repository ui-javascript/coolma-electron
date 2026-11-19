import type { EchoCard, RuneCard } from '../../shared/types/domain';
import { getDatabase } from './connection';

interface RuneRow {
  id: string;
  name: string | null;
  desc: string | null;
  color: string | null;
  icon: string | null;
  template: string | null;
  category: string | null;
  sort_order: number | null;
  inherit_from_previous: number | null;
}

interface EchoRow {
  id: string;
  name: string | null;
  desc: string | null;
  color: string | null;
  icon: string | null;
  anno_source: string | null;
  render_type: string | null;
  category: string | null;
  sort_order: number | null;
}

/**
 * 符文 / 回响卡片读取层。
 *
 * @ 快捷面板（quickInsert）需要的是「id + 名称 + 描述 + 颜色 + 模板」这五个字段，
 * 与 vue2 的 runeCards / echoCards 形状对齐，避免前端再做二次映射。
 */
export const runesRepositoryRef = {
  list(): RuneCard[] {
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM runes
          ORDER BY COALESCE(sort_order, 0) ASC, name ASC`,
      )
      .all() as RuneRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      desc: row.desc ?? '',
      color: row.color ?? '#7E57C2',
      icon: row.icon ?? 'auto_awesome',
      template: row.template ?? '',
      category: row.category ?? 'general',
      sortOrder: row.sort_order ?? 0,
      inheritFromPrevious: (row.inherit_from_previous ?? 0) ? 1 : 0,
    }));
  },
};

export const echoesRepositoryRef = {
  list(): EchoCard[] {
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM echoes
          ORDER BY COALESCE(sort_order, 0) ASC, name ASC`,
      )
      .all() as EchoRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      desc: row.desc ?? '',
      color: row.color ?? '#26A69A',
      icon: row.icon ?? 'graphic_eq',
      annoSource: row.anno_source ?? '',
      renderType: row.render_type ?? 'anno',
      category: row.category ?? 'marker',
      sortOrder: row.sort_order ?? 0,
    }));
  },
};


export interface RuneSaveInput {
  id: string;
  name: string;
  desc?: string;
  color?: string;
  icon?: string;
  template?: string;
  category?: string;
  sortOrder?: number;
  inheritFromPrevious?: number;
}

export interface EchoSaveInput {
  id: string;
  name: string;
  desc?: string;
  color?: string;
  icon?: string;
  annoSource?: string;
  renderType?: string;
  category?: string;
  sortOrder?: number;
}

/**
 * 同名校验：不分大小写、去首尾空白；更新时放行自己。
 * 与 vue2 的 `LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?` 完全一致。
 */
function isDuplicateName(table: 'runes' | 'echoes', id: string, name: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT id FROM ${table} WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?`)
    .get(name, id) as { id: string } | undefined;
  return Boolean(row);
}

const RUNE_DUPLICATE = 'RUNE_DUPLICATE_NAME';
const ECHO_DUPLICATE = 'ECHO_DUPLICATE_NAME';

function saveRune(input: RuneSaveInput): RuneCard {
  const db = getDatabase();
  const id = String(input.id ?? '').trim();
  const name = String(input.name ?? '').trim();
  if (!id) {
    throw new Error('RUNE_INVALID: rune.id is required');
  }
  if (!name) {
    throw new Error('RUNE_NAME_REQUIRED');
  }
  if (isDuplicateName('runes', id, name)) {
    throw new Error(RUNE_DUPLICATE);
  }

  const now = Date.now();
  const existing = db.prepare('SELECT id FROM runes WHERE id = ?').get(id);
  // 新建且没给模板时给一个最小可用模板（对齐 vue2 createDefaultRuneTemplate）
  const template =
    input.template ?? (existing ? '' : `<template>\n  <button type="button">{{ value }}</button>\n</template>`);
  const category = String(input.category ?? '').trim() || 'general';
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;
  const inherit = input.inheritFromPrevious ? 1 : 0;

  if (existing) {
    db.prepare(
      `UPDATE runes SET name = ?, "desc" = ?, color = ?, icon = ?, template = ?, category = ?, sort_order = ?, inherit_from_previous = ?, updated_at = ? WHERE id = ?`,
    ).run(name, input.desc ?? '', input.color ?? '#7E57C2', input.icon ?? 'auto_awesome', template, category, sortOrder, inherit, now, id);
  } else {
    db.prepare(
      `INSERT INTO runes (id, name, "desc", color, icon, template, category, sort_order, inherit_from_previous, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, name, input.desc ?? '', input.color ?? '#7E57C2', input.icon ?? 'auto_awesome', template, category, sortOrder, inherit, now, now);
  }
  return runesRepository.list().find((rune) => rune.id === id) as RuneCard;
}

function saveEcho(input: EchoSaveInput): EchoCard {
  const db = getDatabase();
  const id = String(input.id ?? '').trim();
  const name = String(input.name ?? '').trim();
  if (!id) {
    throw new Error('ECHO_INVALID: echo.id is required');
  }
  if (!name) {
    throw new Error('ECHO_NAME_REQUIRED');
  }
  if (isDuplicateName('echoes', id, name)) {
    throw new Error(ECHO_DUPLICATE);
  }

  const now = Date.now();
  const existing = db
    .prepare('SELECT id, created_at FROM echoes WHERE id = ?')
    .get(id) as { id: string; created_at: number | null } | undefined;
  // 新建没给 anno_source 时给最小实现（对齐 vue2 createDefaultEchoAnnoSource）
  const annoSource = input.annoSource ?? (existing ? '' : `export default { props: ['value'], render(h) { return h('span', this.value || '空') } }`);
  const renderType = input.renderType ?? 'anno';
  const category = String(input.category ?? '').trim() || 'marker';
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;

  if (existing) {
    db.prepare(
      `UPDATE echoes SET name = ?, "desc" = ?, color = ?, icon = ?, anno_source = ?, render_type = ?, category = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
    ).run(name, input.desc ?? '', input.color ?? '#26A69A', input.icon ?? 'graphic_eq', annoSource, renderType, category, sortOrder, now, id);
  } else {
    db.prepare(
      `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, name, input.desc ?? '', input.color ?? '#26A69A', input.icon ?? 'graphic_eq', annoSource, renderType, category, sortOrder, now, now);
  }
  return echoesRepository.list().find((echo) => echo.id === id) as EchoCard;
}

/**
 * 批量保存（排序更新 / 导入合并）。
 * 先做一次「集合内」同名检测（对齐 vue2 db:saveRunes），避免靠数据库 UNIQUE 中断事务。
 * skipDuplicates=true 时静默跳过重名项（导入场景），否则抛错（排序场景不该有重名）。
 */
function saveMany<T extends { name: string }>(
  table: 'runes' | 'echoes',
  items: T[],
  saveOne: (item: T) => unknown,
  options: { skipDuplicates?: boolean } = {},
): { saved: number; skipped: number } {
  const seen = new Set<string>();
  const db = getDatabase();
  let saved = 0;
  let skipped = 0;

  const write = db.transaction(() => {
    for (const item of items) {
      const name = String(item.name ?? '').trim().toLowerCase();
      if (seen.has(name)) {
        if (options.skipDuplicates) {
          skipped += 1;
          continue;
        }
        throw new Error(table === 'runes' ? RUNE_DUPLICATE : ECHO_DUPLICATE);
      }
      seen.add(name);
      try {
        saveOne(item);
        saved += 1;
      } catch (error) {
        if (options.skipDuplicates && String((error as Error).message).endsWith('DUPLICATE_NAME')) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
  });
  write();
  return { saved, skipped };
}

const writeLayer = {
  saveRune,
  saveEcho,
  saveManyRunes: (items: RuneSaveInput[], options?: { skipDuplicates?: boolean }) =>
    saveMany('runes', items, saveRune, options),
  saveManyEchoes: (items: EchoSaveInput[], options?: { skipDuplicates?: boolean }) =>
    saveMany('echoes', items, saveEcho, options),
  removeRune: (id: string): boolean =>
    getDatabase().prepare('DELETE FROM runes WHERE id = ?').run(id).changes > 0,
  removeEcho: (id: string): boolean =>
    getDatabase().prepare('DELETE FROM echoes WHERE id = ?').run(id).changes > 0,
};

export const runesRepository = Object.assign(runesRepositoryRef, {
  save: writeLayer.saveRune,
  saveMany: writeLayer.saveManyRunes,
  remove: writeLayer.removeRune,
});

export const echoesRepository = Object.assign(echoesRepositoryRef, {
  save: writeLayer.saveEcho,
  saveMany: writeLayer.saveManyEchoes,
  remove: writeLayer.removeEcho,
});
