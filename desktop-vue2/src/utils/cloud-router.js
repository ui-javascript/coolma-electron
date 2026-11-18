import axios from 'axios'
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import NeetoError from 'app/share/error'

const DEFAULT_TIMEOUT = 30000
// 云函数 Provider 标识（Supabase 当前仅作为配置选项，适配尚未实现）
export const CLOUDFN_PROVIDER_UNICLOUD = 'uniCloud'
export const CLOUDFN_PROVIDER_SUPABASE = 'supabase'
export const CLOUDFN_PROVIDER_MAGIC_API = 'magic-api'
const MAGIC_API_DEFAULT_TIMEOUT = 15000

function isMagicApi (cfg) {
  return cfg && cfg.provider === CLOUDFN_PROVIDER_MAGIC_API
}

function isSupabase (cfg) {
  return cfg && cfg.provider === CLOUDFN_PROVIDER_SUPABASE
}

function providerNotImplemented (provider) {
  throw new CloudFnError(`${provider} 适配尚未实现`, 'PROVIDER_NOT_IMPLEMENTED')
}

export class CloudFnError extends Error {
  constructor (message, code, externCode) {
    super(message)
    this.name = 'CloudFnError'
    this.code = code
    this.externCode = externCode
  }
}

function normalizeBaseUrl (url) {
  if (!url) return ''
  return url.replace(/\/+$/, '')
}

