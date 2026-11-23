const test = require('node:test')
const assert = require('node:assert/strict')
const MarkdownIt = require('markdown-it')
const muyaMarkdown = require('../src/index.js')

function render (src, options) {
  const md = new MarkdownIt({ html: true }).use(options ? muyaMarkdown.createMuyaMarkdown(options) : muyaMarkdown)
  return md.render(src)
}

test('回响注解：裸键 props + prompt', () => {
  const html = render('@打字机{scope: prev-block}(春风吹又生)')
  assert.match(html, /<EchoHost name="打字机" attrs="scope: prev-block" prompt="春风吹又生" \/>/)
})

test('回响注解：JSON props 归一化', () => {
  const html = render('@生生不息{"speed":2,"target":".card"}(生长)')
  assert.match(html, /attrs="speed: 2, target: .card"/)
  assert.match(html, /prompt="生长"/)
})

test('回响注解：无 props', () => {
  const html = render('@弹幕飘过(speed 7)')
  assert.match(html, /<EchoHost name="弹幕飘过" prompt="speed 7" \/>/)
})

test('不误伤邮箱与句柄', () => {
  const html = render('联系 a@b.com 或 @someone')
  assert.doesNotMatch(html, /EchoHost/)
})

test('符文占位符 HTML 转宿主组件', () => {
  const html = render('<span data-rune-name="输入框" data-rune-id="r1" data-rune-node-id="n1" data-rune-value="hello">@输入框</span>')
  assert.match(html, /<RuneHost name="输入框" value="hello" rune-id="r1" node-id="n1" \/>/)
  assert.doesNotMatch(html, /data-rune-name/)
})

test('自定义组件名', () => {
  const html = render('@打字机(x)', { echoComponent: 'MuyaEcho', runeComponent: 'MuyaRune' })
  assert.match(html, /<MuyaEcho name="打字机" prompt="x" \/>/)
})

test('整行 Muya 节点不套 <p>', () => {
  const echo = render('@打字机(x)')
  assert.doesNotMatch(echo, /<p>/)
  assert.match(echo, /<EchoHost name="打字机" prompt="x" \/>/)
  const rune = render('<span data-rune-name="输入框" data-rune-value="v">x</span>')
  assert.doesNotMatch(rune, /<p>/)
  assert.match(rune, /<RuneHost name="输入框" value="v" \/>/)
})
