// 烟雾测试：确认 libs-muya-vue2 的所有 import 路径能被 pnpm workspace 解析到源码
// 这是最关键的契约——路径解析失败 = 主项目跑不起来

const path = require.resolve('libs-muya-vue2/lib')
const utilsPath = require.resolve('libs-muya-vue2/lib/utils')
const tablePickerPath = require.resolve('libs-muya-vue2/lib/ui/tablePicker')
const quickInsertPath = require.resolve('libs-muya-vue2/lib/ui/quickInsert')
const themeCssPath = require.resolve('libs-muya-vue2/themes/default.css')
const configPath = require.resolve('libs-muya-vue2/lib/config')
const parserPath = require.resolve('libs-muya-vue2/lib/parser')

describe('libs-muya-vue2 via pnpm workspace — path resolution', () => {
  it('main entry resolves to libs-muya-vue2/lib/index.js', () => {
    expect(path).toMatch(/libs-muya-vue2[\\/]lib[\\/]index\.js$/)
  })

  it('sub-paths resolve under libs-muya-vue2/lib/', () => {
    for (const p of [utilsPath, tablePickerPath, quickInsertPath, configPath, parserPath]) {
      expect(p).toMatch(/libs-muya-vue2[\\/]lib[\\/]/)
    }
  })

  it('themes/default.css resolves', () => {
    expect(themeCssPath).toMatch(/libs-muya-vue2[\\/]themes[\\/]default\.css$/)
  })
})