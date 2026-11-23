import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcResult } from '@shared/ipc/contract';
import { invoke } from '@/services/ipc';

export interface BlogExportInput {
  blogDir: string;
  category?: string;
  theme?: 'default' | 'vdoing' | 'hope' | 'reco';
  includeCi?: boolean;
  runeRender?: 'static' | 'component';
}

export interface BlogExportOutput {
  blogDir: string;
  category: string;
  writtenFiles: number;
  skippedFiles: number;
  shortlinkCount: number;
  runeCards: number;
  echoCards: number;
  runeRender: 'static' | 'component';
  workflows: { written: string[]; skipped: string[] };
}

export type BlogDeployKind = 'build' | 'github' | 'sftp';
export type BlogDeployStatus = 'success' | 'failed' | 'cancelled';

export interface BlogHistoryItem {
  id: number;
  kind: BlogDeployKind;
  target: string;
  status: BlogDeployStatus;
  blogDir: string;
  detail: string;
  startedAt: number;
  finishedAt: number | null;
}

export const blogHistory = (limit = 20): Promise<IpcResult<{ total: number; items: BlogHistoryItem[] }>> =>
  invoke<{ total: number; items: BlogHistoryItem[] }>(IPC_CHANNELS.blog.history, { limit });

export const clearBlogHistory = (): Promise<IpcResult<{ cleared: number }>> =>
  invoke<{ cleared: number }>(IPC_CHANNELS.blog.historyClear, {});

export const exportBlog = (input: BlogExportInput): Promise<IpcResult<BlogExportOutput>> =>
  invoke<BlogExportOutput>(IPC_CHANNELS.blog.export, input);

export interface BlogExportCiOutput {
  targetDir: string;
  written: string[];
  skipped: string[];
}

export const exportBlogCi = (blogDir: string): Promise<IpcResult<BlogExportCiOutput>> =>
  invoke<BlogExportCiOutput>(IPC_CHANNELS.blog.exportCi, { blogDir });

export interface BlogBuildProgress {
  stage: 'config' | 'install' | 'build' | 'sftp' | 'done' | 'error' | 'cancelled';
  message: string;
  percent: number;
  stream?: 'stdout' | 'stderr';
}

export type BlogTheme = 'default' | 'vdoing' | 'hope' | 'reco';

export interface BlogBuildEnv {
  theme: BlogTheme;
  nodeVersion: string;
  packageStatus: 'created' | 'updated' | 'kept';
  configStatus: 'created' | 'updated' | 'base-updated' | 'kept';
  installed: boolean;
}

export const BLOG_PROGRESS_CHANNEL = 'blog-deploy-progress';

export const buildBlog = (input: {
  blogDir: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn';
  script?: string;
  theme?: BlogTheme;
  base?: string;
}): Promise<IpcResult<{ distDir: string; script: string; env: BlogBuildEnv }>> =>
  invoke<{ distDir: string; script: string; env: BlogBuildEnv }>(IPC_CHANNELS.blog.build, input);

export const cancelBlogBuild = (): Promise<IpcResult<{ cancelled: boolean }>> =>
  invoke<{ cancelled: boolean }>(IPC_CHANNELS.blog.cancel, {});

export function onBlogProgress(listener: (event: BlogBuildProgress) => void): () => void {
  const api = window.coolma;
  if (!api) {
    return () => undefined;
  }
  return api.on(BLOG_PROGRESS_CHANNEL, (payload) => listener(payload as BlogBuildProgress));
}

export interface BlogGithubConfig {
  owner: string;
  repo: string;
  workflowId: string;
  branch?: string;
  token: string;
}

export const dispatchBlogGithub = (input: BlogGithubConfig): Promise<IpcResult<{ dispatched: boolean }>> =>
  invoke<{ dispatched: boolean }>(IPC_CHANNELS.blog.dispatchGitHub, input);

export interface BlogSftpConfig {
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

export const testBlogSftp = (config: BlogSftpConfig): Promise<IpcResult<{ success: true }>> =>
  invoke<{ success: true }>(IPC_CHANNELS.blog.sftpTest, { config });

export const uploadBlogSftp = (input: {
  localDir: string;
  config: BlogSftpConfig;
}): Promise<IpcResult<{ uploaded: number; total: number; backupPath?: string }>> =>
  invoke<{ uploaded: number; total: number; backupPath?: string }>(IPC_CHANNELS.blog.sftpUpload, input);

export const cancelBlogSftp = (): Promise<IpcResult<{ cancelled: boolean }>> =>
  invoke<{ cancelled: boolean }>(IPC_CHANNELS.blog.sftpCancel, {});

export const pickFile = (): Promise<IpcResult<string | null>> =>
  invoke<string | null>(IPC_CHANNELS.app.pickFile);

export const pickDirectory = (): Promise<IpcResult<string | null>> =>
  invoke<string | null>(IPC_CHANNELS.app.pickDirectory);
