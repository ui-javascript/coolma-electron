/**
 * 设置 → 远程组件源：面板只做展示与编辑，拼接规则全在 runeSourceRegistry。
 * 这里锁住「空态 / 预览地址 / 新增即持久化 / 同名覆盖提示 / 删除」。
 */
jest.mock('components/common/bus.js', () => ({ __esModule: true, default: { $emit: jest.fn() } }))

const path = require('path')
const { mount, createLocalVue } = require('@vue/test-utils')
const {
  MELT_SOURCES_STORAGE_KEY,
  loadRuneSources,
  saveRuneSources
} = require('libs-muya-vue2/lib/rune/runeSourceRegistry')

const appBus = require('components/common/bus.js').default
const SettingsMeltSourcesPanel = require(path.resolve(
  __dirname, '../../../src/components/settings/SettingsMeltSourcesPanel.vue'
)).default

const Passthrough = {
  name: 'Passthrough',
  render (h) { return h('div', this.$slots.default) }
}
const QUASAR_TAGS = [
  'q-btn', 'q-icon', 'q-input', 'q-select', 'q-toggle', 'q-card',
  'q-card-section', 'q-space', 'q-separator', 'q-badge', 'q-tooltip'
]

function mountPanel () {
  const localVue = createLocalVue()
  QUASAR_TAGS.forEach(tag => localVue.component(tag, Passthrough))
  return mount(SettingsMeltSourcesPanel, {
    localVue,
    mocks: { $t: key => key }
  })
}

describe('远程组件源设置面板', () => {
  beforeEach(() => localStorage.clear())

  test('空态提示', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('remoteCompEmpty')
  })

  test('渲染已存条目并给出拼接后的产物地址', () => {
    saveRuneSources([{ name: '@melt-js/comps-vue2-meme', type: 'sftp', base: 'http://82.156.212.243' }])
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json')
  })

  test('新增一条立刻写回 localStorage', () => {
    const wrapper = mountPanel()
    expect(loadRuneSources()).toHaveLength(0)
    wrapper.vm.addSource()
    expect(loadRuneSources()).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(MELT_SOURCES_STORAGE_KEY))).toHaveLength(1)
  })

  test('同名条目：前面的被标记为已覆盖，后者生效', () => {
    saveRuneSources([
      { name: 'comps-vue2-meme', type: 'sftp', base: 'https://old.example.com' },
      { name: '@melt-js/comps-vue2-meme', type: 'sftp', base: 'http://82.156.212.243' }
    ])
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('remoteCompOverridden')
    expect(wrapper.vm.decorated[0].overridden).toBe(true)
    expect(wrapper.vm.decorated[1].overridden).toBe(false)
    expect(wrapper.vm.decorated[1].url).toContain('82.156.212.243')
  })

  test('非 unpkg 来源禁用版本输入并清空版本', () => {
    saveRuneSources([{ name: '@melt-js/comps-vue2-meme', type: 'sftp', base: 'http://82.156.212.243', version: '2026.11.18' }])
    const wrapper = mountPanel()
    expect(wrapper.vm.decorated[0].row.version).toBe('')
    // version 在保存时就被清掉，读回不会再有「不支持版本目录」的警告
    expect(wrapper.vm.decorated[0].warnings).toEqual([])
    expect(wrapper.vm.decorated[0].url).toBe('http://82.156.212.243/@melt-js/comps-vue2-meme/hel_dist/hel-meta.json')
  })

  test('删除后持久化同步', () => {
    saveRuneSources([{ name: 'a', type: 'sftp', base: 'https://a.example.com' }])
    const wrapper = mountPanel()
    wrapper.vm.removeSource(0)
    expect(loadRuneSources()).toHaveLength(0)
  })

  test('「刷新所有远程组件」广播清缓存事件', () => {
    const wrapper = mountPanel()
    appBus.$emit.mockClear()
    wrapper.vm.refreshAllRemote()
    expect(appBus.$emit).toHaveBeenCalledWith('meltCachesCleared')
  })
})
