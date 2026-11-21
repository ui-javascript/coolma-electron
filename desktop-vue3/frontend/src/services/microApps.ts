/**
 * 微应用数据层（移植 vue2 components/microApp/microAppService.js）。
 *
 * 两种装载模式：
 *   - iframe：wujie 沙箱内嵌（url / devUrl）
 *   - module：hel-micro 远程组件（libName / exportName / version）
 *
 * 数据存 SQLite settings 表，key = `setting/microApps`（与 vue2 同 key，互通）。
 */

import type { IpcResult } from '@shared/ipc/contract';
import { allSettings, setSetting } from '@/services/ipc';

export type MicroAppLoadMode = 'iframe' | 'module';
export type MicroAppDisplayMode = 'drawer' | 'fullscreen';

export interface MicroApp {
  id: string;
  name: string;
  icon: string;
  /** iframe 模式：线上地址 */
  url: string;
  /** iframe 模式：开发地址（dev 环境优先） */
  devUrl: string;
  /** module 模式：hel-micro 库名 */
  libName: string;
  /** module 模式：导出的组件名（空 = default） */
  exportName: string;
  /** module 模式：版本（空 = 最新） */
  version: string;
  loadMode: MicroAppLoadMode;
  isDefault: boolean;
  enabled: boolean;
  isMobile: boolean;
  displayMode: MicroAppDisplayMode;
  isBuiltIn: boolean;
}

export const MICRO_APPS_STORAGE_KEY = 'setting/microApps';

export const MICRO_APP_DISPLAY_MODES = { DRAWER: 'drawer', FULLSCREEN: 'fullscreen' } as const;
export const MICRO_APP_LOAD_MODES = { IFRAME: 'iframe', MODULE: 'module' } as const;

export function isDevEnv(): boolean {
  // 渲染层没有 node 的 process，用 vite 注入的环境变量判断开发态
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};
    return env.DEV === true || env.MODE === 'development';
  } catch {
    return false;
  }
}

/** 内置条目注册表（业务方启动时注册，不在主项目里硬编码业务条目）。 */
const builtinRegistry: MicroApp[] = [];

export function registerBuiltinApps(apps: Partial<MicroApp>[]): void {
  for (const app of apps.filter(Boolean)) {
    const normalized = normalizeMicroApp({ ...app, isBuiltIn: true });
    if (!normalized) {
      continue;
    }
    const index = builtinRegistry.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      builtinRegistry.splice(index, 1, normalized);
    } else {
      builtinRegistry.push(normalized);
    }
  }
}

export function getBuiltinApps(): MicroApp[] {
  return builtinRegistry.map((app) => ({ ...app }));
}

/** 首次初始化的默认列表（对齐 vue2 三条默认项）。 */
export function buildDefaultMicroApps(): MicroApp[] {
  const base: Partial<MicroApp>[] = [
    {
      id: 'box-im',
      name: '聊天',
      icon: 'chat-dot-round',
      url: 'https://luo0412.github.io/box-im/#/',
      devUrl: 'http://localhost:18080/',
      isDefault: true,
      enabled: true,
      loadMode: 'iframe',
    },
    {
      id: 'coolma',
      name: 'coolma',
      icon: 'cloudy',
      // 占位地址：请在本条目的设置里填入自己的 uniCloud 静态托管地址
      // （格式形如 https://static-<spaceId>.bspapp.com/），此处不得写入真实 spaceId
      url: 'https://static-00000000-0000-0000-0000-000000000000.bspapp.com/',
      isMobile: true,
      loadMode: 'iframe',
    },
    {
      id: 'vue2-sfc-playground',
      name: 'Vue2 SFC Playground',
      icon: 'cpu',
      devUrl: 'http://localhost:3333/',
      loadMode: 'iframe',
    },
  ];
  return [...base.map((app) => normalizeMicroApp(app)).filter(Boolean) as MicroApp[], ...getBuiltinApps()];
}

/** 归一化单条记录（补齐字段、丢弃残缺记录、识别内置身份）。 */
export function normalizeMicroApp(raw: Partial<MicroApp> | null | undefined): MicroApp | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = String(raw.id ?? '').trim();
  if (!id) {
    return null;
  }
  const builtinDef = builtinRegistry.find((app) => app.id === id);
  const loadMode: MicroAppLoadMode =
    raw.loadMode === MICRO_APP_LOAD_MODES.MODULE || builtinDef?.loadMode === MICRO_APP_LOAD_MODES.MODULE
      ? 'module'
      : 'iframe';
  return {
    id,
    name: String(raw.name ?? id),
    icon: String(raw.icon ?? 'chat-dot-round'),
    url: String(raw.url ?? ''),
    devUrl: String(raw.devUrl ?? ''),
    libName: String(raw.libName ?? ''),
    exportName: String(raw.exportName ?? ''),
    version: String(raw.version ?? ''),
    loadMode,
    isDefault: Boolean(raw.isDefault),
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    isMobile: raw.isMobile === true,
    displayMode:
      (raw.displayMode ?? builtinDef?.displayMode) === MICRO_APP_DISPLAY_MODES.FULLSCREEN ? 'fullscreen' : 'drawer',
    isBuiltIn: Boolean(builtinDef) || Boolean(raw.isBuiltIn),
  };
}

