/**
 * AI 回复追加到当前编辑器的最小事件桥。
 *
 * 对齐 vue2 `appBus.INSERT_AI_TEXT`：AI 面板不直接拿编辑器实例，
 * 只广播文本；由当前挂载的 EditorPane 决定落到 Muya 还是 Monaco。
 */
type Handler = (text: string) => boolean | void;

const handlers = new Set<Handler>();

export function onAiInsert(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** 返回是否有编辑器真正接住了这段文本。 */
export function emitAiInsert(text: string): boolean {
  let handled = false;
  for (const handler of handlers) {
    try {
      if (handler(text) === true) {
        handled = true;
      }
    } catch (error) {
      console.warn('[ai-insert] handler failed', (error as Error).message);
    }
  }
  return handled;
}
