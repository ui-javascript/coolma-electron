import { getDatabase } from './connection';
import type { IntegrityIssue, IntegrityReport } from '../../shared/types/domain';

const SAMPLE_LIMIT = 5;

interface SampleRow {
  id: number;
  title: string;
  category: string;
  tags: string;
  link_count: number;
}

/**
 * 只读一致性体检。
 *
 * 设计原则：只查询、只报告，绝不自动改库。旧库里的历史脏数据长什么样，
 * 必须先看清楚再决定怎么修，否则"自动修复"就是把数据问题变成数据事故。
 */
export function runIntegrityCheck(): IntegrityReport {
  const db = getDatabase();

  const notesRow = db.prepare('SELECT COUNT(*) AS count FROM notes').get() as { count: number };
  const tagsRow = db.prepare('SELECT COUNT(*) AS count FROM tags').get() as { count: number };
  const linkRow = db.prepare('SELECT COUNT(*) AS count FROM note_tags').get() as { count: number };
  const syncRow = db
    .prepare('SELECT COUNT(*) AS count FROM sync_log WHERE synced = 0')
    .get() as { count: number };

  const issues: IntegrityIssue[] = [
    tagStringWithoutLinks(),
    linksWithoutTagString(),
    tagStringDrift(),
    duplicateTitles(),
    orphanLinks(),
    unregisteredCategories(),
    unusedTags(),
  ].filter((issue): issue is IntegrityIssue => issue !== null);

  return {
    checkedAt: Date.now(),
    notes: Number(notesRow.count) || 0,
    tags: Number(tagsRow.count) || 0,
    noteTagLinks: Number(linkRow.count) || 0,
    pendingSync: Number(syncRow.count) || 0,
    issues,
    healthy: issues.length === 0,
  };
}

function sampleOf(rows: SampleRow[]): string[] {
  return rows.slice(0, SAMPLE_LIMIT).map((row) => {
    const category = row.category || '/';
    return `#${row.id} ${row.title} · ${category}`;
  });
}

/** 字符串字段写了标签，但 note_tags 一条关系都没有。 */
function tagStringWithoutLinks(): IntegrityIssue | null {
  const rows = getDatabase()
    .prepare(
      `SELECT n.id, n.title, n.category, n.tags,
              (SELECT COUNT(*) FROM note_tags nt WHERE nt.note_id = n.id) AS link_count
         FROM notes n
        WHERE TRIM(COALESCE(n.tags, '')) != ''
          AND (SELECT COUNT(*) FROM note_tags nt WHERE nt.note_id = n.id) = 0
        ORDER BY n.id ASC`,
    )
    .all() as SampleRow[];

  if (rows.length === 0) {
    return null;
  }
  return {
    kind: 'TAG_STRING_WITHOUT_LINKS',
    label: '标签字符串存在但无关系记录',
    count: rows.length,
    samples: sampleOf(rows),
  };
}

/** 有关系记录，但字符串字段是空的（兼容字段丢了）。 */
function linksWithoutTagString(): IntegrityIssue | null {
  const rows = getDatabase()
    .prepare(
      `SELECT n.id, n.title, n.category, n.tags,
              (SELECT COUNT(*) FROM note_tags nt WHERE nt.note_id = n.id) AS link_count
         FROM notes n
        WHERE TRIM(COALESCE(n.tags, '')) = ''
          AND (SELECT COUNT(*) FROM note_tags nt WHERE nt.note_id = n.id) > 0
        ORDER BY n.id ASC`,
    )
    .all() as SampleRow[];

  if (rows.length === 0) {
    return null;
  }
  return {
    kind: 'LINKS_WITHOUT_TAG_STRING',
    label: '关系记录存在但标签字符串为空',
    count: rows.length,
    samples: sampleOf(rows),
  };
}

