// ============================================================================
// tests/unit/main/remote-fetch.test.js
//
// 锁定主进程共享 helper remote-fetch 的契约（v2026-08-01）：
//   1) toRawGithubUrl —— 4 类 URL 形态：github blob/raw → 转 raw；已是 raw → 原样；
//      非 github / 非 https → null；空 / 非字符串 → null
//   2) fetchRemoteText —— 入参是 toRawGithubUrl 接受的 URL 时拉取真实内容；
//      不接受时返回 INVALID_URL
//   3) 重定向循环 / HTTP 错误 / Content-Length 超限 / 空 body → 对应 code
//
// 真实 HTTP 拉取：本测试用 https 模块的 server-mock 思路不可行（remote-fetch 直接 require https），
// 这里改成三种走法：
//   a) INVALID_URL / fetchOnce 重定向循环 —— 通过 mock https.request 实现，避免依赖外网。
//   b) toRawGithubUrl 是纯函数，覆盖即可。
//   c) fetchRemoteText 的"成功路径"通过 mock https.request 模拟 200 + body 来验证 finalUrl / text。
// ============================================================================

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

const path = require('path')
const REMOTE_FETCH_PATH = path.resolve(__dirname, '../../../src-electron/main-process/service/remote-fetch.js')

// ============================================================================
// toRawGithubUrl —— 纯函数覆盖
// ============================================================================
describe('remote-fetch.toRawGithubUrl', () => {
  function load () { return require(REMOTE_FETCH_PATH) }

  test('github.com blob → 转 raw', () => {
    const { toRawGithubUrl } = load()
    const out = toRawGithubUrl('https://github.com/octocat/Hello-World/blob/master/README.md')
    expect(out).toBe('https://raw.githubusercontent.com/octocat/Hello-World/master/README.md')
  })

  test('github.com raw → 转 raw', () => {
    const { toRawGithubUrl } = load()
    const out = toRawGithubUrl('https://github.com/octocat/Hello-World/raw/master/path/to/file.json')
    expect(out).toBe('https://raw.githubusercontent.com/octocat/Hello-World/master/path/to/file.json')
  })

  test('已经是 raw.githubusercontent.com → 原样返回', () => {
    const { toRawGithubUrl } = load()
    const u = 'https://raw.githubusercontent.com/octocat/Hello-World/master/path.json'
    expect(toRawGithubUrl(u)).toBe(u)
  })

  test('gist.githubusercontent.com → 原样返回', () => {
    const { toRawGithubUrl } = load()
    const u = 'https://gist.githubusercontent.com/octocat/6/raw/abc.json'
    expect(toRawGithubUrl(u)).toBe(u)
  })

  test('非 github 主机 → null（含 localhost / 内网 / 任意 https）', () => {
    const { toRawGithubUrl } = load()
    expect(toRawGithubUrl('https://example.com/foo/bar/blob/master/x.json')).toBeNull()
    expect(toRawGithubUrl('https://localhost:5984/x.json')).toBeNull()
    expect(toRawGithubUrl('http://192.168.1.1/x.json')).toBeNull()
    expect(toRawGithubUrl('ftp://github.com/x.json')).toBeNull()
  })

  test('空 / 非字符串 / github 但路径不完整 → null', () => {
    const { toRawGithubUrl } = load()
    expect(toRawGithubUrl('')).toBeNull()
    expect(toRawGithubUrl('   ')).toBeNull()
    expect(toRawGithubUrl(null)).toBeNull()
    expect(toRawGithubUrl(undefined)).toBeNull()
    expect(toRawGithubUrl(42)).toBeNull()
    // github.com 但 segment 不是 blob/raw
    expect(toRawGithubUrl('https://github.com/o/r/tree/master/x.json')).toBeNull()
    // github.com 但路径太短
    expect(toRawGithubUrl('https://github.com/o/r')).toBeNull()
  })
})

