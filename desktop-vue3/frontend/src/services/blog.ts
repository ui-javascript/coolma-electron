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
  stage: 'build' | 'done' | 'error' | 'cancelled';
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

export const pickDirectory = (): Promise<IpcResult<string | null>> =>
  invoke<string | null>(IPC_CHANNELS.app.pickDirectory);
