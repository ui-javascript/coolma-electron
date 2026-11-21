import fs from 'node:fs/promises';
import path from 'node:path';
import type { IpcResult } from '../shared/ipc/contract';
import { blogBuildSchema, blogDispatchSchema, blogExportCiSchema, blogExportSchema, blogSftpTestSchema, blogSftpUploadSchema } from '../shared/ipc/schemas';
import { fail, ok } from '../shared/ipc/result';
import { notesRepository } from '../service/db/notes-repository';
import { exportCIWorkflows, ensureReadme, generateSidebarJson, writeBlogPosts } from '../service/blog/deploy';
import type { BlogNote } from '../service/blog/deploy';
import { cancelBlogBuild, runBlogBuild, sendBlogProgress } from '../service/blog/build';
import type { BlogBuildEnv } from '../service/blog/build';
import { dispatchWorkflow } from '../service/blog/github';
import { backupRemoteDir, cancelSftpUpload, testConnection, uploadDirectory } from '../service/blog/sftp';
import { failFromError } from './controller-utils';

export interface BlogExportResult {
  blogDir: string;
  category: string;
  writtenFiles: number;
  shortlinkCount: number;
  workflows: { written: string[]; skipped: string[] };
}

class BlogController {
  /** 把本地笔记写进 vuepress 博客目录（P0-10 的本地产物一半）。 */
  async export(args?: unknown): Promise<IpcResult<BlogExportResult>> {
    try {
      const input = blogExportSchema.parse(args);
      const blogDir = path.resolve(input.blogDir);
      const info = await fs.stat(blogDir).catch(() => null);
      if (!info?.isDirectory()) {
        return fail('BLOG_DIR_INVALID', `blogDir is not a directory: ${blogDir}`);
      }

      const category = (input.category || '').trim();
      const rows = input.category
        ? notesRepository
            .list({ limit: 5000, offset: 0 })
            .items.filter((note) => note.category === category || note.category.startsWith(`${category}/`))
        : notesRepository.list({ limit: 5000, offset: 0 }).items;

      if (rows.length === 0) {
        return fail('BLOG_NO_NOTES', 'No notes to export');
      }

      const notes: BlogNote[] = rows.map((summary) => {
        const record = notesRepository.get(summary.id);
        return {
          title: summary.title,
          content: record?.content ?? '',
          docGuid: summary.docGuid ?? '',
        };
      });

      const written = await writeBlogPosts(blogDir, notes, input.theme || 'default', category);
      await generateSidebarJson(blogDir, notes);
      await ensureReadme(blogDir, category || '全部笔记');

      let workflows: { written: string[]; skipped: string[] } = { written: [], skipped: [] };
      if (input.includeCi) {
        workflows = await exportCIWorkflows(blogDir);
      }

      return ok({
        blogDir,
        category,
        writtenFiles: written.writtenFiles,
        shortlinkCount: written.shortlinkCount,
        workflows,
      });
    } catch (error) {
      return failFromError(error, 'BLOG_EXPORT_ERROR');
    }
  }

  /** 只写内置 GitHub Actions workflow 到博客目录（对应 vue2 exportBlogCI）。 */
  async exportCi(args?: unknown): Promise<IpcResult<{ targetDir: string; written: string[]; skipped: string[] }>> {
    try {
      const input = blogExportCiSchema.parse(args);
      const blogDir = path.resolve(input.blogDir);
      const info = await fs.stat(blogDir).catch(() => null);
      if (!info?.isDirectory()) {
        return fail('BLOG_DIR_INVALID', `blogDir is not a directory: ${blogDir}`);
      }
      const result = await exportCIWorkflows(blogDir);
      return ok({ targetDir: blogDir, ...result });
    } catch (error) {
      return failFromError(error, 'BLOG_EXPORT_CI_ERROR');
    }
  }

