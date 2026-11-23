import { getDatabase } from './connection';

export type BlogDeployKind = 'build' | 'github' | 'sftp';
export type BlogDeployStatus = 'success' | 'failed' | 'cancelled';

export interface BlogDeployHistoryRecord {
  id: number;
  kind: BlogDeployKind;
  target: string;
  status: BlogDeployStatus;
  blogDir: string;
  detail: string;
  startedAt: number;
  finishedAt: number | null;
}

function toRecord(row: Record<string, unknown>): BlogDeployHistoryRecord {
  return {
    id: Number(row.id),
    kind: row.kind as BlogDeployKind,
    target: String(row.target ?? ''),
    status: row.status as BlogDeployStatus,
    blogDir: String(row.blog_dir ?? ''),
    detail: String(row.detail ?? ''),
    startedAt: Number(row.started_at) || 0,
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
  };
}

export const blogHistoryRepository = {
  /** 开始一次部署/构建，先落 running 行，结束后补状态。 */
  begin(kind: BlogDeployKind, target: string, blogDir = ''): number {
    const db = getDatabase();
    const result = db
      .prepare('INSERT INTO blog_deploy_history (kind, target, blog_dir, status, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(kind, target, blogDir, 'failed', Date.now());
    return Number(result.lastInsertRowid);
  },

  finish(id: number, status: BlogDeployStatus, detail = ''): void {
    getDatabase()
      .prepare('UPDATE blog_deploy_history SET status = ?, detail = ?, finished_at = ? WHERE id = ?')
      .run(status, detail, Date.now(), id);
  },

  list(limit = 20): BlogDeployHistoryRecord[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM blog_deploy_history ORDER BY started_at DESC, id DESC LIMIT ?')
      .all(Math.max(1, Math.min(200, limit))) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  },

  clear(): number {
    const result = getDatabase().prepare('DELETE FROM blog_deploy_history').run();
    return Number(result.changes);
  },
};
