import { defineMuyaPlugin, type MuyaPlugin } from "libs-muya-v3";
// @ts-ignore Legacy runtime modules are JavaScript by design.
import EchoRegistry from "./core/echoRegistry.js";
// @ts-ignore Legacy runtime modules are JavaScript by design.
import EchoRuntime from "./core/echoRuntime.js";
// @ts-ignore Legacy runtime modules are JavaScript by design.
import { parseEchoProps } from "./core/echoPropsParser.js";
// @ts-ignore Legacy runtime modules are JavaScript by design.
import { decodeEchoPayload, encodeEchoPayload, createEchoPlaceholderPayload } from "./core/echoPayloadCodec.js";

export interface EchoCard {
  id?: string;
  name: string;
  desc?: string;
  icon?: string;
  color?: string;
  type?: string;
  anno_source?: string;
  template?: string;
  [key: string]: unknown;
}

export interface EchoPluginOptions {
  enabled?: boolean;
  cards?: EchoCard[];
  registry?: InstanceType<typeof EchoRegistry>;
}

export function createEchoPlugin(options: EchoPluginOptions = {}): MuyaPlugin {
  return defineMuyaPlugin({
    name: "muya-echo",
    install({ editor }) {
      if (options.enabled === false) return;
      const runtimeEditor = editor as any;
      const existingCards = Array.isArray(runtimeEditor.options.echoCards) ? runtimeEditor.options.echoCards : [];
      const cards = Array.isArray(options.cards) ? options.cards : existingCards;
      const registry = options.registry || new EchoRegistry(cards);
      if (options.registry && cards.length) registry.refresh(cards);
      const runtime = registry.runtime || new EchoRuntime({ registry });
      runtimeEditor.options.echoRegistry = registry;
      runtimeEditor.options.echoCards = registry.getAll();
      runtimeEditor.options.echoRuntime = runtime;
      runtimeEditor.options.__echoRuntime = runtime;
      // 快捷面板的数据源由应用侧统一提供（它读库），插件只负责 anno_source 渲染。
      // 取值回写：卡片里改值 → 写回 markdown 的 token 载荷（与符文 data-rune-value 对称）
      if (typeof runtimeEditor.updateEchoPlaceholderValue !== 'function') {
        runtimeEditor.updateEchoPlaceholderValue = ({ echoId = '', value = '' }: { echoId?: string; value?: unknown } = {}) => {
          const target = String(echoId || '').trim();
          if (!target) return false;
          const markdown = String(editor.getMarkdown() || '');
          const nextValue = String(value ?? '');
          const escapedValue = nextValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          let changed = false;
          const next = markdown.replace(/@([A-Za-z0-9_\u4e00-\u9fa5-]+)\{([^}]*)\}\(\)/g, (match: string, name: string, body: string) => {
            if (changed) return match;
            if (!new RegExp(`echoId\\s*:\\s*['\"]${escapedTarget}['\"]`).test(body)) return match;
            changed = true;
            const replaced = /value\s*:\s*(['"])[^'"]*\1/.test(body)
              ? body.replace(/value\s*:\s*(['"])[^'"]*\1/, `value: '${escapedValue}'`)
              : `${body.replace(/\s*$/, '')}, value: '${escapedValue}'`;
            return `@${name}{${replaced}}()`;
          });
          if (!changed || next === markdown) return false;
          editor.setMarkdown(next);
          return true;
        };
      }

      editor.setMarkdown(editor.getMarkdown());
      return () => {
        try { runtime.disposeAll?.(runtimeEditor.container); } catch (error) { console.warn("[muya-echo] dispose failed", error); }
        if (runtimeEditor.options.echoRuntime === runtime) {
          delete runtimeEditor.options.echoRuntime;
          delete runtimeEditor.options.__echoRuntime;
        }
      };
    },
  });
}

export { EchoRegistry, EchoRuntime, parseEchoProps, decodeEchoPayload, encodeEchoPayload, createEchoPlaceholderPayload };
export default createEchoPlugin;
