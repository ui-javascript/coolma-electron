/**
 * fullscreenBridge —— 全屏 wujie 子应用通用 bus 桥（移植 vue2 fullscreenBridge.js）。
 *
 * 子应用 → 主应用：ready / click-at / choice / completed / request
 * 主应用 → 子应用：summon / teardown / response
 *
 * 向下兼容：旧 `microapp:delete-effect:*` 事件名同步发一份，老子项目不用改。
 */
import { getWujieBus } from '@/services/wujieBus';

export const FULLSCREEN_READY_EVENT = 'microapp:fullscreen:ready';
export const FULLSCREEN_CLICK_EVENT = 'microapp:fullscreen:click-at';
export const FULLSCREEN_CHOICE_EVENT = 'microapp:fullscreen:choice';
export const FULLSCREEN_COMPLETED_EVENT = 'microapp:fullscreen:completed';
export const FULLSCREEN_REQUEST_EVENT = 'microapp:fullscreen:request';
export const FULLSCREEN_RESPONSE_EVENT = 'microapp:fullscreen:response';
export const FULLSCREEN_SUMMON_EVENT = 'microapp:fullscreen:summon';
export const FULLSCREEN_TEARDOWN_EVENT = 'microapp:fullscreen:teardown';

const DELETE_EFFECT_READY_EVENT = 'microapp:delete-effect:ready';
const DELETE_EFFECT_CLICK_EVENT = 'microapp:delete-effect:click-at';
const DELETE_EFFECT_CHOICE_EVENT = 'microapp:delete-effect:choice';
const DELETE_EFFECT_COMPLETED_EVENT = 'microapp:delete-effect:completed';
const DELETE_EFFECT_REQUEST_EVENT = 'microapp:delete-effect:request';
const DELETE_EFFECT_RESPONSE_EVENT = 'microapp:delete-effect:response';
const DELETE_EFFECT_SUMMON_EVENT = 'microapp:delete-effect:summon';
const DELETE_EFFECT_TEARDOWN_EVENT = 'microapp:delete-effect:teardown';

type Bus = { $on: (name: string, handler: (payload: any) => void) => void; $off: Function; $emit: Function };

function getBus(): Bus | null {
  return getWujieBus() as Bus | null;
}

export interface FullscreenBridgeOptions {
  onReady?: (payload: { version?: string; capabilities?: string[]; ts?: number }) => void;
  onStageChange?: (payload: { stage?: string }) => void;
  onClickAt?: (payload: { x: number; y: number; targetGuid?: string }) => void;
  onChoice?: (payload: { label?: string; targetGuid?: string }) => void;
  onCompleted?: (payload: { outcome?: string; targetGuid?: string; targetName?: string; ts?: number }) => void;
  resolveRequest?: (envelope: { requestId: string; kind: string; payload: any }) => unknown | Promise<unknown>;
}

let installed = false;
let uninstallRef: (() => void) | null = null;

function safeCall<T>(fn: ((arg: T) => void) | undefined, arg: T): void {
  if (!fn) {
    return;
  }
  try {
    fn(arg);
  } catch {
    /* 子应用的 handler 抛错不能拖垮主应用 */
  }
}

