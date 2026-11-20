import { createEchoPlugin } from 'libs-muya-echo-vue3';
import { createRunePlugin } from 'libs-muya-rune-vue3';
import type { EchoCard, RuneCard } from '@shared/types/domain';

export interface MuyaPluginSource {
  runes: RuneCard[];
  echoes: EchoCard[];
}

/**
 * 由库数据（SQLite）构造 Muya 插件。
 *
 * 这里不再有任何硬编码 demo 卡片：符文/回响的来源只有库，
 * 数据异步就绪后 MuyaEditor 会重装插件（见 libs-muya-vue3/src/MuyaEditor.vue 的 watch）。
 */
export function createMuyaPlugins(source: MuyaPluginSource): unknown[] {
  return [
    createEchoPlugin({ cards: source.echoes as never }),
    createRunePlugin({ cards: source.runes as never }),
  ];
}
