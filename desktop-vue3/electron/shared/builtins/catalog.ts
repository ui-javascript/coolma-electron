import { BUILTIN_CATALOG } from './data';
import type { BuiltinItem, BuiltinKind, EchoBuiltin, RuneTemplateBuiltin } from './types';

const KIND_ORDER: BuiltinKind[] = ['rune-template', 'echo'];

function sortByOrder<T extends BuiltinItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** 按 kind 取内置项；不传 kind 按固定顺序返回全部。 */
export function builtinItems(kind?: BuiltinKind): BuiltinItem[] {
  if (!kind) {
    return KIND_ORDER.flatMap((itemKind) => builtinItems(itemKind));
  }
  return sortByOrder(BUILTIN_CATALOG.items.filter((item) => item.kind === kind));
}

/** 按 kind + id 精确查一项，供通用删除/编辑器回填使用。 */
export function builtinById(kind: BuiltinKind, id: string): BuiltinItem | null {
  return BUILTIN_CATALOG.items.find((item) => item.kind === kind && item.id === id) ?? null;
}

export function builtinIds(kind: BuiltinKind): string[] {
  return builtinItems(kind).map((item) => item.id);
}

export function runeTemplateBuiltins(): RuneTemplateBuiltin[] {
  return builtinItems('rune-template') as RuneTemplateBuiltin[];
}

export function echoBuiltins(): EchoBuiltin[] {
  return builtinItems('echo') as EchoBuiltin[];
}

/** 新建符文的默认模板：vue2 的 inheritFromPrevious 演示；找不到就退第一个。 */
export function defaultRuneTemplate(): string {
  const inheritDemo = runeTemplateBuiltins().find((item) => item.id === 'builtin-tpl-createInheritDemoTemplate');
  return (inheritDemo ?? runeTemplateBuiltins()[0])?.payload.template ?? '';
}

export { BUILTIN_CATALOG };
export type { BuiltinItem, BuiltinKind, BuiltinCatalog, EchoBuiltin, RuneTemplateBuiltin } from './types';
