/**
 * melt-js 远端组件的 Vue3 宿主（v2 `meltRuneHost.js` 的移植）。
 *
 * 职责：
 *   - 把 `$type: "melt-js"` 定义转成同步可用的「构造器」，内部异步加载；
 *   - 复用 `@melt-js/libs-core-vue3` 的 loader / resource，保留引用计数与刷新世代；
 *   - 外壳统一 loading / error / retry，远端组件渲染异常不炸整块正文。
 *
 * 与 v2 的差异：浏览器渲染层没有 Node 的 http 兜底，meta 必须由远端 CORS 放行；
 * 设置面板会明确提示这一点，不再假装能绕过 CORS。
 */
import * as Vue from 'vue';
import {
  createHelComponentResource,
  createHelLoader,
  resolveHelDep,
} from '@melt-js/libs-core-vue3';
import {
  loadRuneSources,
  resolveDepFromSources,
  parseMeltRuneConfig,
  validateMeltRuneConfig,
  listMeltPropDefs,
} from 'libs-rune-core';

type AnyRecord = Record<string, any>;

const LOG_PREFIX = '[melt-rune]';
const DIRECT_ENTRY_RE = /\/(?:hel-meta\.json|index\.html)$/i;

// 远端 UMD 产物以 window.Vue 为外部依赖（meta 的 staticScript 里带 append:false），
// 宿主必须先把自己的 Vue 暴露到全局，否则远端会在取 defineComponent 时拿到 undefined。
if (typeof window !== 'undefined' && !(window as AnyRecord).Vue) {
  (window as AnyRecord).Vue = Vue;
}

const resourcePool = new Map<string, AnyRecord>();
const retiredPools = new Map<string, AnyRecord>();
const ctorCache = new Map<string, any>();
const depLoaderCache = new Map<string, AnyRecord>();
const refreshEpoch = new Map<string, number>();

const SKELETON_STYLE =
  'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:rgba(38,166,154,0.08);color:rgba(0,0,0,0.45);font-size:12px;';
const ERROR_STYLE =
  'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:rgba(255,82,82,0.08);color:#c62828;font-size:12px;';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const source = value as AnyRecord;
  const keys = Object.keys(source).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(source[key])}`).join(',')}}`;
}

/** 配置 → 真实依赖：定义里显式 host 优先，否则按设置里的远程组件源找同名条目。 */
export function resolveMeltConfig(config: AnyRecord): AnyRecord {
  if (!config || !config.dep) return config;
  const { dep, warnings } = resolveDepFromSources(loadRuneSources(), config.dep);
  if (!warnings.length) return { ...config, dep };
  return { ...config, dep, sourceWarnings: warnings };
}

/** 配置 → 资源池基础 key（platform 参与，因为 hel 的 platform 决定拉哪份产物）。 */
export function getMeltResourceKey(rawConfig: AnyRecord): string {
  if (!rawConfig) return '';
  const config = resolveMeltConfig(rawConfig);
  const dep = config.dep || {};
  const origin = dep.host || dep.type || '';
  return [dep.platform || '', dep.name || '', dep.version || '', origin, config.exportName || ''].join('|');
}

/** 配置 → dep key（同一依赖不同来源算两个 dep）。 */
export function getMeltDepKey(config: AnyRecord): string {
  const dep = (config && config.dep) || {};
  return [dep.platform || '', dep.name || '', dep.version || '', dep.host || dep.type || ''].join('|');
}

/** 刷新世代 + 基础 key = 本次加载真正使用的池 key。 */
export function getMeltPoolKey(config: AnyRecord): string {
  const base = getMeltResourceKey(config);
  if (!base) return '';
  const epoch = refreshEpoch.get(base) || 0;
  return epoch ? `${base}#${epoch}` : base;
}

