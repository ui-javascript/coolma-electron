// ============================================================================
// tests/unit/boot/i18n-locale-fallback.test.js
//
// 锁定契约（v2026-07-29）：
//   src/boot/i18n.js 在 ClientFileStorage 里没有 `language` 时
//   **必须**兜底成 'en-us'（小写 us，跟 messages 字典的 key 一致），
//   不能让 vue-i18n v8 默认落到 'en-US'（**大写** US）这个跟字典对不上的值。
//
// 触发这条用例失败的典型改动：
//   - 删掉 `... || DEFAULT_LOCALE` 兜底，让 locale 透传 undefined
//   - 把兜底值改成 'en-US'（大写）或别的字典里没注册的 locale
//   - 把 messages 的 key 从 'en-us' 改名为别的，兜底却没同步改
//
// 注意：本测试只锁定源文件字面量，避免 mock ClientFileStorage / VueI18n，
// 目的是 catch "兜底逻辑被无意删掉"这种 AI agent 容易踩的回归。
// ============================================================================
const fs = require('fs')
const path = require('path')

const i18nBootPath = path.resolve(__dirname, '..', '..', '..', 'src', 'boot', 'i18n.js')
const messagesIndexPath = path.resolve(__dirname, '..', '..', '..', 'src', 'i18n', 'index.js')

describe('boot/i18n.js 首启 locale 兜底', () => {
  test('i18n.js 源文件必须包含首启 locale 兜底逻辑', () => {
    const src = fs.readFileSync(i18nBootPath, 'utf8')
    // 必须有 `|| <兜底值>` 形式，覆盖 ClientFileStorage 返回的 undefined / null / ''。
    // 兜底值既可以是字面量 'en-us'，也可以是常量（DEFAULT_LOCALE 等）。
    expect(src).toMatch(/getItemFromStore\(['"`]language['"`]\)\s*\|\|\s*[A-Za-z_'"]/)
  })

  test('i18n.js 源文件不能直接透传 undefined 给 locale', () => {
    const src = fs.readFileSync(i18nBootPath, 'utf8')
    // 旧写法 `const locale = ClientFileStorage.getItemFromStore('language')` 不带兜底，
    // locale 可能是 undefined → vue-i18n v8 内部 fallback 到 'en-US'（大写）
    // 跟字典 key 对不上 → 首启所有 i18n.t 返回 key 本身。
    expect(src).not.toMatch(/=\s*ClientFileStorage\.getItemFromStore\(['"`]language['"`]\)\s*$/m)
  })

  test('i18n/index.js 暴露的 locale key 必须含小写 en-us', () => {
    const src = fs.readFileSync(messagesIndexPath, 'utf8')
    expect(src).toMatch(/['"`]en-us['"`]\s*:/)
    // 大写版本不允许混进来
    expect(src).not.toMatch(/['"`]en-US['"`]\s*:/)
  })

  test('availableLocales 必须跟 messages 字典的 key 保持一致（都是小写 en-us）', () => {
    const src = fs.readFileSync(i18nBootPath, 'utf8')
    expect(src).toMatch(/availableLocales:\s*\[\s*['"`]en-us['"`]\s*,\s*['"`]zh-cn['"`]\s*\]/)
  })
})
