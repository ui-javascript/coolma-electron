// ============================================================================
// tests/unit/util/dateUtil-i18n.test.js
//
// 锁定契约（v2026-07-29）：
//   src/utils/util/dateUtil.js 的 `displayDateElegantly(date)`
//   **必须**走 i18n：键 `justNow` / `minutesAgo` / `hoursAgo` / `daysAgo`
//   定义在 src/i18n/zh-cn/utils.js 与 src/i18n/en-us/utils.js。
//   切换语言时文案同步刷新（不再返回硬编码英文 `just now` / `Xm ago`）。
//
// 触发这条用例失败的典型改动：
//   - 在 dateUtil.js 里把 `i18n.t('justNow')` 改回硬编码 `'just now'`
//   - 在 i18n/{en-us,zh-cn}/utils.js 里删 / 改名 justNow / minutesAgo / hoursAgo / daysAgo
//   - 把 `{num} 分钟前` 这种 placeholder 改成 Vue I18n v9 才认识的 `{num}`（本项目锁 v8 legacy）
//
// 这条用例只锁"displayDateElegantly 必须经过 i18n.t 返回 i18n 字典里的文案"这一行为契约；
// 具体的中英文翻译文案 / 阈值 / 多复数处理不在断言范围内（避免翻译修改误杀用例）。
// ============================================================================
const fs = require('fs')
const path = require('path')

const i18nPath = path.resolve(__dirname, '..', '..', '..', 'src', 'i18n')
const zhCnUtilsPath = path.join(i18nPath, 'zh-cn', 'utils.js')
const enUsUtilsPath = path.join(i18nPath, 'en-us', 'utils.js')
const dateUtilPath = path.resolve(__dirname, '..', '..', '..', 'src', 'utils', 'util', 'dateUtil.js')

describe('utils/util/dateUtil.displayDateElegantly 必须走 i18n', () => {
  test('i18n/{zh-cn,en-us}/utils.js 必须存在', () => {
    expect(fs.existsSync(zhCnUtilsPath)).toBe(true)
    expect(fs.existsSync(enUsUtilsPath)).toBe(true)
  })

  test('i18n utils.js 必须含 justNow / minutesAgo / hoursAgo / daysAgo 四个 key', () => {
    const zh = fs.readFileSync(zhCnUtilsPath, 'utf8')
    const en = fs.readFileSync(enUsUtilsPath, 'utf8')
    expect(zh).toMatch(/^\s*justNow\s*:/m)
    expect(zh).toMatch(/^\s*minutesAgo\s*:/m)
    expect(zh).toMatch(/^\s*hoursAgo\s*:/m)
    expect(zh).toMatch(/^\s*daysAgo\s*:/m)
    expect(en).toMatch(/^\s*justNow\s*:/m)
    expect(en).toMatch(/^\s*minutesAgo\s*:/m)
    expect(en).toMatch(/^\s*hoursAgo\s*:/m)
    expect(en).toMatch(/^\s*daysAgo\s*:/m)
  })

  test('dateUtil.js 不能再硬编码 just now / Xm ago / Xh ago / Xd ago', () => {
    const src = fs.readFileSync(dateUtilPath, 'utf8')
    // 这 4 个字符串是历史硬编码英文文案，应当被 i18n.t(...) 取代。
    // 注意：i18n 字典里的 justNow: 'Just Now'（首字母大写、有空格）不算硬编码文案，
    // 这里只锁源文件字面量里的旧硬编码字符串。
    expect(src).not.toMatch(/['"`]just now['"`]/)
    expect(src).not.toMatch(/\$\{[^}]+\}m ago/)
    expect(src).not.toMatch(/\$\{[^}]+\}h ago/)
    expect(src).not.toMatch(/\$\{[^}]+\}d ago/)
  })

  test('dateUtil.js 必须用 i18n.t(...) 拿 justNow / minutesAgo / hoursAgo / daysAgo 文案', () => {
    const src = fs.readFileSync(dateUtilPath, 'utf8')
    // 4 个分支都必须用 i18n.t
    expect(src).toMatch(/i18n\.t\(\s*['"`]justNow['"`]\s*\)/)
    expect(src).toMatch(/i18n\.t\(\s*['"`]minutesAgo['"`]/)
    expect(src).toMatch(/i18n\.t\(\s*['"`]hoursAgo['"`]/)
    expect(src).toMatch(/i18n\.t\(\s*['"`]daysAgo['"`]/)
  })

  test('dateUtil.js 必须从 boot/i18n 拿 i18n 实例', () => {
    const src = fs.readFileSync(dateUtilPath, 'utf8')
    expect(src).toMatch(/from\s+['"`]boot\/i18n['"`]/)
  })
})
