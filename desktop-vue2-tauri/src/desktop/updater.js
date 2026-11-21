import { isTauri } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'

/**
 * 自动更新：把 Tauri updater 的事件桥接成原版 Electron 的通道语义。
 * 流程与原版一致：check-update 立即返回，结果通过事件回推；
 * need-update(true) 只下载，quit-and-install 才真正安装（Windows 会退出应用）。
 * 更新源是 GitHub Release 里的 latest.json，签名由 tauri.conf.json 的 pubkey 校验。
 */

let pending = null
let downloading = false

function errorMessage (error) {
  if (!error) return 'unknown'
  return error.message || String(error)
}

function infoOf (update) {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    releaseNotes: update.body || '',
    date: update.date || ''
  }
}

async function runCheck (emit) {
  try {
    if (pending) {
      try {
        await pending.close()
      } catch (error) {
        console.warn('[updater] 关闭旧更新句柄失败:', error)
      }
      pending = null
    }
    const update = await check()
    if (update) {
      pending = update
      emit('updater-update-available', infoOf(update))
    } else {
      emit('updater-update-not-available')
    }
  } catch (error) {
    emit('updater-update-error', errorMessage(error))
  }
}

export function checkUpdate (emit) {
  if (!isTauri()) return undefined
  // 原版 invoke 立即返回，渲染层随后才弹出“检查中”提示，所以这里不 await。
  runCheck(emit)
  return undefined
}

export async function downloadUpdate (emit) {
  if (!isTauri() || downloading) return
  try {
    let update = pending
    if (!update) {
      update = await check()
    }
    if (!update) {
      emit('updater-update-not-available')
      return
    }
    pending = update
    downloading = true
    let total = 0
    let transferred = 0
    let sampleAt = Date.now()
    let sampleBytes = 0
    let speed = 0

    await update.download(event => {
      if (event.event === 'Started') {
        total = event.data.contentLength || 0
        transferred = 0
        sampleAt = Date.now()
        sampleBytes = 0
        return
      }
      if (event.event === 'Progress') {
        transferred += event.data.chunkLength
        const now = Date.now()
        if (now - sampleAt >= 500) {
          speed = Math.round((transferred - sampleBytes) * 1000 / (now - sampleAt))
          sampleAt = now
          sampleBytes = transferred
        }
        emit('updater-update-downloading', {
          percent: total ? Math.min(99, (transferred / total) * 100) : 0,
          bytesPerSecond: speed,
          transferred,
          total
        })
        return
      }
      emit('updater-update-downloading', { percent: 100, bytesPerSecond: 0, transferred: total, total })
    })
    downloading = false
    emit('updater-update-downloaded', infoOf(update))
  } catch (error) {
    downloading = false
    emit('updater-update-error', errorMessage(error))
  }
}

export async function installUpdate (emit) {
  if (!isTauri() || !pending) return
  try {
    // Windows 上这里会拉起安装器并退出应用，macOS/Linux 需要重启才生效。
    await pending.install()
    pending = null
  } catch (error) {
    emit('updater-update-error', errorMessage(error))
  }
}
