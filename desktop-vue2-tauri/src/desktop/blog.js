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

function forwardEvents (emit) {
  if (forwarding || typeof emit !== 'function') return
  forwarding = true
  for (const channel of FORWARDED_EVENTS) {
    onSidecarEvent(channel, data => emit(channel, data))
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
