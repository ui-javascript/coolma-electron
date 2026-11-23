import type { EchoCard, RuneCard } from '../../shared/types/domain';

/**
 * 博客端符文/回响静态渲染（对应 `参考/vuepress符文回响-设计.md` 的 P1）。
 *
 * 两种模式：
 * - `static`（默认）：改写成 `ag-rune` / `ag-echo` 静态卡片，不依赖任何主题，
 *   VuePress 1.x、VitePress、VuePress 2 都能直接显示；副作用不生效。
 * - `component`：改写成 `<RuneHost>` / `<EchoHost>` 宿主组件，符文把定义以
 *   base64 `definition` 内联进去，回响带 `field`，博客主题注册过宿主组件即可
 *   真正挂载 / 执行回响，不要求博客预先持有用户目录。
 */

export interface RuneEchoCatalog {
  runes: RuneCard[];
  echoes: EchoCard[];
}

export interface RuneEchoStats {
  runes: number;
  echoes: number;
}

export type RuneEchoRenderMode = 'static' | 'component';

export interface RuneEchoOptions {
  mode?: RuneEchoRenderMode;
}

const ECHO_REGEX = /@([^\s{}()@]+)(?:\{([^}]*)\})?\(([^)]*)\)/g;
const RUNE_DIV_REGEX = /<div\b([^>]*\bdata-rune-name=[^>]*)>([\s\S]*?)<\/div>/g;
/** 代码块 / 行内代码不参与替换，避免把示例语法渲染成卡片。 */
const CODE_REGEX = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;
const TAG_REGEX = /(<[^>]+>)/;

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function unescapeHtml(value: string): string {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readAttr(attrs: string, name: string): string {
  const matched = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`));
  if (!matched) return '';
  return unescapeHtml(matched[2] ?? matched[3] ?? '');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function trimText(value: string, limit: number): string {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** 只在代码块之外执行替换，代码块原样保留。 */
function mapOutsideCode(source: string, fn: (chunk: string) => string): string {
  return source
    .split(CODE_REGEX)
    .map((chunk, index) => (index % 2 === 1 ? chunk : fn(chunk)))
    .join('');
}

/** 只在标签之外执行替换，避免改动 HTML 属性里的内容。 */
function mapOutsideTags(source: string, fn: (chunk: string) => string): string {
  return source
    .split(TAG_REGEX)
    .map((chunk, index) => (index % 2 === 1 ? chunk : fn(chunk)))
    .join('');
}

function findRune(catalog: RuneEchoCatalog, name: string, id: string): RuneCard | null {
  return (
    catalog.runes.find((card) => card.name === name) ||
    catalog.runes.find((card) => card.id === id) ||
    null
  );
}

function findEcho(catalog: RuneEchoCatalog, name: string): EchoCard | null {
  return catalog.echoes.find((card) => card.name === name) || null;
}

export function renderRuneCard(input: {
  name: string;
  id: string;
  nodeId: string;
  value: string;
  text: string;
  card: RuneCard | null;
}): string {
  const title = input.card?.name || input.name;
  const color = input.card?.color || '#3b82f6';
  const icon = input.card?.icon || '✦';
  const body = trimText(input.value || input.text, 80);
  const desc = trimText(input.card?.desc || '', 80);
  return (
    `<span class="ag-rune ag-rune--${slug(input.name)}"` +
    ` data-rune-name="${escapeAttr(input.name)}"` +
    ` data-rune-id="${escapeAttr(input.id)}"` +
    ` data-rune-node-id="${escapeAttr(input.nodeId)}"` +
    ` data-rune-value="${escapeAttr(input.value)}"` +
    ` data-rune-action="rune-click"` +
    ` style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border:1px dashed ${escapeAttr(color)};border-radius:4px;font-size:0.9em;background:rgba(59,130,246,0.06)">` +
    `<span class="ag-rune__icon">${escapeHtml(icon)}</span>` +
    `<span class="ag-rune__title" style="color:${escapeAttr(color)};font-weight:600">${escapeHtml(title)}</span>` +
    (body ? `<span class="ag-rune__value">${escapeHtml(body)}</span>` : '') +
    (desc ? `<span class="ag-rune__desc" style="color:#6b7280;font-size:0.85em">${escapeHtml(desc)}</span>` : '') +
    `</span>`
  );
}

