import fs from 'node:fs/promises';
import path from 'node:path';
import type { IpcResult } from '../shared/ipc/contract';
import { blogExportSchema } from '../shared/ipc/schemas';
import { fail, ok } from '../shared/ipc/result';
import { notesRepository } from '../service/db/notes-repository';
import { exportCIWorkflows, ensureReadme, generateSidebarJson, writeBlogPosts } from '../service/blog/deploy';
import type { BlogNote } from '../service/blog/deploy';
import { failFromError } from './controller-utils';

export interface BlogExportResult {
  blogDir: string;
  category: string;
  writtenFiles: number;
  shortlinkCount: number;
  workflows: { written: string[]; skipped: string[] };
}

class BlogController {
  /**
   * 把本地笔记写进 vuepress 博客目录（P0-10 的本地一半）。
   *
   * vue2 的完整链路是：拿笔记 → 写产物 → 主进程 vuepress build → GitHub dispatch / SFTP。
   * 这里只做「拿笔记 → 写产物」；构建与推送没有接（不装样子）。
   */
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
}

BlogController.toString = () => '[class BlogController]';

export default BlogController;
