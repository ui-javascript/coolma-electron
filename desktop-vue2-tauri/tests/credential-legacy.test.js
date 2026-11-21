/* eslint-env jest */
import CryptoJS from 'crypto-js'
import {
  looksLikeApiKey,
  looksLikeCryptoJsCiphertext,
  splitElectronBlob,
  splitDpapiKey,
  decryptCryptoJsWithSecrets
} from '../src/desktop/credential'

const API_KEY = 'sk-test-0123456789abcdef'

function base64Of (bytes) {
  return Buffer.from(bytes).toString('base64')
}

/** 造一段 v10 形态的 safeStorage 密文：3 字节前缀 + 12 字节 nonce + 密文 + 16 字节 tag */
function makeV10 (payloadLength = 35, head = 'v10') {
  const bytes = [
    ...Buffer.from(head, 'ascii'),
    ...Array.from({ length: 12 }, (_, i) => i),
    ...Array.from({ length: payloadLength }, (_, i) => 255 - i),
    ...Array(16).fill(9) // GCM tag
  ]
  return base64Of(bytes)
}

test('v1 密文用同一把机器派生密钥能解回原文', () => {
  const secret = 'a'.repeat(64)
  const cipher = CryptoJS.AES.encrypt(API_KEY, secret).toString()
  expect(looksLikeCryptoJsCiphertext(cipher)).toBe(true)
  expect(decryptCryptoJsWithSecrets(cipher, [secret])).toBe(API_KEY)
})

test('v1 试解会跳过错误密钥并命中正确的那把', () => {
  const right = 'b'.repeat(64)
  const cipher = CryptoJS.AES.encrypt(API_KEY, right).toString()
  expect(decryptCryptoJsWithSecrets(cipher, ['x'.repeat(64), right])).toBe(API_KEY)
})

test('v1 全部密钥都不对时返回空串而不是抛错', () => {
  const cipher = CryptoJS.AES.encrypt(API_KEY, 'c'.repeat(64)).toString()
  expect(decryptCryptoJsWithSecrets(cipher, ['d'.repeat(64), 'e'.repeat(64)])).toBe('')
})

test('只有形如 API Key 的明文才被接受', () => {
  expect(looksLikeApiKey(API_KEY)).toBe(true)
  expect(looksLikeApiKey('short')).toBe(false)
  expect(looksLikeApiKey('sk-\u0001\u0002bad-key-text')).toBe(false)
  expect(looksLikeApiKey('')).toBe(false)
  expect(looksLikeApiKey(null)).toBe(false)
})

test('v10 密文按 前缀/nonce/密文+tag 三段切开', () => {
  const blob = splitElectronBlob(makeV10())
  expect(blob).not.toBeNull()
  expect(blob.iv).toHaveLength(12)
  // 密文 35 字节 + tag 16 字节
  expect(blob.data).toHaveLength(51)
})

test('v11 前缀同样识别，长度不足则拒绝', () => {
  expect(splitElectronBlob(makeV10(35, 'v11'))).not.toBeNull()
  expect(splitElectronBlob(base64Of(Buffer.from('v10', 'ascii')))).toBeNull()
  expect(splitElectronBlob('not-base64!!')).toBeNull()
  expect(splitElectronBlob('')).toBeNull()
})

test('DPAPI 包裹密钥剥掉 5 字节前缀才交给系统解封', () => {
  const wrapped = splitDpapiKey(base64Of([...Buffer.from('DPAPI', 'ascii'), ...Array(32).fill(7)]))
  expect(wrapped).not.toBeNull()
  expect(wrapped).toHaveLength(32)
  expect(splitDpapiKey(base64Of(Buffer.from('NOPE!', 'ascii')))).toBeNull()
  expect(splitDpapiKey('')).toBeNull()
})
