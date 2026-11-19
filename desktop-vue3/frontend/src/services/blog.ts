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

export const pickDirectory = (): Promise<IpcResult<string | null>> =>
  invoke<string | null>(IPC_CHANNELS.app.pickDirectory);
