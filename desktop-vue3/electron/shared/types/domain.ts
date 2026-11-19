export interface NoteSummary {
  id: number;
  docGuid: string | null;
  kbGuid: string | null;
  title: string;
  excerpt: string;
  category: string;
  tags: string;
  createdAt: number;
  updatedAt: number;
  dirty: number;
}

export interface NoteRecord extends NoteSummary {
  content: string;
  dataCreated: number | null;
  dataModified: number | null;
  localModified: number | null;
  serverModified: number | null;
}

export interface NoteListResult {
  items: NoteSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface NoteStats {
  total: number;
  dirty: number;
  categories: number;
  tags: number;
}

export interface CategoryRecord {
  category: string;
  parent: string;
  kbGuid: string;
  localOnly: number;
  noteCount: number;
}

export interface TagRecord {
  id: number;
  name: string;
  color: string;
  noteCount: number;
}

export interface DatabaseStatus {
  ready: boolean;
  path: string;
  schemaVersion: number;
  tables: number;
  noteCount: number;
  tagCount: number;
  runeCount: number;
  echoCount: number;
  sizeBytes: number;
  walMode: string;
}

export interface ImportCounts {
  notes: number;
  tags: number;
  categories: number;
  runes: number;
  echoes: number;
}

export interface ImportResult {
  imported: boolean;
  sourcePath: string;
  backupPath: string | null;
  counts: ImportCounts;
  schemaVersion: number;
}

/** 单条一致性问题的汇总；samples 只放少量样本，避免把整库塞进 IPC。 */
export interface IntegrityIssue {
  kind: string;
  label: string;
  count: number;
  samples: string[];
}

/** 只读体检报告：所有策略都是"发现并报告"，不做自动修复。 */
export interface IntegrityReport {
  checkedAt: number;
  notes: number;
  tags: number;
  noteTagLinks: number;
  pendingSync: number;
  issues: IntegrityIssue[];
  healthy: boolean;
}

export type SyncAction = 'create' | 'update' | 'delete';
export type SyncDirection = 'local_to_server' | 'server_to_local';

/** 本地变更队列中的一行。 */
export interface SyncLogEntry {
  id: number;
  noteId: number | null;
  action: SyncAction;
  direction: SyncDirection;
  docGuid: string | null;
  kbGuid: string | null;
  timestamp: number;
  synced: number;
}

/** 队列按动作的汇总。 */
export interface PendingSyncSummary {
  total: number;
  create: number;
  update: number;
  delete: number;
  oldestTimestamp: number | null;
}

/** @ 快捷面板里的符文卡片（对应 runes 表一行）。 */
export interface RuneCard {
  id: string;
  name: string;
  desc: string;
  color: string;
  icon: string;
  template: string;
  category: string;
  sortOrder: number;
  inheritFromPrevious: number;
}

/** @ 快捷面板里的回响卡片（对应 echoes 表一行）。 */
export interface EchoCard {
  id: string;
  name: string;
  desc: string;
  color: string;
  icon: string;
  annoSource: string;
  renderType: string;
  category: string;
  sortOrder: number;
}

/** 符文/回响批量导入的结果统计。 */
export interface LibraryImportResult {
  imported: number;
  skipped: number;
  renamed: number;
}

/** 备份文件条目（设置页列表用）。 */
export interface BackupEntry {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: number;
  kind: 'manual' | 'import' | 'pre-restore';
}

/** 恢复结果：成功时带上回滚点与升级前后的 schema 版本。 */
export interface RestoreResult {
  restored: boolean;
  sourcePath: string;
  backupPath: string | null;
  counts: number;
  schemaVersion: number;
  previousSchemaVersion: number;
}