function readConfig () {
  try {
    const raw = localStorage.getItem('cloudfn.config')
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

function buildHeaders (extraHeaders, cfg = readConfig()) {
  if (isMagicApi(cfg)) {
    // magic-api（基于 magic-script 的低代码 HTTP 网关）：不带 vk-* 头，
    // 用 magic-token 承载登录态；其余字段由调用方按需追加。
    const headers = {
      'content-type': 'application/json;charset=utf8',
      ...(extraHeaders || {})
    }
    if (cfg.token) headers['magic-token'] = cfg.token
    return headers
  }
  const headers = {
    'content-type': 'application/json;charset=utf8',
    'vk-platform': cfg.platform || 'h5',
    ...(extraHeaders || {})
  }
  if (cfg.appId) headers['vk-appid'] = cfg.appId
  if (cfg.token) headers['uni-id-token'] = cfg.token
  if (cfg.locale) headers['vk-locale'] = cfg.locale
  return headers
}

function unwrap (data, cfg = readConfig()) {
  // magic-api 返回的就是业务 JSON 本身，没有 {code,msg,data} 包裹，直接透传。
  if (isMagicApi(cfg)) return data
  if (data && typeof data === 'object') {
    if ('result' in data && !('data' in data)) return data.result
    if ('returnCode' in data || 'code' in data) {
      const code = data.returnCode ?? data.code
      const message = data.returnMessage || data.message || '云函数请求失败'
      if (code === 0 || code === 200) {
        return 'result' in data ? data.result : data.data
      }
      throw new CloudFnError(message, code, data.externCode)
    }
  }
  return data
}

/**
 * 调用一个云函数（vk-router url 化形态）
 * @param {Object} opts
 * @param {String} opts.url       云函数相对路径，如 'user/kh/login'
 * @param {Object} [opts.data]    请求体
 * @param {Object} [opts.headers] 额外 header
 * @param {Number} [opts.timeout] 超时毫秒
 * @returns {Promise<any>}
 */
export async function callFunction ({ url, data = {}, headers = {}, timeout = DEFAULT_TIMEOUT }) {
  const cfg = readConfig()
  if (isSupabase(cfg)) providerNotImplemented('Supabase')
  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  if (!baseUrl) {
    throw new CloudFnError('尚未配置云函数 baseUrl，请在设置中填写', 'NO_BASE_URL')
  }
  const fullUrl = `${baseUrl}/${url.replace(/^\/+/, '')}`

  let response
  try {
    response = await axios({
      method: 'POST',
      url: fullUrl,
      data,
      headers: buildHeaders(headers, cfg),
      timeout
    })
  } catch (e) {
    const message = (e && e.response && e.response.data && e.response.data.message)
      || (e && e.message)
      || '云函数网络异常'
    const code = (e && e.response && e.response.status) || 'NETWORK_ERROR'
    const err = new CloudFnError(message, code)
    bus.$emit(events.REQUEST_ERROR, new NeetoError(message, code))
    throw err
  }
  return unwrap(response.data, cfg)
}

/**
 * 以 FormData 形式上传到云函数
 * @param {Object} opts
 * @param {String} opts.url
 * @param {FormData|Blob} opts.payload
 * @param {String} [opts.fieldName='file'] 表单字段名
 * @param {Object} [opts.extraFields]      额外的非文件字段
 * @param {Object} [opts.headers]
 */
export async function uploadToFunction ({ url, payload, fieldName = 'file', extraFields = {}, headers = {} }) {
  const cfg = readConfig()
  if (isSupabase(cfg)) providerNotImplemented('Supabase')
  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  if (!baseUrl) {
    throw new CloudFnError('尚未配置云函数 baseUrl', 'NO_BASE_URL')
  }
  const fullUrl = `${baseUrl}/${url.replace(/^\/+/, '')}`

  const form = new FormData()
  if (payload instanceof FormData) {
    for (const [k, v] of payload.entries()) form.append(k, v)
  } else {
    form.append(fieldName, payload)
  }
  Object.entries(extraFields || {}).forEach(([k, v]) => form.append(k, v))

  const merged = buildHeaders(headers, cfg)
  delete merged['content-type']

  const response = await axios({
    method: 'POST',
    url: fullUrl,
    data: form,
    headers: merged,
    timeout: DEFAULT_TIMEOUT * 2
  })
  return unwrap(response.data, cfg)
}

/**
 * 测试连接：给设置面板的"测试连接"按钮用。
 * - uniCloud / Supabase：当前仍调用 system/ping（Supabase 具体适配后续实现）
 * - magic-api：magic-api 没有 ping 端点约定，仅 GET baseUrl 根路径，
 *   只要服务端返回任意 HTTP 响应（2xx/3xx/4xx）即视为可达；
 *   5xx / 网络异常 / timeout 视为不可达。
 */
export async function testConnection ({ timeout } = {}) {
  const cfg = readConfig()
  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  if (!baseUrl) {
    throw new CloudFnError('尚未配置云函数 baseUrl，请在设置中填写', 'NO_BASE_URL')
  }
  if (isMagicApi(cfg)) {
    try {
      const res = await axios.get(baseUrl, {
        headers: buildHeaders({}, cfg),
        timeout: typeof timeout === 'number' ? timeout : MAGIC_API_DEFAULT_TIMEOUT,
        // magic-api 根路径可能返回 HTML（管理后台），axios 默认会按 JSON 解析失败；
        // 明确按 text 接收，状态码本身已足够判定可达。
        responseType: 'text',
        validateStatus: () => true
      })
      if (res.status >= 500) {
        throw new CloudFnError(`HTTP ${res.status}`, res.status)
      }
      return { provider: cfg.provider, status: res.status }
    } catch (e) {
      if (e instanceof CloudFnError) throw e
      const code = (e && e.response && e.response.status) || 'NETWORK_ERROR'
      throw new CloudFnError((e && e.message) || 'magic-api 网络异常', code)
    }
  }
  if (isSupabase(cfg)) providerNotImplemented('Supabase')
  // uniCloud / Supabase：维持现有 system/ping 约定；Supabase 适配暂未实现
  await callFunction({ url: 'system/ping', data: { ts: Date.now() }, timeout })
  return { provider: cfg.provider || CLOUDFN_PROVIDER_UNICLOUD }
}

export const __testing = { normalizeBaseUrl, readConfig, buildHeaders, unwrap, isMagicApi }
