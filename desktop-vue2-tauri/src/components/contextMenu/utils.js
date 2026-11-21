/**
 * 把右键菜单项包装成 { eventName, eventData } 交给主进程。
 *
 * 设计：
 * - 默认 eventData = null（让主进程 injectClickFunction 阶段用 contextData 兜底透传 category）
 * - 上层 handler（NoteList.deleteCategoryHandler 等）从 eventData.category 取值。
 * - 调用方也可以显式传一个非 null eventData 覆盖。
 *
 * 旧 API 兼容：第二个参数传 string 时，把它当成 category 用。
 */
export function packClickFunction (eventName, eventData = null) {
  let finalEventData = eventData
  if (typeof eventData === 'string') {
    finalEventData = { category: eventData }
  }
  return {
    eventName,
    eventData: finalEventData
  }
}
