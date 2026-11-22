// 这个文件是 CJS（module.exports），这里用 require 保持模块形态不变
const { httpFetch } = require('../../http')

const MAX_BODY_BYTES = 5 * 1024 * 1024
const CODE = Object.freeze({ INVALID_URL: 'INVALID_URL', FETCH_FAILED: 'FETCH_FAILED', TOO_LARGE: 'TOO_LARGE', EMPTY_BODY: 'EMPTY_BODY' })

function toRawGithubUrl (input) {
  let url
  try { url = new URL(input) } catch (_) { return null }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'gist.githubusercontent.com') return url.href
  if (url.hostname !== 'github.com') return null
  const [owner, repo, action, branch, ...file] = url.pathname.slice(1).split('/')
  if (!owner || !repo || !['blob', 'raw'].includes(action) || !branch || !file.length) return null
  return ['https://raw.githubusercontent.com', owner, repo, branch, ...file].join('/')
}

async function fetchRemoteText (input) {
  const url = toRawGithubUrl(input)
  if (!url) return { success: false, code: CODE.INVALID_URL, message: '只支持 GitHub HTTPS 源码链接' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const result = await httpFetch(url, { redirect: 'error', credentials: 'omit', signal: controller.signal, maxBytes: MAX_BODY_BYTES })
    if (!result.ok) throw new Error('HTTP ' + result.status)
    const reader = result.body.getReader()
    const decoder = new TextDecoder()
    let size = 0
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        controller.abort()
        return { success: false, code: CODE.TOO_LARGE, message: '文件超过 5 MB' }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    if (!text.trim()) return { success: false, code: CODE.EMPTY_BODY, message: '远端返回内容为空' }
    return { success: true, text, finalUrl: url }
  } catch (error) {
    return { success: false, code: CODE.FETCH_FAILED, message: error.message }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { toRawGithubUrl, fetchRemoteText, CODE, MAX_BODY_BYTES }
