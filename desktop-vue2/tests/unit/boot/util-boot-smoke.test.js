// ============================================================================
// tests/unit/boot/util-boot-smoke.test.js
// 从 scripts/verify-util-boot-smoke.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约：boot/globalGlobals.js 的 require.context 正则
//   /^[a-z]\w*Util\.js$/
// 必须命中 src/utils/util/ 下的 5 个 util 文件（empty / tree / markdown / dom / date）。
// ============================================================================
const fs = require('fs')
const path = require('path')

const utilDir = path.resolve(__dirname, '..', '..', '..', 'src', 'utils', 'util')
const files = fs.existsSync(utilDir) ? fs.readdirSync(utilDir).filter(f => f.endsWith('.js')) : []

const oldRegex = /[A-Z]\w+Util\.js$/
// oldRegex 仅在描述区展示，本项目 util 文件名都是 camelCase，
// 旧 PascalCase 正则只会命中 0 个——这是历史 bug 的事实，不是断言。
void oldRegex
const newRegex = /^[a-z]\w*Util\.js$/

function buildNameSpacedMap (fileList) {
  const map = {}
  fileList.forEach(filename => {
    const fileBaseName = filename.replace(/\.js$/, '')
    const camelName = fileBaseName.charAt(0).toLowerCase() + fileBaseName.slice(1)
    map[camelName] = `(module ${filename} 的所有 named export)`
  })
  return map
}

describe('boot/$utils 扫描正则 smoke', () => {
  test('util 目录应当存在', () => {
    expect(fs.existsSync(utilDir)).toBe(true)
  })

  test('新 camelCase 正则必须命中 5 个 util', () => {
    const newHits = files.filter(f => newRegex.test(f))
    expect(newHits.length).toBe(5)
  })

  test('NoteItem.vue 用到的 3 个关键 util 必须在 namespace map 里', () => {
    const newHits = files.filter(f => newRegex.test(f))
    const $utils = buildNameSpacedMap(newHits)
    expect($utils.emptyUtil).toBeDefined()
    expect($utils.treeUtil).toBeDefined()
    expect($utils.dateUtil).toBeDefined()
  })
})