/**
 * libs-muya-md —— Muya Markdown 语法解析插件（markdown-it）。
 *
 * 把 Muya 文档里的两种扩展语法映射成宿主组件，让任何 VuePress / VitePress
 * 站点都能直接渲染 Muya 源文件：
 *   - 行内回响注解 `@名称{props}(prompt)` → <EchoHost name attrs prompt />
 *   - 带 data-rune-* 的行内占位符 HTML → <RuneHost name value rune-id node-id definition />
 *
 * 纯语法映射：不执行任何脚本，不发起网络请求；远端组件由宿主组件在 mounted 后加载。
 * 组件名可通过 options 改成项目里已全局注册的任意名字。
 */

const ECHO_RE = /^@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)/
const RUNE_OPEN_RE = /^<(span|div|ag-rune)\b([^>]*\bdata-rune-name=[^>]*)>([\s\S]*?)<\/\1>/i
const ATTR_RE = /([a-zA-Z0-9_:@-]+)="([^"]*)"/g

const DEFAULTS = {
  echoComponent: 'EchoHost',
  runeComponent: 'RuneHost'
}

function esc (value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * `{speed: 60, scope: prev-block}` / `{"speed":60}` → `speed: 60, scope: prev-block`
 * 同时兼容 Muya 的裸键值与 JSON 写法。
 */
function normalizeProps (raw) {
  let source = String(raw || '').trim()
  if (!source) return ''
  if (source.startsWith('{') && source.endsWith('}')) source = source.slice(1, -1).trim()
  try {
    const obj = JSON.parse('{' + source + '}')
    return Object.keys(obj)
      .map(function (key) {
        const value = obj[key]
        return key + ': ' + (typeof value === 'string' ? value : JSON.stringify(value))
      })
      .join(', ')
  } catch (error) {
    return source.replace(/"/g, '').replace(/\s*:\s*/g, ': ')
  }
}

function readAttrs (raw) {
  const out = {}
  ATTR_RE.lastIndex = 0
  let match
  while ((match = ATTR_RE.exec(raw))) out[match[1]] = match[2]
  return out
}

/** 创建一个 markdown-it 插件实例；同一个 options 可复用于多个 md 实例。 */
function createMuyaMarkdown (options) {
  const merged = Object.assign({}, DEFAULTS, options || {})

  return function muyaMarkdown (md) {

    // Muya 的区块级节点（回响、符文）在 markdown-it 里会被 paragraph 包成 <p>，
    // 而宿主组件常渲染块级 UI，<p> 里放 <div> 会被浏览器重排导致 SSR hydration 失配。
    // 整行就是一条 Muya 节点时，直接出块级 token，不加 <p>。
    md.block.ruler.before('paragraph', 'muya_block', function (state, startLine, endLine, silent) {
      const line = state.getLines(startLine, startLine + 1, state.tShift[startLine], false).trim()
      if (!line) return false
      let html = ''
      const echo = ECHO_RE.exec(line)
      if (echo && echo[0] === line) {
        const attrs = normalizeProps(echo[2] || '')
        html = '<' + merged.echoComponent + ' name="' + esc(echo[1]) + '"'
        if (attrs) html += ' attrs="' + esc(attrs) + '"'
        if (echo[3]) html += ' prompt="' + esc(echo[3]) + '"'
        html += ' />'
      } else {
        const rune = RUNE_OPEN_RE.exec(line)
        if (!rune || rune[0] !== line) return false
        const attrs = readAttrs(rune[2])
        if (!attrs['data-rune-name']) return false
        const parts = ['name="' + esc(attrs['data-rune-name']) + '"']
        if (attrs['data-rune-value']) parts.push('value="' + esc(attrs['data-rune-value']) + '"')
        if (attrs['data-rune-id']) parts.push('rune-id="' + esc(attrs['data-rune-id']) + '"')
        if (attrs['data-rune-node-id']) parts.push('node-id="' + esc(attrs['data-rune-node-id']) + '"')
        if (attrs['data-rune-definition']) parts.push('definition="' + esc(attrs['data-rune-definition']) + '"')
        html = '<' + merged.runeComponent + ' ' + parts.join(' ') + ' />'
      }
      if (silent) return true
      const token = state.push('muya_block', '', 0)
      token.content = html
      token.map = [startLine, startLine + 1]
      state.line = startLine + 1
      return true
    })

    md.renderer.rules.muya_block = function (tokens, idx) { return tokens[idx].content }

    md.inline.ruler.before('emphasis', 'muya_echo', function (state, silent) {
      const start = state.pos
      const src = state.src
      if (src.charCodeAt(start) !== 0x40) return false
      const prev = start > 0 ? src[start - 1] : ''
      // 邮箱 / 社交句柄不当作回响：@ 前不能是字母、数字或汉字
      if (prev && /[\w\u4e00-\u9fa5]/.test(prev)) return false
      const match = ECHO_RE.exec(src.slice(start))
      if (!match) return false
      if (silent) return true
      const name = match[1]
      const attrs = normalizeProps(match[2] || '')
      const prompt = match[3] || ''
      let html = '<' + merged.echoComponent + ' name="' + esc(name) + '"'
      if (attrs) html += ' attrs="' + esc(attrs) + '"'
      if (prompt) html += ' prompt="' + esc(prompt) + '"'
      html += ' />'
      const token = state.push('muya_echo', '', 0)
      token.content = html
      state.pos += match[0].length
      return true
    })

    md.inline.ruler.before('html_inline', 'muya_rune', function (state, silent) {
      const src = state.src
      const start = state.pos
      if (src.charCodeAt(start) !== 0x3c) return false
      const match = RUNE_OPEN_RE.exec(src.slice(start))
      if (!match) return false
      if (silent) return true
      const attrs = readAttrs(match[2])
      const name = attrs['data-rune-name'] || ''
      if (!name) return false
      const parts = ['name="' + esc(name) + '"']
      if (attrs['data-rune-value']) parts.push('value="' + esc(attrs['data-rune-value']) + '"')
      if (attrs['data-rune-id']) parts.push('rune-id="' + esc(attrs['data-rune-id']) + '"')
      if (attrs['data-rune-node-id']) parts.push('node-id="' + esc(attrs['data-rune-node-id']) + '"')
      if (attrs['data-rune-definition']) parts.push('definition="' + esc(attrs['data-rune-definition']) + '"')
      const token = state.push('muya_rune', '', 0)
      token.content = '<' + merged.runeComponent + ' ' + parts.join(' ') + ' />'
      state.pos += match[0].length
      return true
    })

    md.renderer.rules.muya_echo = function (tokens, idx) { return tokens[idx].content }
    md.renderer.rules.muya_rune = function (tokens, idx) { return tokens[idx].content }
  }
}

const muyaMarkdown = createMuyaMarkdown()

module.exports = muyaMarkdown
module.exports.muyaMarkdown = muyaMarkdown
module.exports.createMuyaMarkdown = createMuyaMarkdown
module.exports.normalizeProps = normalizeProps
module.exports.default = muyaMarkdown
