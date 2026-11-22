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

function bytesToBase64 (bytes) {
  // String.fromCharCode 一次塞太多会爆栈，按 8192 分片转
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 8192))
  }
  return btoa(binary)
}

function base64ToBytes (value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function viewOfBinary (body) {
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  }
  return null
}

async function resolveProxyBody (init) {
  if (typeof init.bodyBase64 === 'string' && init.bodyBase64) return { bodyBase64: init.bodyBase64 }
  const body = init.body
  if (typeof body === 'string') return { body }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { bodyBase64: bytesToBase64(new Uint8Array(await body.arrayBuffer())) }
  }
  const view = body ? viewOfBinary(body) : null
  if (view) return { bodyBase64: bytesToBase64(view) }
  return {}
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
  const body = await resolveProxyBody(init)

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
      body: body.body,
      bodyBase64: body.bodyBase64,
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
    if (typeof init.bodyBase64 !== 'string' || !init.bodyBase64) return fetch(input, init)
    // 不需要代发（同源或非 tauri）时把 base64 还原成 Blob 再走原生 fetch
    const { bodyBase64, ...rest } = init
    return fetch(input, { ...rest, body: new Blob([base64ToBytes(bodyBase64)]) })
  }
  return proxyFetch(url, init)
}

export { isProxyCandidate }
