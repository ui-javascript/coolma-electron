<template>
  <SettingsSectionContent :title='$t("noteTemplate")' accent-color='orange-8'>
    <template v-slot:actions>
      <q-btn
        v-if='!hasBuiltin'
        dense flat no-caps
        size='sm'
        color='orange-8'
        icon='add'
        :label='$t("noteTemplateAdd")'
        @click='$emit("add-template")'
      />
      <q-btn
        v-else
        dense flat no-caps
        size='sm'
        color='negative'
        icon='delete_sweep'
        :label='$t("selectedCount", { count: selected.length })'
        :disable='selected.length === 0'
        @click='$emit("batch-delete", selected)'
      />
    </template>
    <div v-if='isProd && hasBuiltin' class='text-caption text-grey-6 q-mb-xs'>
      <q-icon name='info' size='xs' /> {{ $t('noteTemplateBuiltinHint') }}
    </div>
    <div v-else class='text-caption text-grey-6 q-mb-xs'>
      <q-icon name='drag_indicator' size='xs' /> {{ $t('noteTemplateDragTip') }}
    </div>
    <div class='note-template-grid-scroll'>
      <div class='note-template-grid'>
        <div
          v-for='tpl in sortedTemplates'
          :key='tpl.id'
          class='note-template-card-wrapper'
          :class='{"note-template-card-wrapper--selected": selected.includes(tpl.id), "note-template-card-wrapper--builtin": tpl.is_builtin}'
          @click='onCardClick(tpl)'
        >
          <q-card flat bordered class='note-template-card'>
            <q-card-section class='q-pa-sm'>
              <div class='row items-start no-wrap q-col-gutter-sm'>
                <div class='col'>
                  <div class='row items-center no-wrap q-gutter-xs'>
                    <q-icon :name='tpl.is_builtin ? "auto_awesome" : "description"' :color='tpl.is_builtin ? "amber-7" : "orange-8"' size='1.05rem' />
                    <div class='text-body2 text-weight-medium ellipsis'>{{ tpl.name }}</div>
                    <q-badge v-if='tpl.is_builtin' dense color='amber-7' text-color='white' :label='$t("noteTemplateBuiltinBadge")' class='q-ml-xs' />
                  </div>
                  <div v-if='tpl.desc' class='text-caption text-grey-6 q-mt-xs'>{{ tpl.desc }}</div>
                  <div class='text-caption text-grey-6 q-mt-xs ellipsis-2'>
                    <span class='note-template-content-preview'>{{ tpl.content || $t('noteTemplateEmpty') }}</span>
                  </div>
                </div>
                <div class='column q-gutter-xs items-end' @click.stop>
                  <q-checkbox
                    v-if='!tpl.is_builtin && hasBuiltin'
                    dense
                    :value='selected.includes(tpl.id)'
                    @input='toggleSelect(tpl.id)'
                  />
                  <q-btn
                    dense flat round size='sm'
                    :icon='isReadOnly(tpl) ? "visibility" : "edit"'
                    :color='isReadOnly(tpl) ? "grey-7" : "orange-8"'
                    @click='$emit("edit-template", tpl)'
                  >
                    <q-tooltip>{{ isReadOnly(tpl) ? $t('noteTemplateView') : $t('noteTemplateEdit') }}</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if='!isReadOnly(tpl)'
                    dense flat round size='sm'
                    icon='delete_outline'
                    color='negative'
                    @click='$emit("delete-template", tpl)'
                  >
                    <q-tooltip>{{ $t('noteTemplateDelete') }}</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
      <div v-if='!sortedTemplates || sortedTemplates.length === 0' class='text-center text-grey q-pa-xl'>
        <q-icon name='description' size='3rem' />
        <div class='q-mt-sm'>{{ $t('noteTemplateEmpty') }}</div>
        <q-btn class='q-mt-md' unelevated color='orange-8' :label='$t("noteTemplateAdd")' icon='add' @click='$emit("add-template")' />
      </div>
    </div>
  </SettingsSectionContent>
</template>

<script>
import SettingsSectionContent from 'components/settings/SettingsSectionContent'

export default {
  name: 'SettingsNoteTemplatePanel',
  components: {
    SettingsSectionContent
  },
  props: {
    noteTemplates: {
      type: Array,
      required: true
    }
  },
  data () {
    return {
      selected: []
    }
  },
  computed: {
    isProd () {
      return process.env.PROD === true
    },
    sanitized () {
      const list = Array.isArray(this.noteTemplates) ? this.noteTemplates : []
      return list.filter(t => t && t.id && String(t.name || '').trim())
    },
    hasBuiltin () {
      return this.sanitized.some(t => t.is_builtin)
    },
    sortedTemplates () {
      // 内置在前；其余按 sort_order 升序，再按 created_at 升序
      const list = [...this.sanitized]
      list.sort((a, b) => {
        if (Boolean(a.is_builtin) !== Boolean(b.is_builtin)) {
          return a.is_builtin ? -1 : 1
        }
        const sa = Number(a.sort_order) || 0
        const sb = Number(b.sort_order) || 0
        if (sa !== sb) return sa - sb
        return (Number(a.created_at) || 0) - (Number(b.created_at) || 0)
      })
      return list
    }
  },
  watch: {
    selected () {
      // 切到全内置分类时清空选中
      if (!this.hasBuiltin) this.selected = []
    }
  },
  methods: {
    isReadOnly (tpl) {
      if (!tpl || !tpl.is_builtin) return false
      return this.isProd
    },
    toggleSelect (id) {
      const idx = this.selected.indexOf(id)
      if (idx >= 0) this.selected.splice(idx, 1)
      else this.selected.push(id)
    },
    onCardClick (tpl) {
      this.$emit('edit-template', tpl)
    }
  }
}
</script>

<style scoped>
/*
 * 滚动由外层 .settings-editor-panel（SettingsEditorPanel 提供，flex + overflow:auto）代理。
 * 这里只负责卡片网格与空态的内部布局；不要再设 height/overflow，避免双滚动条。
 */
.note-template-grid-scroll {
  /* 让空态垂直居中显示时不抢高度；高度由内容自然决定 */
}

.note-template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
  padding: 4px 2px;
  min-height: 80px;
  align-items: stretch;
}

.note-template-card-wrapper {
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.note-template-card-wrapper:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 10px rgba(239, 108, 0, 0.12);
}

.note-template-card-wrapper--selected .note-template-card {
  outline: 2px solid rgba(239, 108, 0, 0.65);
}

.note-template-card-wrapper--builtin .note-template-card {
  background: rgba(255, 193, 7, 0.04);
}

.note-template-card {
  border-radius: 6px;
}

.note-template-content-preview {
  display: inline-block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: rgba(120, 120, 120, 0.9);
}

.ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ellipsis-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>