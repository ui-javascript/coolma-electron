// ============================================================================
// tests/unit/rune/templates.test.js
// 从 scripts/verify-rune-templates.js 迁移而来（v2026-07-29 接入 Jest，2026-07-29 适配拆分）。
//
// 锁定的契约（14 个内置 rune 模板）：
//   1) 每个模板的 <script> 块语法可编译（new Function 不抛错）
//   2) 每个 SFC 字符串模板都声明了 props.value（mountRuneVueHosts 硬约定）
//   3) 源文件（拆分后是各 runeTemplates*.js）里的 </script> 都被转义成 <\/script>
//      （否则放在 .vue 文件里会被 Vue 编译器截断）
//   4) SFC 的回写通道：$emit('input', ...) 必须存在（非纯展示型 rune）
//
// === 拆分后的源文件位置 ===
//   拆分前是 src/components/rune/rune-templates.js（单文件，14 个 create*Template）。
//   拆分后是 src/components/rune/runeTemplates/runeTemplates*.js，每个文件
//   一段 rune 模板函数（命名为 runeTemplates*），由 ./runeTemplates.js 聚合并
//   用 create*Template 名字重新导出。
//
// === 文件名映射 ===
//   createBlankTemplate           → runeTemplatesBlank.js           里导出 runeTemplatesBlank
//   createInheritDemoTemplate     → runeTemplatesInheritDemo.js     里导出 runeTemplatesInheritDemo
//   createInputTemplate           → runeTemplatesInput.js           里导出 runeTemplatesInput
//   createHolyShieldTemplate      → runeTemplatesHolyShield.js      里导出 runeTemplatesHolyShield
//   createFireflyTemplate         → runeTemplatesFirefly.js         里导出 runeTemplatesFirefly
//   createJsxGraphTemplate        → runeTemplatesJsxGraph.js        里导出 runeTemplatesJsxGraph
//   createElInputTemplate         → runeTemplatesElInput.js         里导出 runeTemplatesElInput
//   createElSelectTemplate        → runeTemplatesElSelect.js        里导出 runeTemplatesElSelect
//   createElDatePickerTemplate    → runeTemplatesElDatePicker.js    里导出 runeTemplatesElDatePicker
//   createResumeBasicInfoTemplate → runeTemplatesResumeBasicInfo.js 里导出 runeTemplatesResumeBasicInfo
//   createResumeTitleTemplate     → runeTemplatesResumeTitle.js     里导出 runeTemplatesResumeTitle
//   createResumeExperienceTemplate→ runeTemplatesResumeExperience.js里导出 runeTemplatesResumeExperience
//   createResumeTextTemplate      → runeTemplatesResumeText.js      里导出 runeTemplatesResumeText
//   createResumeSkillTemplate     → runeTemplatesResumeSkill.js     里导出 runeTemplatesResumeSkill
// ============================================================================
const fs = require('fs')
const path = require('path')

const TEMPLATE_NAMES = [
  'createBlankTemplate',
  'createInheritDemoTemplate',
  'createInputTemplate',
  'createHolyShieldTemplate',
  'createFireflyTemplate',
  'createJsxGraphTemplate',
  'createElInputTemplate',
  'createElSelectTemplate',
  'createElDatePickerTemplate',
  'createResumeBasicInfoTemplate',
  'createResumeTitleTemplate',
  'createResumeExperienceTemplate',
  'createResumeTextTemplate',
  'createResumeSkillTemplate'
]

const SKIP_PROPS_VALUE = ['createBlankTemplate']
const SKIP_EMIT_INPUT = [
  'createBlankTemplate',
  'createResumeBasicInfoTemplate',
  'createResumeTitleTemplate',
  'createResumeExperienceTemplate',
  'createResumeTextTemplate',
  'createResumeSkillTemplate'
]

// create*Template → 对应的文件内导出名 + 文件名（去掉 "create" 前缀 + "Template" 后缀 → camelCase）
// 例：createBlankTemplate → "Blank" → 文件 runeTemplatesBlank.js，导出 runeTemplatesBlank
//     createElDatePickerTemplate → "ElDatePicker" → 文件 runeTemplatesElDatePicker.js
//     createResumeBasicInfoTemplate → "ResumeBasicInfo" → 文件 runeTemplatesResumeBasicInfo.js
function deriveExportName (createName) {
  if (!createName.startsWith('create') || !createName.endsWith('Template')) {
    throw new Error(`unexpected template name: ${createName}`)
  }
  return createName.slice('create'.length, -'Template'.length) // 'Blank', 'ElDatePicker', 'ResumeBasicInfo', ...
}