/** 字符串里的标签与关系表里的标签集合不一致（顺序无关）。 */
function tagStringDrift(): IntegrityIssue | null {
  const db = getDatabase();
  const notes = db
    .prepare(
      `SELECT n.id, n.title, n.category, n.tags,
              (SELECT COUNT(*) FROM note_tags nt WHERE nt.note_id = n.id) AS link_count
         FROM notes n
        WHERE TRIM(COALESCE(n.tags, '')) != ''
          AND (SELECT COUNT(*) FROM note_tags nt WHERE nt.note_id = n.id) > 0`,
    )
    .all() as SampleRow[];

  const linksStmt = db.prepare(
    `SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ?`,
  );

  const drift: string[] = [];
  for (const note of notes) {
    const linked = new Set(
      (linksStmt.all(note.id) as Array<{ name: string }>).map((row) => row.name.trim()),
    );
    const declared = new Set(
      note.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
    if (linked.size !== declared.size || Array.from(declared).some((tag) => !linked.has(tag))) {
      drift.push(`#${note.id} ${note.title} · 字符串[${Array.from(declared).join('|')}] 关系[${Array.from(linked).join('|')}]`);
    }
  }

  if (drift.length === 0) {
    return null;
  }
  return {
    kind: 'TAG_DRIFT',
    label: '标签字符串与关系表不一致',
    count: drift.length,
    samples: drift.slice(0, SAMPLE_LIMIT),
  };
}

/** 同类目下标题重复（不含 Untitled，唯一索引对它是豁免的）。 */
function duplicateTitles(): IntegrityIssue | null {
  const rows = getDatabase()
    .prepare(
      `SELECT category, LOWER(TRIM(title)) AS normalized, COUNT(*) AS count
         FROM notes
        WHERE TRIM(title) != ''
          AND title != 'Untitled'
        GROUP BY category, LOWER(TRIM(title))
       HAVING COUNT(*) > 1
        ORDER BY count DESC`,
    )
    .all() as Array<{ category: string; normalized: string; count: number }>;

  if (rows.length === 0) {
    return null;
  }
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  return {
    kind: 'DUPLICATE_TITLE',
    label: '同类目标题重复',
    count: total,
    samples: rows.slice(0, SAMPLE_LIMIT).map((row) => `${row.category || '/'} · ${row.normalized} ×${row.count}`),
  };
}

/** note_tags 指向不存在的笔记或标签（外键若没开才会出现）。 */
function orphanLinks(): IntegrityIssue | null {
  const db = getDatabase();
  const brokenNotes = db
    .prepare(
      `SELECT nt.note_id AS id, '' AS title, '' AS category, '' AS tags, 0 AS link_count
         FROM note_tags nt LEFT JOIN notes n ON n.id = nt.note_id
        WHERE n.id IS NULL`,
    )
    .all() as SampleRow[];
  const brokenTags = db
    .prepare(
      `SELECT nt.tag_id AS id, '' AS title, '' AS category, '' AS tags, 0 AS link_count
         FROM note_tags nt LEFT JOIN tags t ON t.id = nt.tag_id
        WHERE t.id IS NULL`,
    )
    .all() as SampleRow[];

  const count = brokenNotes.length + brokenTags.length;
  if (count === 0) {
    return null;
  }
  return {
    kind: 'ORPHAN_LINKS',
    label: '关系表指向已删除的笔记或标签',
    count,
    samples: [
      ...brokenNotes.slice(0, 3).map((row) => `note_tags.note_id=${row.id} 已不存在`),
      ...brokenTags.slice(0, 3).map((row) => `note_tags.tag_id=${row.id} 已不存在`),
    ].slice(0, SAMPLE_LIMIT),
  };
}

/** 笔记落在没登记的目录里（local_categories 没有这条）。 */
function unregisteredCategories(): IntegrityIssue | null {
  const rows = getDatabase()
    .prepare(
      `SELECT n.category, COUNT(*) AS count
         FROM notes n
         LEFT JOIN local_categories c ON c.category = n.category
        WHERE n.category IS NOT NULL
          AND n.category != '/'
          AND c.category IS NULL
        GROUP BY n.category
        ORDER BY count DESC`,
    )
    .all() as Array<{ category: string; count: number }>;

  if (rows.length === 0) {
    return null;
  }
  return {
    kind: 'UNREGISTERED_CATEGORY',
    label: '笔记所在目录未登记',
    count: rows.reduce((sum, row) => sum + Number(row.count), 0),
    samples: rows.slice(0, SAMPLE_LIMIT).map((row) => `${row.category} (${row.count})`),
  };
}

/** 标签表里存在但没有任何笔记引用的标签。属于清理候选，不是错误。 */
function unusedTags(): IntegrityIssue | null {
  const rows = getDatabase()
    .prepare(
      `SELECT t.id, t.name, (SELECT COUNT(*) FROM note_tags nt WHERE nt.tag_id = t.id) AS count
         FROM tags t
        WHERE (SELECT COUNT(*) FROM note_tags nt WHERE nt.tag_id = t.id) = 0
        ORDER BY t.name ASC`,
    )
    .all() as Array<{ id: number; name: string; count: number }>;

  if (rows.length === 0) {
    return null;
  }
  return {
    kind: 'UNUSED_TAG',
    label: '无笔记引用的标签（清理候选）',
    count: rows.length,
    samples: rows.slice(0, SAMPLE_LIMIT).map((row) => `#${row.id} ${row.name}`),
  };
}
