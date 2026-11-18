import { defineMuyaPlugin, extendQuickInsertProvider, type MuyaPlugin } from 'libs-muya';
import { createRuneRendererCtor } from './runeRenderer';

export interface RuneCard {
  id?: string;
  name: string;
  template: string;
  [key: string]: unknown;
}

export interface RunePluginOptions {
  cards?: RuneCard[];
  components?: Record<string, unknown>;
}

export function createRunePlugin(options: RunePluginOptions = {}): MuyaPlugin {
  return defineMuyaPlugin({
    name: 'muya-rune',
    install({ editor }) {
      const runtimeEditor = editor as any;
      const existingCards = Array.isArray(runtimeEditor.options.runeCards) ? runtimeEditor.options.runeCards : [];
      const cards = Array.isArray(options.cards) ? options.cards : existingCards;
      runtimeEditor.options.runeCards = cards;
      runtimeEditor.options.runeRendererCtor = createRuneRendererCtor;
      runtimeEditor.options.enableRuneVueRenderer = true;
      runtimeEditor.options.memocastMuya = runtimeEditor;
      extendQuickInsertProvider(editor, (context) => {
        const items = (cards as RuneCard[])
          .filter((card: RuneCard) => card && (card.name || card.id))
          .map((card: RuneCard) => context.createRuneItem(card));
        const section = 'Rune / 符文';
        return { sectionName: section, items: { [section]: items } };
      });
      if (typeof runtimeEditor.updateRunePlaceholderValue !== 'function') {
        runtimeEditor.updateRunePlaceholderValue = ({ nodeId = '', value = '' }: { nodeId?: string; value?: unknown } = {}) => {
          const target = String(nodeId || '').trim();
          if (!target) return false;
          const markdown = String(editor.getMarkdown() || '');
          const escaped = String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          let changed = false;
          const next = markdown.replace(/<div([^>]*data-rune-node-id\s*=\s*"([^"]*)"[^>]*)>([\s\S]*?)<\/div>/gi, (match: string, attrs: string, currentNodeId: string) => {
            if (changed || currentNodeId !== target) return match;
            changed = true;
            const nextAttrs = attrs.replace(/data-rune-value\s*=\s*"[^"]*"/i, 'data-rune-value="' + escaped + '"');
            return '<div' + nextAttrs + '>' + (escaped || 'Rune') + '</div>';
          });
          if (!changed || next === markdown) return false;
          editor.setMarkdown(next);
          return true;
        };
      }
      editor.setMarkdown(editor.getMarkdown());
      return () => {};
    },
  });
}

export { createRuneRendererCtor };
export default createRunePlugin;
