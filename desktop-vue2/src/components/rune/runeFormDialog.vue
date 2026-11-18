<template>
  <div>
    <q-dialog
      ref='dialog'
      transition-show='fade'
      transition-hide='fade'
      :value='value'
      @input='v => $emit("input", v)'
      :persistent='false'
    >
      <q-card class='rune-form-card'>
        <q-toolbar class='rune-form-toolbar'>
          <q-icon name='star' color='primary' size='1.5em' />
          <q-toolbar-title>
            <span class='text-weight-bold non-selectable'>
              {{ isEditing ? resolvedEditTitle : resolvedAddTitle }}
            </span>
          </q-toolbar-title>
          <q-btn flat round dense icon='close' v-close-popup />
        </q-toolbar>

        <q-card-section class='rune-form-body'>
          <div class='rune-form-content'>
            <!-- 左侧表单区域 -->
            <runeFormFields
              :form='form'
              :mode='mode'
              @update:form='val => form = val'
              @update-inherit='val => form.inherit_from_previous = val'
              @request-ai-help='handleRequestAiHelp'
            />

            <!-- 右侧编辑器区域 -->
            <runeFormEditor
              ref='runeFormEditor'
              :form-data='form'
              :template='form.template'
              :visible='value'
              @update-template='val => form.template = val'
              @update-field='fields => Object.assign(form, fields)'
              @open-remote-import='openRemoteImportDialog'
            />
          </div>
        </q-card-section>

        <q-card-actions align='right' class='rune-form-footer'>
          <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
          <q-btn flat dense no-caps color='primary' :label="$t('ok')" @click='submit' />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- 远端导入弹框 -->
    <runeRemoteImportDialog
      v-model='remoteImportDialogVisible'
      :url='remoteImportUrl'
      :category='remoteImportCategory'
      :category-options='runeCategoryOptions'
      :submitting='remoteImporting'
      :error-message='remoteImportError'
      @submit='onRemoteImportSubmit'
    />
  </div>
</template>

<script>
import { RuneCategoryEnum } from 'src/utils/enum'
import { createBlankTemplate, createInheritDemoTemplate, BUILTIN_RUNE_TEMPLATE_META } from './runeTemplates/runeTemplates.js'
import runeTemplateService from 'src/services/RuneTemplateService'
import { hasRuneTemplateDiv } from 'src/utils/parsing/parsingRules'
import bus from 'src/components/common/bus'
import { EVENTS } from 'src/utils/const/eventsConst'

import runeFormFields from './runeFormFields.vue'
import runeFormEditor from './runeFormEditor.vue'
import runeRemoteImportDialog from './runeRemoteImportDialog.vue'

// 懒加载模板工厂函数映射
const _templateFactoryMap = {
  createBlankTemplate: createBlankTemplate,
  createInheritDemoTemplate: createInheritDemoTemplate,
  createInputTemplate: null,
  createHolyShieldTemplate: null,
  createFireflyTemplate: null,
  createJsxGraphTemplate: null,
  createElInputTemplate: null,
  createElSelectTemplate: null,
  createElDatePickerTemplate: null,
  createResumeBasicInfoTemplate: null,
  createResumeTitleTemplate: null,
  createResumeExperienceTemplate: null,
  createResumeTextTemplate: null,
  createResumeSkillTemplate: null
}

const createUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : ((r & 0x3) | 0x8)
    return v.toString(16)
  })
}

const createRuneForm = (rune = {}, defaultCategory = RuneCategoryEnum.General) => ({
  id: rune.id || createUuid(),
  name: rune.name || '',
  desc: rune.desc || '',
  color: rune.color || '#7E57C2',
  icon: rune.icon || 'whatshot',
  template: rune.template || createInheritDemoTemplate(),
  category: rune.category || defaultCategory,
  inherit_from_previous: rune.inherit_from_previous == null ? 1 : rune.inherit_from_previous
})