  /** 在博客目录跑构建脚本；进度通过 `blog-deploy-progress` 事件推送。 */
  async build(args?: unknown): Promise<IpcResult<{ distDir: string; script: string; env: BlogBuildEnv }>> {
    try {
      const input = blogBuildSchema.parse(args);
      const result = await runBlogBuild(input);
      if (!result.ok || !result.env) {
        return fail(result.error || 'BLOG_BUILD_ERROR', result.error || 'build failed', result.details);
      }
      return ok({ distDir: result.distDir || '', script: result.script || '', env: result.env });
    } catch (error) {
      return failFromError(error, 'BLOG_BUILD_ERROR');
    }
  }

  /** 触发 GitHub Actions workflow（对应 vue2「部署」里的 dispatch 分支）。 */
  async dispatchGitHub(args?: unknown): Promise<IpcResult<{ dispatched: boolean }>> {
    try {
      const input = blogDispatchSchema.parse(args);
      const result = await dispatchWorkflow(input);
      if (!result.ok) {
        return fail('BLOG_DISPATCH_ERROR', result.error || 'dispatch failed');
      }
      return ok({ dispatched: true });
    } catch (error) {
      return failFromError(error, 'BLOG_DISPATCH_ERROR');
    }
  }

  /** 测试 SFTP 连接 + 目标目录写权限（对应 vue2 sftp-service testConnection）。 */
  async sftpTest(args?: unknown): Promise<IpcResult<{ success: true }>> {
    try {
      const input = blogSftpTestSchema.parse(args);
      const result = await testConnection(input.config);
      return ok(result);
    } catch (error) {
      return fail('BLOG_SFTP_TEST_ERROR', String((error as Error)?.message || error));
    }
  }

  /** 备份远程目录并上传构建产物；进度复用 `blog-deploy-progress`。 */
  async sftpUpload(args?: unknown): Promise<IpcResult<{ uploaded: number; total: number; backupPath?: string }>> {
    try {
      const input = blogSftpUploadSchema.parse(args);
      let backupPath: string | undefined;

      if (input.config.backupEnabled !== false) {
        sendBlogProgress({ stage: 'sftp', message: 'backup remote directory', percent: 96 });
        try {
          const backup = await backupRemoteDir(input.config);
          backupPath = backup.backupPath;
        } catch (error) {
          sendBlogProgress({
            stage: 'sftp',
            message: `backup skipped: ${(error as Error).message}`,
            percent: 96,
            stream: 'stderr',
          });
        }
      }

      sendBlogProgress({ stage: 'sftp', message: 'upload started', percent: 96 });
      const result = await uploadDirectory(input.config, path.resolve(input.localDir), (filename, uploaded, total) => {
        const percent = total > 0 ? 96 + Math.floor((uploaded / total) * 4) : 100;
        sendBlogProgress({
          stage: 'sftp',
          message: `${filename} (${uploaded}/${total})`,
          percent,
        });
      });
      sendBlogProgress({ stage: 'sftp', message: 'upload done', percent: 100 });
      return ok({ ...result, backupPath });
    } catch (error) {
      return fail('BLOG_SFTP_UPLOAD_ERROR', String((error as Error)?.message || error));
    }
  }

  async sftpCancel(args?: unknown): Promise<IpcResult<{ cancelled: boolean }>> {
    try {
      blogBuildSchema.partial().parse(args ?? {});
      return ok({ cancelled: cancelSftpUpload() });
    } catch (error) {
      return failFromError(error, 'BLOG_SFTP_CANCEL_ERROR');
    }
  }

  async cancel(args?: unknown): Promise<IpcResult<{ cancelled: boolean }>> {
    try {
      blogBuildSchema.partial().parse(args ?? {});
      return ok({ cancelled: cancelBlogBuild() });
    } catch (error) {
      return failFromError(error, 'BLOG_CANCEL_ERROR');
    }
  }
}

BlogController.toString = () => '[class BlogController]';

export default BlogController;
