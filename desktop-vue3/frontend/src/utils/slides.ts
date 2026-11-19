/**
 * Markdown → 演示稿切片（对齐 vue2 previewPptDialog 的纯逻辑部分）。
 * 这里刻意不依赖 DOM / reveal.js，方便单测：组件只负责把 HTML 丢给 reveal 渲染。
 */
export type SlideSplitMode = 'manual' | 'auto';

const SLIDE_SEPARATOR_RE = /^---\s*$/m;
const VERTICAL_SEPARATOR_RE = /^--\s*$/m;
const HEADING_RE = /^(#{1,2})\s+(.+)$/;

/** 与引擎 libs-muya 的 escapeHtml 保持一致，避免两个来源的转义结果不同。 */
export function escapeSlideHtml(html: string): string {
  return String(html ?? '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdownSection(content = ''): string {
  return `
        <section data-markdown>
          <textarea data-template>${escapeSlideHtml(content.trim() || ' ')}</textarea>
        </section>
      `;
}

/** 按一二级标题切页（vue2 的「按标题切页」模式）。 */
export function buildAutoSlidesHtml(markdown = ''): string {
  const lines = String(markdown).split('\n');
  const sections: string[] = [];
  let currentSection: string[] = [];

  lines.forEach((line) => {
    if (HEADING_RE.test(line) && currentSection.length) {
      sections.push(currentSection.join('\n').trim());
      currentSection = [line];
      return;
    }
    currentSection.push(line);
  });

  if (currentSection.length) {
    sections.push(currentSection.join('\n').trim());
  }

  const normalizedSections = sections.filter(Boolean);
  if (!normalizedSections.length) {
    return renderMarkdownSection(markdown);
  }
  return normalizedSections.map((section) => renderMarkdownSection(section)).join('');
}

export interface BuildSlidesOptions {
  markdown: string;
  splitMode: SlideSplitMode;
  emptyTitle: string;
  emptyHint: string;
}

/**
 * 手动分片：`---` 切横向页，`--` 切纵向页（与 vue2 的正则一致）。
 */
export function buildSlidesHtml(options: BuildSlidesOptions): string {
  const normalized = String(options.markdown || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return `
          <section data-markdown>
            <textarea data-template>
# ${options.emptyTitle}

${options.emptyHint}
            </textarea>
          </section>
        `;
  }

  if (options.splitMode === 'auto') {
    return buildAutoSlidesHtml(normalized);
  }

  return normalized
    .split(SLIDE_SEPARATOR_RE)
    .map((section) => {
      const trimmedSection = section.trim();
      if (!trimmedSection) {
        return '';
      }
      const verticalSlides = trimmedSection.split(VERTICAL_SEPARATOR_RE);
      if (verticalSlides.length === 1) {
        return renderMarkdownSection(verticalSlides[0]);
      }
      return `<section>${verticalSlides.map((slide) => renderMarkdownSection(slide)).join('')}</section>`;
    })
    .join('');
}

export interface BuildPrintDocumentOptions {
  slidesHtml: string;
  title: string;
  mode?: 'native' | 'pdf';
}

/**
 * 导出用的独立 HTML：走 CDN 的 reveal.js，交给浏览器窗口打印 / 另存 PDF。
 * 与 vue2 buildPrintDocument 同构（含 print-pdf 分支）。
 */
export function buildPrintDocument(options: BuildPrintDocumentOptions): string {
  const isPdfMode = options.mode === 'pdf';
  const pdfStyle = isPdfMode
    ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/print-pdf/print-pdf.css" media="print">'
    : '';
  const initConfig = isPdfMode
    ? {
        plugins: ['RevealMarkdown', 'RevealHighlight', 'RevealNotes'],
        pdfSeparateFragments: false,
        showNotes: false,
        margin: 0.04,
      }
    : {
        plugins: ['RevealMarkdown', 'RevealHighlight', 'RevealNotes'],
        pdfSeparateFragments: false,
      };
  const afterInit = isPdfMode ? '' : 'window.print();';

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeSlideHtml(options.title)}</title>`,
    '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.css">',
    '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/theme/white.css">',
    '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/highlight/monokai.css">',
    `  ${pdfStyle}`,
    '  <style>',
    '    body { margin: 0; background: #111827; }',
    '    .reveal { height: 100vh; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="reveal">',
    '    <div class="slides">',
    options.slidesHtml,
    '    </div>',
    '  </div>',
    '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.js"></script>',
    '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/markdown/markdown.js"></script>',
    '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/highlight/highlight.js"></script>',
    '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/notes/notes.js"></script>',
    '  <script>',
    `    const rawConfig = ${JSON.stringify(initConfig)};`,
    '    const pluginMap = {',
    '      RevealMarkdown,',
    '      RevealHighlight,',
    '      RevealNotes',
    '    };',
    '    const deckConfig = Object.assign({}, rawConfig, {',
    '      plugins: (rawConfig.plugins || []).map(name => pluginMap[name]).filter(Boolean)',
    '    });',
    '    const deck = new Reveal(deckConfig);',
    '    deck.initialize().then(() => {',
    `      ${afterInit}`,
    '    });',
    '  </script>',
    '</body>',
    '</html>',
  ].join('\n');
}
