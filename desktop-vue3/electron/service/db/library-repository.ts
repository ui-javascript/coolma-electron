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
}

/**
 * 符文 / 回响卡片读取层。
 *
 * @ 快捷面板（quickInsert）需要的是「id + 名称 + 描述 + 颜色 + 模板」这五个字段，
 * 与 vue2 的 runeCards / echoCards 形状对齐，避免前端再做二次映射。
 */
export const runesRepository = {
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

export const echoesRepository = {
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
    }));
  },
};
