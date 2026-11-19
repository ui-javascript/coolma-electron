/** busDialog 的事件总线（复刻 vue2 busDialogBus：一个只有 on/off/emit 的小发射器）。 */
type Handler = (payload?: unknown) => void;

const handlers = new Map<string, Set<Handler>>();

export const busDialogBus = {
  on(event: string, handler: Handler): () => void {
    const set = handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    handlers.set(event, set);
    return () => busDialogBus.off(event, handler);
  },
  off(event: string, handler: Handler): void {
    handlers.get(event)?.delete(handler);
  },
  emit(event: string, payload?: unknown): void {
    handlers.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.warn('[busDialog] handler threw:', error);
      }
    });
  },
};
