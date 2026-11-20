/**
 * CDN 依赖注入（移植 vue2 `utils/cdnDepsUtil.js` + `boot/cdn-deps.js`）。
 *
 * - 启动后异步注入，不阻塞首屏；
 * - script 严格串行，保证 city-picker.data.js 先于 city-picker.js；
 * - 同一 URL 只注入一次；`reloadCdnDeps` 先清再重注；
 * - npm 已提供 jQuery 时跳过 CDN 版 jQuery 核心，避免双实例。
 */
import { useAppStore } from '@/stores/app';
import {
  CDN_DEPS_STORAGE_KEY,
  getResourceType,
  isJQueryCoreDep,
  mergeCdnDeps,
  type CdnDep,
} from '@/utils/cdn-rules';

export type { CdnDep } from '@/utils/cdn-rules';
export { CDN_DEPS_STORAGE_KEY, getResourceType, isJQueryCoreDep, mergeCdnDeps } from '@/utils/cdn-rules';

function setCommonAttrs(el: HTMLElement, dep: CdnDep): void {
  el.id = `cdn-dep-${(dep.id || dep.name || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
  el.setAttribute('data-cdn-name', dep.name || '');
}

function injectScript(dep: CdnDep): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`head script[src="${dep.url}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = dep.url;
    setCommonAttrs(script, dep);
    script.onload = () => resolve();
    script.onerror = () => {
      console.error('[CdnDeps] Script failed:', dep.url);
      resolve();
    };
    document.head.appendChild(script);
  });
}

function injectStylesheet(dep: CdnDep): void {
  const existing = document.querySelector<HTMLLinkElement>(`head link[href="${dep.url}"]`);
  if (existing) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = dep.url;
  setCommonAttrs(link, dep);
  link.onerror = () => console.error('[CdnDeps] Stylesheet failed:', dep.url);
  document.head.appendChild(link);
}

function injectFont(dep: CdnDep): void {
  const fontFamily = dep.name || 'CDNFont';
  const fontId = `cdn-font-${(dep.id || fontFamily).replace(/[^a-zA-Z0-9]/g, '_')}`;
  if (document.getElementById(fontId)) {
    return;
  }
  try {
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = new URL(dep.url).origin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
  } catch {
    // 非法 URL 忽略预连接
  }
  const fileName = dep.url.split('/').pop()?.split('?')[0] ?? '';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const formatMap: Record<string, string> = {
    woff2: 'woff2',
    woff: 'woff',
    ttf: 'truetype',
    otf: 'opentype',
    eot: 'embedded-opentype',
    svg: 'svg',
  };
  const format = formatMap[ext] || ext;
  const style = document.createElement('style');
  style.id = fontId;
  style.setAttribute('data-cdn-font-face', fontFamily);
  style.textContent = `@font-face { font-family: '${fontFamily}'; src: url('${dep.url}') format('${format}'); font-display: swap; }`;
  document.head.appendChild(style);
}

async function injectInOrder(deps: CdnDep[]): Promise<void> {
  for (const dep of deps) {
    const type = getResourceType(dep.url);
    if (type === 'script') {
      await injectScript(dep);
    } else if (type === 'font') {
      injectFont(dep);
    } else {
      injectStylesheet(dep);
    }
  }
}

function ensureJQueryGlobals(): void {
  const host = window as Window & { jQuery?: unknown; $?: unknown };
  if (typeof host.jQuery === 'undefined' && typeof host.$ !== 'undefined') {
    host.jQuery = host.$;
  } else if (typeof host.jQuery !== 'undefined' && typeof host.$ === 'undefined') {
    host.$ = host.jQuery;
  }
}

export function removeInjectedResources(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.querySelectorAll('head script[data-cdn-name]').forEach((el) => el.remove());
  document.querySelectorAll('head link[data-cdn-name]').forEach((el) => el.remove());
  document.querySelectorAll('style[data-cdn-font-face]').forEach((el) => el.remove());
}

async function injectAll(): Promise<void> {
  if (typeof document === 'undefined') {
    return;
  }
  const store = useAppStore();
  if (!store.prefsLoaded) {
    await store.loadPrefs();
  }
  const allDeps = mergeCdnDeps(store.prefs[CDN_DEPS_STORAGE_KEY]);
  const enabled = allDeps.filter((dep) => dep.enabled && dep.url);
  if (enabled.length === 0) {
    return;
  }

  const jqueryDeps: CdnDep[] = [];
  const otherDeps: CdnDep[] = [];
  const host = window as Window & { jQuery?: unknown };
  for (const dep of enabled) {
    if (isJQueryCoreDep(dep)) {
      if (!host.jQuery) {
        jqueryDeps.push(dep);
      }
    } else {
      otherDeps.push(dep);
    }
  }

  if (jqueryDeps.length > 0) {
    await injectInOrder(jqueryDeps);
    ensureJQueryGlobals();
  }
  await injectInOrder(otherDeps);
  ensureJQueryGlobals();
}

let loadingPromise: Promise<void> | null = null;
let readyPromise: Promise<void> | null = null;

export function loadCdnDeps(): Promise<void> {
  if (loadingPromise) {
    return loadingPromise;
  }
  if (readyPromise) {
    return readyPromise;
  }
  loadingPromise = (async () => {
    try {
      await injectAll();
    } catch (error) {
      console.error('[CdnDeps] Error loading CDN deps:', error);
    } finally {
      loadingPromise = null;
      readyPromise = Promise.resolve();
    }
  })();
  return loadingPromise;
}

/** 设置保存后重载：先等当前一轮结束，再清掉已注入资源重新来，避免并发双注入。 */
export async function reloadCdnDeps(): Promise<void> {
  if (loadingPromise) {
    await loadingPromise.catch(() => undefined);
  }
  removeInjectedResources();
  readyPromise = null;
  return loadCdnDeps();
}

export function whenCdnDepsReady(): Promise<void> {
  if (readyPromise) {
    return readyPromise;
  }
  return loadCdnDeps();
}
