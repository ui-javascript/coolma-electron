import { isTauri, openExternal, revealPath, openFolder } from 'src/desktop/nativeFs'
import { refreshThemeFolder } from 'src/desktop/theme'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'

/**
 * Electron 版里 `$q.electron` 由 Quasar 的 Electron 模式注入。
 * Tauri 版是 SPA 模式，这里补一层同形兼容实现，避免调用处直接抛 TypeError。
 */
function installElectronShell ($q) {
  if (!isTauri() || !$q || $q.electron) return
  $q.electron = {
    shell: {
      openExternal: url => { openExternal(url).catch(console.warn) },
      showItemInFolder: path => { revealPath(path).catch(console.warn) },
      openPath: path => { openFolder(path).catch(console.warn) }
    },
    clipboard: {
      writeText: text => { navigator.clipboard.writeText(String(text)).catch(console.warn) }
    }
  }
}

export default async ({ Vue }) => {
  if (!isTauri()) return
  installElectronShell(Vue.prototype.$q)
  // 原版由主进程在建窗时把主题列表写进 electron-store，这里在启动阶段补做一次。
  const themes = await refreshThemeFolder().catch(error => {
    console.warn('[tauri-desktop] 主题目录扫描失败', error)
    return []
  })
  if (themes.length) ClientFileStorage.setItemInStore('themes', themes)
}
