import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'ssh2';
import type { ConnectConfig, SFTPWrapper } from 'ssh2';
import { collectTree, normalizeRemotePath } from './sftp-fs';

/**
 * SFTP 部署服务（照 desktop-vue2 的 sftp-service.js 搬运）。
 *
 * 行为对齐：
 * - 连接 30s 超时；
 * - testConnection 在 remotePath 下写 `.sftp_test` 再删，验证写权限；
 * - uploadDirectory 先 mkdir 远程根，再按目录 / 文件顺序 fastPut，逐个回调进度；
 * - backupRemoteDir 把现有 remotePath 重命名为 `${remotePath}_backup_${Date.now()}`；
 * - cancelSftpUpload 直接断开当前上传客户端。
 *
 * 只做安全加固：host / username / remotePath 必填、私钥路径必须能读、错误信息统一。
 */

export interface SftpConfig {
  enabled?: boolean;
  host: string;
  port?: number;
  username: string;
  authType?: 'password' | 'key';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  remotePath: string;
  backupEnabled?: boolean;
}

export interface SftpUploadResult {
  uploaded: number;
  total: number;
}

export interface SftpBackupResult {
  backedUp: boolean;
  backupPath?: string;
}

let currentClient: Client | null = null;

function buildConnectConfig(config: SftpConfig): ConnectConfig {
  const host = (config.host || '').trim();
  const username = (config.username || '').trim();
  if (!host) {
    throw new Error('SFTP host is required');
  }
  if (!username) {
    throw new Error('SFTP username is required');
  }

  const conn: ConnectConfig = {
    host,
    port: Number(config.port) || 22,
    username,
    readyTimeout: 30000,
  };

  if ((config.authType || 'password') === 'password') {
    if (!config.password) {
      throw new Error('SFTP password is required');
    }
    conn.password = config.password;
  } else {
    const keyPath = (config.privateKeyPath || '').trim();
    if (!keyPath) {
      throw new Error('SFTP private key path is required');
    }
    try {
      conn.privateKey = fs.readFileSync(keyPath);
    } catch (error) {
      throw new Error(`Failed to read private key: ${(error as Error).message}`);
    }
    if (config.passphrase) {
      conn.passphrase = config.passphrase;
    }
  }

  return conn;
}

function connect(config: SftpConfig): Promise<{ client: Client; sftp: SFTPWrapper }> {
  const connConfig = buildConnectConfig(config);

  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.end();
      reject(new Error('Connection timeout (30s)'));
    }, 30000);

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.end();
      reject(error);
    };

    client.on('ready', () => {
      if (settled) return;
      clearTimeout(timeout);
      client.sftp((error, sftp) => {
        if (error) {
          fail(error);
          return;
        }
        settled = true;
        resolve({ client, sftp });
      });
    });

    client.on('error', (error) => fail(error));

    try {
      client.connect(connConfig);
    } catch (error) {
      fail(new Error(`SSH connection failed: ${(error as Error).message}`));
    }
  });
}

function ensureRemoteDir(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (error) => {
      const code = (error as { code?: string | number } | undefined)?.code;
      if (error && !error.message.includes('already exists') && code !== 4) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function putFile(sftp: SFTPWrapper, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function testConnection(config: SftpConfig): Promise<{ success: true }> {
  const remotePath = normalizeRemotePath(config.remotePath);
  const { client, sftp } = await connect(config);

  try {
    const testFile = path.posix.join(remotePath, '.sftp_test');
    await new Promise<void>((resolve, reject) => {
      sftp.writeFile(testFile, 'test', (error) => (error ? reject(new Error('No write permission to remote directory')) : resolve()));
    });
    await new Promise<void>((resolve) => {
      sftp.unlink(testFile, () => resolve());
    });
    return { success: true };
  } finally {
    client.end();
  }
}

export async function uploadDirectory(
  config: SftpConfig,
  localDir: string,
  onProgress?: (filename: string, uploaded: number, total: number) => void,
): Promise<SftpUploadResult> {
  const remotePath = normalizeRemotePath(config.remotePath);
  const tree = await collectTree(localDir);
  const { client, sftp } = await connect(config);
  currentClient = client;

  try {
    await ensureRemoteDir(sftp, remotePath);
    for (const dir of tree.dirs) {
      await ensureRemoteDir(sftp, path.posix.join(remotePath, dir));
    }

    let uploaded = 0;
    const total = tree.files.length;
    for (const file of tree.files) {
      await putFile(sftp, path.join(localDir, file), path.posix.join(remotePath, file));
      uploaded += 1;
      onProgress?.(file, uploaded, total);
    }

    return { uploaded, total };
  } finally {
    if (currentClient === client) {
      currentClient = null;
    }
    client.end();
  }
}

export async function backupRemoteDir(config: SftpConfig): Promise<SftpBackupResult> {
  const remotePath = normalizeRemotePath(config.remotePath);
  const { client, sftp } = await connect(config);

  try {
    const exists = await new Promise<boolean>((resolve) => {
      sftp.stat(remotePath, (error) => resolve(!error));
    });
    if (!exists) {
      return { backedUp: false };
    }

    const backupPath = `${remotePath}_backup_${Date.now()}`;
    await new Promise<void>((resolve, reject) => {
      sftp.rename(remotePath, backupPath, (error) => (error ? reject(error) : resolve()));
    });
    return { backedUp: true, backupPath };
  } finally {
    client.end();
  }
}

export function cancelSftpUpload(): boolean {
  if (!currentClient) {
    return false;
  }
  currentClient.end();
  currentClient = null;
  return true;
}