/** 依赖配置 → meta 地址候选（直连优先，其次站点根约定，最后包目录约定）。 */
export function buildMetaUrlCandidates(dep: AnyRecord = {}): string[] {
  const host = typeof dep.host === 'string' ? dep.host.trim().replace(/\/+$/, '') : '';
  if (!host) return [];
  if (DIRECT_ENTRY_RE.test(host)) return [host];
  const name = String(dep.name || '').replace(/^\/+/, '');
  const list = [`${host}/hel-meta.json`];
  if (name) list.push(`${host}/${name}/hel_dist/hel-meta.json`, `${host}/${name}/dist/hel-meta.json`);
  return list;
}

/** 远端 meta 形状校验（脏数据会在资源阶段以难懂的方式炸，这里先判）。 */
export function assertHelMetaShape(meta: unknown, url = ''): AnyRecord {
  const where = url ? `（${url}）` : '';
  if (!meta || typeof meta !== 'object') throw new Error(`meta 不是对象${where}`);
  const source = meta as AnyRecord;
  const app = source.app || {};
  const version = source.version || {};
  const srcMap = version.src_map || {};
  if (!app.name) throw new Error(`meta 缺 app.name${where}`);
  if (!version.sub_app_version && !app.online_version) throw new Error(`meta 缺版本号${where}`);
  const hasAssets =
    Array.isArray(srcMap.chunkJsSrcList) ||
    Array.isArray(srcMap.bodyAssetList) ||
    typeof srcMap.webDirPath === 'string';
  if (!hasAssets) throw new Error(`meta 的 src_map 没有任何资源信息${where}`);
  return source;
}

/** 配置 → hel 加载描述（先解析地址，再补 platform / requiredExports）。 */
export function buildMeltLoadSpec(rawConfig: AnyRecord): AnyRecord {
  const config = resolveMeltConfig(rawConfig);
  const dep = config.dep || {};
  const host = typeof dep.host === 'string' ? dep.host.trim() : '';
  const ref = dep.version ? `${dep.name}@${dep.version}` : dep.name;
  let spec: AnyRecord;
  if (host && DIRECT_ENTRY_RE.test(host)) {
    spec = resolveHelDep({ name: dep.name, host }) as AnyRecord;
  } else if (host) {
    const siteType = dep.type && dep.type !== 'unpkg' ? dep.type : 'custom';
    spec = resolveHelDep(ref, { type: siteType, base: host }) as AnyRecord;
  } else {
    spec = resolveHelDep(ref, { type: dep.type || 'unpkg' }) as AnyRecord;
  }
  if (dep.platform) spec.platform = dep.platform;
  if (dep.requiredExports && dep.requiredExports.length) {
    spec.requiredExports = dep.requiredExports.slice();
  }
  return spec;
}

/** 取（并按需创建）该 dep 的 hel loader；刷新时丢掉这一个。 */
function getMeltLoader(config: AnyRecord, spec: AnyRecord): AnyRecord {
  const key = getMeltDepKey(config);
  let entry = depLoaderCache.get(key);
  if (!entry) {
    entry = { loader: createHelLoader(), spec, dep: (config && config.dep) || {} };
    depLoaderCache.set(key, entry);
  }
  return entry;
}

/** 清掉该 dep 的 loader（连带请求合并与内存缓存）。 */
export function resetMeltDepLoader(config: AnyRecord): void {
  depLoaderCache.delete(getMeltDepKey(config));
}

function acquireResource(config: AnyRecord, onChange: (state: AnyRecord) => void): AnyRecord {
  const key = getMeltPoolKey(config);
  let entry = resourcePool.get(key);
  if (entry) {
    entry.refs += 1;
  } else {
    const spec = buildMeltLoadSpec(config);
    const { loader } = getMeltLoader(config, spec);
    const resource = createHelComponentResource(
      {
        exportName: config.exportName,
        loader: () => loader.loadHelLib(spec),
      },
      (state) => {
        const current = resourcePool.get(key);
        if (current) current.state = state;
        if (current) current.listeners.forEach((fn: (state: AnyRecord) => void) => fn(state));
      },
    );
    entry = { resource, refs: 1, state: resource.getState(), listeners: new Set() };
    resourcePool.set(key, entry);
  }
  const listener = (state: AnyRecord) => onChange(state);
  entry.listeners.add(listener);
  return { entry, key, listener };
}

