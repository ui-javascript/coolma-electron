/**
 * Echo 的纯逻辑层：不依赖 Muya 或 Vue。
 *
 * vue3 桌面、vue2 桌面、vuepress、vitepress 都能直接吃这里的函数；
 * 差异只在「谁来把 items 塞进编辑器、谁来渲染 anno_source」。
 */
export interface EchoCardLike {
  id?: string;
  name?: string;
  desc?: string;
  color?: string;
  anno_source?: string;
}

export interface QuickInsertItem {
  title: () => string;
  subTitle: () => string;
  label: string;
  shortCut: string;
  icon: string;
  color: string;
  searchText: string;
  meta: Record<string, unknown>;
}

export function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 卡片图标：色块 + 名称首字（与 vue2 的做法一致，避免依赖图片资源）。 */
export function glyphIcon(name: string, color: string, fallback = '回'): string {
  const glyph = Array.from(String(name || '').trim())[0] ?? fallback;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="${escapeXml(color)}"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" ` +
    `font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,PingFang SC,Microsoft YaHei,sans-serif" ` +
    `font-weight="700" fill="#fff">${escapeXml(Array.from(glyph)[0]?.toUpperCase() ?? '')}</text></svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

function toBase64(value: string): string {
  // 浏览器、Electron 渲染进程、Node 18+ 都有 TextEncoder + btoa；vuepress/vitepress 同样适用。
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** 回响在正文里的占位写法：`@名称{}()`。 */
export function echoPlaceholder(name: string): string {
  return `@${name || '回响'}{}()`;
}

function escapeEchoAttrValue(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function randomId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface EchoPlaceholderInput {
  name: string;
  /** 继承来的值（上一行文本）。 */
  value?: string;
  /** 实例 id，缺省时生成。 */
  echoId?: string;
}

/**
 * 回响实例的完整占位：`@名称{echoId: '...', value: '...'}()`。
 * `echoId` 是每个实例稳定的身份，运行时靠它拿 `props.echoId`。
 */
export function buildEchoPlaceholderMarkup(input: EchoPlaceholderInput): string {
  const name = String(input.name || '').trim() || '回响';
  const value = String(input.value ?? '');
  const echoId = input.echoId || randomId();
  return `@${name}{echoId: '${escapeEchoAttrValue(echoId)}', value: '${escapeEchoAttrValue(value)}'}()`;
}

export interface EchoInsertItem {
  meta?: { echoName?: string; [key: string]: unknown };
}

export interface EchoInsertContext {
  replaceAtTrigger: (text: string) => boolean;
  getBlockText?: () => string;
  isInlineTrigger?: () => boolean;
  getPreviousLine?: () => { text?: string; isPlainText?: boolean } | null;
}

/**
 * 应用侧插入语义：把 `@query` 换成带 echoId 的占位，并继承上一行文本作为 value。
 * 引擎那边只剩「替换 @query」这个原语。
 */
export function createEchoInsertHandler(): (item: EchoInsertItem, context: EchoInsertContext) => boolean {
  return (item, context) => {
    const name = String(item?.meta?.echoName ?? '').trim();
    if (!name) {
      return false;
    }

    const inline = context.isInlineTrigger ? context.isInlineTrigger() : false;
    const blockText = context.getBlockText ? String(context.getBlockText() ?? '') : '';
    const insertedFromTrigger = blockText.trimStart().startsWith('@');

    let value = '';
    if (inline || insertedFromTrigger) {
      const previous = context.getPreviousLine ? context.getPreviousLine() : null;
      if (previous?.isPlainText) {
        value = String(previous.text ?? '');
      }
    }

    return context.replaceAtTrigger(buildEchoPlaceholderMarkup({ name, value }));
  };
}

export function buildEchoItems(cards: EchoCardLike[], fallbackName = '回响'): QuickInsertItem[] {
  return cards
    .filter((card) => Boolean(card && (card.name || card.id)))
    .map((card) => {
      const name = String(card.name || card.id || '').trim() || fallbackName;
      const color = card.color || '#26A69A';
      return {
        title: () => name,
        subTitle: () => String(card.desc || ''),
        label: `echo:${card.id || name}`,
        shortCut: '',
        icon: glyphIcon(name, color),
        color,
        searchText: [name, card.desc, card.anno_source].filter(Boolean).join(' '),
        meta: {
          type: 'echo',
          echoName: name,
          echoId: card.id || '',
          color,
        },
      };
    });
}
