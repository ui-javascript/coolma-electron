// ============================================================================
// tests/unit/boot/enum-boot-smoke.test.js
// 从 scripts/verify-enum-boot-smoke.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约：boot/globalGlobals.js 的 require.context 正则
//   /^[a-z]\w*Enum\.js$/
// 必须命中 src/utils/enum/ 下的所有 enum 文件，且不命中 index.js / enumSetup.js。
// ============================================================================
const fs = require('fs')
const path = require('path')

const enumDir = path.resolve(__dirname, '..', '..', '..', 'src', 'utils', 'enum')
const enumFiles = fs.readdirSync(enumDir).filter(f => f.endsWith('.js'))

const enumOldRegex = /[A-Z]\w+Enum\.js$/
// enumOldRegex 仅在演示区展示，本项目枚举文件名都是 camelCase，
// 旧 PascalCase 正则只会命中 0 个——这是历史 bug 的事实，不是断言。
void enumOldRegex
const enumNewRegex = /^[a-z]\w*Enum\.js$/
const EXPECTED_ENUM_FILES = 6

describe('boot/$enums 扫描正则 smoke', () => {
  test('enum 目录应该存在且至少有 6 个 enum 文件', () => {
    expect(fs.existsSync(enumDir)).toBe(true)
    const hits = enumFiles.filter(f => enumNewRegex.test(f))
    expect(hits.length).toBe(EXPECTED_ENUM_FILES)
  })

  test('新 camelCase 正则必须命中 6 个 enum 文件、不命中基础设施', () => {
    const newHits = enumFiles.filter(f => enumNewRegex.test(f))
    expect(newHits.length).toBe(EXPECTED_ENUM_FILES)
    // 不应命中 index.js / enumSetup.js 等基础设施
    expect(newHits).not.toContain('index.js')
    expect(newHits).not.toContain('enumSetup.js')
  })

  test('关键 enum 必须能被挂载（settingsTab / runeEchoCategories / noteOrderType）', () => {
    const newHits = enumFiles.filter(f => enumNewRegex.test(f))
    expect(newHits).toContain('settingsTabEnum.js')
    expect(newHits).toContain('runeEchoCategoriesEnum.js')
    expect(newHits).toContain('noteOrderTypeEnum.js')
  })
})