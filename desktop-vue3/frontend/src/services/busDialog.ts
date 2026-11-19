/**
 * busDialog 弹层体系（移植 vue2 components/common/busDialogRegistry.js）。
 *
 * 能力一致：
 *  - 按名字注册对话框（懒加载：调用时才 import 组件）
 *  - `openBusDialog(name, { ...contentProps, busDialogProps })` 返回 {status,id,close}
 *  - `closeBusDialog(name, id)` / `closeAllBusDialogs(name)`
 *  - bus 事件 API：`busDialogBus.emit('XxxBusDialog.open', payload)` / `.close`
 *
 * 与 vue2 的差别（如实报备）：
 *  - vue2 用一个 vue-layerx portal host 承载「同一对话框的多个 session 数组」，
 *    因为 Vue 2.7 下 clone 的 layer 不继承 host；vue3 的 vue-layerx 1.2.5 每个 open
 *    直接建独立实例（并发多开天然支持），不需要 session 数组。
 *  - 名字不再靠 webpack 静态 context 扫目录推出来，改为显式注册（vite 没有等价 API）。
 */
import { watch } from 'vue';
import { ElDialog, ElDrawer } from 'element-plus';
import { createLayer } from 'vue-layerx';
import { busDialogBus } from '@/services/busDialogBus';

type AnyComponent = Record<string, unknown>;

export type BusDialogKind = 'dialog' | 'drawer';

export interface BusDialogDefaults {
  kind?: BusDialogKind;
  props?: Record<string, unknown>;
}

export interface BusDialogEntry {
  name: string;
  loader: () => Promise<{ default: AnyComponent } | AnyComponent>;
  defaults: { kind: BusDialogKind; props: Record<string, unknown> };
}

export interface BusDialogResult {
  status: 'opened' | 'unknown' | 'failed';
  name: string;
  id?: string;
  close?: () => void;
  closed?: Promise<unknown>;
  error?: unknown;
}

const registry = new Map<string, BusDialogEntry>();
const sessions = new Map<string, { close: () => void }>();
let seq = 0;
let listening = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useDialog = createLayer(ElDialog as any, { props: { appendToBody: true, closeOnClickModal: false, width: '560px' } }) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useDrawer = createLayer(ElDrawer as any, { props: { appendToBody: true, size: '420px' } }) as any;

export function registerBusDialog(
  name: string,
  loader: () => Promise<{ default: AnyComponent } | AnyComponent>,
  defaults: BusDialogDefaults = {},
): void {
  if (!name) {
    throw new Error('[busDialog] name is required');
  }
  if (registry.has(name)) {
    throw new Error(`[busDialog] duplicate dialog name "${name}"`);
  }
  registry.set(name, {
    name,
    loader,
    defaults: { kind: defaults.kind ?? 'dialog', props: defaults.props ?? {} },
  });
}

export function getBusDialog(name: string): BusDialogEntry | undefined {
  return registry.get(name);
}

export async function openBusDialog(
  name: string,
  payload: Record<string, unknown> = {},
): Promise<BusDialogResult> {
  const entry = registry.get(name);
  if (!entry) {
    return { status: 'unknown', name };
  }
  try {
    const module = await entry.loader();
    const component = ((module as { default?: AnyComponent }).default ?? module) as AnyComponent;
    const { busDialogProps, ...contentProps } = payload as {
      busDialogProps?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const kind = (busDialogProps?.container as BusDialogKind | undefined) ?? entry.defaults.kind;
    const layer = (kind === 'drawer' ? useDrawer : useDialog)(component) as {
      open: (config: Record<string, unknown>) => void;
      close: () => void;
      readonly visible: boolean;
    };
    const containerProps = { ...entry.defaults.props, ...(busDialogProps ?? {}) };
    const id = `${name}:${++seq}`;

    const closed = new Promise((resolve) => {
      const stop = watch(
        () => layer.visible,
        (visible) => {
          if (!visible) {
            stop();
            sessions.delete(id);
            resolve({ status: 'closed', id });
          }
        },
      );
    });

    sessions.set(id, { close: () => layer.close() });
    layer.open({ props: { ...contentProps, onClose: () => layer.close() }, container: { props: containerProps } });
    return { status: 'opened', name, id, close: () => layer.close(), closed };
  } catch (error) {
    return { status: 'failed', name, error };
  }
}

export function closeBusDialog(name: string, id?: string): { status: string; name: string; id?: string } {
  if (!id) {
    return { status: 'missing-id', name };
  }
  const session = sessions.get(id);
  if (!session) {
    return { status: 'missing', name, id };
  }
  session.close();
  sessions.delete(id);
  return { status: 'closed', name, id };
}

export function closeAllBusDialogs(name?: string): void {
  Array.from(sessions.entries()).forEach(([id, session]) => {
    if (!name || id.startsWith(`${name}:`)) {
      session.close();
      sessions.delete(id);
    }
  });
}

/** 启动 bus 事件监听（效果等同 vue2 的 startBusDialogs）。 */
export function startBusDialogs(): void {
  if (listening) {
    return;
  }
  listening = true;
  registry.forEach((entry) => {
    busDialogBus.on(`${entry.name}.open`, (payload) => {
      void openBusDialog(entry.name, (payload as Record<string, unknown>) ?? {});
    });
    busDialogBus.on(`${entry.name}.close`, (payload) => {
      const data = payload as { id?: string } | undefined;
      if (data?.id) {
        closeBusDialog(entry.name, data.id);
      } else {
        closeAllBusDialogs(entry.name);
      }
    });
  });
}

export function stopBusDialogs(): void {
  listening = false;
  closeAllBusDialogs();
}

export function isBusDialogListening(): boolean {
  return listening;
}
