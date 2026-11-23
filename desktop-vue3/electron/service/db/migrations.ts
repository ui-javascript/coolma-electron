import type { SqlDatabase } from './connection';
import { echoBuiltins } from '../../shared/builtins/catalog';
import { syncBuiltinCatalog } from './builtins';
import { hashSyncPayload } from '../sync/sync-merge';

type DB = SqlDatabase;

interface Migration {
  version: number;
  name: string;
  up: (db: DB) => void;
}

const TABLES = `
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_guid TEXT,
    kb_guid TEXT,
    title TEXT NOT NULL DEFAULT 'Untitled',
    content TEXT DEFAULT '',
    category TEXT DEFAULT '/',
    tags TEXT DEFAULT '',
    data_created INTEGER,
    data_modified INTEGER,
    local_modified INTEGER,
    server_modified INTEGER,
    created_at INTEGER,
    updated_at INTEGER,
    dirty INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#1890ff',
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS local_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL UNIQUE,
    parent TEXT DEFAULT '',
    kb_guid TEXT DEFAULT '',
    local_only INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER,
    action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
    direction TEXT NOT NULL CHECK(direction IN ('local_to_server', 'server_to_local')),
    doc_guid TEXT,
    kb_guid TEXT,
    timestamp INTEGER,
    synced INTEGER DEFAULT 0,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS guid_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_id INTEGER NOT NULL,
    server_guid TEXT NOT NULL,
    service TEXT DEFAULT 'wiznote',
    created_at INTEGER,
    UNIQUE(local_id, server_guid),
    FOREIGN KEY (local_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS runes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "desc" TEXT,
    color TEXT DEFAULT '#7E57C2',
    icon TEXT DEFAULT 'auto_awesome',
    template TEXT,
    category TEXT DEFAULT 'general',
    sort_order INTEGER DEFAULT 0,
    inherit_from_previous INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS echoes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "desc" TEXT,
    color TEXT DEFAULT '#26A69A',
    icon TEXT DEFAULT 'graphic_eq',
    anno_source TEXT,
    render_type TEXT DEFAULT 'anno',
    category TEXT DEFAULT 'marker',
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS ai_model_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
    base_url TEXT NOT NULL DEFAULT '',
    api_key_encrypted TEXT NOT NULL DEFAULT '',
    api_key_encrypted_version INTEGER NOT NULL DEFAULT 0,
    virtual_key_encrypted TEXT NOT NULL DEFAULT '',
    virtual_key_encrypted_version INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT '',
    is_default INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    headers_json TEXT DEFAULT '{}',
    extra_config_json TEXT DEFAULT '{}',
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS ai_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    builtin INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS rune_templates (
    id TEXT PRIMARY KEY,
    category_key TEXT NOT NULL,
    name TEXT NOT NULL,
    "desc" TEXT,
    color TEXT,
    icon TEXT,
    template TEXT NOT NULL,
    source_url TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS note_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "desc" TEXT,
    content TEXT NOT NULL DEFAULT '',
    is_builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

const INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_doc_guid ON notes(doc_guid) WHERE doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`,
  `CREATE INDEX IF NOT EXISTS idx_notes_kb_guid ON notes(kb_guid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_kb_doc_unique ON notes(kb_guid, doc_guid) WHERE kb_guid IS NOT NULL AND doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_category_title_kb ON notes(category, title, COALESCE(kb_guid, '')) WHERE category IS NOT NULL AND title IS NOT NULL AND title != 'Untitled'`,
  `CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_dirty ON notes(dirty)`,
  `CREATE INDEX IF NOT EXISTS idx_local_categories_kb ON local_categories(kb_guid)`,
  `CREATE INDEX IF NOT EXISTS idx_local_categories_parent ON local_categories(parent)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_runes_name_unique ON runes(LOWER(TRIM(name)))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_echoes_name_unique ON echoes(LOWER(TRIM(name)))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_model_configs_name ON ai_model_configs(name)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_model_configs_default ON ai_model_configs(is_default)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_model_configs_provider ON ai_model_configs(provider_type)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skills_name ON ai_skills(name)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_skills_builtin ON ai_skills(builtin)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_skills_sort ON ai_skills(sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_rune_tpl_cat ON rune_templates(category_key)`,
  `CREATE INDEX IF NOT EXISTS idx_rune_tpl_name ON rune_templates(name)`,
  `CREATE INDEX IF NOT EXISTS idx_note_tpl_name ON note_templates(name)`,
  `CREATE INDEX IF NOT EXISTS idx_note_tpl_sort_order ON note_templates(sort_order)`,
];

