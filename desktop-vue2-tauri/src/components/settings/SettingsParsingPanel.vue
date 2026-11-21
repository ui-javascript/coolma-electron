<template>
  <div class='settings-parsing-panel'>
    <SettingsSectionContent :title='$t("editorParsing")' accent-color='orange-8'>
      <!-- 第一栏：回响 —— 匹配必须要 () -->
      <div class='parsing-row'>
        <div class='parsing-row__text'>
          <div class='text-body2 text-weight-medium'>
            {{ $t('editorParsingEchoTitle') }}
            <span class='text-caption text-grey-6 q-ml-xs'>(@xxx{...}(prompt))</span>
          </div>
          <div class='text-caption text-grey-7 q-mt-xs parsing-row__hint'>
            {{ $t('editorParsingEchoRequireParensHint') }}
          </div>
        </div>
        <q-option-group
          :value='echoRequireParens ? "yes" : "no"'
          :options='yesNoOptions'
          color='orange-8'
          inline
          @input='val => onEchoChange(val === "yes")'
        />
      </div>

      <q-separator class='q-my-md' />

      <!-- 第二栏：符文 —— 保存前检测 template 下的 div 节点 -->
      <div class='parsing-row'>
        <div class='parsing-row__text'>
          <div class='text-body2 text-weight-medium'>
            {{ $t('editorParsingRuneTitle') }}
            <span class='text-caption text-grey-6 q-ml-xs'>&lt;template&gt; → &lt;div&gt;</span>
          </div>
          <div class='text-caption text-grey-7 q-mt-xs parsing-row__hint'>
            {{ $t('editorParsingRuneRequireTemplateDivHint') }}
          </div>
        </div>
        <q-option-group
          :value='runeRequireTemplateDiv ? "yes" : "no"'
          :options='yesNoOptions'
          color='orange-8'
          inline
          @input='val => onRuneChange(val === "yes")'
        />
      </div>
    </SettingsSectionContent>
  </div>
</template>

<script>
import SettingsSectionContent from 'components/settings/SettingsSectionContent'

export default {
  name: 'SettingsParsingPanel',
  components: {
    SettingsSectionContent
  },
  props: {
    echoRequireParens: {
      type: Boolean,
      required: true
    },
    runeRequireTemplateDiv: {
      type: Boolean,
      required: true
    }
  },
  data () {
    return {
      yesNoOptions: [
        { label: this.$t('yes') || '是', value: 'yes' },
        { label: this.$t('no') || '否', value: 'no' }
      ]
    }
  },
  methods: {
    onEchoChange (val) {
      this.$emit('update-state', { echoRequireParens: val })
    },
    onRuneChange (val) {
      this.$emit('update-state', { runeRequireTemplateDiv: val })
    }
  }
}
</script>

<style scoped>
.settings-parsing-panel {
  padding: 0 6px 4px 6px;
}

.parsing-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 2px;
}

.parsing-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.parsing-row__hint {
  line-height: 1.5;
  max-width: 60ch;
}

.settings-parsing-panel :deep(.q-separator) {
  background: rgba(0, 0, 0, 0.08);
}

.body--dark .settings-parsing-panel :deep(.q-separator) {
  background: rgba(255, 255, 255, 0.08);
}
</style>