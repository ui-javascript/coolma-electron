import { isTauri, openExternal, revealPath, openFolder } from 'src/desktop/nativeFs'
import { refreshThemeFolder } from 'src/desktop/theme'
import { installKeyboardShortcuts } from 'src/desktop/keyboard'
import { installLogging } from 'src/desktop/logger'
import { reportLastCrash } from 'src/desktop/crash'
import { readText as readClipboardText, writeText as writeClipboardText } from 'src/desktop/clipboard'
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
      writeText: text => { writeClipboardText(text) },
      readText: () => readClipboardText()
    }
  }
}

export default ({ Vue }) => {
  if (!isTauri()) return
  installElectronShell(Vue.prototype.$q)
  installKeyboardShortcuts()
  installLogging()
  // 上次进程没正常走完的话，这里弹一条带「查看日志」的提示
  reportLastCrash()
  // 原版由主进程在建窗时把主题列表写进 electron-store。这里放到启动后台跑：
  // 主题列表只有打开「设置」时才用，没必要卡在 boot 链上等 IPC 扫描目录。
  refreshThemeFolder()
    .then(themes => {
      if (themes.length) ClientFileStorage.setItemInStore('themes', themes)
    })
    .catch(error => {
      console.warn('[tauri-desktop] 主题目录扫描失败', error)
    })
}
