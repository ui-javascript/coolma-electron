/**
 * AI 回复追加到当前编辑器的最小事件桥。
 *
 * 对齐 vue2 `appBus.INSERT_AI_TEXT`：AI 面板不直接拿编辑器实例，
 * 只广播文本；由当前挂载的 EditorPane 决定落到 Muya 还是 Monaco。
 */
export type AiInsertMode = 'append' | 'replace';
type Handler = (text: string, mode: AiInsertMode) => boolean | void;

const handlers = new Set<Handler>();

export function onAiInsert(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** mode：append 保留 vue2 的末尾追加；replace 为整篇覆盖（调用方需先确认）。 */
export function emitAiInsert(text: string, mode: AiInsertMode = 'append'): boolean {
  let handled = false;
  for (const handler of handlers) {
    try {
      if (handler(text, mode) === true) {
        handled = true;
      }
    } catch (error) {
      console.warn('[ai-insert] handler failed', (error as Error).message);
    }
  }
  return handled;
}
