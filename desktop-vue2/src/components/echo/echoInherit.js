// ============================================================================
// echoInherit —— echo 的「继承上一节点 value」能力
//
// 设计：
//   - 默认 createDefaultEchoAnnoSource 不输出 inheritFromPrevious，行为是「不继承」。
//   - echo 名片（registry 注册的定义）可在顶层或 props.inheritFromPrevious = true 启用继承。
//   - 真正的「找前一个 token」由 caller（Muya Vue）扫描 markdown 后传入 token.prevValue。
// ============================================================================

import { ECHO_PLACEHOLDER_RE } from './echoPayloadCodec.js'
import { parseEchoProps } from './echoPropsParser.js'

const INHERIT_FROM_PREVIOUS_KEYS = ['inheritFromPrevious', 'inherit_from_previous', 'inheritPrevValue']

export const isInheritFromPreviousEnabled = (input = {}) => {
  if (!input || typeof input !== 'object') return false
  for (const key of INHERIT_FROM_PREVIOUS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue
    const raw = input[key]
    if (raw === true) return true
    if (typeof raw === 'string') {
      const norm = raw.trim().toLowerCase()
      if (norm === 'true' || norm === '1' || norm === 'yes' || norm === 'on') return true
    }
    if (typeof raw === 'number' && raw === 1) return true
  }
  return false
}

export const echoInheritFromPrevious = (echo = {}) => {
  if (!echo || typeof echo !== 'object') return false
  if (isInheritFromPreviousEnabled(echo)) return true
  if (isInheritFromPreviousEnabled(echo.props)) return true
  return false
}

export const extractPrevEchoTokenValue = (markdown = '', currentIndex = -1, options = {}) => {
  const source = String(markdown || '')
  if (!source) return ''
  const upperBound = (typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex <= source.length)
    ? currentIndex
    : source.length
  const prefix = source.slice(0, upperBound)
  if (!prefix || prefix.indexOf('@') === -1) return ''

  const onlyName = (options && options.echoName) ? String(options.echoName).trim() : ''
  let lastValue = ''
  const localRe = new RegExp(ECHO_PLACEHOLDER_RE.source, 'g')
  let match
  while ((match = localRe.exec(prefix)) !== null) {
    const rawEchoName = String(match[1] || '').trim()
    if (!rawEchoName) continue
    if (onlyName && rawEchoName !== onlyName) continue
    const propsRaw = String(match[2] || '')
    const promptRaw = String(match[3] || '')
    const props = parseEchoProps(propsRaw)
    lastValue = String(props.value || promptRaw || '')
  }
  return lastValue
}
