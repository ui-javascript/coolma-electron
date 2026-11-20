/**
 * Rune 的纯逻辑层：不依赖 Muya 或 Vue。
 *
 * SFC 模板的解析（`props.inheritFromPrevious.default`）在引擎里原本写死，
 * 这里把它抽成纯函数，vue2/vue3/vuepress/vitepress 共用同一套判断。
 */
export interface RuneCardLike {
  id?: string;
  name?: string;
  desc?: string;
  color?: string;
  icon?: string;
  template?: string;
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

function toBase64(value: string): string {
  // 浏览器、Electron 渲染进程、Node 18+ 都有 TextEncoder + btoa；vuepress/vitepress 同样适用。
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function glyphIcon(name: string, color: string, fallback = '符'): string {
  const glyph = Array.from(String(name || '').trim())[0] ?? fallback;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="${color || '#7E57C2'}"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-weight="700" fill="#fff">${glyph}</text></svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * 从 SFC 模板里读 `props.inheritFromPrevious.default`。
 * 返回值三态：true / false / undefined（未声明）。
 */
export function readInheritFromTemplate(template: string): boolean | undefined {
  if (typeof template !== 'string' || !template) {
    return undefined;
  }
  const scriptMatch = template.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    return undefined;
  }
  const body = scriptMatch[1];
  const propsIdx = body.indexOf('props');
  if (propsIdx < 0) {
    return undefined;
  }
  const start = body.indexOf('{', propsIdx);
  if (start < 0) {
    return undefined;
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) {
    return undefined;
  }
  const propsBody = body.slice(start + 1, end);
  const match = propsBody.match(/inheritFromPrevious\s*:\s*\{[^}]*?default\s*:\s*(true|false)/);
  if (!match) {
    return undefined;
  }
  return match[1] === 'true';
}

export function escapeHtmlAttribute(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function randomId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface RunePlaceholderInput {
  name: string;
  /** 显示文本，默认等于 name。 */
  text?: string;
  /** 继承来的值（上一行文本），没有就留空。 */
  value?: string;
  /** 实例 id，缺省时生成。 */
  id?: string;
  nodeId?: string;
}

/**
 * 符文在正文里的占位写法：`<div data-rune-*>`。
 * 只带 4 个系统级属性；SFC props 的合并（手写属性 > 卡片字段 > props.default）
 * 交给渲染端的 mountRuneVueHosts，不在 Markdown 里堆参数。
 */
export function buildRunePlaceholderHtml(input: RunePlaceholderInput): string {
  const name = String(input.name || '').trim() || 'Rune';
  const text = String(input.text ?? '').trim() || name;
  const value = String(input.value ?? '').trim();
  const id = input.id || randomId();
  const nodeId = input.nodeId || `rune-${randomId()}`;
  return (
    `<div data-rune-name="${escapeHtmlAttribute(name)}"` +
    ` data-rune-id="${escapeHtmlAttribute(id)}"` +
    ` data-rune-node-id="${escapeHtmlAttribute(nodeId)}"` +
    ` data-rune-value="${escapeHtmlAttribute(value)}">` +
    `${escapeHtmlAttribute(text)}</div>`
  );
}

/**
 * 应用侧插入语义（引擎只提供原语，不再自己实现符文）。
 *
 * 上下文由引擎注入，只要求这些原语：
 * - `insertHtmlAtTrigger(html)`：把 `@query` 换成富内容，光标落末尾
 * - `getBlockText()` / `isInlineTrigger()`：判断是行首还是行内 `@`
 * - `getPreviousLine()` / `removeLine(target)`：`inheritFromPrevious: true` 时取上一行
 */
export interface RuneInsertItem {
  meta?: {
    runeName?: string;
    insertContent?: string;
    [key: string]: unknown;
  };
}

export interface RuneInsertContext {
  insertHtmlAtTrigger: (html: string) => boolean;
  getBlockText?: () => string;
  isInlineTrigger?: () => boolean;
  getPreviousLine?: () => { text?: string; isPlainText?: boolean; removeTarget?: unknown } | null;
  removeLine?: (target: unknown) => boolean;
}

export function createRuneInsertHandler(): (item: RuneInsertItem, context: RuneInsertContext) => boolean {
  return (item, context) => {
    const name = String(item?.meta?.runeName ?? '').trim();
    if (!name) {
      return false;
    }

    const template = String(item?.meta?.insertContent ?? '');
    const inherit = readInheritFromTemplate(template) === true;
    const inline = context.isInlineTrigger ? context.isInlineTrigger() : false;
    const blockText = context.getBlockText ? String(context.getBlockText() ?? '') : '';
    const insertedFromTrigger = blockText.trimStart().startsWith('@');

    let previous: { text?: string; isPlainText?: boolean; removeTarget?: unknown } | null = null;
    let value = '';
    if (inherit && (inline || insertedFromTrigger)) {
      previous = context.getPreviousLine ? context.getPreviousLine() : null;
      if (previous?.isPlainText) {
        value = String(previous.text ?? '');
      }
    }

    const ok = context.insertHtmlAtTrigger(buildRunePlaceholderHtml({ name, value }));
    if (!ok) {
      return false;
    }

    // 行首插入且继承成功时，把被读走的上一行删掉（与 vue2 行为一致）；行内插入不动。
    if (!inline && previous && previous.removeTarget && context.removeLine) {
      context.removeLine(previous.removeTarget);
    }
    return true;
  };
}


export function buildRuneItems(cards: RuneCardLike[], fallbackName = '符文'): QuickInsertItem[] {
  return cards
    .filter((card) => Boolean(card && (card.name || card.id)))
    .map((card) => {
      const name = String(card.name || card.id || '').trim() || fallbackName;
      const template = typeof card.template === 'string' ? card.template : '';
      const color = card.color || '#7E57C2';
      return {
        title: () => name,
        subTitle: () => String(card.desc || '') || template.slice(0, 80),
        label: `rune:${card.id || name}`,
        shortCut: '',
        icon: glyphIcon(name, color),
        color,
        searchText: [name, card.desc, template].filter(Boolean).join(' '),
        meta: {
          type: 'rune',
          runeTemplateId: card.id || '',
          runeName: name,
          color,
          insertContent: template,
        },
      };
    });
}