function releaseResource(key: string, listener: ((state: AnyRecord) => void) | null): void {
  const entry = resourcePool.get(key) || retiredPools.get(key);
  if (!entry) return;
  if (listener) entry.listeners.delete(listener);
  entry.refs -= 1;
  if (entry.refs <= 0) {
    try {
      entry.resource.dispose();
    } catch (error) {
      console.warn(`${LOG_PREFIX} dispose failed`, error);
    }
    resourcePool.delete(key);
    retiredPools.delete(key);
  }
}

/** 测试钩子：清空池与缓存（不对外承诺稳定 API）。 */
export function clearMeltRuneCaches(): void {
  [resourcePool, retiredPools].forEach((pool) => {
    pool.forEach((entry) => {
      try {
        entry.resource.dispose();
      } catch {
        /* noop */
      }
    });
    pool.clear();
  });
  ctorCache.clear();
  depLoaderCache.clear();
  refreshEpoch.clear();
}

/** 设置页「刷新所有远程组件」：保留已挂载实例，旧池等卸载时释放。 */
export function clearAllMeltCaches(): number {
  const deps: AnyRecord[] = [];
  depLoaderCache.forEach((entry) => {
    if (entry && entry.dep && entry.dep.name) deps.push(entry.dep);
  });
  resourcePool.forEach((entry, key) => retiredPools.set(key, entry));
  resourcePool.clear();
  ctorCache.clear();
  depLoaderCache.clear();
  refreshEpoch.clear();
  return deps.length;
}

/** 启动后预热：把当前符文列表里的 melt 依赖按需拉一次，失败只记日志。 */
export function preloadMeltRunes(runes: unknown[] = []): Promise<unknown[]> {
  const seen = new Set<string>();
  const started: Array<Promise<unknown>> = [];
  (Array.isArray(runes) ? runes : []).forEach((rune) => {
    const parsed = parseMeltRuneConfig(rune);
    if (!parsed) return;
    const config = resolveMeltConfig(parsed);
    if (validateMeltRuneConfig(config).length) return;
    const key = getMeltPoolKey(config);
    if (!key || seen.has(key)) return;
    seen.add(key);
    try {
      const spec = buildMeltLoadSpec(config);
      const { loader } = getMeltLoader(config, spec);
      started.push(
        loader.loadHelLib(spec).catch((error: unknown) => {
          console.warn(`${LOG_PREFIX} preload failed`, config.exportName, error);
        }),
      );
    } catch (error) {
      console.warn(`${LOG_PREFIX} preload skipped`, error);
    }
  });
  return Promise.all(started);
}

/** 宿主传来的字符串/布尔值按 schema 类型强转；空值走 undefined，交给远端组件 default。 */
export function coerceMeltProp(raw: unknown, def: AnyRecord = {}): unknown {
  const type = String(def.type || 'string').toLowerCase();
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (type === 'number') {
    const num = Number(raw);
    return Number.isFinite(num) ? num : undefined;
  }
  if (type === 'boolean') {
    if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
    if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
    return undefined;
  }
  if (type === 'json') {
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return undefined;
    }
  }
  return String(raw);
}

/** 远端组件 emit 出来的值可能是「值」也可能是「事件对象」，统一成字符串。 */
export function normalizeMeltEmitValue(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'target' in raw) {
    const target = (raw as AnyRecord).target;
    return target?.value == null ? '' : String(target.value);
  }
  return raw == null ? '' : String(raw);
}

