/** 搜索命中片段：截断 + 把关键词标成高亮需要的纯文本（模板里再强调） */
export function highlightSnippet(text: string, keyword: string, maxLength = 80): string {
  const plain = String(text ?? '').replace(/\s+/g, ' ').trim();
  const word = String(keyword ?? '').trim();
  if (!plain) {
    return '';
  }
  if (!word) {
    return plain.slice(0, maxLength);
  }
  const index = plain.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) {
    return plain.slice(0, maxLength);
  }
  const start = Math.max(0, index - 20);
  const end = Math.min(plain.length, start + maxLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plain.length ? '…' : '';
  return `${prefix}${plain.slice(start, end)}${suffix}`;
}