export function installFullscreenBridge(opts: FullscreenBridgeOptions = {}): () => void {
  if (installed && uninstallRef) {
    return uninstallRef;
  }
  const bus = getBus();
  if (!bus) {
    return () => {};
  }

  const resolveRequest = opts.resolveRequest ?? defaultResolveRequest;

  const readyHandler = (payload: any) => safeCall(opts.onReady, payload);
  const stageHandler = (payload: any) => safeCall(opts.onStageChange, payload);
  const clickHandler = (payload: any) => safeCall(opts.onClickAt, payload);
  const choiceHandler = (payload: any) => safeCall(opts.onChoice, payload);
  const completedHandler = (payload: any) => safeCall(opts.onCompleted, payload);

  const requestHandler = async (envelope: { requestId?: string; kind?: string; payload?: unknown } = {}) => {
    const { requestId, kind, payload } = envelope;
    if (!requestId) {
      return;
    }
    try {
      const result = await resolveRequest({ requestId, kind: kind ?? '', payload: payload ?? {} });
      const okResult = result === undefined ? null : result;
      bus.$emit(FULLSCREEN_RESPONSE_EVENT, { requestId, ok: true, result: okResult });
      bus.$emit(DELETE_EFFECT_RESPONSE_EVENT, { requestId, ok: true, result: okResult });
    } catch (error) {
      const typed = error as Error & { code?: string };
      const errorPayload = { code: typed?.code ?? 'FULLSCREEN_REQUEST_FAILED', message: typed?.message ?? String(error) };
      bus.$emit(FULLSCREEN_RESPONSE_EVENT, { requestId, ok: false, error: errorPayload });
      bus.$emit(DELETE_EFFECT_RESPONSE_EVENT, { requestId, ok: false, error: errorPayload });
    }
  };

  bus.$on(FULLSCREEN_READY_EVENT, readyHandler);
  bus.$on(DELETE_EFFECT_READY_EVENT, readyHandler);
  bus.$on(FULLSCREEN_CLICK_EVENT, clickHandler);
  bus.$on(DELETE_EFFECT_CLICK_EVENT, clickHandler);
  bus.$on(FULLSCREEN_CHOICE_EVENT, choiceHandler);
  bus.$on(DELETE_EFFECT_CHOICE_EVENT, choiceHandler);
  bus.$on(FULLSCREEN_COMPLETED_EVENT, completedHandler);
  bus.$on(DELETE_EFFECT_COMPLETED_EVENT, completedHandler);
  bus.$on(FULLSCREEN_REQUEST_EVENT, requestHandler);
  bus.$on(DELETE_EFFECT_REQUEST_EVENT, requestHandler);

  installed = true;
  uninstallRef = () => {
    if (!installed) {
      return;
    }
    try {
      bus.$off(FULLSCREEN_READY_EVENT, readyHandler);
      bus.$off(DELETE_EFFECT_READY_EVENT, readyHandler);
      bus.$off(FULLSCREEN_CLICK_EVENT, clickHandler);
      bus.$off(DELETE_EFFECT_CLICK_EVENT, clickHandler);
      bus.$off(FULLSCREEN_CHOICE_EVENT, choiceHandler);
      bus.$off(DELETE_EFFECT_CHOICE_EVENT, choiceHandler);
      bus.$off(FULLSCREEN_COMPLETED_EVENT, completedHandler);
      bus.$off(DELETE_EFFECT_COMPLETED_EVENT, completedHandler);
      bus.$off(FULLSCREEN_REQUEST_EVENT, requestHandler);
      bus.$off(DELETE_EFFECT_REQUEST_EVENT, requestHandler);
      // stage 事件 vue2 在 install 时没订阅，这里只在有 handler 时补上
      if (opts.onStageChange) {
        bus.$off('microapp:fullscreen:stage', stageHandler);
        bus.$off('microapp:delete-effect:stage', stageHandler);
      }
    } catch {
      /* noop */
    }
    installed = false;
    uninstallRef = null;
  };

  if (opts.onStageChange) {
    bus.$on('microapp:fullscreen:stage', stageHandler);
    bus.$on('microapp:delete-effect:stage', stageHandler);
  }

  return uninstallRef;
}

export function isFullscreenBridgeInstalled(): boolean {
  return installed;
}

/** 主应用主动召唤全屏效果（同时发旧事件名，兼容老子项目）。 */
export function summonFullscreen(payload: { target?: unknown; mousePos?: { x: number; y: number } } = {}): boolean {
  const bus = getBus();
  if (!bus) {
    return false;
  }
  const envelope = { target: payload.target ?? null, mousePos: payload.mousePos ?? null, ts: Date.now() };
  bus.$emit(FULLSCREEN_SUMMON_EVENT, envelope);
  bus.$emit(DELETE_EFFECT_SUMMON_EVENT, envelope);
  return true;
}

/** 主应用主动销毁 overlay。 */
export function teardownFullscreen(): boolean {
  const bus = getBus();
  if (!bus) {
    return false;
  }
  const envelope = { ts: Date.now() };
  bus.$emit(FULLSCREEN_TEARDOWN_EVENT, envelope);
  bus.$emit(DELETE_EFFECT_TEARDOWN_EVENT, envelope);
  return true;
}

// 子应用发来的能力请求：默认支持取光标位置与屏幕信息
const cursorPosCache = new Map<number, { x: number; y: number; updatedAt: number }>();

export function updateCursorPosCache(webContentsId: number, x: number, y: number): void {
  cursorPosCache.set(webContentsId || 0, { x, y, updatedAt: Date.now() });
}

export function defaultResolveRequest(envelope: { kind: string; payload?: any }): unknown {
  const { kind, payload } = envelope;
  if (kind === 'get-cursor-pos') {
    return getCachedCursorPos(payload ?? {});
  }
  if (kind === 'get-screen-info') {
    return getScreenInfo();
  }
  throw Object.assign(new Error(`unknown kind '${kind}'`), { code: 'UNKNOWN_KIND' });
}

function getCachedCursorPos(payload: { webContentsId?: number } = {}): unknown {
  const cached = cursorPosCache.get(payload.webContentsId ?? 0);
  if (cached) {
    return cached;
  }
  const width = typeof window !== 'undefined' ? window.innerWidth : 0;
  const height = typeof window !== 'undefined' ? window.innerHeight : 0;
  return { x: width / 2, y: height / 2, fallback: true, updatedAt: Date.now() };
}

function getScreenInfo(): Record<string, number> {
  if (typeof window === 'undefined') {
    return {};
  }
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX || 0,
    scrollY: window.scrollY || 0,
  };
}
