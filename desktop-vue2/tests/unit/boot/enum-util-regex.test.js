// ============================================================================
// tests/unit/boot/enum-util-regex.test.js
// 从 scripts/verify-enum-util-regex.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约（项目文件名约定是小驼峰 camelCase）：
//   - /^[a-z]\w*Util\.js$/ 能命中 emptyUtil / treeUtil / markdownUtil / domUtil / dateUtil
//   - /^[a-z]\w*Util\.js$/ **不**命中 EmptyUtil.js 这种 PascalCase 文件
//
// 注意：原 verify 脚本还会"展示"旧 PascalCase 正则 /[A-Z]\w+Util\.js$/ 的
// 命中情况（教学用途），但**不**作为断言——它对 PascalCase 文件确实会命中，
// 只是不能用来匹配本项目 camelCase 文件名。我们这里只锁定上面两条正向契约。
// ============================================================================
describe('boot/require-context 正则自检', () => {
  const newRegex = /^[a-z]\w*Util\.js$/

  test('camelCase 正则能命中本项目 util 文件', () => {
    expect(newRegex.test('emptyUtil.js')).toBe(true)
    expect(newRegex.test('treeUtil.js')).toBe(true)
    expect(newRegex.test('dateUtil.js')).toBe(true)
    expect(newRegex.test('markdownUtil.js')).toBe(true)
    expect(newRegex.test('domUtil.js')).toBe(true)
  })

  test('camelCase 正则不命中 PascalCase 文件名（这正是历史 bug 的根本原因）', () => {
    expect(newRegex.test('EmptyUtil.js')).toBe(false)
    expect(newRegex.test('Utilxx.js')).toBe(false)
  })

  test('camelCase 正则不命中非 .js 后缀', () => {
    expect(newRegex.test('emptyUtil.vue')).toBe(false)
    expect(newRegex.test('emptyUtil')).toBe(false)
  })
})