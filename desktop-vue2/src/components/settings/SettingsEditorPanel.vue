<template>
  <div class='settings-editor-panel-layout'>
    <CategoryTabs
      v-model='subTab'
      :tabs='subTabOptions'
      color-theme='orange'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-editor-panel'>
      <!-- 笔记 -->
      <SettingsSectionContent v-if='subTab === $enums.EditorSubEnum.Note' :title="$t('editorNote')" accent-color='orange-8'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('markdownOnly') }}</span>
            <q-toggle
              :value='markdownOnly'
              color='orange-8'
              @input="v => $emit('toggle-change', { key: 'markdownOnly', value: v })"
            />
          </div>
        </div>
        <q-separator class='q-my-xs' />
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('noteListDenseMode') }}</span>
            <q-toggle
              :value='noteListDenseMode'
              color='orange-8'
              @input="v => $emit('toggle-change', { key: 'noteListDenseMode', value: v })"
            />
          </div>
        </div>
        <q-separator class='q-my-xs' />
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            <span>{{ $t('noteOrder') }}</span>
            <q-select
              dense options-dense
              :value='noteOrderType'
              :options='noteOrderOptions'
              emit-value map-options
              @input='noteOrderChangeHandler'
            />
          </div>
        </div>
      </SettingsSectionContent>

      <!-- 面板 -->
      <SettingsSectionContent v-if='subTab === $enums.EditorSubEnum.Panel' :title="$t('editorPanel')" accent-color='orange-8'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            <div class='row items-center no-wrap justify-between q-mb-xs'>
              <span>{{ $t('quickInsertColumns') }}</span>
              <div class='row items-center no-wrap q-gutter-xs'>
                <q-badge color='orange-8' align='middle'>{{ quickInsertColumns }}</q-badge>
                <span class='text-caption text-grey-6'>默认 6</span>
              </div>
            </div>
            <q-slider
              :value='quickInsertColumns'
              :min='4' :max='8' :step='1'
              label snap color='orange-8' markers
              @input="value => $emit('update-state', { quickInsertColumns: value })"
            />
            <div class='row justify-between text-caption text-grey-6 q-mt-xs'>
              <span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
            </div>
          </div>
        </div>
      </SettingsSectionContent>

      <!-- 模板 -->
      <SettingsNoteTemplatePanel
        v-if='subTab === $enums.EditorSubEnum.Template'
        :note-templates='noteTemplates'
        @add-template='$emit("add-template")'
        @edit-template='$emit("edit-template", $event)'
        @delete-template='$emit("delete-template", $event)'
        @batch-delete='$emit("batch-delete-templates", $event)'
      />

      <!-- 语法解析 -->
      <SettingsParsingPanel
        v-if='subTab === $enums.EditorSubEnum.Parsing'
        :echo-require-parens='echoRequireParens'
        :rune-require-template-div='runeRequireTemplateDiv'
        @update-state='$emit("update-state", $event)'
      />
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import SettingsNoteTemplatePanel from 'components/settings/SettingsNoteTemplatePanel'
import SettingsParsingPanel from 'components/settings/SettingsParsingPanel'
import { NoteOrderTypeEnum } from 'src/utils/enum'

export default {
  name: 'SettingsEditorPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent,
    SettingsNoteTemplatePanel,
    SettingsParsingPanel
  },
  props: {
    markdownOnly: {
      type: Boolean,
      required: true
    },
    noteListDenseMode: {
      type: Boolean,
      required: true
    },
    noteOrderType: {
      type: String,
      required: true
    },
    quickInsertColumns: {
      type: Number,
      required: true
    },
    noteTemplates: {
      type: Array,
      default: () => []
    },
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
      subTab: this.$enums.EditorSubEnum.Note
    }
  },
  computed: {
    noteOrderOptions: function () {
      return NoteOrderTypeEnum.items.map(c => ({ value: c.value, label: c.label }))
    },
    subTabOptions () {
      return this.$enums.EditorSubEnum.items.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon
      }))
    }
  },
  methods: {
    noteOrderChangeHandler: function (type) {
      if (!NoteOrderTypeEnum.has(type)) return
      this.$emit('update-state', { noteOrderType: type })
    }
  }
}
</script>

<style scoped>
.settings-editor-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-editor-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-editor-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-editor-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-editor-panel::-webkit-scrollbar-track {
  background: transparent;
}

.settings-dialog-sep {
  flex-shrink: 0;
}

.setting-item {
  margin-top: 0.45rem;
}

.setting-item--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.setting-item--row .q-toggle {
  flex-shrink: 0;
}
</style>