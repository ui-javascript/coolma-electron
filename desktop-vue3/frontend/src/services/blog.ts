import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcResult } from '@shared/ipc/contract';
import { invoke } from '@/services/ipc';

export interface BlogExportInput {
  blogDir: string;
  category?: string;
  theme?: 'default' | 'vdoing' | 'hope' | 'reco';
  includeCi?: boolean;
}

export interface BlogExportOutput {
  blogDir: string;
  category: string;
  writtenFiles: number;
  shortlinkCount: number;
  workflows: { written: string[]; skipped: string[] };
}

export const exportBlog = (input: BlogExportInput): Promise<IpcResult<BlogExportOutput>> =>
  invoke<BlogExportOutput>(IPC_CHANNELS.blog.export, input);

export interface BlogBuildProgress {
  stage: 'build' | 'sftp' | 'done' | 'error' | 'cancelled';
  message: string;
  percent: number;
  stream?: 'stdout' | 'stderr';
}

export const BLOG_PROGRESS_CHANNEL = 'blog-deploy-progress';

export const buildBlog = (input: { blogDir: string; packageManager?: 'npm' | 'pnpm' | 'yarn'; script?: string }): Promise<IpcResult<{ distDir: string; script: string }>> =>
  invoke<{ distDir: string; script: string }>(IPC_CHANNELS.blog.build, input);

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
