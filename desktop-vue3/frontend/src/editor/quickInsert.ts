import { buildEchoItems } from 'libs-echo-core';
import { buildRuneItems } from 'libs-rune-core';
import type { EchoCard, NoteSummary, RuneCard } from '@shared/types/domain';

type Translate = (key: string) => string;

function svgToDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function noteIcon(name: string): string {
  const glyph = escapeXml(Array.from(String(name || '笔').trim())[0] ?? '笔');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="#409EFF"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" ` +
    `font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,PingFang SC,Microsoft YaHei,sans-serif" ` +
    `font-weight="700" fill="#fff">${glyph}</text></svg>`;
  return svgToDataUri(svg);
}

/** 面板里最多列多少条笔记，避免把几万条全塞进 DOM。 */
const NOTE_LIMIT = 40;

function noteItem(note: NoteSummary) {
  return {
    title: () => note.title,
    subTitle: () => note.excerpt || note.category,
    label: `note:${note.id}`,
    shortCut: '',
    icon: noteIcon(note.title),
    color: '#409EFF',
    searchText: [note.title, note.excerpt, note.category].filter(Boolean).join(' '),
    meta: {
      type: 'note',
      noteId: note.id,
      noteTitle: note.title,
    },
  };
}

export interface QuickInsertSource {
  runes: RuneCard[];
  echoes: EchoCard[];
  notes: NoteSummary[];
}

/**
 * 构造 Muya 的 `quickInsertProvider`。
 *
 * 分组顺序是「笔记 → 符文 → 回响」；符文/回响的 item 形状由各自包的 pure 层产出
 * （`libs-rune-core`、`libs-echo-core`），应用这边不再重复实现，
 * 这样 vuepress/vitepress 换成自己的卡片来源时能直接复用同一份构造逻辑。
 */
export function createQuickInsertProvider(getSource: () => QuickInsertSource, t: Translate) {
  return function quickInsertProvider(): Record<string, unknown> {
    const { runes, echoes, notes } = getSource();
    const noteSection = t('editor.noteSection');
    const runeSection = t('editor.runeSection');
    const echoSection = t('editor.echoSection');

    return {
      sectionName: noteSection,
      items: {
        [noteSection]: notes.slice(0, NOTE_LIMIT).map(noteItem),
        [runeSection]: buildRuneItems(runes, t('editor.unnamedRune')),
        [echoSection]: buildEchoItems(echoes, t('editor.unnamedEcho')),
      },
      echoSectionName: echoSection,
    };
  };
}
