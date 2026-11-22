import { Channel, invoke, isTauri } from '@tauri-apps/api/core'

/**
 * Tauri 桌面端的跨域 HTTP 通道。
 *
 * WebView2 会按浏览器同源策略拦掉跨域请求（CORS），而 Electron 版靠 webSecurity:false 没这个问题。
 * 这里把非本机同源的绝对 URL 交给 Rust 侧发出去，响应按块回传，SSE 也能用。
 */

function toHeadersObject (headers) {
  if (!headers) return {}
  const output = {}
  if (typeof headers.forEach === 'function' && !(headers instanceof Object && headers.constructor === Object)) {
    headers.forEach((value, name) => { output[name] = value })
    return output
  }
  Object.keys(headers).forEach(name => { output[name] = headers[name] })
  return output
}

function resolveUrl (input) {
  if (typeof input === 'string') return input
  return input && input.url ? input.url : ''
}

function isSameOrigin (url) {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.origin === window.location.origin
  } catch (_) {
    return true
  }
}

function isProxyCandidate (url) {
  return /^https?:\/\//i.test(url) && !isSameOrigin(url)
}

function buildResponseHeaders (raw) {
  const headers = new Headers()
  Object.keys(raw || {}).forEach(name => {
    try { headers.set(name, raw[name]) } catch (_) {}
  })
  return headers
}

async function proxyFetch (url, init) {
  const method = String(init.method || 'GET').toUpperCase()
  const headers = toHeadersObject(init.headers)
  const body = typeof init.body === 'string' ? init.body : undefined

  const encoder = new TextEncoder()
  let controller
  let closed = false
  const stream = new ReadableStream({
    start (c) { controller = c },
    cancel () { closed = true }
  })

  const state = { status: 0, headers: {} }
  let resolveOpen
  let rejectOpen
  const opened = new Promise((resolve, reject) => {
    resolveOpen = resolve
    rejectOpen = reject
  })

  const channel = new Channel()
  channel.onmessage = message => {
    if (!message || closed) return
    if (message.kind === 'open') {
      state.status = message.status || 200
      state.headers = message.headers || {}
      resolveOpen()
      return
    }
    try {
      if (message.kind === 'chunk') {
        controller.enqueue(encoder.encode(message.text || ''))
      } else if (message.kind === 'error') {
        const error = new Error(message.message || '网络请求失败')
        if (!state.status) rejectOpen(error)
        else controller.error(error)
        closed = true
      }
    } catch (_) {}
  }

  const finished = invoke('http_proxy_stream', {
    request: {
      url,
      method,
      headers,
      body,
      maxBytes: init.maxBytes,
      timeoutMs: init.timeoutMs
    },
    onEvent: channel
  })
    .catch(error => {
      const wrapped = new Error(typeof error === 'string' ? error : (error?.message || '网络请求失败'))
      if (!state.status) {
        rejectOpen(wrapped)
      } else if (!closed) {
        controller.error(wrapped)
        closed = true
      }
      throw wrapped
    })
    .then(() => {
      if (!closed) {
        controller.close()
        closed = true
      }
    })

  if (init.signal) {
    const abort = () => {
      closed = true
      try { controller.error(new DOMException('请求已取消', 'AbortError')) } catch (_) {}
    }
    if (init.signal.aborted) abort()
    else init.signal.addEventListener('abort', abort, { once: true })
  }

  await opened
  const status = state.status
  const responseInit = {
    status,
    headers: buildResponseHeaders(state.headers)
  }
  const result = new Response(status === 204 || status === 304 ? null : stream, responseInit)
  // 保证命令结束时流被关闭（即使调用方只读了 response.json()）
  Object.defineProperty(result, 'proxyDone', { value: finished, enumerable: false })
  return result
}

/**
 * 跨域请求走 Rust，同源请求保持浏览器原生 fetch。
 * 返回值与 fetch 的 Response 一致（status / headers / text() / json() / body.getReader()）。
 */
export async function httpFetch (input, init = {}) {
  const url = resolveUrl(input)
  if (!isTauri() || !isProxyCandidate(url)) {
    return fetch(input, init)
  }
  return proxyFetch(url, init)
}

export { isProxyCandidate }
