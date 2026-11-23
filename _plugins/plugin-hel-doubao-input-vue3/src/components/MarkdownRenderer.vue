<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  content: string;
}

const props = defineProps<Props>();

// Simple markdown to HTML conversion
const htmlContent = computed(() => {
  let html = props.content;
  
  // Escape HTML first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Code blocks (```code```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });
  
  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold (**text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // Paragraphs - wrap lines that aren't already wrapped
  html = html
    .split('\n\n')
    .map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<') && para.endsWith('>')) return para;
      return `<p>${para.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
  
  return html;
});
</script>

<template>
  <div class="markdown-renderer" v-html="htmlContent"></div>
</template>

<style lang="scss" scoped>
.markdown-renderer {
  font-family: var(--s-font-family, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 15px;
  line-height: 1.6;
  color: inherit;
  
  :deep(h1) {
    font-size: 1.5em;
    font-weight: 600;
    margin: 0.5em 0;
  }
  
  :deep(h2) {
    font-size: 1.3em;
    font-weight: 600;
    margin: 0.5em 0;
  }
  
  :deep(h3) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0.5em 0;
  }
  
  :deep(p) {
    margin: 0.5em 0;
  }
  
  :deep(ul), :deep(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }
  
  :deep(li) {
    margin: 0.25em 0;
  }
  
  :deep(code) {
    background: rgba(0, 0, 0, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
    font-size: 0.9em;
  }
  
  :deep(pre) {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 12px 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0.75em 0;
    font-size: 13px;
    line-height: 1.5;
    
    code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
  }
  
  :deep(a) {
    color: var(--s-color-brand-primary-default, #0057ff);
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
  
  :deep(blockquote) {
    margin: 0.5em 0;
    padding-left: 1em;
    border-left: 3px solid var(--s-color-border-secondary, rgba(0,0,0,0.1));
    color: var(--s-color-text-secondary, rgba(0,0,0,0.7));
  }
  
  :deep(img) {
    max-width: 100%;
    border-radius: 8px;
    margin: 0.5em 0;
  }
}
</style>
