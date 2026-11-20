import type Muya from './core/index.js';

export interface MuyaPluginContext {
  /** Muya core instance. */
  editor: Muya;
  /** DOM container owned by the editor. */
  container: HTMLElement;
}

export interface MuyaPlugin {
  name: string;
  install(context: MuyaPluginContext): void | (() => void);
}

export function extendQuickInsertProvider(
  editor: Muya,
  provider: (context: Record<string, any>) => Record<string, any>,
): void {
  const runtimeEditor = editor as any;
  const previous = runtimeEditor.options.quickInsertProvider;
  runtimeEditor.options.quickInsertProvider = (context: Record<string, any>) => {
    const base = typeof previous === 'function' ? previous(context) : {};
    const extension = provider(context) || {};
    const baseItems = base?.items || base || {};
    const extensionItems = extension?.items || extension || {};
    return {
      ...base,
      ...extension,
      items: { ...baseItems, ...extensionItems },
    };
  };
}

/**
 * Helper for the future `libs-muya-echo-vue3` and `libs-muya-rune-vue3` packages.
 * A plugin owns its DOM/CSS and returns an optional cleanup function.
 */
export function defineMuyaPlugin(plugin: MuyaPlugin): MuyaPlugin {
  return plugin;
}
