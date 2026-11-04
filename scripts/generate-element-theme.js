/**
 * 生成 Element UI 主题色桥接样式。
 *
 * Element UI 2.x 的 theme-chalk 在编译期把主色写死为 #409EFF 及其浅色梯度，
 * 无法直接消费 CSS 变量。这里扫描官方 theme-chalk，把所有主色相关声明抽出来，
 * 替换成应用的 --themeColor* 变量，生成一份加载在官方主题之后的覆盖样式。
 *
 * 使用：
 *   node scripts/generate-element-theme.js
 */
const fs = require('fs')
const path = require('path')
const postcss = require('postcss')

const SOURCE = path.resolve(__dirname, '../node_modules/element-ui/lib/theme-chalk/index.css')
const TARGET = path.resolve(__dirname, '../src/assets/css/element-theme.css')

// Element UI 主色梯度（theme-chalk/src/common/var.scss）→ 应用主题色变量
const PRIMARY_COLORS = [
  ['#409eff', 'var(--themeColor)'],
  ['#3a8ee6', 'var(--themeColor90)'],
  ['#337ecc', 'var(--themeColor90)'],
  ['#53a8ff', 'var(--themeColor90)'],
  ['#66b1ff', 'var(--themeColor80)'],
  ['#79bbff', 'var(--themeColor70)'],
  ['#8cc5ff', 'var(--themeColor60)'],
  ['#a0cfff', 'var(--themeColor50)'],
  ['#b3d8ff', 'var(--themeColor40)'],
  ['#c6e2ff', 'var(--themeColor30)'],
  ['#d9ecff', 'var(--themeColor20)'],
  ['#ecf5ff', 'var(--themeColor10)'],
  // 少数组件使用的浅色 tint，同样跟随主题
  ['#f0f7ff', 'var(--themeColor10)'],
  ['#f2f8fe', 'var(--themeColor10)'],
  ['#e6f1fe', 'var(--themeColor10)']
].map(([color, variable]) => [
  new RegExp(color + '\\b', 'gi'),
  variable
])

const source = fs.readFileSync(SOURCE, 'utf8')
const root = postcss.parse(source, { from: SOURCE })
const output = []
let declarationCount = 0

root.walkRules(rule => {
  const declarations = []

  rule.walkDecls(decl => {
    let value = decl.value
    let matched = false

    for (const [pattern, variable] of PRIMARY_COLORS) {
      const nextValue = value.replace(pattern, variable)
      if (nextValue !== value) {
        value = nextValue
        matched = true
      }
    }

    if (matched) {
      declarations.push(`${decl.prop}: ${value}${decl.important ? ' !important' : ''};`)
      declarationCount++
    }
  })

  if (declarations.length === 0) return

  // 提升一级选择器权重，确保覆盖加载顺序不确定的官方 theme-chalk
  const selector = rule.selector
    .split(',')
    .map(part => {
      const trimmed = part.trim()
      if (/^(body|html|:root)\b/.test(trimmed)) return trimmed
      return `body ${trimmed}`
    })
    .join(',\n')

  output.push(`${selector} {\n${declarations.map(line => `  ${line}`).join('\n')}\n}`)
})

const header = `/* =========================================================
 * Element UI 主题色桥接（自动生成，请勿手改）
 * 生成命令：node scripts/generate-element-theme.js
 * 来源：node_modules/element-ui/lib/theme-chalk/index.css
 * 作用：把 Element UI 写死的主色及其浅色梯度映射到应用的
 *      --themeColor / --themeColor10...90 CSS 变量，
 *      让 Element UI 主题色跟随 Default-Light / Default-Dark / 皮肤切换。
 * ========================================================= */
`

// 浮动面板跟随应用浮层变量：暗色主题下不再残留白底，浅色主题保持原样
const extra = `
/* 下拉面板：跟随应用浮层背景 / 字体，主题色 hover 才可读 */
body .el-dropdown-menu {
  background-color: var(--floatBgColor, var(--editorBgColor));
  border-color: var(--floatBorderColor);
}

body .el-dropdown-menu__item {
  color: var(--floatFontColor, var(--editorColor));
}

body .el-select-dropdown {
  background-color: var(--floatBgColor, var(--editorBgColor));
  border-color: var(--floatBorderColor);
}

body .el-select-dropdown__item {
  color: var(--floatFontColor, var(--editorColor));
}

body .el-select-dropdown__item.hover,
body .el-select-dropdown__item:hover {
  background-color: var(--floatHoverColor);
}
`

fs.writeFileSync(TARGET, header + output.join('\n\n') + '\n' + extra, 'utf8')

console.log(`Generated ${path.relative(process.cwd(), TARGET)}`)
console.log(`  rules: ${output.length}, declarations: ${declarationCount}`)
