// Stub for Memocast's src/components/echo/echoCore.js
// Only the parser-side exports are needed (parseEchoProps)
// Full EchoRegistry/EchoRuntime require Memocast-specific services (DB, sync, etc.)

/**
 * Parse echo annotation props from markdown token content.
 * @param {string} content - token.content like "wizard{}" or "wizard{prop:val}"
 * @returns {object} parsed props
 */
export function parseEchoProps (content) {
  if (!content || typeof content !== 'string') return {}
  const match = content.match(/^([a-zA-Z_]\w*)\{(.*)\}$/s)
  if (!match) return { echoName: content }
  const [, name, propsStr] = match
  const props = {}
  propsStr.replace(/(\w+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)/g, (_, k, v) => {
    props[k] = v.replace(/^["']|["']$/g, '')
  })
  return { echoName: name, ...props }
}

export function decodeEchoPayload () {}
export function encodeEchoPayload () {}
export function createEchoPlaceholderPayload () {}
export function extractPrevEchoTokenValue () {}
export function echoInheritFromPrevious () {}

export class EchoRegistry {
  constructor () {}
  refresh () {}
  get () { return [] }
  all () { return [] }
}

export class EchoRuntime {
  constructor () {}
}
