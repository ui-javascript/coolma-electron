import { defineMuyaPlugin, extendQuickInsertProvider, type MuyaPlugin } from "libs-muya";
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
      extendQuickInsertProvider(editor, () => {
        const items = registry.getAll().filter((card: EchoCard) => card.name).map((card: EchoCard) => {
          const name = String(card.name).trim();
          const color = card.color || "#26A69A";
          const glyph = Array.from(name)[0] || "回";
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="' + color + '" /><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-weight="700" fill="#fff">' + glyph + "</text></svg>";
          return {
            title: () => name,
            subTitle: () => String(card.desc || ""),
            label: "echo:" + String(card.id || name),
            shortCut: "",
            icon: "data:image/svg+xml," + encodeURIComponent(svg),
            color,
            searchText: [name, card.desc, card.anno_source].filter(Boolean).join(" "),
            meta: { type: "echo", echoName: name, echoId: card.id || "" },
          };
        });
        const section = "Echo / 回响";
        return { echoSectionName: section, items: { [section]: items } };
      });
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
