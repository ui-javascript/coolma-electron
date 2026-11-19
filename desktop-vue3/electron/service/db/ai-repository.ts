import { getDatabase } from './connection';

/**
 * AI 模型配置 / 技能仓储（表 ai_model_configs / ai_skills 在 migration v1 建好）。
 * 密文字段（api_key_encrypted / virtual_key_encrypted）由控制器层用 Electron
 * safeStorage 加解密，仓储只存取原始密文，保持本文件可脱离 Electron 测试。
 */
export interface AiModelRawRow {
  id: number;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  apiKeyEncryptedVersion: number;
  virtualKeyEncrypted: string;
  virtualKeyEncryptedVersion: number;
  model: string;
  isDefault: boolean;
  enabled: boolean;
  headersJson: string;
  extraConfigJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface AiModelSaveInput {
  id?: number;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKeyEncrypted?: string;
  apiKeyEncryptedVersion?: number;
  virtualKeyEncrypted?: string;
  virtualKeyEncryptedVersion?: number;
  model: string;
  isDefault?: boolean;
  enabled?: boolean;
  headersJson?: string;
  extraConfigJson?: string;
}

interface RawAiModelRow {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  api_key_encrypted: string | null;
  api_key_encrypted_version: number | null;
  virtual_key_encrypted: string | null;
  virtual_key_encrypted_version: number | null;
  model: string;
  is_default: number | null;
  enabled: number | null;
  headers_json: string | null;
  extra_config_json: string | null;
  created_at: number | null;
  updated_at: number | null;
}

function toAiModel(raw: RawAiModelRow): AiModelRawRow {
  return {
    id: raw.id,
    name: raw.name,
    providerType: raw.provider_type,
    baseUrl: raw.base_url,
    apiKeyEncrypted: raw.api_key_encrypted ?? '',
    apiKeyEncryptedVersion: raw.api_key_encrypted_version ?? 0,
    virtualKeyEncrypted: raw.virtual_key_encrypted ?? '',
    virtualKeyEncryptedVersion: raw.virtual_key_encrypted_version ?? 0,
    model: raw.model,
    isDefault: Number(raw.is_default) === 1,
    enabled: Number(raw.enabled) === 1,
    headersJson: raw.headers_json ?? '{}',
    extraConfigJson: raw.extra_config_json ?? '{}',
    createdAt: raw.created_at ?? 0,
    updatedAt: raw.updated_at ?? 0,
  };
}

export interface AiSkillRow {
  id: number;
  name: string;
  title: string;
  content: string;
  builtin: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiSkillSaveInput {
  id?: number;
  name: string;
  title?: string;
  content?: string;
  enabled?: boolean;
  sortOrder?: number;
}

interface RawAiSkillRow {
  id: number;
  name: string;
  title: string | null;
  content: string | null;
  builtin: number | null;
  enabled: number | null;
  sort_order: number | null;
  created_at: number | null;
  updated_at: number | null;
}

function toAiSkill(raw: RawAiSkillRow): AiSkillRow {
  return {
    id: raw.id,
    name: raw.name,
    title: raw.title ?? '',
    content: raw.content ?? '',
    builtin: Number(raw.builtin) === 1,
    enabled: Number(raw.enabled) === 1,
    sortOrder: raw.sort_order ?? 0,
    createdAt: raw.created_at ?? 0,
    updatedAt: raw.updated_at ?? 0,
  };
}

export const aiModelsRepository = {
  list(): AiModelRawRow[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM ai_model_configs ORDER BY is_default DESC, updated_at DESC')
      .all() as RawAiModelRow[];
    return rows.map(toAiModel);
  },

  get(id: number): AiModelRawRow | null {
    const row = getDatabase().prepare('SELECT * FROM ai_model_configs WHERE id = ?').get(id) as
      | RawAiModelRow
      | undefined;
    return row ? toAiModel(row) : null;
  },

  save(input: AiModelSaveInput): AiModelRawRow {
    const db = getDatabase();
    const now = Date.now();
    const isDefault = input.isDefault ? 1 : 0;
    const enabled = input.enabled === false ? 0 : 1;
    // 默认标记互斥：新默认落下时清掉其他默认行
    if (isDefault) {
      db.prepare('UPDATE ai_model_configs SET is_default = 0 WHERE is_default = 1').run();
    }
    if (input.id) {
      const info = db
        .prepare(
          `UPDATE ai_model_configs SET
             name = ?, provider_type = ?, base_url = ?, model = ?,
             is_default = ?, enabled = ?, headers_json = ?, extra_config_json = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.name, input.providerType, input.baseUrl, input.model,
          isDefault, enabled, input.headersJson ?? '{}', input.extraConfigJson ?? '{}', now, input.id,
        );
      if (info.changes === 0) {
        throw new Error('AI_MODEL_NOT_FOUND');
      }
      // 密文只在明确提供时才覆盖（clear 由控制器传空串表达）
      if (input.apiKeyEncrypted !== undefined) {
        db.prepare('UPDATE ai_model_configs SET api_key_encrypted = ?, api_key_encrypted_version = ? WHERE id = ?')
          .run(input.apiKeyEncrypted, input.apiKeyEncryptedVersion ?? 0, input.id);
      }
      if (input.virtualKeyEncrypted !== undefined) {
        db.prepare('UPDATE ai_model_configs SET virtual_key_encrypted = ?, virtual_key_encrypted_version = ? WHERE id = ?')
          .run(input.virtualKeyEncrypted, input.virtualKeyEncryptedVersion ?? 0, input.id);
      }
    } else {
      const info = db
        .prepare(
          `INSERT INTO ai_model_configs (
             name, provider_type, base_url, api_key_encrypted, api_key_encrypted_version,
             virtual_key_encrypted, virtual_key_encrypted_version, model,
             is_default, enabled, headers_json, extra_config_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.name, input.providerType, input.baseUrl,
          input.apiKeyEncrypted ?? '', input.apiKeyEncryptedVersion ?? 0,
          input.virtualKeyEncrypted ?? '', input.virtualKeyEncryptedVersion ?? 0,
          input.model, isDefault, enabled, input.headersJson ?? '{}', input.extraConfigJson ?? '{}',
          now, now,
        );
      const id = Number(info.lastInsertRowid);
      const row = db.prepare('SELECT * FROM ai_model_configs WHERE id = ?').get(id) as RawAiModelRow;
      return toAiModel(row);
    }
    const row = db.prepare('SELECT * FROM ai_model_configs WHERE id = ?').get(input.id) as RawAiModelRow;
    return toAiModel(row);
  },

  remove(id: number): boolean {
    return getDatabase().prepare('DELETE FROM ai_model_configs WHERE id = ?').run(id).changes > 0;
  },

  setDefault(id: number): boolean {
    const db = getDatabase();
    const exists = db.prepare('SELECT id FROM ai_model_configs WHERE id = ?').get(id);
    if (!exists) {
      return false;
    }
    const write = db.transaction(() => {
      db.prepare('UPDATE ai_model_configs SET is_default = 0 WHERE is_default = 1').run();
      db.prepare('UPDATE ai_model_configs SET is_default = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
    });
    write();
    return true;
  },
};

export const aiSkillsRepository = {
  /** 用户可见技能（排除内置），对齐 vue2 db:getAiSkills。 */
  list(): AiSkillRow[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM ai_skills WHERE builtin = 0 ORDER BY sort_order ASC, id ASC')
      .all() as RawAiSkillRow[];
    return rows.map(toAiSkill);
  },

  listIncludingBuiltin(): AiSkillRow[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM ai_skills ORDER BY builtin DESC, sort_order ASC, id ASC')
      .all() as RawAiSkillRow[];
    return rows.map(toAiSkill);
  },

  get(id: number): AiSkillRow | null {
    const row = getDatabase().prepare('SELECT * FROM ai_skills WHERE id = ?').get(id) as
      | RawAiSkillRow
      | undefined;
    return row ? toAiSkill(row) : null;
  },

  save(input: AiSkillSaveInput): AiSkillRow {
    const db = getDatabase();
    const now = Date.now();
    if (input.id) {
      const info = db
        .prepare(
          `UPDATE ai_skills SET name = ?, title = ?, content = ?, enabled = ?, sort_order = ?, updated_at = ? WHERE id = ? AND builtin = 0`,
        )
        .run(
          input.name, input.title ?? '', input.content ?? '',
          input.enabled === false ? 0 : 1, input.sortOrder ?? 0, now, input.id,
        );
      if (info.changes === 0) {
        throw new Error('AI_SKILL_NOT_FOUND_OR_BUILTIN');
      }
    } else {
      const info = db
        .prepare(
          `INSERT INTO ai_skills (name, title, content, builtin, enabled, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, 0, 1, ?, ?, ?)`,
        )
        .run(input.name, input.title ?? '', input.content ?? '', input.sortOrder ?? 0, now, now);
      input.id = Number(info.lastInsertRowid);
    }
    const row = db.prepare('SELECT * FROM ai_skills WHERE id = ?').get(input.id) as RawAiSkillRow;
    return toAiSkill(row);
  },

  remove(id: number): boolean {
    // 内置技能不可删（对齐 vue2 db:deleteAiSkill）
    return getDatabase().prepare('DELETE FROM ai_skills WHERE id = ? AND builtin = 0').run(id).changes > 0;
  },
};
