import fs from 'node:fs';
import path from 'node:path';
import type { BackupEntry } from '../../shared/types/domain';

/**
 * 备份文件的纯文件系统部分：不碰 better-sqlite3 / Electron，
 * 因此可以在 Node 测试里直接跑（命名、列表、保留策略都在这里）。
 */
export function backupFileName(prefix = 'coolma', at = new Date()): string {
  return `${prefix}-${at.toISOString().replace(/[:.]/g, '-')}.db`;
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** 只认本应用产出的文件名，避免把用户随手丢进来的 .db 当成自动备份清掉。 */
const BACKUP_FILE_RE = /^(coolma|import|pre-restore)-[0-9TZ-]+\.db$/;

export function isManagedBackupFile(name: string): boolean {
  return BACKUP_FILE_RE.test(name);
}

export function listBackups(directory: string): BackupEntry[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const entries: BackupEntry[] = [];
  for (const name of fs.readdirSync(directory)) {
    if (!isManagedBackupFile(name)) {
      continue;
    }
    const filePath = path.join(directory, name);
    const stat = fs.statSync(filePath);
    entries.push({
      name,
      path: filePath,
      sizeBytes: stat.size,
      // 备份文件只写一次，mtime 就是创建时间；Linux 上 birthtime 常不可靠，统一用 mtime
      createdAt: stat.mtimeMs,
      kind: name.startsWith('pre-restore') ? 'pre-restore' : name.startsWith('import') ? 'import' : 'manual',
    });
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 只保留最新的 keep 份手动/自动备份；`pre-restore` 回滚点与 `import` 临时件不动。
 * 返回被删掉的路径，方便日志与测试断言。
 */
export function pruneBackups(keep: number, directory: string): string[] {
  const managed = listBackups(directory).filter((entry) => entry.kind === 'manual');
  if (managed.length <= keep) {
    return [];
  }
  const removed: string[] = [];
  for (const entry of managed.slice(keep)) {
    try {
      fs.rmSync(entry.path, { force: true });
      removed.push(entry.path);
    } catch {
      // 删不掉就留着，下次启动还会重试；这里不当作失败
    }
  }
  return removed;
}
