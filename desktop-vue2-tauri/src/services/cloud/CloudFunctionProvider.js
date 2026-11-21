import {
  callFunction,
  uploadToFunction,
  testConnection,
  CloudFnError,
  CLOUDFN_PROVIDER_UNICLOUD,
  CLOUDFN_PROVIDER_SUPABASE,
  CLOUDFN_PROVIDER_MAGIC_API
} from 'src/utils/cloud-router'

const CONFIG_KEY = 'cloudfn.config'
const TOKEN_KEY = 'cloudfn.token'

function readConfig () {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

function writeConfig (cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg || {}))
}

export function getConfig () {
  const cfg = readConfig()
  const supportedProviders = [
    CLOUDFN_PROVIDER_UNICLOUD,
    CLOUDFN_PROVIDER_SUPABASE,
    CLOUDFN_PROVIDER_MAGIC_API
  ]
  return {
    baseUrl: cfg.baseUrl || '',
    appId: cfg.appId || '',
    platform: cfg.platform || 'h5',
    locale: cfg.locale || 'zh-Hans',
    provider: supportedProviders.includes(cfg.provider)
      ? cfg.provider
      : CLOUDFN_PROVIDER_UNICLOUD,
    token: localStorage.getItem(TOKEN_KEY) || cfg.token || ''
  }
}

export function setConfig ({ baseUrl, appId, platform, locale, provider }) {
  const next = {
    ...readConfig(),
    ...(baseUrl !== undefined ? { baseUrl: (baseUrl || '').replace(/\/+$/, '') } : {}),
    ...(appId !== undefined ? { appId } : {}),
    ...(platform !== undefined ? { platform } : {}),
    ...(locale !== undefined ? { locale } : {}),
    ...(provider !== undefined ? { provider } : {})
  }
  writeConfig(next)
  return getConfig()
}

export function setToken (token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
  const cfg = readConfig()
  cfg.token = token || ''
  writeConfig(cfg)
}

export function clearToken () {
  setToken('')
}

/**
 * 调用云函数。
 * 后续 WizNote / lafyun / 自建后端都接在这里。
 * @param {String} name   云函数路径，如 'router/user/login'
 * @param {Object} data
 * @param {Object} [opts] { headers, timeout }
 */
export async function invoke (name, data = {}, opts = {}) {
  return callFunction({ url: name, data, ...opts })
}

/**
 * 上传文件到云函数
 * @param {String} name       云函数路径，如 'router/resource/upload'
 * @param {FormData|Blob} payload
 * @param {Object} [opts]     { fieldName, extraFields, headers }
 */
export async function upload (name, payload, opts = {}) {
  return uploadToFunction({ url: name, payload, ...opts })
}

export { CloudFnError }

export default {
  invoke,
  upload,
  testConnection,
  getConfig,
  setConfig,
  setToken,
  clearToken,
  CloudFnError
}