// ============================================================================
// fetchRemoteText —— 通过 mock https.request 模拟各种响应
// ============================================================================
describe('remote-fetch.fetchRemoteText', () => {
  function makeMockResponse (status, body, headers = {}) {
    const listeners = {}
    return {
      statusCode: status,
      headers,
      setEncoding () {},
      on (event, cb) { listeners[event] = cb },
      resume () {},
      _emitData () {
        if (listeners.data && body) listeners.data(Buffer.from(body))
      },
      _emitEnd () {
        if (listeners.end) listeners.end()
      }
    }
  }

  function load () { return require(REMOTE_FETCH_PATH) }

  test('URL 不被接受 → INVALID_URL', async () => {
    const { fetchRemoteText } = load()
    const r = await fetchRemoteText('https://example.com/x.json')
    expect(r.success).toBe(false)
    expect(r.code).toBe('INVALID_URL')
  })

  test('空字符串 → INVALID_URL', async () => {
    const { fetchRemoteText } = load()
    const r = await fetchRemoteText('')
    expect(r.success).toBe(false)
    expect(r.code).toBe('INVALID_URL')
  })

  test('HTTP 200 + 合法 body → success + text + finalUrl', async () => {
    const https = require('https')
    const spy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
      const res = makeMockResponse(200, '{"format":"memocast.rune-pack"}')
      const handlers = {}
      const req = {
        on (event, h) { handlers[event] = h },
        end () {},
        setTimeout (ms, fn) {
          this._timeoutFn = fn
        },
        destroy (err) {
          if (handlers.error && err) handlers.error(err)
        }
      }
      // 异步触发 cb：避开 client.request 同步回调里访问 req 的 TDZ
      // jsdom 环境没有 setImmediate，用 process.nextTick 替代
      process.nextTick(() => {
        cb(res)
        // cb 内 res.on('data', ...) / res.on('end', ...) 注册后，异步 emit data + end
        process.nextTick(() => {
          res._emitData()
          res._emitEnd()
        })
      })
      return req
    })
    const { fetchRemoteText } = load()
    const r = await fetchRemoteText('https://raw.githubusercontent.com/o/r/master/x.json')
    expect(r.success).toBe(true)
    expect(r.text).toBe('{"format":"memocast.rune-pack"}')
    expect(r.finalUrl).toContain('raw.githubusercontent.com')
    spy.mockRestore()
  })

  test('Content-Length 超限 → TOO_LARGE', async () => {
    const https = require('https')
    const spy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
      const res = makeMockResponse(200, 'a', { 'content-length': String(6 * 1024 * 1024) })
      process.nextTick(() => cb(res))
      return { on () {}, end () {}, setTimeout () {}, destroy () {} }
    })
    const { fetchRemoteText } = load()
    const r = await fetchRemoteText('https://raw.githubusercontent.com/o/r/master/x.json')
    expect(r.success).toBe(false)
    expect(r.code).toBe('TOO_LARGE')
    spy.mockRestore()
  })

  test('响应 body 为空 → EMPTY_BODY', async () => {
    const https = require('https')
    const spy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
      const res = makeMockResponse(200, '')
      process.nextTick(() => {
        cb(res)
        process.nextTick(() => res._emitEnd())
      })
      return { on () {}, end () {}, setTimeout () {}, destroy () {} }
    })
    const { fetchRemoteText } = load()
    const r = await fetchRemoteText('https://raw.githubusercontent.com/o/r/master/x.json')
    expect(r.success).toBe(false)
    expect(r.code).toBe('EMPTY_BODY')
    spy.mockRestore()
  })

  test('HTTP 404 → FETCH_FAILED', async () => {
    const https = require('https')
    const spy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
      const res = makeMockResponse(404, 'not found')
      process.nextTick(() => cb(res))
      return { on () {}, end () {}, setTimeout () {}, destroy () {} }
    })
    const { fetchRemoteText } = load()
    const r = await fetchRemoteText('https://raw.githubusercontent.com/o/r/master/x.json')
    expect(r.success).toBe(false)
    expect(r.code).toBe('FETCH_FAILED')
    expect(r.message).toMatch(/HTTP 404/)
    spy.mockRestore()
  })

  test('重定向到非 github 主机 → FETCH_FAILED（含"unsupported host"字样）', async () => {
    const https = require('https')
    const spy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
      const res = makeMockResponse(302, '', { location: 'https://localhost:5984/x' })
      process.nextTick(() => cb(res))
      return { on () {}, end () {}, setTimeout () {}, destroy () {} }
    })
    const { fetchRemoteText } = load()
    const r = await fetchRemoteText('https://github.com/o/r/blob/master/x.json')
    expect(r.success).toBe(false)
    expect(r.code).toBe('FETCH_FAILED')
    expect(r.message).toMatch(/unsupported host/i)
    spy.mockRestore()
  })
})
