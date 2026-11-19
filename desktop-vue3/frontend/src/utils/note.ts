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
