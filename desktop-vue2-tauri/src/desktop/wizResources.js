import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'

function resourcePath (kbGuid, docGuid, name) {
  return [kbGuid, docGuid, name].map(encodeURIComponent).join('/')
}

export function wizResourceUrl (kbGuid, docGuid, name) {
  const path = resourcePath(kbGuid, docGuid, name)
  return isTauri()
    ? convertFileSrc('', 'coolma-resource') + path
    : 'coolma://coolma.app/' + path
}

export async function cacheWizResource (kbGuid, docGuid, name, file) {
  if (!isTauri()) return
  await invoke('wiznote_cache_file', await file.arrayBuffer(), {
    headers: { 'x-coolma-resource': resourcePath(kbGuid, docGuid, name) }
  })
}