export default {
  name: 'runeFormDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  components: {
    runeFormFields,
    runeFormEditor,
    runeRemoteImportDialog
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    rune: {
      type: Object,
      default: null
    },
    mode: {
      type: String,
      default: 'rune'
    },
    defaultCategory: {
      type: String,
      default: ''
    },
    runeRequireTemplateDiv: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      dialog: null,
      // v2026-08-01（修复）：data 初始化时立即用 defaultCategory prop，避免 v-if mount 后 + watch.rune 异步触发的
      //   渲染抖动（用户看到下拉框空白 → 一帧后跳到目标分类）。父端 openAddRune 已先更新 runeCategory
      //   再设 runeFormKey++ 触发重建，prop default-category 在组件创建瞬间就是目标值。
      form: createRuneForm({}, this.defaultCategory),
      remoteImportDialogVisible: false,
      remoteImportUrl: '',
      remoteImportCategory: '',
      remoteImporting: false,
      remoteImportError: ''
    }
  },
  computed: {
    isEditing () {
      return !!this.rune
    },
    isEchoMode () {
      return this.mode === 'echo'
    },
    runeCategoryOptions () {
      return RuneCategoryEnum.items.map(c => ({ value: c.value, label: c.label }))
    },
    resolvedAddTitle () {
      return this.isEchoMode ? this.$t('echoCardAdd') : this.$t('runeCardAdd')
    },
    resolvedEditTitle () {
      return this.isEchoMode ? this.$t('echoCardEdit') : this.$t('runeCardEdit')
    }
  },
  watch: {
    value: {
      immediate: true,
      handler (val) {
        if (val) {
          this.dialog = this.$refs.dialog
        }
      }
    },
    rune: {
      immediate: true,
      handler (val) {
        if (val) {
          const form = createRuneForm(val, val.category)
          if (!val.template) form.template = createBlankTemplate()
          this.form = form
          console.log('\n[RuneFormDialog.rune watcher] Loaded editing rune:', {
            id: this.form.id,
            name: this.form.name,
            templateLen: (this.form.template || '').length
          })
        } else {
          this.form = createRuneForm({}, this.defaultCategory || RuneCategoryEnum.General)
          console.log('\n[RuneFormDialog.rune watcher] Initialized new rune form:', {
            id: this.form.id
          })
        }
      }
    }
  },
  mounted () {
    this.dialog = this.$refs.dialog
  },
  methods: {
    handleRequestAiHelp () {
      const desc = String(this.form.desc || '').trim()
      const builtinTemplates = BUILTIN_RUNE_TEMPLATE_META.map(tpl => {
        const templateSource = this._getTemplateSource(tpl.factoryName)
        return '【' + tpl.name + '】\n' +
          (tpl.desc || '无描述') + '\n' +
          '---\ntemplate:\n```html\n' +
          templateSource + '\n```'
      }).join('\n\n')

      const templateExample = [
        '<template>',
        '  <div class="rune-card" :style="{ borderColor: color }">',
        '    <!-- 符文内容 -->',
        '  </div>',
        '</template>',
        '',
        '<script>',
        'export default {',
        '  name: "myRune",',
        '  props: {',
        '    value: { type: String, default: "" },',
        '    color: { type: String, default: "#7E57C2" }',
        '  },',
        '  methods: {',
        '    updateValue (val) {',
        '      this.$emit("input", val)',
        '    }',
        '  }',
        '}',
        '<\\/script>',
        '',
        '<style scoped>',
        '.rune-card {',
        '  border: 2px solid;',
        '  border-radius: 8px;',
        '  padding: 12px;',
        '}',
        '</style>'
      ].join('\n')

      const prompt = [
        '你是一个符文（Rune）编辑器助手。请根据用户的描述和所有内置符文模板，帮助生成一个新的符文 SFC 代码。',
        '',
        '用户描述：',
        desc || '（未提供描述）',
        '',
        '当前符文内容是：',
        (this.form.template || '').trim() || '（空）',
        '',
        '基于此进行修改。',
        '',
        '所有内置符文模板：',
        builtinTemplates,
        '',
        '请生成一个新的符文 SFC，遵循以下格式：',
        '```html',
        templateExample,
        '```',
        '',
        '只输出最终的代码块，不要输出分析过程。'
      ].join('\n')

      this.$busDialog.$emit('AiHelperBusDialog.open', {
        codeGenPrompt: prompt,
        codeGenType: 'rune',
        codeGenTargetName: this.form.name || '新符文',
        codeGenCallback: (code) => {
          // 提取代码块中的内容
          const extractedCode = this._extractCodeFromMarkdown(code)
          // 更新 form 数据
          this.form.template = extractedCode
          // 直接更新 monaco 编辑器
          const editorRef = this.$refs.runeFormEditor
          if (editorRef && editorRef.setTemplate) {
            editorRef.setTemplate(extractedCode)
          }
          this.$emit('update-template', extractedCode)
        }
      })
    },

    _getTemplateSource (factoryName) {
      if (!_templateFactoryMap[factoryName]) {
        // 懒加载模板
        try {
          const mod = require('./runeTemplates/runeTemplates.js')
          if (mod && mod[factoryName]) {
            _templateFactoryMap[factoryName] = mod[factoryName]
          }
        } catch (e) {
          return '(模板源码不可用)'
        }
      }
      const factory = _templateFactoryMap[factoryName]
      if (factory) {
        const source = factory()
        return (typeof source === 'string' ? source : '').substring(0, 500)
      }
      return '(模板源码不可用)'
    },

    _extractCodeFromMarkdown (markdown) {
      // 提取 markdown 中的代码块内容
      const codeBlockMatch = markdown.match(/```(?:html|vue)?\s*([\s\S]*?)```/)
      if (codeBlockMatch && codeBlockMatch[1]) {
        return codeBlockMatch[1].trim()
      }
      // 如果没有代码块，尝试直接返回（可能是纯 SFC 代码）
      return markdown.trim()
    },

    openRemoteImportDialog () {
      this.remoteImportError = ''
      this.remoteImportUrl = ''
      this.remoteImportCategory = this.form.category || ''
      this.remoteImportDialogVisible = true
    },

    async onRemoteImportSubmit ({ url, category } = {}) {
      this.remoteImporting = true
      this.remoteImportError = ''
      try {
        const res = await runeTemplateService.fetchFromGithub({
          sourceUrl: url || '',
          categoryKey: category || this.form.category || RuneCategoryEnum.General
        })
        if (!res || !res.success) {
          this.remoteImportError = (res && (res.message || res.code)) || '导入失败'
          return
        }
        const newRow = res.data
        if (newRow) {
          this.form.template = newRow.template || createBlankTemplate()
          if (newRow.name && !this.form.name) this.form.name = newRow.name
          if (newRow.desc && !this.form.desc) this.form.desc = newRow.desc
        }
        this.remoteImportDialogVisible = false
      } catch (e) {
        this.remoteImportError = (e && e.message) || String(e)
      } finally {
        this.remoteImporting = false
      }
    },

    submit () {
      if (!String(this.form.name || '').trim()) {
        this.$q.notify({ message: this.$t('runeNameRequired'), type: 'warning', position: 'top' })
        return
      }
      const editorRef = this.$refs.runeFormEditor
      if (editorRef && editorRef.isMonacoReady && !editorRef.isMonacoReady()) {
        return
      }
      if (editorRef && editorRef.getTemplate) {
        this.form.template = editorRef.getTemplate()
      }
      // 语法解析开关：符文 template 下 div 必填（详见 SettingsDialog/SettingsParsingPanel）
      // 默认关闭。开启后要求 <template>...</template> 块内至少出现一个 <div 标签起始。
      if (this.runeRequireTemplateDiv && !hasRuneTemplateDiv(this.form.template)) {
        this.$q.notify({ message: this.$t('editorParsingRuneTemplateDivMissing'), type: 'warning', position: 'top' })
        return
      }
      console.log('\n[RuneFormDialog.submit] Emitting rune payload:', {
        id: this.form.id,
        name: this.form.name,
        desc: this.form.desc,
        templateLen: (this.form.template || '').length
      })
      this.$emit('submit', { ...this.form })
    }
  }
}
</script>

<style lang="scss" scoped>
.rune-form-card {
  min-width: 600px;
  max-width: 82vw;
  width: 760px;
  height: 78vh;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rune-form-toolbar {
  flex: 0 0 auto;
}

.rune-form-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 16px;
}

.rune-form-content {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 14px;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
}

.rune-form-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.03);
}

/* Dark mode overrides */
.body--dark .rune-form-footer {
  border-top-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
}

@media (max-width: 680px) {
  .rune-form-card {
    width: 96vw;
    max-width: 96vw;
  }

  .rune-form-body {
    flex-direction: column;
  }
}
</style>
