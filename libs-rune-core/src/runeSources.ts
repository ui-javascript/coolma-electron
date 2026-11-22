/**
 * 远程组件源注册表（v2 `libs-muya-vue2/lib/rune/runeSourceRegistry.js` 的 TS 移植）。
 *
 * `$type: "melt-js"` 的符文只写「组件名 + 导出名」，产物地址由这里统一维护：
 * sftp / unpkg / github pages / direct 四种拼接规则，后面的来源覆盖前面的。
 * 纯函数层，不依赖 Vue/DOM；localStorage 读写有 guard，Node 测试可用。
 */

export const MELT_SOURCE_TYPES = {
  SFTP: 'sftp',
  UNPKG: 'unpkg',
  GITHUB: 'github',
  DIRECT: 'direct',
} as const;

export type MeltSourceType = (typeof MELT_SOURCE_TYPES)[keyof typeof MELT_SOURCE_TYPES];

export interface MeltSourceInput {
  id?: string;
  name?: string;
  type?: string;
  base?: string;
  version?: string;
  distDir?: string;
  enabled?: boolean;
  note?: string;
}

export interface MeltSource {
  id: string;
  name: string;
  type: MeltSourceType;
  base: string;
  version: string;
  distDir: string;
  enabled: boolean;
  note: string;
  warnings: string[];
}

export interface MeltSourceEntryUrl {
  url: string;
  warnings: string[];
}

export interface ResolvedMeltDep {
  dep: Record<string, unknown> & { name?: string; host?: string; type?: string; version?: string };
  source: MeltSource | null;
  warnings: string[];
}

export const MELT_SOURCE_TYPE_OPTIONS: ReadonlyArray<{ value: MeltSourceType; label: string }> = [
  { value: MELT_SOURCE_TYPES.SFTP, label: 'SFTP / 自建静态托管' },
  { value: MELT_SOURCE_TYPES.UNPKG, label: 'unpkg' },
  { value: MELT_SOURCE_TYPES.GITHUB, label: 'GitHub Pages' },
  { value: MELT_SOURCE_TYPES.DIRECT, label: '直连产物地址' },
];

export const MELT_SOURCES_STORAGE_KEY = 'melt.rune.sources';

const DIRECT_ENTRY_RE = /\/(?:hel-meta\.json|index\.html)$/i;

