import type { NoteSummary } from '@shared/types/domain';

export const DAY_MS = 24 * 60 * 60 * 1000;

export type TimeGroupKey = 'today' | 'yesterday' | 'week' | 'earlier';

export type Translate = (key: string, named?: Record<string, unknown>) => string;

/** `tags` 字段是逗号串，读的时候一律走这里，避免各处 split 逻辑不一致。 */
export function splitTags(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function noteTags(note: Pick<NoteSummary, 'tags'>): string[] {
  return splitTags(note.tags);
}

export function primaryTag(note: Pick<NoteSummary, 'tags'>, t: Translate): string {
  return noteTags(note)[0] ?? t('notes.untagged');
}

export function extraTagCount(note: Pick<NoteSummary, 'tags'>): number {
  return Math.max(0, noteTags(note).length - 1);
}

/** 根目录的历史写法，与主进程 `normalizeCategory` 保持同一份别名表。 */
const ROOT_FOLDER_ALIASES = new Set(['', '/', 'OFFLINE_ROOT_CATEGORY', '/我的笔记/', '/My Notes/']);

/**
 * 目录路径归一化（前端比较专用）。
 *
 * 侧栏树的 key 形如 `/My Notes/【2】算法/排序/`（首尾都带斜杠，照 vue2 的
 * `buildCategoryNodeTree`），而 SQLite 里 notes.category 是 `/My Notes/【2】算法/排序`
 * （主进程 `normalizeCategory` 会砍掉尾斜杠）。两边直接 `===` 永远不相等，
 * 表现为「点了文件夹，列表一条都查不出来」。所有跨层比较都必须先过这里。
 */
export function normalizeFolderPath(category?: string | null): string {
  const raw = String(category ?? '').trim();
  if (ROOT_FOLDER_ALIASES.has(raw)) {
    return '/';
  }
  const withPrefix = raw.startsWith('/') ? raw : `/${raw}`;
  const trimmed = withPrefix.replace(/\/+$/g, '');
  return trimmed || '/';
}

/** 只取路径最后一段做展示，完整路径仍由 category 字段承载。 */
export function folderName(category: string, rootLabel: string): string {
  const parts = String(category ?? '')
    .split('/')
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : rootLabel;
}

export function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

export function noteTimeGroup(note: Pick<NoteSummary, 'updatedAt' | 'createdAt'>): TimeGroupKey {
  const timestamp = note.updatedAt || note.createdAt;
  if (!timestamp) {
    return 'earlier';
  }
  const today = startOfToday();
  if (timestamp >= today) {
    return 'today';
  }
  if (timestamp >= today - DAY_MS) {
    return 'yesterday';
  }
  if (timestamp >= today - 6 * DAY_MS) {
    return 'week';
  }
  return 'earlier';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatNoteDate(note: Pick<NoteSummary, 'updatedAt' | 'createdAt'>, t: Translate): string {
  const timestamp = note.updatedAt || note.createdAt;
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = startOfToday();
  if (timestamp >= today) {
    return `${t('time.today')} ${time}`;
  }
  if (timestamp >= today - DAY_MS) {
    return `${t('time.yesterday')} ${time}`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** 正文首行 `# 标题` 决定列表标题；没有标题行时回落到旧标题。 */
export function deriveTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || fallback).slice(0, 300);
}

/** 按本地时区把时间戳转 YYYY-MM-DD。 */
export function dateKeyOf(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return '';
  }
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 日历基准对应的日期键：modified 优先 updated_at。 */
export function noteDateKey(note: Pick<NoteSummary, 'updatedAt' | 'createdAt'>, basis: 'created' | 'modified'): string {
  return dateKeyOf(basis === 'created' ? note.createdAt : note.updatedAt || note.createdAt);
}

/**
 * 新建笔记弹窗的默认标题（对齐 vue2 addNoteHandler）：
 * 取当前分类最后一段 + 本地年月，如「【工作】新笔记-202611.md」。
 */
export function newNoteDefaults(category: string, t: Translate, now = new Date()): { title: string; categoryName: string; date: string } {
  const categoryName = String(category ?? '').split('/').filter(Boolean).pop() || '';
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    categoryName,
    date,
    title: t('notes.defaultTitle', { category: categoryName, date }),
  };
}

/**
 * 目录路径拼接（对齐 vue2 createCategory）：父路径 + 子目录名，统一成 `/a/b`。
 * 子目录名允许含多级；传入父路径时不再把输入当绝对路径，避免生成 `/父/父/子`。
 */
export function joinFolderPath(parent: string, child: string): string {
  const names = String(child ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!names.length) {
    return '';
  }
  const parentParts = String(parent ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  return `/${[...parentParts, ...names].join('/')}`;
}

/** 批量删除模板可执行 ids：只留当前存在且非内置的模板（对齐 vue2 confirmBatchDeleteTemplates）。 */
export function removableTemplateIds(
  templates: Array<{ id: string; isBuiltin: boolean }>,
  selected: string[],
): string[] {
  const allowed = new Set(templates.filter((tpl) => tpl.id && !tpl.isBuiltin).map((tpl) => tpl.id));
  return selected.filter((id) => allowed.has(id));
}
