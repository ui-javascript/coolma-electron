/**
 * MarkdownRenderer - Markdown 渲染服务
 *
 * 支持：
 * - 标准 Markdown 渲染（标题、列表、链接等）
 * - 代码块语法高亮（使用 prismjs）
 */

import MarkdownIt from 'markdown-it'
import Prism from 'prismjs'

// 加载常用语言
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'

let md = null

/**
 * HTML 转义
 */
function escapeHtml (text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

/**
 * 语法高亮
 */
function highlightCode (code, language) {
  const lang = language && Prism.languages[language] ? language : 'plaintext'
  let highlighted

  if (lang === 'plaintext') {
    highlighted = escapeHtml(code)
  } else {
    try {
      highlighted = Prism.highlight(code, Prism.languages[lang], lang)
    } catch (err) {
      highlighted = escapeHtml(code)
    }
  }

  return highlighted
}

/**
 * 初始化 Markdown 渲染器
 */
export function initMarkdownRenderer () {
  if (md) return

  md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      const highlighted = highlightCode(str, lang)
      const languageClass = lang ? ` language-${lang}` : ''
      return `<pre class="code-block"><code class="${languageClass}">${highlighted}</code></pre>`
    }
  })
}

/**
 * 解析 Markdown 并返回 HTML
 */
export function renderMarkdown (text) {
  if (!md) {
    initMarkdownRenderer()
  }

  if (!text) return ''

  try {
    return md.render(text)
  } catch (err) {
    console.warn('[MarkdownRenderer] Render error:', err)
    return escapeHtml(text)
  }
}

/**
 * 销毁渲染器
 */
export function disposeAll () {
  md = null
}

export default {
  initMarkdownRenderer,
  renderMarkdown,
  disposeAll
}