function tableColumns(db: DB, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function ensureColumn(db: DB, table: string, column: string, definition: string): void {
  if (!tableColumns(db, table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createIndexes(db: DB): void {
  for (const sql of INDEXES) {
    try {
      db.exec(sql);
    } catch (error) {
      // Old databases may contain duplicate rows that violate a new unique
      // index. Keep the import usable; the diagnostics surface the issue later.
      console.warn('[db] index creation skipped:', sql, error instanceof Error ? error.message : error);
    }
  }
}

const migration1: Migration = {
  version: 1,
  name: 'initial-coolma-schema',
  up(db) {
    db.exec(TABLES);

    ensureColumn(db, 'notes', 'kb_guid', 'TEXT');
    ensureColumn(db, 'notes', 'dirty', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'sync_log', 'doc_guid', 'TEXT');
    ensureColumn(db, 'sync_log', 'kb_guid', 'TEXT');
    ensureColumn(db, 'runes', 'category', "TEXT DEFAULT 'general'");
    ensureColumn(db, 'runes', 'sort_order', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'runes', 'inherit_from_previous', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'echoes', 'category', "TEXT DEFAULT 'marker'");
    ensureColumn(db, 'echoes', 'sort_order', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'ai_model_configs', 'virtual_key_encrypted', "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, 'ai_model_configs', 'virtual_key_encrypted_version', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn(db, 'ai_model_configs', 'headers_json', "TEXT DEFAULT '{}'");
    ensureColumn(db, 'ai_model_configs', 'extra_config_json', "TEXT DEFAULT '{}'");
    ensureColumn(db, 'ai_model_configs', 'enabled', 'INTEGER DEFAULT 1');

    createIndexes(db);
  },
};

const migration2: Migration = {
  version: 2,
  name: 'query-performance-indexes',
  up(db) {
    // 列表默认按 updated_at 倒序，标签筛选走 note_tags.tag_id，同步队列按 synced 扫描。
    // 这些都是纯索引补充，可重复执行，不改变任何列定义。
    for (const sql of [
      `CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at)`,
      `CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)`,
      `CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sync_log_synced ON sync_log(synced)`,
      `CREATE INDEX IF NOT EXISTS idx_sync_log_note ON sync_log(note_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tags_name_lower ON tags(LOWER(name))`,
    ]) {
      try {
        db.exec(sql);
      } catch (error) {
        console.warn('[db] index creation skipped:', sql, error instanceof Error ? error.message : error);
      }
    }
  },
};

export const BUILTIN_RUNE_TEMPLATE = `<template><button class="coolma-rune-counter" type="button" @click="increment">{{ value || 0 }}</button></template><script>export default { props: { value: { default: 0 }, onValueChange: { default: null } }, methods: { increment () { if (this.onValueChange) this.onValueChange({ value: Number(this.value || 0) + 1 }) } } }</script>`;

const BUILTIN_ECHO_SOURCE = `export default { type: "echo", render (props = {}) { return "<span class=\\"coolma-echo-demo\\">" + String(props.value || props.prompt || "demo") + "</span>" } }`;

const migration3: Migration = {
  version: 3,
  name: 'seed-builtin-runes-and-echoes',
  up(db) {
    // 只在表为空时播种，避免覆盖用户已有的卡片（旧库导入后这里会跳过）。
    const now = Date.now();
    try {
      db.prepare(
        `INSERT INTO runes (id, name, "desc", color, icon, template, category, sort_order, inherit_from_previous, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, 'general', 0, 0, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM runes)`,
      ).run(
        'builtin-rune-counter',
        'counter',
        '点击即加一的示例符文',
        '#7E57C2',
        'auto_awesome',
        BUILTIN_RUNE_TEMPLATE,
        now,
        now,
      );
    } catch (error) {
      console.warn('[db] seed rune skipped:', error instanceof Error ? error.message : error);
    }

    try {
      db.prepare(
        `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, 'anno', 'marker', 0, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM echoes)`,
      ).run(
        'builtin-echo-demo',
        'demo',
        '最小可用的回响示例',
        '#26A69A',
        'graphic_eq',
        BUILTIN_ECHO_SOURCE,
        now,
        now,
      );
    } catch (error) {
      console.warn('[db] seed echo skipped:', error instanceof Error ? error.message : error);
    }
  },
};

const migration4: Migration = {
  version: 4,
  name: 'create-note-templates',
  up(db) {
    // 表结构与 vue2 note-template-service 对齐：id 为客户端生成的稳定 TEXT 主键。
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_templates (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        "desc"      TEXT,
        content     TEXT NOT NULL DEFAULT '',
        is_builtin  INTEGER NOT NULL DEFAULT 0,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_note_tpl_name ON note_templates(name);
      CREATE INDEX IF NOT EXISTS idx_note_tpl_sort_order ON note_templates(sort_order);
    `);
  },
};

/** 迁移 5：把 vue2 的 17 张内置回响原样种进 echoes 表；已有同 id 行不覆盖。 */
const migration5: Migration = {
  version: 5,
  name: 'seed-builtin-echo-cards',
  up(db) {
    const now = Date.now();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'anno', ?, ?, ?, ?)`,
    );
    for (const card of echoBuiltins()) {
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
    // 迁移 3 的 demo 是 v3 占位卡，vue2 没有这张；清掉避免内置分类多出一张假卡。
    db.prepare(`DELETE FROM echoes WHERE id = 'builtin-echo-demo'`).run();
  },
};

/**
 * 迁移 6：按当前 catalog.json 对账。
 * - 新增的内置回响补进库；
 * - 已从 JSON 移除的 `__builtin_*` 回响删掉；
 * - 再清一次 v3 的 demo 占位卡。
 * 这样以后删内置项只改 JSON + 升迁移版本，不用手工写 DELETE。
 */
const migration6: Migration = {
  version: 6,
  name: 'reconcile-builtin-catalog',
  up(db) {
    syncBuiltinCatalog(db);
  },
};

/**
 * 迁移 7：同步基线 + 冲突队列。
 * - notes 记「上次成功同步时的内容 hash / 远端修改时间」，用于判断单边改动（自动）还是双边改动（冲突）；
 * - 老库按当前正文回填一次基线，避免升级后把所有笔记误判成冲突；
 * - sync_conflicts 存冲突时两侧的完整快照，用户可离线二选一，不必再联网取一遍。
 */
const migration7: Migration = {
  version: 7,
  name: 'sync-baseline-and-conflicts',
  up(db) {
    ensureColumn(db, 'notes', 'synced_hash', 'TEXT');
    ensureColumn(db, 'notes', 'synced_server_modified', 'INTEGER');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL UNIQUE,
        doc_guid TEXT,
        kb_guid TEXT,
        direction TEXT NOT NULL CHECK(direction IN ('pull', 'push')),
        local_hash TEXT,
        remote_modified INTEGER,
        local_title TEXT,
        local_content TEXT,
        remote_title TEXT,
        remote_content TEXT,
        remote_category TEXT DEFAULT '/',
        remote_tags TEXT DEFAULT '',
        created_at INTEGER,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);
    const rows = db
      .prepare('SELECT id, title, content, category, tags, server_modified FROM notes')
      .all() as Array<{ id: number; title: string; content: string; category: string; tags: string; server_modified: number | null }>;
    const update = db.prepare(
      'UPDATE notes SET synced_hash = ?, synced_server_modified = COALESCE(synced_server_modified, ?) WHERE id = ?',
    );
    for (const row of rows) {
      const hash = hashSyncPayload({
        title: row.title ?? '',
        content: row.content ?? '',
        category: row.category ?? '/',
        tags: row.tags ?? '',
      });
      update.run(hash, row.server_modified ?? null, row.id);
    }
  },
};

const migration8: Migration = {
  version: 8,
  name: 'blog-deploy-history',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS blog_deploy_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('build', 'github', 'sftp')),
        target TEXT DEFAULT '',
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'cancelled')),
        blog_dir TEXT DEFAULT '',
        detail TEXT DEFAULT '',
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_blog_history_time ON blog_deploy_history(started_at DESC)');
  },
};

export const MIGRATIONS: readonly Migration[] = [migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8];

export function runMigrations(db: DB): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  let current = Number(db.pragma('user_version', { simple: true })) || 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }

    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(
        'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.name, Date.now());
      db.pragma(`user_version = ${migration.version}`);
    });

    apply();
    current = migration.version;
  }

  return current;
}
