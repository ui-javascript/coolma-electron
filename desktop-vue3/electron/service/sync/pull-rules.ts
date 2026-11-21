/**
 * 拉取阶段纯规则，照 vue2 `SyncService._buildRestorePreviewStats`。
 *
 * 云端列表 → 本地去重 key：
 *   `${title}|${normalizeCategoryForMatch(category)}|${kbGuid}`，整体 lower。
 * 只做字符串计算，L3 可测。
 */
import { normalizeMatchCategory } from './push-rules';

export function cloudDedupeKey(input: {
  title?: string | null;
  category?: string | null;
  kbGuid?: string | null;
}): string {
  const title = String(input.title ?? '').trim() || 'Untitled';
  const category = normalizeMatchCategory(input.category);
  const kbGuid = String(input.kbGuid ?? '');
  return `${title}|${category}|${kbGuid}`.toLowerCase();
}

/**
 * 为知目录删除路径：vue2 传的是树节点 key，首尾都带斜杠（`/My Notes/foo/`）。
 * V3 库里存的是去尾斜杠的 `/foo`，发服务端前补回尾斜杠。
 */
export function toWizCategoryDeletePath(category: string): string {
  const normalized = normalizeMatchCategory(category);
  if (normalized === '/') {
    return '/';
  }
  return `${normalized}/`;
}

/**
 * 为知列表查询参数。vue2 用 `orderBy=modified`，服务端只认
 * `modified/created/title`；`dataModified` 会被 2000 拒掉。
 */
export function buildNoteListQuery(input: {
  category?: string;
  limit?: number;
  start?: number;
} = {}): URLSearchParams {
  return new URLSearchParams({
    category: input.category ?? '',
    start: String(Math.max(0, input.start ?? 0)),
    count: String(Math.max(1, input.limit ?? 100)),
    withAbstract: 'true',
    orderBy: 'modified',
  });
}

/**
 * 云端 `.md` 笔记标题落本地时要去扩展名；查重也必须用同一个标题，
 * 否则「带 .md 查不到 → 去 .md 插入」会撞 category+title+kb 唯一索引。
 */
export function stripWizMarkdownSuffix(title: unknown): string {
  return String(title ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.md$/i, '');
}
