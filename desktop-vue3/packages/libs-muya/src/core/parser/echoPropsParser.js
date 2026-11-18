// ============================================================================
// echoPropsParser —— 解析 echo 实例的 props 段（@echo{props:...}(prompt) 中的 {...} 部分）
//
// 输入：字符串（带引号 / 数字 / bool / 裸字符串）
// 输出：扁平对象 { key: parsedValue }
//
// 词法：
//   - top-level 按逗号切分（尊重嵌套 {} [] ()）
//   - 每段 key:value
//   - value 是单引号/双引号字符串、true/false、数字、或裸字符串
// ============================================================================

const unescapeQuotedString = (value = '') => String(value || '')
  .replace(/\\'/g, "'")
  .replace(/\\"/g, '"')
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\r')
  .replace(/\\t/g, '\t')

const parsePrimitiveValue = (raw = '') => {
  const source = String(raw || '').trim()
  if (!source) return ''
  if ((source.startsWith("'") && source.endsWith("'")) || (source.startsWith('"') && source.endsWith('"'))) {
    return unescapeQuotedString(source.slice(1, -1))
  }
  if (/^(true|false)$/i.test(source)) return /^true$/i.test(source)
  if (/^-?\d+(?:\.\d+)?$/.test(source)) return Number(source)
  return source
}

const splitTopLevel = (source = '', separator = ',') => {
  const result = []
  let current = ''
  let quote = ''
  let escape = false
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0

  for (const char of String(source || '')) {
    if (escape) { current += char; escape = false; continue }
    if (char === '\\') { current += char; escape = true; continue }
    if (quote) { current += char; if (char === quote) quote = ''; continue }
    if (char === '"' || char === "'") { quote = char; current += char; continue }
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1)
    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1)
    if (char === separator && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      result.push(current)
      current = ''
      continue
    }
    current += char
  }

  if (current) result.push(current)
  return result
}

export const parseEchoProps = (source = '') => {
  const raw = String(source || '').trim()
  if (!raw) return {}
  return splitTopLevel(raw)
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf(':')
      if (separatorIndex === -1) return acc
      const key = pair.slice(0, separatorIndex).trim()
      const value = pair.slice(separatorIndex + 1).trim()
      if (!key) return acc
      acc[key] = parsePrimitiveValue(value)
      return acc
    }, {})
}
