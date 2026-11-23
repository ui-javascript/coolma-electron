// ============================================================================
// 符文 / 回响目录（POC 数据源）
//
// 真实博客里 catalog 由导出器从 SQLite 的 runes / echoes 表读出，
// 这里直接复用仓库根目录的导出包，保证「博客看到的定义」和桌面端一致。
// 额外追加一条 melt-js 定义，用来验证 hel-micro 远程 Vue2 组件能否在
// VuePress 宿主里被全局注册并渲染。
// ============================================================================

// eslint-disable-next-line import/no-unresolved
const runePack = require('../../../../tpl-rune/memocast-runes-2026-08-01.json')
// eslint-disable-next-line import/no-unresolved
const echoPack = require('../../../../tpl-echo/memocast-echoes-2026-08-01.json')

const DEMO_MELT_RUNE = {
  id: 'demo-melt-hello',
  name: 'melt-hello',
  desc: 'hel-micro 远程 Vue2 组件（comps-vue2/HelloWorld）',
  category: 'demo',
  color: '#26A69A',
  icon: 'cloud',
  template: JSON.stringify({
    $type: 'melt-js',
    version: 1,
    dep: {
      name: 'comps-vue2',
      type: 'custom',
      version: '',
      platform: '',
      host: 'https://cdn.jsdelivr.net/gh/melt-js/comps-vue2@master/hel_dist/hel-meta.json',
      requiredExports: ['HelloWorld']
    },
    exportName: 'HelloWorld',
    valueProp: 'value',
    valueEvent: 'input',
    props: {}
  })
}

const runes = (runePack.runes || []).slice()
const echoes = (echoPack.echoes || []).slice()

// 只把 POC 定义追加到内存目录，不改动导出包原件
runes.push(DEMO_MELT_RUNE)

const byName = list => {
  const map = new Map()
  list.forEach(item => {
    if (item && item.name) map.set(String(item.name).trim(), item)
  })
  return map
}

const runeMap = byName(runes)
const echoMap = byName(echoes)

export function findRune (name) {
  return runeMap.get(String(name || '').trim()) || null
}

export function findEcho (name) {
  return echoMap.get(String(name || '').trim()) || null
}

export function listRunes () {
  return runes
}

export function listEchoes () {
  return echoes
}

export default { findRune, findEcho, listRunes, listEchoes }
