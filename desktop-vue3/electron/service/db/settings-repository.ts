import { getDatabase } from './connection';

function decode(value: string | null): unknown {
  if (value === null || value === '') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const settingsRepository = {
  get(key: string): unknown {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string | null }
      | undefined;
    return row ? decode(row.value) : null;
  },

  set(key: string, value: unknown): void {
    const db = getDatabase();
    const encoded = value === undefined ? 'null' : JSON.stringify(value);
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, encoded, Date.now());
  },

  all(): Record<string, unknown> {
    const rows = getDatabase()
      .prepare('SELECT key, value FROM settings ORDER BY key')
      .all() as Array<{ key: string; value: string | null }>;
    return Object.fromEntries(rows.map((row) => [row.key, decode(row.value)]));
  },

  remove(key: string): boolean {
    const info = getDatabase().prepare('DELETE FROM settings WHERE key = ?').run(key);
    return info.changes > 0;
  },
};
