/**
 * 符文定义类型判定与 melt-js 配置解析（v2 `libs-muya-vue2/lib/rune/runeDefinition.js` 的 TS 移植）。
 *
 * 纯函数，不依赖 Vue/DOM，供渲染层、设置面板与测试共用。
 * 口径：
 *   - `vue-sfc`：template 是一段 Vue SFC 源码；
 *   - `melt-js`：template 是 JSON，顶层 `$type: "melt-js"`，描述远端依赖与 props schema。
 */

export const RUNE_TYPE_VUE_SFC = 'vue-sfc';
export const RUNE_TYPE_MELT_JS = 'melt-js';
export const MELT_CONFIG_MARKER = '$type';
export const MELT_DEP_TYPES = ['unpkg', 'github', 'custom'] as const;
export const MELT_PROP_TYPES = ['string', 'number', 'boolean', 'json'] as const;

export type MeltDepType = (typeof MELT_DEP_TYPES)[number];
export type MeltPropType = (typeof MELT_PROP_TYPES)[number];

export interface MeltPropDef {
  type?: MeltPropType | string;
  default?: unknown;
  label?: string;
}

export interface MeltDepConfig {
  name: string;
  type: MeltDepType;
  version: string;
  platform: string;
  host: string;
  requiredExports: string[];
}

export interface MeltRuneConfig {
  type: typeof RUNE_TYPE_MELT_JS;
  version: number;
  dep: MeltDepConfig;
  exportName: string;
  valueProp: string;
  valueEvent: string;
  style: Record<string, unknown> | null;
  props: Record<string, MeltPropDef>;
}

export interface MeltPropRuntimeDef {
  name: string;
  type: MeltPropType;
  default: unknown;
  label: string;
}

export interface RuneDefinition {
  type: typeof RUNE_TYPE_VUE_SFC | typeof RUNE_TYPE_MELT_JS;
  config: MeltRuneConfig | null;
  errors: Array<{ field: string; message: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 解析 template 里的 JSON（不是 JSON / 不是对象一律返回 null）。 */
export function parseRuneConfigJson(template: unknown): Record<string, unknown> | null {
  if (typeof template !== 'string') return null;
  const source = template.trim();
  if (!source || source.charAt(0) !== '{') return null;
  try {
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isMeltRuneConfig(config: unknown): boolean {
  return isRecord(config) && String(config[MELT_CONFIG_MARKER] ?? '') === RUNE_TYPE_MELT_JS;
}

/** 只看 template 判定类型；非 JSON 一律当 vue-sfc（历史数据零迁移）。 */
export function detectRuneType(template: unknown): typeof RUNE_TYPE_VUE_SFC | typeof RUNE_TYPE_MELT_JS {
  return isMeltRuneConfig(parseRuneConfigJson(template)) ? RUNE_TYPE_MELT_JS : RUNE_TYPE_VUE_SFC;
}

/** 归一化 melt 配置，缺省值在这里补，渲染层与表单共用同一份口径。 */
export function normalizeMeltRuneConfig(config: unknown = {}): MeltRuneConfig {
  const source = isRecord(config) ? config : {};
  const dep = isRecord(source.dep) ? source.dep : {};
  const depTypeRaw = String(dep.type ?? 'unpkg').trim().toLowerCase();
  const depType = (MELT_DEP_TYPES as readonly string[]).includes(depTypeRaw)
    ? (depTypeRaw as MeltDepType)
    : 'unpkg';
  const props = isRecord(source.props) ? (source.props as Record<string, MeltPropDef>) : {};
  return {
    type: RUNE_TYPE_MELT_JS,
    version: Number(source.version) || 1,
    dep: {
      name: String(dep.name ?? '').trim(),
      type: depType,
      version: String(dep.version ?? '').trim(),
      platform: String(dep.platform ?? '').trim(),
      host: String(dep.host ?? '').trim(),
      requiredExports: Array.isArray(dep.requiredExports)
        ? dep.requiredExports.map((item) => String(item))
        : [],
    },
    exportName: String(source.exportName ?? '').trim(),
    valueProp: String(source.valueProp ?? 'value').trim() || 'value',
    valueEvent: String(source.valueEvent ?? 'input').trim() || 'input',
    style: isRecord(source.style) ? { ...source.style } : null,
    props,
  };
}

/** 从 template / rune 对象拿 melt 配置；不是 melt 定义返回 null。 */
export function parseMeltRuneConfig(templateOrRune: unknown): MeltRuneConfig | null {
  const template = isRecord(templateOrRune) ? templateOrRune.template : templateOrRune;
  const config = parseRuneConfigJson(template);
  return isMeltRuneConfig(config) ? normalizeMeltRuneConfig(config) : null;
}

/** 保存前的校验：返回 [{ field, message }]，空数组表示通过。 */
export function validateMeltRuneConfig(config: unknown = {}): Array<{ field: string; message: string }> {
  const normalized = normalizeMeltRuneConfig(config);
  const errors: Array<{ field: string; message: string }> = [];
  if (!normalized.dep.name) errors.push({ field: 'dep.name', message: '缺少依赖包名' });
  if (normalized.dep.type === 'custom' && !normalized.dep.host) {
    errors.push({ field: 'dep.host', message: 'custom 来源需要填 host' });
  }
  if (!normalized.exportName) errors.push({ field: 'exportName', message: '缺少导出组件名' });
  Object.entries(normalized.props).forEach(([name, def]) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      errors.push({ field: `props.${name}`, message: 'prop 名不是合法标识符' });
    }
    const propType = String(def?.type ?? 'string').toLowerCase();
    if (!(MELT_PROP_TYPES as readonly string[]).includes(propType)) {
      errors.push({
        field: `props.${name}.type`,
        message: `prop 类型只支持 ${MELT_PROP_TYPES.join(' / ')}`,
      });
    }
  });
  return errors;
}

/** props schema → 渲染层使用的 propDefs（与 SFC 版 parseSfcPropsDef 的输出形态对齐）。 */
export function listMeltPropDefs(config: unknown = {}): MeltPropRuntimeDef[] {
  const normalized = normalizeMeltRuneConfig(config);
  return Object.entries(normalized.props).map(([name, def]) => {
    const value = isRecord(def) ? def : {};
    return {
      name,
      type: (MELT_PROP_TYPES as readonly string[]).includes(String(value.type ?? '').toLowerCase())
        ? (String(value.type).toLowerCase() as MeltPropType)
        : 'string',
      default: value.default,
      label: value.label ? String(value.label) : name,
    };
  });
}

/** 定义 → { type, config, errors }；vue-sfc 的 propDefs 由调用方用 parseSfcPropsDef 解析。 */
export function resolveRuneDefinition(rune: unknown = {}): RuneDefinition {
  const template = isRecord(rune) ? rune.template : undefined;
  const type = detectRuneType(template);
  if (type !== RUNE_TYPE_MELT_JS) return { type: RUNE_TYPE_VUE_SFC, config: null, errors: [] };
  const config = parseMeltRuneConfig(rune);
  if (!config) {
    return {
      type: RUNE_TYPE_MELT_JS,
      config: null,
      errors: [{ field: 'template', message: 'melt-js 定义不是合法 JSON' }],
    };
  }
  return { type: RUNE_TYPE_MELT_JS, config, errors: validateMeltRuneConfig(config) };
}
