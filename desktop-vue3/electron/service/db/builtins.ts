import type { SqlDatabase } from './connection';
import { echoBuiltins } from '../../shared/builtins/catalog';

/**
 * 让 echoes 表跟上 catalog.json：
 * - 当前 JSON 里的内置回响 upsert（已有同 id 不覆盖用户可见字段）；
 * - JSON 里已删掉的 `__builtin_*` 行清掉；
 * - 继续清 v3 的 demo 占位卡。
 *
 * 每次启动都跑一遍，所以以后删内置回响只改 catalog.json + gen:builtins，
 * 不用再写迁移版本。内置 id 前缀是系统保留的，不会被用户卡片撞上。
 */
export function syncBuiltinCatalog(db: SqlDatabase): void {
  const now = Date.now();
  const cards = echoBuiltins();
  const keep = new Set(cards.map((card) => card.id));
  const insert = db.prepare(
    `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'anno', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       "desc" = excluded."desc",
       color = excluded.color,
       icon = excluded.icon,
       anno_source = excluded.anno_source,
       render_type = excluded.render_type,
       category = excluded.category,
       sort_order = excluded.sort_order,
       updated_at = excluded.updated_at`,
  );
  for (const card of cards) {
    insert.run(
      card.id,
      card.name,
      card.desc,
      card.color,
      card.icon,
      card.payload.annoSource,
      card.category,
      card.sortOrder,
      now,
      now,
    );
  }

  const rows = db.prepare('SELECT id FROM echoes').all() as Array<{ id: string }>;
  const remove = db.prepare('DELETE FROM echoes WHERE id = ?');
  for (const row of rows) {
    if (row.id.startsWith('__builtin_') && !keep.has(row.id)) {
      remove.run(row.id);
    }
  }
  db.prepare(`DELETE FROM echoes WHERE id = 'builtin-echo-demo'`).run();
}