/** 整表归一化；顺带保证最多一个 isDefault。 */
export function normalizeMicroApps(rawList: Partial<MicroApp>[] | unknown): MicroApp[] {
  if (!Array.isArray(rawList)) {
    return [];
  }
  let seenDefault = false;
  return (rawList
    .map((item) => normalizeMicroApp(item as Partial<MicroApp>))
    .filter(Boolean) as MicroApp[]).map((item) => {
    if (!item.isDefault) {
      return item;
    }
    if (seenDefault) {
      return { ...item, isDefault: false };
    }
    seenDefault = true;
    return item;
  });
}

/** 实际加载地址：dev 用 devUrl，否则 url，都没有就空。 */
export function resolveActiveUrl(app: MicroApp | null | undefined): string {
  if (!app) {
    return '';
  }
  if (isDevEnv() && app.devUrl) {
    return app.devUrl;
  }
  return app.url || app.devUrl || '';
}

export function pickDefaultApp(apps: Partial<MicroApp>[]): MicroApp | null {
  const list = normalizeMicroApps(apps).filter((app) => app.enabled !== false);
  return list.find((app) => app.isDefault) ?? list[0] ?? null;
}

/** 影响挂载的字段是否有变（决定要不要重建 wujie / 重新拉组件）。 */
export function microAppMountKey(app: MicroApp | null | undefined): string {
  if (!app) {
    return '';
  }
  return [
    app.loadMode,
    app.url,
    app.devUrl,
    app.libName,
    app.exportName,
    app.version,
    app.displayMode,
  ].join('::');
}

/** 对比两份列表，返回需要重建的 id。 */
export function diffMicroAppsForReload(oldList: Partial<MicroApp>[], newList: Partial<MicroApp>[]): string[] {
  const oldNorm = normalizeMicroApps(oldList);
  const newNorm = normalizeMicroApps(newList);
  const newById = new Map(newNorm.map((app) => [app.id, app]));
  const dirty: string[] = [];
  for (const oldItem of oldNorm) {
    const next = newById.get(oldItem.id);
    if (!next) {
      dirty.push(oldItem.id);
      continue;
    }
    if (microAppMountKey(oldItem) !== microAppMountKey(next)) {
      dirty.push(oldItem.id);
    }
  }
  return dirty;
}

/**
 * 升级场景合并内置条目：已存在的内置条目完全尊重用户修改，只补缺失的。
 */
export function mergeBuiltInApps(rawList: Partial<MicroApp>[]): MicroApp[] {
  const existing = Array.isArray(rawList) ? rawList.filter(Boolean) : [];
  const existingIds = new Set(existing.map((app) => app.id));
  const builtinIds = new Set(builtinRegistry.map((app) => app.id));

  const normalized = existing.map((app) => {
    const item = normalizeMicroApp(app);
    if (!item) {
      return null;
    }
    // 内置条目的用户可控字段全部保留，只把 isBuiltIn 标回来
    return builtinIds.has(item.id) ? { ...item, isBuiltIn: true } : item;
  }).filter(Boolean) as MicroApp[];

  const missing = builtinRegistry.filter((app) => !existingIds.has(app.id));
  return [...normalized, ...missing.map((app) => ({ ...app }))];
}

/** 读取列表：settings 里没有 → 默认列表（但不落库，等用户改一次才写）。 */
export async function loadMicroApps(): Promise<MicroApp[]> {
  const result: IpcResult<Record<string, unknown>> = await allSettings();
  if (!result.ok) {
    return buildDefaultMicroApps();
  }
  const raw = result.data[MICRO_APPS_STORAGE_KEY];
  if (raw === undefined || raw === null) {
    return buildDefaultMicroApps();
  }
  const parsed = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const list = normalizeMicroApps(parsed);
  return list.length > 0 ? mergeBuiltInApps(list) : buildDefaultMicroApps();
}

export async function saveMicroApps(apps: MicroApp[]): Promise<boolean> {
  // settings 仓储自己做 JSON 序列化，这里直接给数组，避免双重编码
  const result = await setSetting(MICRO_APPS_STORAGE_KEY, normalizeMicroApps(apps));
  return result.ok && Boolean(result.data);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}
