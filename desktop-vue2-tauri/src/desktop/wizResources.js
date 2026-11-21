import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'

function resourceBase () {
  return convertFileSrc('', 'coolma-resource')
}

/** 运行形态前缀（读库后把正文里的规范地址换成它）。 */
export function resourceUrlBase () {
  return isTauri() ? resourceBase() : 'coolma://coolma.app/'
}

function resourcePath (kbGuid, docGuid, name) {
  return [kbGuid, docGuid, name].map(encodeURIComponent).join('/')
}

export function wizResourceUrl (kbGuid, docGuid, name) {
  const path = resourcePath(kbGuid, docGuid, name)
  return isTauri()
    ? resourceBase() + path
    : 'coolma://coolma.app/' + path
}

/**
 * 把本地绝对路径转成可加载的 URL。
 *
 * Tauri 侧 WebView2 不允许页面直接读 `file://`，原版 Electron 是靠
 * `electron-main.js:3932` 的 `interceptFileProtocol('file')` 全盘放开才可用的。
 * 这里改走 `coolma-resource` 的 `local/abs/` 路由，服务端只放行应用数据目录、
 * 应用根目录与系统临时目录（见 `wiz_resources::local_file`），其余返回 403。
 */
export function localFileUrl (target) {
  if (typeof target !== 'string' || !target) return ''
  // 已经是 URL（http/data/blob/自定义协议等）就原样返回，避免二次编码
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    if (!target.startsWith('file:')) return target
    // file:// 转成协议地址，必要时先剥掉 scheme 与多余斜杠
    const stripped = target.replace(/^file:\/{2,}/i, '')
    return localFileUrl(safeDecode(stripped))
  }
  const normalized = target.replace(/\\/g, '/')
  if (!isTauri()) return target
  return resourceBase() + 'local/abs/' + encodeURIComponent(normalized)
}

function safeDecode (value) {
  try {
    return decodeURIComponent(value)
  } catch (e) {
    return value
  }
}

export async function cacheWizResource (kbGuid, docGuid, name, file) {
  if (!isTauri()) return
  await invoke('wiznote_cache_file', await file.arrayBuffer(), {
    headers: { 'x-coolma-resource': resourcePath(kbGuid, docGuid, name) }
  })
}