function trimSlashes(value: unknown): string {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function stripScope(name: unknown): string {
  const raw = String(name ?? '').trim();
  const idx = raw.lastIndexOf('/');
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

/** 地址本身就是产物入口（hel-meta.json / index.html）。 */
export function isDirectEntryUrl(url: unknown): boolean {
  return DIRECT_ENTRY_RE.test(String(url ?? '').trim());
}

/** unpkg 的产物目录约定：comps-* / tpl-* / demo-* 走 hel_dist，其余走 dist。 */
export function defaultDistDirFor(name: unknown): string {
  const bare = stripScope(name);
  return /^(?:comps|tpl|demo)-/.test(bare) ? 'hel_dist' : 'dist';
}

/** 规范化一条来源配置。缺字段补默认，非法值落 warning。 */
export function normalizeRuneSource(source: MeltSourceInput = {}): MeltSource {
  const warnings: string[] = [];
  const name = String(source.name ?? '').trim();
  let type = String(source.type ?? '').trim();
  if (!Object.values(MELT_SOURCE_TYPES).includes(type as MeltSourceType)) {
    type = MELT_SOURCE_TYPES.SFTP;
    warnings.push(`未知来源类型「${source.type ?? ''}」，已按 sftp 处理`);
  }
  const base = trimSlashes(source.base);
  if (type !== MELT_SOURCE_TYPES.UNPKG && !base) {
    warnings.push('该来源需要填写站点根地址');
  }
  if (base && isDirectEntryUrl(base)) {
    // 直连产物地址时 type 只是标记，实际拼接以地址为准
    type = MELT_SOURCE_TYPES.DIRECT;
  }
  const rawVersion = String(source.version ?? '').trim();
  if (rawVersion && type !== MELT_SOURCE_TYPES.UNPKG) {
    warnings.push('该来源不支持版本目录，version 已忽略（版本由对方部署路径决定）');
  }
  const version = type === MELT_SOURCE_TYPES.UNPKG ? rawVersion : '';
  const distDir = String(source.distDir ?? '').trim() || defaultDistDirFor(name);
  return {
    id: String(source.id ?? '').trim() || `${name || 'source'}:${type}`,
    name,
    type: type as MeltSourceType,
    base,
    version,
    distDir,
    enabled: source.enabled !== false,
    note: String(source.note ?? '').trim(),
    warnings,
  };
}

/** 单条来源 → 产物入口地址。UI 预览与运行时解析共用同一实现。 */
export function buildSourceEntryUrl(source: MeltSourceInput): MeltSourceEntryUrl {
  const src = normalizeRuneSource(source);
  const warnings = src.warnings.slice();
  if (src.type === MELT_SOURCE_TYPES.UNPKG) {
    if (!src.name) {
      warnings.push('unpkg 来源需要填写组件名');
      return { url: '', warnings };
    }
    const ref = src.version ? `${src.name}@${src.version}` : `${src.name}@latest`;
    return { url: `https://unpkg.com/${ref}/${src.distDir}/hel-meta.json`, warnings };
  }
  if (!src.base) return { url: '', warnings };
  if (isDirectEntryUrl(src.base)) return { url: src.base, warnings };
  const pkgPath = src.type === MELT_SOURCE_TYPES.GITHUB ? stripScope(src.name) : src.name;
  if (!pkgPath) {
    warnings.push('该来源需要填写组件名');
    return { url: '', warnings };
  }
  if (src.type === MELT_SOURCE_TYPES.GITHUB) {
    // GitHub Pages 实测形态：base 给组织根，每个包一个仓库 → base/<包名>/hel_dist/...
    // 也允许 base 直接给到仓库根（末尾段名 == 包名），此时只补产物目录。
    const lastSegment = src.base.slice(src.base.lastIndexOf('/') + 1);
    if (lastSegment === pkgPath) {
      return { url: `${src.base}/${src.distDir}/hel-meta.json`, warnings };
    }
    return { url: `${src.base}/${pkgPath}/${src.distDir}/hel-meta.json`, warnings };
  }
  return { url: `${src.base}/${pkgPath}/${src.distDir}/hel-meta.json`, warnings };
}

/** 按组件名找来源：后面的覆盖前面的；只跳过 enabled === false。 */
export function resolveSourceForDep(sources: MeltSourceInput[], depName: unknown): MeltSource | null {
  const target = String(depName ?? '').trim().toLowerCase();
  if (!target || !Array.isArray(sources)) return null;
  for (let i = sources.length - 1; i >= 0; i -= 1) {
    const raw = sources[i] ?? {};
    if (raw.enabled === false) continue;
    const name = String(raw.name ?? '').trim().toLowerCase();
    if (name === target || stripScope(name) === stripScope(target)) {
      return normalizeRuneSource(raw);
    }
  }
  return null;
}

/**
 * 解析运行时依赖：定义里显式写了 host 就用定义（定义级覆盖优先），
 * 否则按注册表找同名来源；找不到就原样返回（交给上游走 unpkg 默认）。
 */
export function resolveDepFromSources(sources: MeltSourceInput[], dep: Record<string, unknown> = {}): ResolvedMeltDep {
  const original: ResolvedMeltDep['dep'] = { ...(dep ?? {}) };
  if (original.host) {
    return { dep: original, source: null, warnings: [] };
  }
  const source = resolveSourceForDep(sources, original.name);
  if (!source) return { dep: original, source: null, warnings: [] };
  const { url, warnings } = buildSourceEntryUrl(source);
  if (!url) {
    return { dep: original, source, warnings: warnings.concat('来源地址为空，回落到默认加载') };
  }
  return {
    dep: {
      ...original,
      type: original.type || source.type,
      host: url,
      // 非 unpkg 来源不写版本：版本由对方部署路径决定
      version: source.type === MELT_SOURCE_TYPES.UNPKG ? (original.version || source.version) : '',
    },
    source,
    warnings,
  };
}

/** 读取设置（localStorage）。无环境或损坏时返回空列表。 */
export function loadRuneSources(): MeltSource[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(MELT_SOURCES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeRuneSource((item ?? {}) as MeltSourceInput))
      : [];
  } catch {
    return [];
  }
}

/** 写入设置（localStorage）。返回规范化后的列表。 */
export function saveRuneSources(sources: MeltSourceInput[]): MeltSource[] {
  const list = Array.isArray(sources)
    ? sources.map((item) => normalizeRuneSource(item ?? {}))
    : [];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MELT_SOURCES_STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    // 存储失败不影响运行时（下次读取会拿到旧值）
  }
  return list;
}

/** 空行模板（UI 新增用）。 */
export function createEmptyRuneSource(overrides: MeltSourceInput = {}): MeltSource {
  return normalizeRuneSource({
    name: '',
    type: MELT_SOURCE_TYPES.SFTP,
    base: '',
    version: '',
    distDir: '',
    enabled: true,
    ...overrides,
  });
}
