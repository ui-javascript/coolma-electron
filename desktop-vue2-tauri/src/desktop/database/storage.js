import { invoke, isTauri } from '@tauri-apps/api/core'

// Browser preview keeps its own test data; the desktop build uses an atomic
// SQLite file in its application data directory.
let browserDatabase
function openPreview () {
  if (!browserDatabase) {
    browserDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('coolma-tauri-preview', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return browserDatabase
}

async function preview (mode, callback) {
  const db = await openPreview()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', mode)
    const request = callback(transaction.objectStore('snapshots'))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function loadSnapshot () {
  const bytes = isTauri()
    ? await invoke('database_read')
    : await preview('readonly', store => store.get('memocast.db'))
  return new Uint8Array(bytes || 0)
}

export function writeSnapshot (bytes) {
  return isTauri()
    ? invoke('database_write', bytes)
    : preview('readwrite', store => store.put(bytes, 'memocast.db'))
}
