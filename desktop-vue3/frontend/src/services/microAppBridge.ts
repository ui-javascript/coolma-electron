/**
 * 微应用 ↔ 主进程桥（wujie bus 通道，移植 vue2 microAppIpcBridge.js）。
 *
 * 子应用在 iframe 里 `window.$wujie.bus.$emit('microapp:parse:request', { requestId, payload })`，
 * 主应用这里监听 → 走主进程能力 → 再 `$emit('microapp:parse:response', { requestId, result })`。
 *
 * vue3 目前主进程还没有 vue-sfc 解析通道（vue2 是 ParseVueSfc），
 * 这里先把桥的骨架和事件名固定下来，处理器留成可注入的（后续接解析通道只换 impl）。
 */
import WujieVue from 'wujie-vue3';

export const PARSE_REQUEST_EVENT = 'microapp:parse:request';
export const PARSE_RESPONSE_EVENT = 'microapp:parse:response';

export interface MicroAppParsePayload {
  requestId?: string;
  payload?: unknown;
}

type ParseImpl = (payload: unknown) => Promise<unknown> | unknown;

let impl: ParseImpl | null = null;
let installed = false;
let uninstallRef: (() => void) | null = null;

/** 注入实际的解析实现（后续接主进程通道时调用一次）。 */
export function setMicroAppParseImpl(next: ParseImpl | null): void {
  impl = next;
}

export function installMicroAppParseBridge(): () => void {
  if (installed && uninstallRef) {
    return uninstallRef;
  }
  const bus = (WujieVue as unknown as { bus?: { $on: Function; $off: Function; $emit: Function } }).bus;
  if (!bus) {
    return () => {};
  }

  const handler = async (envelope: MicroAppParsePayload = {}): Promise<void> => {
    const { requestId, payload } = envelope;
    if (!requestId) {
      return;
    }
    try {
      if (!impl) {
        throw Object.assign(new Error('microapp parse bridge has no impl'), { code: 'PARSE_BRIDGE_NO_IMPL' });
      }
      const result = await impl(payload);
      bus.$emit(PARSE_RESPONSE_EVENT, { requestId, ok: true, result });
    } catch (error) {
      const typed = error as Error & { code?: string };
      bus.$emit(PARSE_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { message: typed?.message ?? String(error), code: typed?.code ?? 'PARSE_BRIDGE_FAILED' },
      });
    }
  };

  bus.$on(PARSE_REQUEST_EVENT, handler);
  installed = true;
  uninstallRef = () => {
    if (!installed) {
      return;
    }
    try {
      bus.$off(PARSE_REQUEST_EVENT, handler);
    } catch {
      /* noop */
    }
    installed = false;
    uninstallRef = null;
  };
  return uninstallRef;
}

export function isMicroAppParseBridgeInstalled(): boolean {
  return installed;
}
