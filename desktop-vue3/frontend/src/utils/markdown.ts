/**
 * AI 回复的 Markdown 渲染，对齐 vue2 `MarkdownRenderer`：
 * markdown-it（html=false + linkify + typographer）+ Prism 语言高亮。
 *
 * 只用于对话内容展示。Muya 正文仍由编辑器自己的解析链路负责。
 */
import MarkdownIt from 'markdown-it';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

function highlightCode(code: string, language: string): string {
  const lang = language && Prism.languages[language] ? language : 'plaintext';
  if (lang === 'plaintext') {
    return escapeHtml(code);
  }
  try {
    return Prism.highlight(code, Prism.languages[lang], lang);
  } catch {
    return escapeHtml(code);
  }
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, language): string {
    const highlighted = highlightCode(code, language);
    const languageClass = language ? ` language-${language}` : '';
    return `<pre class="code-block"><code class="${languageClass}">${highlighted}</code></pre>`;
  },
});

/** 将 AI 回复渲染成可安全 v-html 的 HTML。 */
export function renderMarkdown(text: string): string {
  if (!text) {
    return '';
  }
  try {
    return md.render(text);
  } catch {
    return escapeHtml(text);
  }
}

export default { renderMarkdown };