function buildFileAndExportName (createName) {
  const tail = deriveExportName(createName)
  return {
    fileName: `runeTemplates${tail}.js`,
    exportName: `runeTemplates${tail}`,
    filePath: path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'rune', 'runeTemplates', `runeTemplates${tail}.js`)
  }
}

const mod = require('../../../src/components/rune/runeTemplates/runeTemplates.js')

describe('rune/14 个内置 SFC 模板契约', () => {
  describe.each(TEMPLATE_NAMES.map(name => [name]))('[%s]', (name) => {
    let runtime
    let fileSrc
    let filePath
    let exportName

    beforeAll(() => {
      runtime = mod[name]()
      const meta = buildFileAndExportName(name)
      filePath = meta.filePath
      exportName = meta.exportName
      fileSrc = fs.readFileSync(filePath, 'utf8')
    })

    test('必须导出（来自聚合入口）', () => {
      expect(typeof mod[name]).toBe('function')
    })

    test('运行时含 <template>', () => {
      expect(runtime).toMatch(/<template>/)
    })

    test('运行时含 <script>', () => {
      expect(runtime).toMatch(/<script>/)
    })

    test('运行时含 </style>', () => {
      expect(runtime).toMatch(/<\/style>/)
    })

    test('在源文件里能找到函数定义（export const runeTemplatesXxx = () => { ... }）', () => {
      const fnHeaderRegex = new RegExp(`(const|export\\s+const)\\s+${exportName}\\s*=\\s*\\(?\\s*\\)?\\s*=>\\s*\\{`, 'm')
      expect(fileSrc.match(fnHeaderRegex)).toBeTruthy()
    })

    test('源文件内 </script> 必须转义成 <\\/script>', () => {
      const fnHeaderRegex = new RegExp(`(const|export\\s+const)\\s+${exportName}\\s*=\\s*\\(?\\s*\\)?\\s*=>\\s*\\{`, 'm')
      const headerMatch = fileSrc.match(fnHeaderRegex)
      expect(headerMatch).toBeTruthy()
      const fnBodyStart = headerMatch.index + headerMatch[0].length
      // 截取函数体前 30KB 足以覆盖所有 runeTemplates 的体积
      const fnBody = fileSrc.slice(fnBodyStart, fnBodyStart + 30000)
      expect(fnBody).toMatch(/<\\\/script>/)
    })

    describe('script 块 + props.value + $emit 通道', () => {
      let scriptBody
      let defMatch
      beforeAll(() => {
        const match = runtime.match(/<script>([\s\S]*?)<\/script>/i)
        expect(match).toBeTruthy()
        scriptBody = match[1]
        defMatch = scriptBody.match(/export\s+default\s+(\{[\s\S]*?\n\})/m)
      })

      test('能提取 <script> 块', () => {
        expect(scriptBody).toBeDefined()
      })

      test('能找到 export default {...} 块', () => {
        expect(defMatch).toBeTruthy()
      })

      test('<script> 块语法可编译', () => {
        if (defMatch) {
          const compileBody = scriptBody.replace(/export\s+default\s+\{/m, 'return {')
          expect(() => {
            // eslint-disable-next-line no-new-func
            new Function(compileBody)
          }).not.toThrow()
        }
      })

      if (!SKIP_PROPS_VALUE.includes(name)) {
        test('SFC 声明了 props.value（mountRuneVueHosts 硬约定）', () => {
          expect(defMatch).toBeTruthy()
          expect(defMatch[1]).toMatch(/props\s*:\s*\{[\s\S]*?\bvalue\b/)
        })
      }

      if (!SKIP_EMIT_INPUT.includes(name)) {
        test('含 $emit(\'input\', ...) 回写通道', () => {
          expect(runtime).toMatch(/\$emit\(\s*['"]input['"]/)
        })
      }
    })
  })
})
