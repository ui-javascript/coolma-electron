import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * AI 密钥存储：对标原版 Electron safeStorage。
 * 密文实际由系统凭据库保管，SQLite 里的 api_key_encrypted 只存 `keyring:<账号>` 引用，
 * 版本号仍是 2，前端据此显示“系统钥匙串”提示；读不出来（Electron 遗留密文）时返回空串。
 */
export const CREDENTIAL_VERSION = 2

const REF_PREFIX = 'keyring:'
let counter = 0

function nextAccount () {
  counter += 1
  return `ai-${Date.now()}-${counter}`
}

export function isCredentialRef (value) {
  return typeof value === 'string' && value.startsWith(REF_PREFIX)
}

export async function storeApiKey (plain) {
  if (!plain) return { encrypted: '', version: 0 }
  if (!isTauri()) throw new Error('系统凭据库仅在桌面版可用')
  const account = nextAccount()
  await invoke('credential_set', { account, secret: plain })
  return { encrypted: `${REF_PREFIX}${account}`, version: CREDENTIAL_VERSION }
}

export async function readApiKey (encrypted, version) {
  if (!encrypted || Number(version) !== CREDENTIAL_VERSION) return ''
  if (!isCredentialRef(encrypted) || !isTauri()) return ''
  try {
    return (await invoke('credential_get', { account: encrypted.slice(REF_PREFIX.length) })) || ''
  } catch (error) {
    console.warn('[credential] 读取 AI 密钥失败:', error)
    return ''
  }
}

export async function removeApiKey (encrypted, version) {
  if (!encrypted || Number(version) !== CREDENTIAL_VERSION || !isCredentialRef(encrypted) || !isTauri()) return
  try {
    await invoke('credential_delete', { account: encrypted.slice(REF_PREFIX.length) })
  } catch (error) {
    console.warn('[credential] 清理 AI 密钥失败:', error)
  }
}
