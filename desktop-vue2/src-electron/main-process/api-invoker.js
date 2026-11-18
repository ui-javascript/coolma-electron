import { webContents, BrowserWindow } from 'electron'

async function sendNotification (notificationPayload, event) {
  let wcs = BrowserWindow.fromWebContents(event.sender)?.webContents
  if (!wcs) {
    wcs = webContents.getFocusedWebContents()
  }
  return wcs?.send('show-notification', notificationPayload)
}

async function triggerRendererContextMenu (eventName, eventData, event, contextData) {
  let wcs = BrowserWindow.fromWebContents(event.sender)?.webContents
  if (!wcs) {
    wcs = webContents.getFocusedWebContents()
  }
  console.log('triggerRendererContextMenu', eventName, eventData, 'contextData=', contextData)
  // 透传右键菜单的真实上下文（category 等）：
  // - 如果 actions.js 已经显式填了 eventData（packClickFunction 第二参数），以 eventData 为准
  // - 否则用 contextData 兜底（之前完全丢失，导致 NoteList.vue 拿不到右键 category）
  const mergedEventData = (eventData != null)
    ? eventData
    : (contextData || null)
  return wcs?.send('pop-context-menu-event', {
    eventName,
    eventData: mergedEventData
  })
}

// async function requestResourceTempUrl (kbGuid, docGuid, resName) {
//   if (!wcs) {
//     wcs = webContents.getFocusedWebContents()
//   }
//   return wcs.send('request-resource-temp-url', { kbGuid, docGuid, resName })
// }

export {
  sendNotification,
  triggerRendererContextMenu
}
