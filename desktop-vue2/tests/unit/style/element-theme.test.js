const fs = require('fs')
const path = require('path')
const postcss = require('postcss')

const repoRoot = path.resolve(__dirname, '../../..')
const themePath = path.join(repoRoot, 'src/assets/css/element-theme.css')
const bootPath = path.join(repoRoot, 'src/boot/element-ui.js')
const themeCss = fs.readFileSync(themePath, 'utf8')

const PRIMARY_HEXES = [
  '#409eff',
  '#3a8ee6',
  '#337ecc',
  '#53a8ff',
  '#66b1ff',
  '#79bbff',
  '#8cc5ff',
  '#a0cfff',
  '#b3d8ff',
  '#c6e2ff',
  '#d9ecff',
  '#ecf5ff',
  '#f0f7ff',
  '#f2f8fe',
  '#e6f1fe'
]

describe('Element UI 主题色桥接', () => {
  test('生成文件可被 PostCSS 解析', () => {
    expect(() => postcss.parse(themeCss)).not.toThrow()
  })

  test('所有 Element UI 主色都换成应用主题变量', () => {
    for (const color of PRIMARY_HEXES) {
      expect(themeCss.toLowerCase()).not.toContain(color)
    }
    expect(themeCss).toContain('var(--themeColor)')
    expect(themeCss).toContain('var(--themeColor10)')
  })

  test('覆盖下拉、按钮、输入、树、日期、开关、复选等关键组件', () => {
    for (const selector of [
      '.el-dropdown-menu__item',
      '.el-button--primary',
      '.el-input__inner:focus',
      '.el-tree--highlight-current .el-tree-node.is-current',
      '.el-date-table td.current',
      '.el-switch.is-checked .el-switch__core',
      '.el-checkbox__input.is-checked'
    ]) {
      expect(themeCss).toContain(selector)
    }
  })

  test('官方 theme-chalk 之后才加载主题桥接样式', () => {
    const boot = fs.readFileSync(bootPath, 'utf8')
    const officialIndex = boot.indexOf('element-ui/lib/theme-chalk/index.css')
    const bridgeIndex = boot.indexOf('../assets/css/element-theme.css')
    expect(officialIndex).toBeGreaterThan(-1)
    expect(bridgeIndex).toBeGreaterThan(officialIndex)
  })

  test('浮动面板跟随应用浮层背景与字体变量', () => {
    expect(themeCss).toContain('background-color: var(--floatBgColor, var(--editorBgColor))')
    expect(themeCss).toContain('color: var(--floatFontColor, var(--editorColor))')
  })
})
