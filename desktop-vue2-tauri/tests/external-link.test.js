/* eslint-env jest */
// 外链判定单测：对齐原版 electron 主进程 new-window 的处理范围
const { resolveExternalUrl } = require('../src/utils/externalLink')

const BASE = 'http://tauri.localhost/'

test('http(s) 外链解析为绝对地址', () => {
  expect(resolveExternalUrl('https://github.com/TankNee/Memocast', BASE)).toBe('https://github.com/TankNee/Memocast')
  expect(resolveExternalUrl('http://example.com/a?b=1#c', BASE)).toBe('http://example.com/a?b=1#c')
  expect(resolveExternalUrl('  https://example.com/trim  ', BASE)).toBe('https://example.com/trim')
})

test('mailto 交给系统，不算内部地址', () => {
  expect(resolveExternalUrl('mailto:hi@example.com', BASE)).toBe('mailto:hi@example.com')
})

test('应用自身与本地开发地址不拦截', () => {
  expect(resolveExternalUrl('http://tauri.localhost/#/note/1', BASE)).toBeNull()
  expect(resolveExternalUrl('http://localhost:1420/', BASE)).toBeNull()
  expect(resolveExternalUrl('http://127.0.0.1:1420/index.html', BASE)).toBeNull()
  expect(resolveExternalUrl('http://[::1]:1420/', BASE)).toBeNull()
})

test('相对路径、锚点、hash 路由不算外链', () => {
  expect(resolveExternalUrl('/assets/logo.png', BASE)).toBeNull()
  expect(resolveExternalUrl('#/settings', BASE)).toBeNull()
  expect(resolveExternalUrl('note/1', BASE)).toBeNull()
})

test('空地址（预览打印窗口的 window.open("", "_blank")）不拦截', () => {
  expect(resolveExternalUrl('', BASE)).toBeNull()
  expect(resolveExternalUrl('   ', BASE)).toBeNull()
  expect(resolveExternalUrl(null, BASE)).toBeNull()
  expect(resolveExternalUrl(undefined, BASE)).toBeNull()
  expect(resolveExternalUrl({}, BASE)).toBeNull()
})

test('非 http(s)/mailto 协议一律不交给系统浏览器', () => {
  expect(resolveExternalUrl('javascript:alert(1)', BASE)).toBeNull()
  expect(resolveExternalUrl('file:///E:/tmp/a.md', BASE)).toBeNull()
  expect(resolveExternalUrl('ftp://example.com/a.zip', BASE)).toBeNull()
  expect(resolveExternalUrl('coolma-resource://local/E:/a.png', BASE)).toBeNull()
  expect(resolveExternalUrl('data:text/html,<h1>x</h1>', BASE)).toBeNull()
})

test('畸形地址不抛错，直接忽略', () => {
  expect(resolveExternalUrl('http://', BASE)).toBeNull()
  expect(resolveExternalUrl('https://exa mple.com', BASE)).toBeNull()
})

test('与应用同源的外链地址视为内部跳转', () => {
  expect(resolveExternalUrl('https://coolma.example.com/note', 'https://coolma.example.com/')).toBeNull()
  expect(resolveExternalUrl('https://other.example.com/note', 'https://coolma.example.com/')).toBe('https://other.example.com/note')
})
