/**
 * OpenAI-compatible SSE 增量解析（纯函数，主进程与测试共用）。
 *
 * 只取 `data:` 行；事件边界交给调用方按换行缓冲处理。
 * `[DONE]` 原样返回，由调用方判断收尾。
 */
export interface SseDrainResult {
  lines: string[];
  rest: string;
}

export function drainSseDataLines(buffer: string): SseDrainResult {
  const text = String(buffer ?? '');
  const parts = text.split('\n');
  const rest = parts.pop() ?? '';
  const lines: string[] = [];
  for (const part of parts) {
    const line = part.replace(/\r$/, '');
    if (!line.startsWith('data:')) {
      continue;
    }
    const data = line.slice(5).trim();
    if (data) {
      lines.push(data);
    }
  }
  return { lines, rest };
}

/** 从流式 `delta.content` 取文本；兼容字符串与分段数组。 */
export function extractDeltaText(delta: unknown): string {
  if (!delta || typeof delta !== 'object') {
    return '';
  }
  const content = (delta as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : String((part as { text?: unknown })?.text ?? '')))
      .join('');
  }
  return '';
}
