/**
 * remote-fetch - GitHub raw URL 抓取共享 helper
 *
 * 设计目标：
 *   1. 单一来源：rune-template-service.importFromRemote（单文件 .vue）、rune-pack fetchRemote、
 *      echo-pack fetchRemote 都共用一份 URL 规范化 + 抓取逻辑，避免 3 处手写 https.get 漂移。
 *   2. 安全边界：只允许 github.com / raw.githubusercontent.com / gist.githubusercontent.com，
 *      防止 SSRF（拒绝 file://、localhost、内网 IP、任意 https 主机）。
 *   3. 错误契约：返回 { success, code, message, text? }；调用方按 code 决定 UI 文案。
 *
 * 不做：
 *   - 不做 JSON 解析（交给各 *Pack service.parseXxxPack 兜底，错误码语义保持一致）
 *   - 不写 SQLite / electron-store（仅负责"URL → 文本"）
 *
 * 抽离原因（v2026-08-01）：
 *   原 rune-template-service.js 里 toRawGithubUrl + fetchTextWithRedirects 写在同文件，
 *   当 rune-pack / echo-pack 需要复用同一份抓取逻辑时，要么复制粘贴漂移，要么从 rune-template-service
 *   跨服务 require（容易把无关的 DB 依赖拖进来）。拆成独立 module 让 3 处调用方都按需 require。
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

// 8 层重定向足够 GitHub 的 raw → raw → codeload 跳转链；超出则报错。
const MAX_REDIRECTS = 8

// 抓取上限 5 MB：与 RuneImportService / EchoImportService 的 MAX_FILE_BYTES 保持一致。
// 注意：单 rune template 的 MAX_BODY_BYTES 是 1 MB（rune-template-service 单独定义），
// 这里 5 MB 故意放宽，因为 rune-pack / echo-pack 是 JSON 文件，可能比单 .vue 大。
const MAX_BODY_BYTES = 5 * 1024 * 1024

// 超时（按整体 socket idle 算，不设 connectTimeout 是因为 Node 在小局域网/代理下经常慢连）
const SOCKET_IDLE_TIMEOUT_MS = 20000

const CODE = Object.freeze({
  INVALID_URL: 'INVALID_URL',
  FETCH_FAILED: 'FETCH_FAILED',
  TOO_LARGE: 'TOO_LARGE',
  EMPTY_BODY: 'EMPTY_BODY',
  REDIRECT_LOOP: 'REDIRECT_LOOP',
  UNSUPPORTED_HOST: 'UNSUPPORTED_HOST'
})

/**
 * 把任意 GitHub URL 规范化为 raw 形式。
 * - 已是 raw.githubusercontent.com / gist.githubusercontent.com → 原样返回
 * - 是 github.com/<u>/<r>/blob/<b>/<p> 或 .../raw/<b>/<p> → 转 raw
 * - 其他主机（包括 file://、localhost、内网 IP、其它 https 主机） → 返回 null
 *
 * 与原 rune-template-service.toRawGithubUrl 语义一致；多包复用时仅这里改一次。
 */
function toRawGithubUrl (input) {
  if (typeof input !== 'string' || !input.trim()) return null
  let u
  try {
    u = new URL(input.trim())
  } catch (_) {
    return null
  }
  const protocol = (u.protocol || '').toLowerCase()
  if (protocol !== 'https:' && protocol !== 'http:') return null
  const host = (u.hostname || '').toLowerCase()
  if (host === 'raw.githubusercontent.com' || host === 'gist.githubusercontent.com') {
    return u.toString()
  }
  if (host !== 'github.com') return null
  const parts = (u.pathname || '').split('/').filter(Boolean)
  if (parts.length < 5) return null
  const owner = parts[0]
  const repo = parts[1]
  const segment = parts[2]
  if (segment !== 'blob' && segment !== 'raw') return null
  const branch = parts[3]
  const restPath = parts.slice(4).join('/')
  if (!owner || !repo || !branch || !restPath) return null
  return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + restPath
}

/**
 * 一次抓取带重定向。
 * - 不导出（仅 fetchRemoteText 内部递归用）。导出 toRawGithubUrl + fetchRemoteText 两个就够。
 */
function fetchOnce (targetUrl, redirectsLeft, logger) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(targetUrl)
    } catch (e) {
      reject(new Error('Invalid URL: ' + targetUrl))
      return
    }
    const isHttps = parsed.protocol === 'https:'
    const client = isHttps ? https : http
    const req = client.request({
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'memocast-pack-importer',
        'Accept': 'application/json, text/plain, text/html;q=0.9, */*;q=0.5'
      }
    }, (res) => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft < 0) {
          reject(new Error('Too many redirects'))
          return
        }
        const next = new URL(res.headers.location, parsed).toString()
        // 重定向后必须再次校验目标 host；否则攻击者可以把 github.com URL 重定向到 localhost:5984 制造 SSRF。
        if (!toRawGithubUrl(next) && !/^https?:\/\/(raw|gist)\.githubusercontent\.com\//.test(next)) {
          reject(new Error('Redirect to unsupported host: ' + next))
          return
        }
        fetchOnce(next, redirectsLeft - 1, logger).then(resolve, reject)
        return
      }
      if (status < 200 || status >= 300) {
        res.resume()
        reject(new Error('HTTP ' + status + ' from ' + targetUrl))
        return
      }
      const contentLength = parseInt(res.headers['content-length'] || '0', 10)
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        res.resume()
        reject(new Error('Response too large: ' + contentLength + ' bytes'))
        return
      }
      res.setEncoding('utf8')
      const accum = []
      let total = 0
      let destroyed = false
      req.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => {
        if (destroyed) return
        destroyed = true
        req.destroy(new Error('Socket idle timeout (' + SOCKET_IDLE_TIMEOUT_MS + 'ms)'))
      })
      res.on('data', chunk => {
        if (destroyed) return
        accum.push(chunk)
        total += chunk.length
        if (total > MAX_BODY_BYTES) {
          destroyed = true
          req.destroy(new Error('Response exceeded ' + MAX_BODY_BYTES + ' bytes'))
        }
      })
      res.on('end', () => {
        if (destroyed) return
        resolve(accum.join(''))
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * URL → 文本。
 * - 成功：{ success: true, text, finalUrl, contentType? }
 * - 失败：{ success: false, code, message }
 *
 * finalUrl 用于调试（重定向后的最终地址）和去重（同一个 URL 不重复拉）。
 */
async function fetchRemoteText (input, logger) {
  const raw = toRawGithubUrl(input)
  if (!raw) {
    return {
      success: false,
      code: CODE.INVALID_URL,
      message: '只支持 github.com / raw.githubusercontent.com / gist.githubusercontent.com 形式的 URL'
    }
  }
  let body
  try {
    body = await fetchOnce(raw, MAX_REDIRECTS, logger)
  } catch (error) {
    const msg = error && error.message ? error.message : String(error)
    let code = CODE.FETCH_FAILED
    if (/Too many redirects/i.test(msg)) code = CODE.REDIRECT_LOOP
    else if (/too large/i.test(msg)) code = CODE.TOO_LARGE
    logger && logger.error && logger.error('[remote-fetch] fetch error:', error)
    return { success: false, code, message: msg }
  }
  if (!body || !body.trim()) {
    return { success: false, code: CODE.EMPTY_BODY, message: '远端返回内容为空' }
  }
  return { success: true, text: body, finalUrl: raw }
}

module.exports = {
  toRawGithubUrl,
  fetchRemoteText,
  CODE,
  MAX_BODY_BYTES
}
