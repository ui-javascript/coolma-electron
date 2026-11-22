import { defineMuyaPlugin, type MuyaPlugin } from 'libs-muya-vue3';
import { createRuneRendererCtor } from './runeRenderer';
import {
  createMeltRuneRendererCtor,
  preloadMeltRunes,
  clearAllMeltCaches,
  clearMeltRuneCaches,
} from './meltRune';

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
      // 快捷面板的数据源由应用侧统一提供（它读库），插件只负责渲染与解析，
      // 不再自己往 quickInsertProvider 里塞一份，否则面板会出现重复分组。
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
      // 打开笔记/启动后 idle 预热 melt 依赖；失败只记日志，不阻塞编辑。
      setTimeout(() => {
        void preloadMeltRunes(cards);
      }, 0);
      return () => {};
    },
  });
}

export { createRuneRendererCtor, createMeltRuneRendererCtor, preloadMeltRunes, clearAllMeltCaches, clearMeltRuneCaches };
export default createRunePlugin;
