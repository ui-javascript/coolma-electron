/**
 * 推送阶段的纯规则，照 vue2 `SyncService.pushToCloud` / `syncLocalCategoriesToCloud`。
 *
 * 这里不碰数据库和网络，L3 可以直接测：
 *   - 2004 / 不存在 / not found → 视为云端笔记已被删除，回退新建
 *   - 同名同目录匹配（category 先归一，title 精确比）
 *   - 本地目录按路径深度排序，先父后子
 */

const ROOT_CATEGORY_ALIASES = new Set(['', '/', 'OFFLINE_ROOT_CATEGORY', '/我的笔记/', '/My Notes/']);

export interface CloudNoteCandidate {
  docGuid: string;
  title: string;
  category: string;
}

/** vue2 `normalizeCategoryForMatch`：根目录各种写法统一成 `/`。 */
export function normalizeMatchCategory(category: unknown): string {
  const raw = String(category ?? '').trim();
  if (ROOT_CATEGORY_ALIASES.has(raw)) {
    return '/';
  }
  const withPrefix = raw.startsWith('/') ? raw : `/${raw}`;
  return withPrefix.replace(/\/+$/g, '') || '/';
}

/**
 * 更新远端笔记失败时，判断是不是「笔记已不存在」。
 * vue2 认 code / message / externCode 三种形态；v3 的 request 只带 code 和 message，
 * 额外补 HTTP 404，避免服务端换错误码后直接同步失败。
 */
export function isNoteMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown; externCode?: unknown };
  if (Number(candidate.code) === 2004 || Number(candidate.externCode) === 2004) {
    return true;
  }
  if (Number(candidate.status) === 404) {
    return true;
  }
  const message = String(candidate.message ?? '');
  return /2004|不存在|not exist|not found/i.test(message);
}

/** 云端目录已存在：vue2 把 400 / 409 / message 带 exists 都当幂等成功。 */
export function isCategoryExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  const status = Number(candidate.status ?? candidate.code);
  if (status === 400 || status === 409) {
    return true;
  }
  return /exists|已存在|exist/i.test(String(candidate.message ?? ''));
}

/** 本地分类路径 → 为知 createCategory 需要的 parent / child。 */
export function toWizCategoryInput(category: string): { parent: string; child: string } {
  const segments = String(category ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= 1) {
    return { parent: '/', child: segments[0] ?? '' };
  }
  return {
    parent: `/${segments.slice(0, -1).join('/')}/`,
    child: segments[segments.length - 1],
  };
}

/** 父目录在前；同深度按原顺序，避免子目录被父目录的排序打乱。 */
export function sortCategoriesByDepth<T extends { category: string }>(items: readonly T[]): T[] {
  const depth = (item: T): number => (String(item.category ?? '').match(/\//g) || []).length;
  return [...items].sort((left, right) => depth(left) - depth(right));
}

/**
 * vue2 `findCloudNoteInCategory`：category 归一后相等，title 精确相等。
 * 返回第一条命中，找不到返回 null。
 */
export function findCloudNoteByTitle<T extends CloudNoteCandidate>(
  notes: readonly T[],
  input: { title: string; category: string },
): T | null {
  const targetTitle = input.title || 'Untitled';
  const targetCategory = normalizeMatchCategory(input.category);
  for (const note of notes) {
    if (
      String(note.title ?? '') === targetTitle
      && normalizeMatchCategory(note.category) === targetCategory
    ) {
      return note;
    }
  }
  return null;
}
