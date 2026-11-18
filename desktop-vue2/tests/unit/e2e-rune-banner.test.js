// 端到端：场景 A + 场景 C 都跑一遍，验证 v2026-08-01 的 UI 强提示文案出现
//
// v2026-08-01（修复）：原 e2e 测试用 wrapper.find('.rune-batch-import-all-conflict').exists()
//   检查 DOM，但 quasar <q-dialog> 用 portal/teleport 渲染到 body，vue-test-utils 默认 mount 不
//   进入 portal，导致 wrapper.html() 是空、find 永远 false —— 即使 v-if 真的该 true 也找不到。
//   改用 vm 上的渲染状态判断（即 v-if 的字面表达式值）来锁定"应当显示"的契约。
const fs = require('fs')
const path = require('path')

require('../../tests/fixtures/jquery-setup.js')

const mockText = fs.readFileSync(path.resolve(__dirname, '../../../_plugins/rune-template/memocast-runes-2026-08-01.json'), 'utf8')

jest.mock('../../src/utils/DatabaseClient.js', () => {
  return {
    runes: { getAll: jest.fn() },
    runeTemplates: { getAll: jest.fn() },
    runePacks: { fetchRemote: jest.fn().mockResolvedValue({ success: true, text: mockText, finalUrl: 'x' }) }
  }
})

const { mount, createLocalVue } = require('@vue/test-utils')
const Quasar = require('quasar')
const ElementUI = require('element-ui')
const DatabaseClient = require('../../src/utils/DatabaseClient.js')

const localVue = createLocalVue()
localVue.use(Quasar, { config: {} })
localVue.use(ElementUI)

const Comp = require('../../src/components/rune/runeBatchImportDialog.vue').default

// 与 .vue 模板 line 141 / 154 的 v-if 表达式等价复刻（不依赖 quasar portal 渲染结果）
function shouldShowPreview (vm) {
  return Array.isArray(vm.parsedEntries) && vm.parsedEntries.length > 0
}
function shouldShowAllConflictBanner (vm) {
  return vm.newItems.length === 0 && vm.conflictItems.length > 0
}

test('场景 A：runes 表里已经存在所有 7 个符文 → 弹框渲染强提示 + hasSelectedItem=false', async () => {
  // 模拟 runes 表里已经有所有 7 个
  const parsed = JSON.parse(mockText)
  DatabaseClient.runes.getAll.mockResolvedValue(parsed.runes.map(r => ({
    id: 'rune-existing-' + r.name,
    name: r.name,
    category: 'general'
  })))

  const wrapper = mount(Comp, {
    localVue,
    propsData: {
      value: true,
      defaultCategory: 'general',
      existingRunes: parsed.runes.map(r => ({ name: r.name, category: 'general' })),
      builtinNames: []
    }
  })
  await new Promise(r => setTimeout(r, 50))
  const vm = wrapper.vm
  await vm.applyParsedText(mockText)
  await new Promise(r => setTimeout(r, 50))

  // 数据契约
  expect(vm.newItems.length).toBe(0)
  expect(vm.conflictItems.length).toBe(7)
  expect(vm.hasSelectedItem).toBe(false)
  // v-if 渲染契约（不依赖 quasar portal）
  expect(shouldShowPreview(vm)).toBe(true)
  expect(shouldShowAllConflictBanner(vm)).toBe(true)
})

test('场景 C：runes 表里只有 2 个重名 → 弹框不渲染强提示 + hasSelectedItem=true', async () => {
  // 模拟 runes 表里只有"演示符文"和"日期"
  DatabaseClient.runes.getAll.mockResolvedValue([
    { id: 'r1', name: '演示符文', category: 'general' },
    { id: 'r2', name: '日期', category: 'general' }
  ])

  const wrapper = mount(Comp, {
    localVue,
    propsData: {
      value: true,
      defaultCategory: 'general',
      existingRunes: [],
      builtinNames: []
    }
  })
  await new Promise(r => setTimeout(r, 50))
  const vm = wrapper.vm
  await vm.applyParsedText(mockText)
  await new Promise(r => setTimeout(r, 50))

  expect(vm.newItems.length).toBe(5)
  expect(vm.conflictItems.length).toBe(2)
  expect(vm.hasSelectedItem).toBe(true)
  // 预览区仍显示，但强提示横幅不出现（newItems 不为空）
  expect(shouldShowPreview(vm)).toBe(true)
  expect(shouldShowAllConflictBanner(vm)).toBe(false)
})