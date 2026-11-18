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
