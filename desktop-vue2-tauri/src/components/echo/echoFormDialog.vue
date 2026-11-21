<template>
  <q-dialog
    ref='dialog'
    transition-show='fade'
    transition-hide='fade'
    :value='value'
    @input='v => $emit("input", v)'
    :persistent='false'
  >
    <q-card class='echo-form-card'>
      <q-toolbar class='echo-form-toolbar'>
        <q-icon name='graphic_eq' color='teal-5' size='1.5em' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>
            {{ isReadonly ? ($t('echoCardView') || '查看回响') : (isEditing ? $t('echoCardEdit') : $t('echoCardAdd')) }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='echo-form-body'>
        <div class='echo-form-content'>
          <!-- 左侧表单区域 -->
          <echoFormFields
            :form='form'
            :is-readonly='isReadonly'
            :is-builtin='isBuiltin'
            @update:form='val => form = val'
            @request-ai-help='handleRequestAiHelp'
          />

          <!-- 右侧编辑器区域 -->
          <echoFormEditor
            ref='echoFormEditor'
            :source='form.anno_source'
            :echo-name='form.name'
            :is-readonly='isReadonly'
            :is-builtin='isBuiltin'
            :visible='value'
            @update-source='val => form.anno_source = val'
          />
        </div>
      </q-card-section>

      <q-card-actions align='right' class='echo-form-footer'>
        <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
        <q-btn
          flat
          dense
          no-caps
          :color='isReadonly ? "primary" : "primary"'
          :icon='isReadonly ? "check" : undefined'
          :label='isReadonly ? ($t("close") || "关闭") : $t("ok")'
          @click='onPrimaryClick'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { v4 as uuidv4 } from 'uuid'
import {
  createDefaultEchoAnnoSource,
  DEFAULT_ECHO_COLOR,
  DEFAULT_ECHO_ICON
} from 'src/components/echo/echoCore'
import { BUILTIN_ECHO_CARDS } from 'src/components/echo/echoBuiltins/echoBuiltins'
import { DEFAULT_ECHO_CATEGORY, EchoCategoryEnum } from 'src/utils/enum'
import { normalizeEchoCategory } from 'src/utils/const/runeEchoCategoryLogic'
import { hasEchoParens } from 'src/utils/parsing/parsingRules'
import bus from 'src/components/common/bus'
import { EVENTS } from 'src/utils/const/eventsConst'

import echoFormFields from './echoFormFields.vue'
import echoFormEditor from './echoFormEditor.vue'

const DEFAULT_RENDER_TYPE = 'anno'

const createUuid = () => uuidv4()

export default {
  name: 'echoFormDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  components: {
    echoFormFields,
    echoFormEditor
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    echo: {
      type: Object,
      default: null
    },
    defaultCategory: {
      type: String,
      default: ''
    },
    echoRequireParens: {
      type: Boolean,
      default: true
    }
  },
  data () {
    return {
      dialog: null,
      form: {
        id: '',
        name: '',
        desc: '',
        color: DEFAULT_ECHO_COLOR,
        icon: DEFAULT_ECHO_ICON,
        anno_source: createDefaultEchoAnnoSource(),
        render_type: DEFAULT_RENDER_TYPE,
        category: DEFAULT_ECHO_CATEGORY,
        isBuiltin: false
      }
    }
  },
  computed: {
    isEditing () {
      return !!this.echo
    },
    isBuiltin () {
      return Boolean(this.echo && this.echo.isBuiltin)
    },
    isProd () {
      return process.env.PROD === true
    },
    isReadonly () {
      return this.isBuiltin && this.isProd
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
    echo: {
      immediate: true,
      handler (val) {
        if (val) {
          const annoSource = val.anno_source || val.template || createDefaultEchoAnnoSource(val.name)
          const category = val.isBuiltin ? (val.category || EchoCategoryEnum.Builtin) : normalizeEchoCategory(val.category)
          this.form = {
            id: val.id,
            name: val.name || '',
            desc: val.desc || '',
            color: val.color || DEFAULT_ECHO_COLOR,
            icon: val.icon || DEFAULT_ECHO_ICON,
            anno_source: annoSource,
            render_type: val.render_type || DEFAULT_RENDER_TYPE,
            category,
            isBuiltin: Boolean(val.isBuiltin),
            created_at: val.created_at,
            updated_at: val.updated_at
          }
        } else {
          this.form = {
            id: createUuid(),
            name: '',
            desc: '',
            color: DEFAULT_ECHO_COLOR,
            icon: DEFAULT_ECHO_ICON,
            anno_source: createDefaultEchoAnnoSource(),
            render_type: DEFAULT_RENDER_TYPE,
            category: this.defaultCategory || DEFAULT_ECHO_CATEGORY,
            isBuiltin: false
          }
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
      const builtinTemplates = BUILTIN_ECHO_CARDS.map(card => {
        return `【${card.name}】
${card.desc || '无描述'}
---
anno_source:
\`\`\`javascript
${card.anno_source}
\`\`\`
`
      }).join('\n\n')

      const prompt = `你是一个回响（Echo）编辑器助手。请根据用户的描述和所有内置回响模板，帮助生成一个新的回响 anno_source 代码。

用户描述：
${desc || '（未提供描述）'}

当前回响内容是：
${(this.form.anno_source || '').trim() || '（空）'}

基于此进行修改。

所有内置回响模板：
${builtinTemplates}

请生成一个新的回响 anno_source，遵循以下格式：
\`\`\`javascript
export default {
  type: 'echo',        // 'echo' | 'echo-chant' | 'echo-tbd'
  field: 'xxx',        // 字段名（与 name 相同）
  title: 'xxx',        // 标题
  version: 1,
  props: {},
  render(node, props = {}) {
    return '<span>...</span>'  // 返回 HTML 字符串
  },
  afterRender(node, props = {}) {
    const $ = window.jQuery
    const $node = $(node)
    // 使用 jQuery 操作 DOM
  }
}
\`\`\`

只输出最终的代码块，不要输出分析过程。`

      this.$busDialog.$emit('AiHelperBusDialog.open', {
        codeGenPrompt: prompt,
        codeGenType: 'echo',
        codeGenTargetName: this.form.name || '新回响',
        codeGenCallback: (code) => {
          // 更新 form 数据
          this.form.anno_source = code
          // 直接更新 monaco 编辑器
          const editorRef = this.$refs.echoFormEditor
          if (editorRef && editorRef.setSource) {
            editorRef.setSource(code)
          }
          this.$emit('update-source', code)
        }
      })
    },

    onPrimaryClick () {
      if (this.isReadonly) {
        if (this.dialog) this.dialog.hide()
        return
      }
      this.submit()
    },

    submit () {
      if (this.isReadonly) {
        if (this.dialog) this.dialog.hide()
        return
      }
      const name = String(this.form.name || '').trim()
      if (!name) {
        this.$q.notify({ message: this.$t('echoNameRequired'), type: 'warning', position: 'top' })
        return
      }
      const editorRef = this.$refs.echoFormEditor
      const annoSource = editorRef && editorRef.getSource
        ? editorRef.getSource()
        : (this.form.anno_source || '')
      if (!annoSource.trim()) return
      // 语法解析开关：回响 () 必填（详见 SettingsDialog/SettingsParsingPanel）
      // 默认开启。开启后要求 anno_source 中至少出现一处 @<name>(...) 或 @<name>{...}(...) 的示例，
      // 保证 echo 的占位符形态符合 CURRENT_ECHO_PLACEHOLDER_RE 的 () 成对约定。
      if (this.echoRequireParens && !hasEchoParens(annoSource, name)) {
        this.$q.notify({ message: this.$t('editorParsingEchoParensMissing'), type: 'warning', position: 'top' })
        return
      }
      const category = this.form.isBuiltin
        ? (this.form.category || EchoCategoryEnum.Builtin)
        : normalizeEchoCategory(this.form.category)
      const payload = {
        ...this.form,
        name,
        desc: String(this.form.desc || '').trim(),
        anno_source: annoSource,
        render_type: DEFAULT_RENDER_TYPE,
        category
      }
      this.$emit('submit', payload)
    }
  }
}
</script>

<style lang="scss" scoped>
.echo-form-card {
  min-width: 680px;
  max-width: 88vw;
  width: 900px;
  height: 80vh;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.echo-form-toolbar {
  flex: 0 0 auto;
}

.echo-form-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 16px;
}

.echo-form-content {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 14px;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
}

.echo-form-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.03);
}

/* Dark mode overrides */
.body--dark .echo-form-footer {
  border-top-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
}

@media (max-width: 760px) {
  .echo-form-card {
    width: 96vw;
    min-width: auto;
    height: 88vh;
  }

  .echo-form-content {
    flex-direction: column;
  }
}
</style>
