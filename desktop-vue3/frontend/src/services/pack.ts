/**
 * Pack v1 解析 / 导出（复刻 vue2 EchoImportService + RuneImportService 的纯函数部分）。
 * 格式与 vue2 完全互通：memocast.echo-pack / memocast.rune-pack，version 1。
 * vue2 的 DB 比对在主进程（db:previewEchoImport）；vue3 走 controller/packs 通道。
 */
import { resolveLibraryCategory } from '@shared/enums/library';
import { isBuiltinLibraryCard } from '@shared/types/libraryCard';
import type { EchoCard, RuneCard } from '@shared/types/domain';

export type PackKind = 'runes' | 'echoes';

export const ECHO_PACK_FORMAT = 'memocast.echo-pack';
export const RUNE_PACK_FORMAT = 'memocast.rune-pack';
export const PACK_VERSION = 1;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ITEMS = 500;

export interface PackParseResult {
  success: boolean;
  code?: string;
  message?: string;
  kind?: PackKind;
  exportedAt?: string | null;
  entries: Array<{ index: number; normalized: Record<string, unknown> }>;
  invalidItems: Array<{ index: number; reason: string; name: string }>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEntry(kind: PackKind, raw: unknown): { ok: boolean; item?: Record<string, unknown>; reason?: string; name?: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'NOT_OBJECT', name: '' };
  }
  const name = String(raw.name ?? '').trim();
  if (!name) {
    return { ok: false, reason: 'EMPTY_NAME', name: '' };
  }
  if (name.length > 100) {
    return { ok: false, reason: 'NAME_TOO_LONG', name };
  }
  const item: Record<string, unknown> = { name, desc: String(raw.desc ?? '').slice(0, 2000) };
  if (kind === 'echoes') {
    item.anno_source = String(raw.anno_source ?? '');
    item.render_type = String(raw.render_type ?? 'anno');
    if (!String(item.anno_source).trim()) {
      return { ok: false, reason: 'EMPTY_ANNO_SOURCE', name };
    }
    item.color = String(raw.color ?? '#26A69A');
    item.icon = String(raw.icon ?? 'graphic_eq');
  } else {
    item.template = String(raw.template ?? '');
    if (!String(item.template).trim()) {
      return { ok: false, reason: 'EMPTY_TEMPLATE', name };
    }
    item.color = String(raw.color ?? '#7E57C2');
    item.icon = String(raw.icon ?? 'auto_awesome');
    item.inherit_from_previous = raw.inherit_from_previous ? 1 : 0;
  }
  return { ok: true, item };
}

function parsePack(rawText: string, kind: PackKind): PackParseResult {
  const empty: PackParseResult = { success: false, entries: [], invalidItems: [] };
  if (typeof rawText !== 'string' || rawText.length > MAX_FILE_BYTES) {
    return { ...empty, code: 'FILE_TOO_LARGE', message: `文件过大（> ${MAX_FILE_BYTES} 字节）` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    return { ...empty, code: 'JSON_PARSE_FAILED', message: error instanceof Error ? error.message : String(error) };
  }
  const expectedFormat = kind === 'echoes' ? ECHO_PACK_FORMAT : RUNE_PACK_FORMAT;
  const otherFormat = kind === 'echoes' ? RUNE_PACK_FORMAT : ECHO_PACK_FORMAT;

  if (Array.isArray(parsed)) {
    // 裸数组——识别是否为另一种 Pack 的误传（与 vue2 一致给出提示）
    const list = parsed as Array<Record<string, unknown>>;
    const first = list.find((it) => isPlainObject(it) && String(it.name ?? '').trim());
    const isOther = first && (kind === 'echoes' ? first.template && !first.anno_source : first.anno_source && !first.template);
    return {
      ...empty,
      code: 'ARRAY_FORMAT',
      message: isOther
        ? `JSON 格式不匹配：当前文件是${kind === 'echoes' ? '符文' : '回响'}导出，请用对应的导入入口`
        : 'JSON 格式不匹配：应为带 format/version 的 Pack 对象',
    };
  }
  if (!isPlainObject(parsed)) {
    return { ...empty, code: 'PACK_INVALID', message: 'Pack 必须为 JSON 对象' };
  }
  if (parsed.format === otherFormat) {
    return {
      ...empty,
      code: 'WRONG_KIND',
      message: `JSON 格式不匹配：当前文件是${kind === 'echoes' ? '符文 Rune Pack' : '回响 Echo Pack'}格式`,
    };
  }
  if (parsed.format !== expectedFormat) {
    return { ...empty, code: 'FORMAT_MISMATCH', message: `format 应为 ${expectedFormat}` };
  }
  if (parsed.version !== PACK_VERSION) {
    return { ...empty, code: 'VERSION_UNSUPPORTED', message: `version 应为 ${PACK_VERSION}` };
  }
  const itemsRaw = kind === 'echoes' ? parsed.echoes : parsed.runes;
  if (!Array.isArray(itemsRaw)) {
    return { ...empty, code: 'PACK_INVALID', message: kind === 'echoes' ? 'echoes 必须为数组' : 'runes 必须为数组' };
  }
  if (itemsRaw.length > MAX_ITEMS) {
    return { ...empty, code: 'PACK_TOO_MANY', message: `条目超过 ${MAX_ITEMS} 条` };
  }
  const entries: PackParseResult['entries'] = [];
  const invalidItems: PackParseResult['invalidItems'] = [];
  for (let index = 0; index < itemsRaw.length; index += 1) {
    const result = normalizeEntry(kind, itemsRaw[index]);
    if (result.ok && result.item) {
      entries.push({ index, normalized: result.item });
    } else {
      invalidItems.push({ index, reason: result.reason ?? 'INVALID', name: result.name ?? '' });
    }
  }
  return { success: true, kind, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null, entries, invalidItems };
}

export const parseEchoPack = (raw: string): PackParseResult => parsePack(raw, 'echoes');
export const parseRunePack = (raw: string): PackParseResult => parsePack(raw, 'runes');

export function computeFileDuplicates(entries: PackParseResult['entries']): Array<{ name: string; indexes: number[] }> {
  const map = new Map<string, { name: string; indexes: number[] }>();
  for (const entry of entries) {
    const name = String(entry.normalized.name ?? '');
    if (!name) {
      continue;
    }
    const key = name.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name, indexes: [] });
    }
    map.get(key)!.indexes.push(entry.index);
  }
  return Array.from(map.values()).filter((item) => item.indexes.length > 1);
}

/** 导出为 Pack v1 JSON（不导出 id/is_builtin/审计字段，与 vue2 一致）。 */
export function buildPack(kind: PackKind, items: ReadonlyArray<RuneCard | EchoCard>): string {
  const list = items.filter((item) => !isBuiltinLibraryCard(item.id)).map((item) => {
    const common = {
      name: item.name.trim(),
      desc: item.desc,
      category: resolveLibraryCategory(kind === 'echoes' ? 'echo' : 'rune', item.category),
      color: item.color,
      icon: item.icon,
    };
    return 'annoSource' in item
      ? { ...common, anno_source: item.annoSource, render_type: item.renderType }
      : { ...common, template: item.template, inherit_from_previous: item.inheritFromPrevious };
  });
  const payload = {
    format: kind === 'echoes' ? ECHO_PACK_FORMAT : RUNE_PACK_FORMAT,
    version: PACK_VERSION,
    exportedAt: new Date().toISOString(),
    ...(kind === 'echoes' ? { echoes: list } : { runes: list }),
  };
  return JSON.stringify(payload, null, 2);
}
