// 烟雾测试：确认 libs-muya 的所有 import 路径能被 pnpm workspace 解析到源码
// 这是最关键的契约——路径解析失败 = 主项目跑不起来

const path = require.resolve('libs-muya/lib')
const utilsPath = require.resolve('libs-muya/lib/utils')
const tablePickerPath = require.resolve('libs-muya/lib/ui/tablePicker')
const quickInsertPath = require.resolve('libs-muya/lib/ui/quickInsert')
const themeCssPath = require.resolve('libs-muya/themes/default.css')
const configPath = require.resolve('libs-muya/lib/config')
const parserPath = require.resolve('libs-muya/lib/parser')

describe('libs-muya via pnpm workspace — path resolution', () => {
  it('main entry resolves to libs-muya/lib/index.js', () => {
    expect(path).toMatch(/libs-muya[\\/]lib[\\/]index\.js$/)
  })

  it('sub-paths resolve under libs-muya/lib/', () => {
    for (const p of [utilsPath, tablePickerPath, quickInsertPath, configPath, parserPath]) {
      expect(p).toMatch(/libs-muya[\\/]lib[\\/]/)
    }
  })

  it('themes/default.css resolves', () => {
    expect(themeCssPath).toMatch(/libs-muya[\\/]themes[\\/]default\.css$/)
  })
})