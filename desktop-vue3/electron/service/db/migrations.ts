import type Database from 'better-sqlite3';

type DB = Database.Database;

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

export const MIGRATIONS: readonly Migration[] = [migration1];

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
