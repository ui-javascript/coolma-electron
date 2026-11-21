import { getCurrentWindow } from '@tauri-apps/api/window'
import { request, onSidecarEvent } from './sidecar'

/**
 * 博客构建 / SFTP 通道。原版由主进程 child_process + ssh2 完成，
 * Tauri 侧交给 Node sidecar，事件名与载荷保持原样。
 */

const FORWARDED_EVENTS = [
  'blog-deploy-progress',
  'blog-deploy-done',
  'blog-deploy-warn',
  'sftp-upload-progress'
]

let forwarding = false

/**
 * 对齐原版 blog-deploy-handler.js:95/102 的 `win.setProgressBar`：
 * 构建中把百分比打到任务栏，结束（成功或失败）清掉。
 * 抽成纯函数，方便单测；返回 null 表示这次事件不改进度条。
 */
export function taskbarState (channel, data) {
  if (channel === 'blog-deploy-progress') {
    const percent = Number(data && data.percent)
    if (!Number.isFinite(percent)) return null
    return { status: 'normal', progress: Math.min(Math.max(percent / 100, 0), 1) }
  }
  if (channel === 'blog-deploy-done' || channel === 'blog-deploy-warn') {
    return { status: 'none' }
  }
  return null
}

function updateTaskbar (channel, data) {
  const state = taskbarState(channel, data)
  if (!state) return
  getCurrentWindow()
    .setProgressBar(state)
    .catch(error => console.warn('[blog] 任务栏进度设置失败', error))
}

function forwardEvents (emit) {
  if (forwarding || typeof emit !== 'function') return
  forwarding = true
  for (const channel of FORWARDED_EVENTS) {
    onSidecarEvent(channel, data => {
      updateTaskbar(channel, data)
      emit(channel, data)
    })
  }
}

export async function startBlogDeploy (payload = {}, emit) {
  forwardEvents(emit)
  return request('blog.start', payload)
}

export async function cancelBlogDeploy (emit) {
  forwardEvents(emit)
  return request('blog.cancel', {})
}

export async function sftpTestConnection (payload = {}, emit) {
  forwardEvents(emit)
  return request('sftp.test', { config: payload.config || payload })
}

export async function sftpUpload (payload = {}, emit) {
  forwardEvents(emit)
  return request('sftp.upload', { config: payload.config, localDir: payload.localDir })
}
