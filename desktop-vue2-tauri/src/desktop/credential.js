import CryptoJS from 'crypto-js'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { joinPath, readText } from './nativeFs'

/**
 * AI 密钥存储：对标原版 Electron safeStorage。
 * 密文实际由系统凭据库保管，SQLite 里的 api_key_encrypted 只存 `keyring:<账号>` 引用，
 * 版本号仍是 2，前端据此显示"系统钥匙串"提示。
 *
 * 从 Electron 版迁移过来的老库，api_key_encrypted 里是两种历史格式：
 *   1. v1：CryptoJS AES（`U2FsdGVkX1` 开头），密钥由机器环境派生，见原版 electron-main.js:68-79
 *   2. v2：Electron safeStorage，实为 `v10` 前缀的 AES-256-GCM 密文，
 *      密钥由 DPAPI 包裹后存在原版 `Local State` 的 os_crypt.encrypted_key
 * 两种都读不出来时返回空串（与原版一致），读得出来就直接可用，下次保存配置即升级为 keyring 引用。
 */
export const CREDENTIAL_VERSION = 2

const REF_PREFIX = 'keyring:'
const CRYPTOJS_PREFIX = 'U2FsdGVkX1'
let counter = 0

/** 老密文本次会话内解出来的明文缓存，避免每次读配置都重跑 DPAPI/试解 */
const legacyCache = new Map()

function nextAccount () {
  counter += 1
  return `ai-${Date.now()}-${counter}`
}

export function isCredentialRef (value) {
  return typeof value === 'string' && value.startsWith(REF_PREFIX)
}

export function looksLikeCryptoJsCiphertext (value) {
  return typeof value === 'string' && value.startsWith(CRYPTOJS_PREFIX)
}

/** API Key 的合理形态：可打印 ASCII，长度至少 8 */
export function looksLikeApiKey (text) {
  if (typeof text !== 'string' || text.length < 8) return false
  return /^[\x20-\x7e]+$/.test(text)
}

export function base64ToBytes (value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 拆 Electron safeStorage 密文：`v10`/`v11` 前缀(3) + GCM nonce(12) + 密文||tag(16)。
 * WebCrypto 的 AES-GCM 要求 tag 跟在密文后面一起传，所以 data 取到末尾。
 */
export function splitElectronBlob (value) {
  if (typeof value !== 'string' || !value) return null
  let bytes
  try {
    bytes = base64ToBytes(value)
  } catch (error) {
    return null
  }
  if (bytes.length < 3 + 12 + 16) return null
  const head = String.fromCharCode(bytes[0], bytes[1], bytes[2])
  if (head !== 'v10' && head !== 'v11') return null
  return {
    iv: bytes.slice(3, 15),
    data: bytes.slice(15)
  }
}

/** 剥掉 DPAPI 包裹密钥前面的 `DPAPI` 五个字节 */
export function splitDpapiKey (value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const bytes = base64ToBytes(value)
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4])
    if (head !== 'DPAPI') return null
    return bytes.slice(5)
  } catch (error) {
    return null
  }
}

/** v1：逐个候选密钥试解 CryptoJS 密文，命中即返回明文 */
export function decryptCryptoJsWithSecrets (cipher, secrets) {
  if (!looksLikeCryptoJsCiphertext(cipher) || !Array.isArray(secrets)) return ''
  for (const secret of secrets) {
    if (!secret) continue
    try {
      const text = CryptoJS.AES.decrypt(cipher, secret).toString(CryptoJS.enc.Utf8)
      if (looksLikeApiKey(text)) return text
    } catch (error) {
      // 密钥不对时会抛 malformed utf-8，继续试下一个
    }
  }
  return ''
}

async function legacyDataDir () {
  try {
    return await invoke('legacy_data_dir')
  } catch (error) {
    console.warn('[credential] 未找到原版数据目录:', error)
    return ''
  }
}

/** v2 老密文：原版 Local State 的 DPAPI 密钥 + AES-256-GCM */
async function decryptElectronSafeStorage (cipher) {
  const blob = splitElectronBlob(cipher)
  if (!blob) return ''
  const dir = await legacyDataDir()
  if (!dir) return ''
  let state
  try {
    state = JSON.parse(await readText(joinPath(dir, 'Local State')))
  } catch (error) {
    console.warn('[credential] 读取原版 Local State 失败:', error)
    return ''
  }
  const wrapped = splitDpapiKey(state && state.os_crypt && state.os_crypt.encrypted_key)
  if (!wrapped) return ''
  const subtle = globalThis.crypto && globalThis.crypto.subtle
  if (!subtle) {
    console.warn('[credential] 当前环境没有 WebCrypto，无法解开 Electron 密文')
    return ''
  }
  const rawKey = await invoke('dpapi_unprotect', { payload: Array.from(wrapped) })
  const key = await subtle.importKey('raw', Uint8Array.from(rawKey), { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: blob.iv, tagLength: 128 }, key, blob.data)
  const text = new TextDecoder().decode(plain)
  return looksLikeApiKey(text) ? text : ''
}

async function decryptLegacy (cipher) {
  const cached = legacyCache.get(cipher)
  if (cached !== undefined) return cached
  let plain = ''
  if (looksLikeCryptoJsCiphertext(cipher)) {
    try {
      plain = decryptCryptoJsWithSecrets(cipher, await invoke('legacy_key_secrets'))
    } catch (error) {
      console.warn('[credential] v1 试解失败:', error)
    }
  }
  if (!plain && splitElectronBlob(cipher)) {
    try {
      plain = await decryptElectronSafeStorage(cipher)
    } catch (error) {
      console.warn('[credential] Electron 密文解密失败:', error)
    }
  }
  legacyCache.set(cipher, plain)
  return plain
}

export async function storeApiKey (plain) {
  if (!plain) return { encrypted: '', version: 0 }
  if (!isTauri()) throw new Error('系统凭据库仅在桌面版可用')
  const account = nextAccount()
  await invoke('credential_set', { account, secret: plain })
  return { encrypted: `${REF_PREFIX}${account}`, version: CREDENTIAL_VERSION }
}

export async function readApiKey (encrypted, version) {
  if (!encrypted) return ''
  if (!isTauri()) return ''
  if (isCredentialRef(encrypted)) {
    try {
      return (await invoke('credential_get', { account: encrypted.slice(REF_PREFIX.length) })) || ''
    } catch (error) {
      console.warn('[credential] 读取 AI 密钥失败:', error)
      return ''
    }
  }
  // 非 keyring 引用：Electron 遗留密文，能解就当场用，解不开返回空
  if (Number(version) === CREDENTIAL_VERSION || looksLikeCryptoJsCiphertext(encrypted)) {
    return decryptLegacy(encrypted)
  }
  return ''
}

export async function removeApiKey (encrypted, version) {
  if (!encrypted || Number(version) !== CREDENTIAL_VERSION || !isCredentialRef(encrypted) || !isTauri()) return
  try {
    await invoke('credential_delete', { account: encrypted.slice(REF_PREFIX.length) })
  } catch (error) {
    console.warn('[credential] 清理 AI 密钥失败:', error)
  }
}