export function renderEchoCard(input: {
  name: string;
  attrs: string;
  prompt: string;
  card: EchoCard;
}): string {
  const color = input.card.color || '#f59e0b';
  const icon = input.card.icon || '✦';
  const summary = trimText(input.prompt, 120);
  return (
    `<span class="ag-echo ag-echo--${slug(input.name)}"` +
    ` data-echo-name="${escapeAttr(input.name)}"` +
    ` data-echo-attrs="${escapeAttr(input.attrs)}"` +
    ` data-echo-prompt="${escapeAttr(input.prompt)}"` +
    ` data-echo-action="echo-click"` +
    ` style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;margin:0 2px;border-radius:4px;border-left:3px solid ${escapeAttr(color)};font-size:0.9em;background:rgba(107,114,128,0.08)">` +
    `<span class="ag-echo__icon">${escapeHtml(icon)}</span>` +
    `<span class="ag-echo__title" style="font-weight:600">${escapeHtml(input.card.name || input.name)}</span>` +
    (summary ? `<span class="ag-echo__summary" style="color:#6b7280;font-size:0.85em">${escapeHtml(summary)}</span>` : '') +
    `</span>`
  );
}

/** 符文定义 → base64 JSON，避免在 Markdown 属性里处理引号与换行。 */
function encodeDefinition(card: RuneCard | null): string {
  if (!card || !card.template) return '';
  const payload = {
    id: card.id,
    name: card.name,
    desc: card.desc,
    color: card.color,
    icon: card.icon,
    template: card.template,
    category: card.category,
    inheritFromPrevious: card.inheritFromPrevious,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function renderRuneComponent(input: {
  name: string;
  id: string;
  nodeId: string;
  value: string;
  card: RuneCard | null;
}): string {
  const definition = encodeDefinition(input.card);
  return (
    `<RuneHost name="${escapeAttr(input.name)}"` +
    ` value="${escapeAttr(input.value)}"` +
    ` rune-id="${escapeAttr(input.id)}"` +
    ` node-id="${escapeAttr(input.nodeId)}"` +
    (definition ? ` definition="${definition}"` : '') +
    `></RuneHost>`
  );
}

function readEchoField(source: string): string {
  const matched = String(source || '').match(/field\s*:\s*['"]([^'"]+)['"]/);
  return matched ? matched[1] : '';
}

export function renderEchoComponent(input: {
  name: string;
  attrs: string;
  prompt: string;
  card: EchoCard;
}): string {
  const field = readEchoField(input.card.annoSource);
  return (
    `<EchoHost name="${escapeAttr(input.name)}"` +
    ` attrs="${escapeAttr(input.attrs)}"` +
    ` prompt="${escapeAttr(input.prompt)}"` +
    (field ? ` field="${escapeAttr(field)}"` : '') +
    `></EchoHost>`
  );
}

/**
 * 把一篇笔记正文里的 rune 占位与 echo 标记改写为静态卡片。
 * 未知 echo 名原样保留（避免把邮箱、代码里的 `@xx(...)` 误伤）。
 */
export function transformRuneEcho(
  markdown: string,
  catalog: RuneEchoCatalog,
  options: RuneEchoOptions = {},
): { content: string; stats: RuneEchoStats } {
  const stats: RuneEchoStats = { runes: 0, echoes: 0 };
  const mode: RuneEchoRenderMode = options.mode === 'component' ? 'component' : 'static';

  const runeRendered = mapOutsideCode(markdown, (chunk) =>
    chunk.replace(RUNE_DIV_REGEX, (whole, attrs: string, inner: string) => {
      const name = readAttr(attrs, 'data-rune-name');
      if (!name) return whole;
      stats.runes += 1;
      const payload = {
        name,
        id: readAttr(attrs, 'data-rune-id'),
        nodeId: readAttr(attrs, 'data-rune-node-id'),
        value: readAttr(attrs, 'data-rune-value'),
        text: inner.replace(/<[^>]+>/g, ''),
        card: findRune(catalog, name, readAttr(attrs, 'data-rune-id')),
      };
      return mode === 'component' ? renderRuneComponent(payload) : renderRuneCard(payload);
    }),
  );

  const echoRendered = mapOutsideCode(runeRendered, (chunk) =>
    mapOutsideTags(chunk, (text) =>
      text.replace(ECHO_REGEX, (whole, name: string, attrs: string, prompt: string) => {
        const card = findEcho(catalog, name);
        if (!card) return whole;
        stats.echoes += 1;
        const payload = { name, attrs: attrs || '', prompt: prompt || '', card };
        return mode === 'component' ? renderEchoComponent(payload) : renderEchoCard(payload);
      }),
    ),
  );

  return { content: echoRendered, stats };
}
