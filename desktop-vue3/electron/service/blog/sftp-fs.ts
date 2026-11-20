import fsp from 'node:fs/promises';
import path from 'node:path';

/** 把远程目录规整成 posix 路径；空值直接报错，末尾多余 `/` 去掉。 */
export function normalizeRemotePath(remotePath: string): string {
  const value = (remotePath || '').trim();
  if (!value) {
    throw new Error('SFTP remote path is required');
  }
  return path.posix.normalize(value).replace(/\/+$/, '') || '/';
}

/** 递归列出目录下的子目录和文件（相对路径，统一用 posix 分隔符）。 */
export async function collectTree(localDir: string): Promise<{ dirs: string[]; files: string[] }> {
  const dirs: string[] = [];
  const files: string[] = [];

  async function walk(relative: string): Promise<void> {
    const current = path.join(localDir, relative);
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = relative ? path.posix.join(relative, entry.name) : entry.name;
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        // 与 vue2 的 statSync 对齐：软链按目标类型处理。
        const target = await fsp.stat(path.join(localDir, childRelative)).catch(() => null);
        isDir = Boolean(target?.isDirectory());
        isFile = Boolean(target?.isFile());
      }
      if (isDir) {
        dirs.push(childRelative);
        await walk(childRelative);
      } else if (isFile) {
        files.push(childRelative);
      }
    }
  }

  const info = await fsp.stat(localDir).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`Local directory is not a directory: ${localDir}`);
  }
  await walk('');
  return { dirs, files };
}
