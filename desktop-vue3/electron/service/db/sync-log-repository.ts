import { getDatabase } from './connection';
import type {
  PendingSyncSummary,
  SyncAction,
  SyncDirection,
  SyncLogEntry,
} from '../../shared/types/domain';

export type { PendingSyncSummary, SyncAction, SyncDirection, SyncLogEntry };

interface SyncLogRow {
  id: number;
  note_id: number | null;
  action: SyncAction;
  direction: SyncDirection;
  doc_guid: string | null;
  kb_guid: string | null;
  timestamp: number | null;
  synced: number | null;
}

function toEntry(row: SyncLogRow): SyncLogEntry {
  return {
    id: row.id,
    noteId: row.note_id,
    action: row.action,
    direction: row.direction,
    docGuid: row.doc_guid,
    kbGuid: row.kb_guid,
    timestamp: row.timestamp ?? 0,
    synced: row.synced ?? 0,
  };
}

/**
 * 本地变更队列（outbox）。
 *
 * 约定：
 * - 只记 `local_to_server` 方向；服务端拉取不写这里。
 * - 同一笔记的连续本地改动会被折叠：已有未同步的 create/update 时只刷新时间戳，
 *   不会为每次按键攒一行，避免整表膨胀。
 * - `delete` 行的 `note_id` 必须为 NULL：笔记删除时外键 CASCADE 会连带清掉引用它的日志，
 *   所以删除事件只能靠 `doc_guid` 定位，这也正是同步时唯一需要的信息。
 */
export const syncLogRepository = {
  isEnabled(): boolean {
    return true;
  },

  /** 记录一次本地变更；返回写入（或折叠）后的日志 id。 */
  record(input: {
    noteId: number | null;
    action: SyncAction;
    docGuid?: string | null;
    kbGuid?: string | null;
  }): number {
    const db = getDatabase();
    const now = Date.now();

    if (input.action !== 'delete') {
      const latest = db
        .prepare(
          `SELECT id, action FROM sync_log
            WHERE note_id = ? AND synced = 0
            ORDER BY id DESC LIMIT 1`,
        )
        .get(input.noteId) as { id: number; action: SyncAction } | undefined;

      if (latest && (latest.action === 'create' || latest.action === 'update')) {
        // create 尚未同步时保持 create，语义上服务端还没见过这条笔记。
        db.prepare('UPDATE sync_log SET timestamp = ?, doc_guid = ?, kb_guid = ? WHERE id = ?').run(
          now,
          input.docGuid ?? null,
          input.kbGuid ?? null,
          latest.id,
        );
        return latest.id;
      }
    }

    const info = db
      .prepare(
        `INSERT INTO sync_log (note_id, action, direction, doc_guid, kb_guid, timestamp, synced)
         VALUES (?, ?, 'local_to_server', ?, ?, ?, 0)`,
      )
      .run(input.noteId, input.action, input.docGuid ?? null, input.kbGuid ?? null, now);

    return Number(info.lastInsertRowid);
  },

  listPending(limit = 200): SyncLogEntry[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT * FROM sync_log WHERE synced = 0 ORDER BY timestamp ASC, id ASC LIMIT ?`,
      )
      .all(Math.min(Math.max(Number(limit) || 200, 1), 5000)) as SyncLogRow[];
    return rows.map(toEntry);
  },

  summary(): PendingSyncSummary {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT action, COUNT(*) AS count, MIN(timestamp) AS oldest
           FROM sync_log WHERE synced = 0 GROUP BY action`,
      )
      .all() as Array<{ action: SyncAction; count: number; oldest: number | null }>;

    const summary: PendingSyncSummary = {
      total: 0,
      create: 0,
      update: 0,
      delete: 0,
      oldestTimestamp: null,
    };

    for (const row of rows) {
      const count = Number(row.count) || 0;
      summary.total += count;
      summary[row.action] = count;
      if (row.oldest && (summary.oldestTimestamp === null || row.oldest < summary.oldestTimestamp)) {
        summary.oldestTimestamp = row.oldest;
      }
    }

    return summary;
  },

  /** 同步成功后标记为已同步；服务端确认前不要调用。 */
  markSynced(ids: number[]): number {
    if (ids.length === 0) {
      return 0;
    }
    const db = getDatabase();
    const update = db.prepare('UPDATE sync_log SET synced = 1 WHERE id = ? AND synced = 0');
    const run = db.transaction((values: number[]) =>
      values.reduce((count, id) => count + update.run(id).changes, 0),
    );
    return run(ids);
  },

  /** 丢掉某条笔记的全部未同步日志；仅用于"本地记录已回滚"这类场景。 */
  dropForNote(noteId: number): number {
    return getDatabase().prepare('DELETE FROM sync_log WHERE note_id = ? AND synced = 0').run(noteId)
      .changes;
  },
};

export type SyncLogRepository = typeof syncLogRepository;
