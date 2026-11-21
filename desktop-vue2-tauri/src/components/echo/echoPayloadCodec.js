// ============================================================================
// echoPayloadCodec —— echo placeholder 的 payload 编解码
//
// payload 形态（v2026-07 固定）：
//   { version: 1, prompt: string, props: { value, id, definitionId, ... } }
//
// 关联 API：
//   - encodeEchoPayload({ prompt, props })        → string
//   - decodeEchoPayload(string)                   → { version, prompt, props }
//   - createEchoPlaceholderPayload(echo, options) → string（用于新建实例时的默认值）
// ============================================================================

import { parseEchoProps } from './echoPropsParser.js'
import { DEFAULT_ECHO_COLOR, DEFAULT_ECHO_ICON } from './echoBuiltinsShared.js'
import { echoInheritFromPrevious } from './echoInherit.js'

const ECHO_PAYLOAD_VERSION = 1

export const ECHO_PLACEHOLDER_RE = /@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)/g

export const encodeEchoPayload = (payload = {}) => {
  try {
    const normalized = {
      version: ECHO_PAYLOAD_VERSION,
      prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
      props: payload.props && typeof payload.props === 'object' ? payload.props : {}
    }
    if (!Object.prototype.hasOwnProperty.call(normalized.props, 'value')) {
      normalized.props.value = normalized.prompt
    }
    return JSON.stringify(normalized)
  } catch (error) {
    console.error('[echoPayloadCodec] encode failed:', error)
    return JSON.stringify({ version: ECHO_PAYLOAD_VERSION, prompt: '', props: {} })
  }
}

export const decodeEchoPayload = (payload = '') => {
  const source = String(payload || '').trim()
  if (!source) return { version: ECHO_PAYLOAD_VERSION, prompt: '', props: {} }

  try {
    const parsed = JSON.parse(source)
    const props = parsed?.props && typeof parsed.props === 'object' ? parsed.props : {}
    return {
      version: Number(parsed?.version) || ECHO_PAYLOAD_VERSION,
      prompt: typeof parsed?.prompt === 'string'
        ? parsed.prompt
        : typeof props.value === 'string' ? props.value : '',
      props
    }
  } catch (error) {
    console.warn('[echoPayloadCodec] decode fallback:', error)
    return { version: ECHO_PAYLOAD_VERSION, prompt: source, props: {} }
  }
}

export const createEchoPlaceholderPayload = (echo = {}, options = {}) => {
  const inheritEnabled = echoInheritFromPrevious(echo) || (options && options.inheritFromPrevious === true)
  const inheritedValue = inheritEnabled ? String(options && options.inheritedValue || '') : ''
  return encodeEchoPayload({
    prompt: inheritedValue,
    props: {
      value: inheritedValue,
      definitionId: String(echo?.id || '').trim(),
      title: echo?.name || '回响',
      desc: echo?.desc || '',
      icon: echo?.icon || DEFAULT_ECHO_ICON,
      color: echo?.color || DEFAULT_ECHO_COLOR,
      inheritFromPrevious: inheritEnabled
    }
  })
}
