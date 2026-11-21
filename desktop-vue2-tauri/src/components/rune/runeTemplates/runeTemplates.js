// ============================================================================
// runeTemplates —— 14 个内置 rune 模板（系统提供，固定不可删改）
//
// 每个 createXxxTemplate() 产出的是一段字符串形式的 Vue SFC，
// 由 mountRuneVueHosts 在编辑区实例化为可交互 rune 卡片。
//
// 拆分后目录结构（位于 ./runeTemplates/）：
//   - runeTemplatesBlank.js                    createBlankTemplate()       空白模板
//   - runeTemplatesInheritDemo.js              createInheritDemoTemplate() inheritFromPrevious 演示
//   - runeTemplatesInput.js                    createInputTemplate()       输入框（基础）
//   - runeTemplatesHolyShield.js               createHolyShieldTemplate()  hel-micro 远程加载
//   - runeTemplatesFirefly.js                  createFireflyTemplate()     萤火虫动画
//   - runeTemplatesJsxGraph.js                 createJsxGraphTemplate()    JSXGraph 坐标板
//   - runeTemplatesElInput.js                  createElInputTemplate()     el-input 包装
//   - runeTemplatesElSelect.js                 createElSelectTemplate()    el-select 包装
//   - runeTemplatesElDatePicker.js             createElDatePickerTemplate() el-date-picker 包装
//   - runeTemplatesResumeBasicInfo.js          createResumeBasicInfoTemplate()  简历基本信息
//   - runeTemplatesResumeTitle.js              createResumeTitleTemplate()      简历标题
//   - runeTemplatesResumeExperience.js         createResumeExperienceTemplate() 简历经历
//   - runeTemplatesResumeText.js               createResumeTextTemplate()       简历自由文本
//   - runeTemplatesResumeSkill.js              createResumeSkillTemplate()      简历技能条
//
// 外部 API 保持与原 rune-templates.js 一致：14 个 create*Template() 函数。
// ============================================================================

import runeTemplatesBlank from './runeTemplatesBlank.js'
import runeTemplatesInheritDemo from './runeTemplatesInheritDemo.js'
import runeTemplatesInput from './runeTemplatesInput.js'
import runeTemplatesHolyShield from './runeTemplatesHolyShield.js'
import runeTemplatesFirefly from './runeTemplatesFirefly.js'
import runeTemplatesJsxGraph from './runeTemplatesJsxGraph.js'
import runeTemplatesElInput from './runeTemplatesElInput.js'
import runeTemplatesElSelect from './runeTemplatesElSelect.js'
import runeTemplatesElDatePicker from './runeTemplatesElDatePicker.js'
import runeTemplatesResumeBasicInfo from './runeTemplatesResumeBasicInfo.js'
import runeTemplatesResumeTitle from './runeTemplatesResumeTitle.js'
import runeTemplatesResumeExperience from './runeTemplatesResumeExperience.js'
import runeTemplatesResumeText from './runeTemplatesResumeText.js'
import runeTemplatesResumeSkill from './runeTemplatesResumeSkill.js'

// 保持原 API：14 个 create*Template() 函数
const createBlankTemplate = runeTemplatesBlank
const createInheritDemoTemplate = runeTemplatesInheritDemo
const createInputTemplate = runeTemplatesInput
const createHolyShieldTemplate = runeTemplatesHolyShield
const createFireflyTemplate = runeTemplatesFirefly
const createJsxGraphTemplate = runeTemplatesJsxGraph
const createElInputTemplate = runeTemplatesElInput
const createElSelectTemplate = runeTemplatesElSelect
const createElDatePickerTemplate = runeTemplatesElDatePicker
const createResumeBasicInfoTemplate = runeTemplatesResumeBasicInfo
const createResumeTitleTemplate = runeTemplatesResumeTitle
const createResumeExperienceTemplate = runeTemplatesResumeExperience
const createResumeTextTemplate = runeTemplatesResumeText
const createResumeSkillTemplate = runeTemplatesResumeSkill

export {
  createBlankTemplate,
  createInheritDemoTemplate,
  createInputTemplate,
  createHolyShieldTemplate,
  createFireflyTemplate,
  createJsxGraphTemplate,
  createElInputTemplate,
  createElSelectTemplate,
  createElDatePickerTemplate,
  createResumeBasicInfoTemplate,
  createResumeTitleTemplate,
  createResumeExperienceTemplate,
  createResumeTextTemplate,
  createResumeSkillTemplate
}

export default {
  createBlankTemplate,
  createInheritDemoTemplate,
  createInputTemplate,
  createHolyShieldTemplate,
  createFireflyTemplate,
  createJsxGraphTemplate,
  createElInputTemplate,
  createElSelectTemplate,
  createElDatePickerTemplate,
  createResumeBasicInfoTemplate,
  createResumeTitleTemplate,
  createResumeExperienceTemplate,
  createResumeTextTemplate,
  createResumeSkillTemplate
}

