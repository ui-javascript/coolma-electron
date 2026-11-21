/**
 * 微应用 ↔ 主进程桥（wujie bus 通道，移植 vue2 microAppIpcBridge.js）。
 *
 * 子应用在 iframe 里 `window.$wujie.bus.$emit('microapp:parse:request', { requestId, payload })`，
 * 主应用监听 → `controller/microapp/parse`（Vue 2 SFC 编译）→
 * `$emit('microapp:parse:response', { requestId, ok, result | error })`。
 */
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { invoke } from '@/services/ipc';
import { getWujieBus } from '@/services/wujieBus';

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

/**
 * 把 vue2 parseClient 的 payload 形状转成主进程入参：
 *   - payload 可以是源码字符串
 *   - 或 { source, options, filename, sourceMap }
 * 与 vue2 microAppIpcBridge 的 filename/sourceMap 合并顺序一致。
 */
export async function parseMicroAppSfc(payload: unknown): Promise<unknown> {
  const source = typeof payload === 'string' ? payload : (payload as { source?: unknown } | null | undefined)?.source;
  const objectPayload = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const options = (objectPayload.options && typeof objectPayload.options === 'object' ? objectPayload.options : {}) as Record<
    string,
    unknown
  >;
  const filename = String(objectPayload.filename || 'inline.vue');
  const sourceMap = objectPayload.sourceMap || false;

  const result = await invoke(IPC_CHANNELS.microapp.parse, {
    source,
    options: { ...options, filename, sourceMap },
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.error.message), { code: result.error.code });
  }
  return result.data;
}

/** 注入自定义解析实现（测试用）；传 null 恢复为无实现状态。 */
export function setMicroAppParseImpl(next: ParseImpl | null): void {
  impl = next;
}

export function installMicroAppParseBridge(): () => void {
  if (installed && uninstallRef) {
    return uninstallRef;
  }
  const bus = getWujieBus() as { $on: Function; $off: Function; $emit: Function } | null;
  if (!bus) {
    return () => {};
  }
  if (!impl) {
    impl = parseMicroAppSfc;
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
