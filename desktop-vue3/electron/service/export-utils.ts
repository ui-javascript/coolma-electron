/**
 * 导出文件名清洗（对齐 vue2：标题即文件名，非法字符替换掉，空标题兜底）。
 * 保持纯函数，方便直接断言，不依赖 Electron。
 */
export function sanitizeFileName(title: string, fallback = 'Untitled'): string {
  const raw = String(title ?? '').trim() || fallback;
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || fallback;
}

export function markdownFileName(title: string): string {
  return `${sanitizeFileName(title)}.md`;
}

/** 导出 PNG 时把 dataURL 的 base64 主体剥出来（主进程按二进制写盘）。 */
export function stripDataUrlBase64(dataUrl: string): string {
  const raw = String(dataUrl ?? '');
  const comma = raw.indexOf(',');
  return comma >= 0 ? raw.slice(comma + 1) : raw;
}