// ============================================================================
// BUILTIN_RUNE_TEMPLATE_META —— 14 个内置 rune 模板的展示元数据（v2026-07-29 full-push）
//
// 真相源：和上面 14 个 create*Template() 工厂函数一一对应，**禁止在 main 端再写一份镜像**。
//
// 字段用途（用于落库到 main 端 rune_templates 表，schema 详见
// `src-electron/main-process/service/rune-template-service.js`）：
//   factoryName   —— 上面 create*Template 同名函数的字符串名（'createBlankTemplate' 等），
//                    由调用方通过 mod[factoryName]() 拿到模板字符串；选字符串而不是直接存函数引用，
//                    是为了让 IPC payload 跨进程可序列化，并把"factory 名"这个事实契约暴露给 jest。
//   id            —— 落库 id（DB 主键），统一前缀 `builtin-tpl-`
//   category_key  —— 落库 category_key（默认 'general'；简历类用 'resume'）
//   name          —— UI 显示名（中文）
//   desc          —— UI 显示描述（一句话）
//   color         —— UI 卡片颜色
//   icon          —— quasar icon 名（注意：不是 emoji）
//
// sort_order / is_builtin / created_at / updated_at 由 seedBuiltin() 运行时按顺序补齐。
// ============================================================================

const BUILTIN_RUNE_TEMPLATE_META = [
  {
    factoryName: 'createBlankTemplate',
    id: 'builtin-tpl-createBlankTemplate',
    category_key: 'general',
    name: '空白模板',
    desc: '标准 Vue SFC 格式（template + script + style + data + methods）',
    color: '#7E57C2',
    icon: 'description'
  },
  {
    factoryName: 'createInheritDemoTemplate',
    id: 'builtin-tpl-createInheritDemoTemplate',
    category_key: 'general',
    name: 'inheritFromPrevious 演示',
    desc: '演示从上一个 echo / rune 取值（inheritFromPrevious + props.value 回写）',
    color: '#26C6DA',
    icon: 'preview'
  },
  {
    factoryName: 'createInputTemplate',
    id: 'builtin-tpl-createInputTemplate',
    category_key: 'general',
    name: '输入框',
    desc: '@blur 时触发 $emit("input")，适合表单场景',
    color: '#66BB6A',
    icon: 'edit'
  },
  {
    factoryName: 'createHolyShieldTemplate',
    id: 'builtin-tpl-createHolyShieldTemplate',
    category_key: 'general',
    name: 'hel-micro',
    desc: '远程组件，演示 $hel.preFetchLib',
    color: '#FFB300',
    icon: 'cloud_download'
  },
  {
    factoryName: 'createJsxGraphTemplate',
    id: 'builtin-tpl-createJsxGraphTemplate',
    category_key: 'general',
    name: 'JsxGraph',
    desc: '通过 this.$jxg 初始化坐标系，点击上报坐标（JSXGraph）',
    color: '#4FC3F7',
    icon: 'show_chart'
  },
  {
    factoryName: 'createFireflyTemplate',
    id: 'builtin-tpl-createFireflyTemplate',
    category_key: 'general',
    name: '萤火虫',
    desc: 'CSS3 多点发光动画，点击萤火虫上报坐标（参考博客园）',
    color: '#FFD54F',
    icon: 'auto_awesome'
  },
  {
    factoryName: 'createElInputTemplate',
    id: 'builtin-tpl-createElInputTemplate',
    category_key: 'general',
    name: 'el-input',
    desc: 'Element-UI 输入框，@blur 时触发 $emit("input")',
    color: '#26A69A',
    icon: 'input'
  },
  {
    factoryName: 'createElSelectTemplate',
    id: 'builtin-tpl-createElSelectTemplate',
    category_key: 'general',
    name: 'el-select',
    desc: 'Element-UI 下拉选择，@change 时触发 $emit("input")',
    color: '#5C6BC0',
    icon: 'arrow_drop_down_circle'
  },
  {
    factoryName: 'createElDatePickerTemplate',
    id: 'builtin-tpl-createElDatePickerTemplate',
    category_key: 'general',
    name: 'el-date-picker',
    desc: 'Element-UI 日期选择（默认 date），@change 时触发 $emit("input")',
    color: '#7E57C2',
    icon: 'event'
  },
  {
    factoryName: 'createResumeBasicInfoTemplate',
    id: 'builtin-tpl-createResumeBasicInfoTemplate',
    category_key: 'resume',
    name: '简历-基本信息',
    desc: '头像 + 姓名 + 职位 + 联系方式，独立 rune 卡片，可自由组合',
    color: '#7E57C2',
    icon: 'person'
  },
  {
    factoryName: 'createResumeTitleTemplate',
    id: 'builtin-tpl-createResumeTitleTemplate',
    category_key: 'resume',
    name: '简历-标题段落',
    desc: '段落标题（H1/H2/H3），独立 rune 卡片',
    color: '#5C6BC0',
    icon: 'title'
  },
  {
    factoryName: 'createResumeExperienceTemplate',
    id: 'builtin-tpl-createResumeExperienceTemplate',
    category_key: 'resume',
    name: '简历-时间段经历',
    desc: '工作 / 项目经历（职位 / 机构 / 起止 / 描述），独立 rune 卡片',
    color: '#26A69A',
    icon: 'schedule'
  },
  {
    factoryName: 'createResumeTextTemplate',
    id: 'builtin-tpl-createResumeTextTemplate',
    category_key: 'resume',
    name: '简历-自由文本',
    desc: '自我介绍 / 备注，多行文本，独立 rune 卡片',
    color: '#4FC3F7',
    icon: 'subject'
  },
  {
    factoryName: 'createResumeSkillTemplate',
    id: 'builtin-tpl-createResumeSkillTemplate',
    category_key: 'resume',
    name: '简历-技能标签',
    desc: '技能名 + 熟练度进度条，独立 rune 卡片',
    color: '#FFB300',
    icon: 'insights'
  }
]

export {
  BUILTIN_RUNE_TEMPLATE_META
}

export const BUILTIN_RUNE_TEMPLATE_META_LIST = BUILTIN_RUNE_TEMPLATE_META

