/**
 * 通用微应用 ↔ 主进程桥（wujie bus 通道，移植 vue2 genericMicroAppIpcBridge.js）。
 *
 * 子应用发 `microapp:ipc:request` → 主应用按白名单校验 → 走 preload 暴露的
 * `window.coolma.invoke(channel, args)` → 回 `microapp:ipc:response`。
 *
 * 与 vue2 的差别：vue2 直接拿 ipcRenderer.invoke，vue3 渲染层只有 contextBridge 的
 * coolma.invoke（含通道白名单），所以这里再叠一层「给子应用的可用通道白名单」。
 */
import { getWujieBus } from '@/services/wujieBus';

export const IPC_REQUEST_EVENT = 'microapp:ipc:request';
export const IPC_RESPONSE_EVENT = 'microapp:ipc:response';

/**
 * 默认允许子应用调用的通道（只放只读 / 低风险能力）。
 * 新增时先确认主进程 handler 是否允许跨应用调用。
 */
export const DEFAULT_ALLOWED_CHANNELS: string[] = [
  'controller/app/info',
  'controller/notes/list',
  'controller/notes/get',
  'controller/notes/stats',
  'controller/categories/list',
  'controller/tags/list',
  'controller/settings/get',
];

type Bus = { $on: Function; $off: Function; $emit: Function };

function getBus(): Bus | null {
  return getWujieBus() as Bus | null;
}

let installed = false;
let uninstallRef: (() => void) | null = null;

export function installGenericMicroAppIpcBridge(options: {
  allowedChannels?: string[];
  onRequest?: (envelope: { requestId: string; channel: string; args?: unknown }) => void;
} = {}): () => void {
  if (installed && uninstallRef) {
    return uninstallRef;
  }
  const bus = getBus();
  if (!bus) {
    return () => {};
  }
  const allowed = new Set(options.allowedChannels ?? DEFAULT_ALLOWED_CHANNELS);

  const handler = async (
    envelope: { requestId?: string; channel?: string; args?: unknown } = {},
  ): Promise<void> => {
    const { requestId, channel, args } = envelope;
    if (!requestId) {
      return;
    }
    if (!channel || typeof channel !== 'string') {
      bus.$emit(IPC_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code: 'INVALID_CHANNEL', message: 'channel must be a non-empty string' },
      });
      return;
    }
    if (!allowed.has(channel)) {
      bus.$emit(IPC_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code: 'CHANNEL_NOT_ALLOWED', message: `channel '${channel}' is not in allowed list` },
      });
      return;
    }
    try {
      options.onRequest?.({ requestId, channel, args });
      const api = window.coolma;
      if (!api?.invoke) {
        throw Object.assign(new Error('coolma bridge unavailable'), { code: 'BRIDGE_UNAVAILABLE' });
      }
      const response = await api.invoke(channel, args);
      if (!response?.ok) {
        throw Object.assign(new Error(response?.error?.message || 'IPC invoke failed'), {
          code: response?.error?.code || 'IPC_BRIDGE_FAILED',
        });
      }
      bus.$emit(IPC_RESPONSE_EVENT, { requestId, ok: true, result: response.data });
    } catch (error) {
      const typed = error as Error & { code?: string };
      bus.$emit(IPC_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code: typed?.code ?? 'IPC_BRIDGE_FAILED', message: typed?.message ?? String(error) },
      });
    }
  };

  bus.$on(IPC_REQUEST_EVENT, handler);
  installed = true;
  uninstallRef = () => {
    if (!installed) {
      return;
    }
    try {
      bus.$off(IPC_REQUEST_EVENT, handler);
    } catch {
      /* noop */
    }
    installed = false;
    uninstallRef = null;
  };
  return uninstallRef;
}

export function isGenericMicroAppIpcBridgeInstalled(): boolean {
  return installed;
}
