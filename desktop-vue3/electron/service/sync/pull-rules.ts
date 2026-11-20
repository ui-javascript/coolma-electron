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
