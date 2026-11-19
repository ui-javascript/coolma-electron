/**
 * AI 打标纯函数（移植 vue2 utils/tagUtil.js 的打标相关部分）。
 *
 * 只做三件事，不碰库、不发请求：
 *   1. 标签名规范化（去模型输出的 # 前缀 / 序号 / 引号 / 尾标点，限长）
 *   2. AI 文本 → 标签名数组（JSON 数组 / 逐行 / 逗号顿号分隔都能吃）
 *   3. 组织 chat messages（system + user，正文按字符上限压缩）
 */

export const MAX_TAG_NAME_LENGTH = 24;
export const MAX_SUGGESTED_TAGS = 8;
export const DEFAULT_SUGGESTED_TAGS = 3;
/** 单次 prompt 的正文上限：打标只要主题信息，不需要整篇。 */
export const CONTENT_PROMPT_LIMIT = 1200;
/** 参与 prompt 的已有标签名上限，避免超长列表把 prompt 撑爆。 */
export const EXISTING_TAG_PROMPT_LIMIT = 120;
export const DEFAULT_MAX_TOKENS = 1024;
export const RETRY_MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `你是一名严谨的笔记标签整理助手。
- 只输出一个 JSON 字符串数组，不要输出解释、不要 markdown 代码块、不要前后缀。
- 标签是简短的名词短语（2-8 个汉字，或 1-3 个英文单词）。
- 优先复用用户「已有标签」里语义相同的名称，名称必须与列表完全一致。
- 不要输出 # 前缀、不要标点、不要句子、不要重复标签。`;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(num), min), max);
}

/** 标签名规范化（对齐 vue2 normalizeTagName）。 */
export function normalizeTagName(raw: unknown): string {
  let name = String(raw ?? '').trim();
  if (!name) {
    return '';
  }
  name = name.replace(/^[\s"'“”‘’`*•·\-–—]+/, '');
  name = name.replace(/^\d+\s*[.、)）]\s*/, '');
  name = name.replace(/^#+\s*/, '');
  name = name.replace(/^[[({]+/, '');
  name = name.replace(/^[\s"'“”‘’`]+/, '');
  name = name.replace(/[\]})]+$/, '');
  name = name.replace(/[\s"'“”‘’`*]+$/g, '');
  name = name.replace(/[，,。.、;；:：!！?？]+$/g, '');
  name = name.replace(/\s+/g, ' ').trim();
  if (name.length > MAX_TAG_NAME_LENGTH) {
    name = name.slice(0, MAX_TAG_NAME_LENGTH).trim();
  }
  return name;
}

function extractJsonArray(text: string): unknown[] | null {
  const source = String(text ?? '');
  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function splitLooseTagText(text: string): string[] {
  return String(text ?? '')
    .split(/[\n\r,，、;；|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** AI 输出 → 标签名数组（规范化 + 去重 + 截断）。 */
export function parseTagNames(rawText: string, options?: { maxTags?: number }): string[] {
  const text = String(rawText ?? '').trim();
  if (!text) {
    return [];
  }
  const limit = clampNumber(options?.maxTags, 1, MAX_SUGGESTED_TAGS, DEFAULT_SUGGESTED_TAGS);
  const candidates = extractJsonArray(text) ?? splitLooseTagText(text);

  const names: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const raw =
      typeof candidate === 'object' && candidate !== null
        ? (candidate as { name?: unknown; tag?: unknown; label?: unknown }).name ??
          (candidate as { tag?: unknown }).tag ??
          (candidate as { label?: unknown }).label ??
          ''
        : candidate;
    const name = normalizeTagName(raw);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
    if (names.length >= limit) {
      break;
    }
  }
  return names;
}

/**
 * 正文压缩：去 markdown 噪音（代码块、图片、链接地址、强调符号），
 * 再按字符上限截断。打标只关心主题，不需要原样喂全文。
 */
export function condenseNoteContent(content: string, limit = CONTENT_PROMPT_LIMIT): string {
  let text = String(content ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*~`_>#|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > limit) {
    text = text.slice(0, limit);
  }
  return text;
}

export function buildUserPrompt(input: {
  title?: string;
  content?: string;
  existingTagNames?: string[];
  maxTags?: number;
}): string {
  const maxTags = clampNumber(input.maxTags, 1, MAX_SUGGESTED_TAGS, DEFAULT_SUGGESTED_TAGS);
  const names = (input.existingTagNames || [])
    .map((name) => String(name ?? '').trim())
    .filter(Boolean)
    .slice(0, EXISTING_TAG_PROMPT_LIMIT);
  const existingBlock = names.length ? names.map((name) => `- ${name}`).join('\n') : '（暂无已有标签）';
  const body = condenseNoteContent(input.content ?? '', CONTENT_PROMPT_LIMIT);

  return `请阅读下面的笔记，为它生成 1-${maxTags} 个标签。

【已有标签】（能复用就优先复用，输出的名称必须与下面完全一致）
${existingBlock}

【笔记标题】
${String(input.title ?? '').trim() || '（无标题）'}

【笔记正文】（可能被截断）
${body || '（无正文）'}

【输出要求】
- 只输出 JSON 字符串数组，例如 ["读书笔记","效率工具"]。
- 最多 ${maxTags} 个，按重要性排序。
- 已有标签能覆盖语义时必须复用，不要另造同义新标签。`;
}

export function buildAutoTagMessages(input: {
  title?: string;
  content?: string;
  existingTagNames?: string[];
  maxTags?: number;
}): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(input) },
  ];
}

/** 候选笔记：未打过标签的（notes.tags 为空）。 */
export function filterUntaggedNotes<T extends { tags?: string }>(notes: T[]): T[] {
  return notes.filter((note) => !String(note?.tags ?? '').trim());
}
