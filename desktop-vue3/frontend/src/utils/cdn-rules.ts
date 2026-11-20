/**
 * CDN 依赖的纯规则：内置清单、保存项合并、资源类型判断、jQuery 核心识别。
 * 不碰 DOM，也不依赖 Pinia，方便 L3 直接测。
 */
export interface CdnDep {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  applyToBlog: boolean;
  isBuiltIn?: boolean;
}

export const CDN_DEPS_STORAGE_KEY = 'setting/cdnDeps';

export const BUILT_IN_CDN_DEPS: CdnDep[] = [
  { id: '', name: 'jQuery', url: 'https://luo0412.github.io/cdn/jquery/jquery.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { id: '', name: 'jQuery Migrate', url: 'https://luo0412.github.io/cdn/jquery/jquery-migrate.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { id: '', name: 'layui CSS', url: 'https://luo0412.github.io/cdn/layui/css/layui.css', enabled: true, applyToBlog: false, isBuiltIn: true },
  { id: '', name: 'layui JS', url: 'https://luo0412.github.io/cdn/layui/layui.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { id: '', name: 'city-picker data', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.data.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { id: '', name: 'city-picker JS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { id: '', name: 'city-picker CSS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.css', enabled: true, applyToBlog: false, isBuiltIn: true },
];

const BUILT_IN_NAMES = new Set(BUILT_IN_CDN_DEPS.map((dep) => dep.name));

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeDep(raw: unknown): CdnDep | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const name = String(item.name ?? '');
  const url = String(item.url ?? '');
  if (!name && !url) {
    return null;
  }
  return {
    id: String(item.id ?? newId()),
    name,
    url,
    enabled: item.enabled === undefined ? true : Boolean(item.enabled),
    applyToBlog: Boolean(item.applyToBlog),
    isBuiltIn: Boolean(item.isBuiltIn),
  };
}

export function normalizeCdnDeps(raw: unknown): CdnDep[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(normalizeDep).filter((dep): dep is CdnDep => dep !== null);
}

/**
 * 合并内置项与已保存项（对齐 vue2 `resolveAllDeps`）：
 * 内置项始终保留并标 isBuiltIn，保存过的同名字段覆盖默认值；自定义项追加在后面。
 */
export function mergeCdnDeps(saved: unknown): CdnDep[] {
  const list = normalizeCdnDeps(saved);
  if (list.length === 0) {
    return BUILT_IN_CDN_DEPS.map((dep) => ({ ...dep, id: newId() }));
  }
  const custom = list.filter((dep) => !BUILT_IN_NAMES.has(dep.name));
  const builtIn = BUILT_IN_CDN_DEPS.map((dep) => {
    const existing = list.find((item) => item.name === dep.name);
    return existing
      ? { ...existing, isBuiltIn: true, id: existing.id || newId() }
      : { ...dep, isBuiltIn: true, id: newId() };
  });
  return [...builtIn, ...custom];
}

export function getResourceType(url: string): 'script' | 'stylesheet' | 'font' {
  const lower = String(url ?? '').toLowerCase();
  if (lower.endsWith('.js')) return 'script';
  if (lower.endsWith('.css')) return 'stylesheet';
  if (/\.(woff2?|ttf|otf|eot|svg)(\?|$)/.test(lower)) return 'font';
  return 'stylesheet';
}

export function isJQueryCoreDep(dep: Pick<CdnDep, 'name' | 'url'> | null | undefined): boolean {
  if (!dep) return false;
  const name = String(dep.name ?? '').toLowerCase();
  if (name === 'jquery' || name === 'jquery core') return true;
  const url = String(dep.url ?? '').toLowerCase();
  return /jquery(\.min)?\.js(\?|$)/.test(url) && !url.includes('migrate');
}