function renderMessage(
  h: typeof Vue.h,
  options: { style: string; text: string; retry?: () => void; state?: string },
): AnyRecord {
  const children: any[] = [h('span', {}, options.text)];
  if (typeof options.retry === 'function') {
    children.push(
      h(
        'button',
        {
          type: 'button',
          contenteditable: 'false',
          style:
            'border:none;background:transparent;color:inherit;text-decoration:underline;cursor:pointer;font-size:12px;padding:0;',
          onClick: options.retry,
        },
        '刷新',
      ),
    );
  }
  return h(
    'div',
    {
      contenteditable: 'false',
      'data-melt-rune-state': options.state || 'loading',
      style: options.style,
    },
    children,
  );
}

/** 主工厂：melt 定义 → 同步构造器；不是 melt 定义返回 null。 */
export function createMeltRuneRendererCtor(rune: AnyRecord = {}): any {
  const parsed = parseMeltRuneConfig(rune);
  if (!parsed) return null;
  const config = resolveMeltConfig(parsed);
  const cacheKey = `${rune.id || rune.name || 'default'}:${stableStringify(config)}`;
  if (ctorCache.has(cacheKey)) return ctorCache.get(cacheKey);

  const propDefs = listMeltPropDefs(config);
  const propNames = propDefs.map((item) => item.name);
  const schema = config.props || {};
  const valueProp = config.valueProp || 'value';
  const valueEvent = config.valueEvent || 'input';
  const errors = validateMeltRuneConfig(config);
  const loadErrors = errors.map((item) => `${item.field}: ${item.message}`);
  const invalidReason = loadErrors.length ? `melt-js 定义不合法（${loadErrors.join('；')}）` : '';

  // 系统保留名不能当 schema prop 声明，否则会和壳自己的 props 撞车
  const RESERVED_PROP_NAMES = ['runeId', 'nodeId', 'rune', 'value', 'onValueChange'];
  const allPropNames = Array.from(new Set([
    'runeId',
    'nodeId',
    'rune',
    'value',
    'onValueChange',
    valueProp,
    ...propNames,
  ]));

  function MeltRuneRenderer(options: AnyRecord = {}): AnyRecord {
    const initial: AnyRecord = { ...(options.propsData || {}) };
    allPropNames.forEach((name) => {
      if (!(name in initial)) initial[name] = undefined;
    });
    const state = Vue.reactive(initial);
    // 远端组件是组件对象，不能被深层 reactive 代理，否则 Vue 会告警且多一层开销
    const meltState = Vue.shallowReactive<AnyRecord>({
      status: invalidReason ? 'error' : 'loading',
      component: null,
      error: null,
    });
    let failureReason = invalidReason;
    let resourceKey = '';
    let resourceListener: ((state: AnyRecord) => void) | null = null;

    const root = document.createElement('div');
    root.className = 'muya-rune-vue-host melt-rune-host-wrap';
    root.setAttribute('contenteditable', 'false');

    function buildProps(): AnyRecord {
      const out: AnyRecord = {};
      propDefs.forEach((def) => {
        if (RESERVED_PROP_NAMES.includes(def.name)) return;
        const coerced = coerceMeltProp((state as AnyRecord)[def.name], schema[def.name] || {});
        if (coerced !== undefined) out[def.name] = coerced;
      });
      if (valueProp) {
        out[valueProp] = (state as AnyRecord).value == null ? '' : String((state as AnyRecord).value);
      }
      return out;
    }

    function handleValueEmit(raw: unknown): void {
      const nextValue = normalizeMeltEmitValue(raw);
      const handler = (state as AnyRecord).onValueChange;
      if (typeof handler === 'function') {
        handler({
          runeId: (state as AnyRecord).runeId || '',
          nodeId: (state as AnyRecord).nodeId || '',
          value: nextValue,
        });
      }
    }

    function disposeResource(): void {
      if (resourceKey) releaseResource(resourceKey, resourceListener);
      resourceKey = '';
      resourceListener = null;
    }

    function load(force = false): void {
      failureReason = '';
      meltState.status = 'loading';
      meltState.component = null;
      meltState.error = null;
      try {
        if (force) {
          resetMeltDepLoader(config);
          const base = getMeltResourceKey(config);
          refreshEpoch.set(base, (refreshEpoch.get(base) || 0) + 1);
        }
        const acquired = acquireResource(config, (next) => {
          meltState.status = next.status;
          meltState.component = next.component;
          meltState.error = next.error;
        });
        resourceKey = acquired.key;
        resourceListener = acquired.listener;
        void acquired.entry.resource.load();
      } catch (error) {
        failureReason = `melt-js 运行时不可用：${error instanceof Error ? error.message : String(error)}`;
        meltState.status = 'error';
      }
    }

    function refresh(): void {
      disposeResource();
      load(true);
    }

    const app = Vue.createApp({
      render() {
        const h = Vue.h;
        if (failureReason) {
          return renderMessage(h, { style: ERROR_STYLE, text: failureReason, state: 'error' });
        }
        if (meltState.status === 'loading') {
          return renderMessage(h, {
            style: SKELETON_STYLE,
            text: `正在加载远端组件 ${config.exportName}…`,
          });
        }
        if (meltState.status === 'error') {
          const errorText =
            meltState.error instanceof Error
              ? meltState.error.message
              : String(meltState.error || '加载失败');
          const origin = (config.dep && (config.dep.host || config.dep.name)) || '';
          const sourceWarn =
            config.sourceWarnings?.length ? `（${config.sourceWarnings.join('；')}）` : '';
          return renderMessage(h, {
            style: ERROR_STYLE,
            text: `${config.exportName} 加载失败（${origin}）：${errorText}${sourceWarn}`,
            retry: refresh,
            state: 'error',
          });
        }
        if (!meltState.component) {
          return renderMessage(h, { style: ERROR_STYLE, text: '远端导出不是组件', state: 'error' });
        }
        const listeners: AnyRecord = {};
        if (valueEvent) listeners[`on${valueEvent.charAt(0).toUpperCase()}${valueEvent.slice(1)}`] = handleValueEmit;
        return h(
          meltState.component as AnyRecord,
          {
            class: 'melt-rune-host',
            style: config.style || undefined,
            ...buildProps(),
            ...listeners,
          },
        );
      },
    });
    app.config.errorHandler = (error) => {
      console.warn(`${LOG_PREFIX} remote component threw`, error);
      meltState.status = 'error';
      meltState.component = null;
      meltState.error = error;
    };
    app.mount(root);
    if (!invalidReason) load(false);

    const vm: AnyRecord = {
      $el: root,
      $options: { props: Object.fromEntries(allPropNames.map((name) => [name, null])) },
      __runeRenderKey: '',
      $mount: () => vm,
      $destroy: () => {
        disposeResource();
        app.unmount();
        root.remove();
      },
    };
    allPropNames.forEach((key) => {
      Object.defineProperty(vm, key, {
        configurable: true,
        enumerable: true,
        get: () => state[key],
        set: (value) => {
          state[key] = value;
        },
      });
    });
    return vm;
  }

  ctorCache.set(cacheKey, MeltRuneRenderer);
  return MeltRuneRenderer;
}

export const MELT_RUNE_TYPE = 'melt-js';

export default {
  createMeltRuneRendererCtor,
  getMeltResourceKey,
  getMeltPoolKey,
  getMeltDepKey,
  buildMetaUrlCandidates,
  assertHelMetaShape,
  preloadMeltRunes,
  clearAllMeltCaches,
  resetMeltDepLoader,
  resolveMeltConfig,
  buildMeltLoadSpec,
  coerceMeltProp,
  normalizeMeltEmitValue,
  clearMeltRuneCaches,
};
