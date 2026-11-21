<template>
  <q-dialog
    ref='dialog'
    transition-show='fade'
    transition-hide='fade'
    :value='value'
    @input='v => $emit("input", v)'
    persistent
  >
    <q-card class='note-template-form-card'>
      <q-toolbar class='note-template-form-toolbar'>
        <q-icon :name='isReadOnly ? "visibility" : "description"' :color='isReadOnly ? "amber-7" : "orange-8"' size='1.4em' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>
            {{ isReadOnly ? resolvedViewTitle : (isEditing ? resolvedEditTitle : resolvedAddTitle) }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='note-template-form-body'>
        <div v-if='isReadOnly' class='text-caption text-grey-6 q-mb-md'>
          <q-icon name='info' size='xs' /> {{ $t('noteTemplateReadOnlyHint') }}
        </div>
        <div class='row q-col-gutter-md'>
          <div class='col-12 col-md-5'>
            <div class='text-caption text-grey-7 q-mb-xs'>{{ $t('noteTemplateFieldName') }}</div>
            <q-input
              v-model='form.name'
              dense
              outlined
              :placeholder='$t("noteTemplateNamePlaceholder")'
              :rules='[v => !!(v && String(v).trim()) || $t("noteTemplateNameRequired")]'
              lazy-rules
              :readonly='isReadOnly'
              :disable='isReadOnly'
            />
          </div>
          <div class='col-12 col-md-7'>
            <div class='text-caption text-grey-7 q-mb-xs'>{{ $t('noteTemplateFieldDesc') }}</div>
            <q-input
              v-model='form.desc'
              dense
              outlined
              :placeholder='$t("noteTemplateDescPlaceholder")'
              :readonly='isReadOnly'
              :disable='isReadOnly'
            />
          </div>
          <div class='col-12'>
            <div class='text-caption text-grey-7 q-mb-xs'>{{ $t('noteTemplateFieldContent') }}</div>
            <q-input
              v-model='form.content'
              type='textarea'
              outlined
              autogrow
              :placeholder='$t("noteTemplateContentPlaceholder")'
              input-style='min-height: 220px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px;'
              :readonly='isReadOnly'
              :disable='isReadOnly'
            />
            <div v-if='!isReadOnly' class='text-caption text-grey-6 q-mt-xs'>
              <q-icon name='info' size='xs' /> {{ $t('noteTemplateContentHint') }}
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align='right' class='note-template-form-footer'>
        <q-btn flat dense no-caps :label='isReadOnly ? $t("close") : $t("cancel")' @click='cancel' />
        <q-btn v-if='!isReadOnly' flat dense no-caps color='orange-8' :label='$t("ok")' @click='submit' />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
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

export default {
  name: 'NoteTemplateFormDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    template: {
      type: Object,
      default: null
    },
    readOnly: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      form: this.buildForm(this.template)
    }
  },
  computed: {
    isEditing () {
      return Boolean(this.template && this.template.id)
    },
    isReadOnly () {
      return this.readOnly
    },
    resolvedAddTitle () {
      return this.$t('noteTemplateAdd')
    },
    resolvedEditTitle () {
      return this.$t('noteTemplateEdit')
    },
    resolvedViewTitle () {
      return this.$t('noteTemplateView')
    }
  },
  watch: {
    value (visible) {
      if (visible) {
        this.form = this.buildForm(this.template)
      }
    },
    template: {
      immediate: false,
      handler () {
        this.form = this.buildForm(this.template)
      }
    }
  },
  methods: {
    buildForm (raw) {
      const safe = raw && typeof raw === 'object' ? raw : {}
      return {
        id: safe.id || createUuid(),
        name: safe.name || '',
        desc: safe.desc || '',
        content: safe.content || '',
        sort_order: Number(safe.sort_order) || 0,
        created_at: safe.created_at || null,
        updated_at: safe.updated_at || null
      }
    },
    cancel () {
      this.$emit('input', false)
    },
    submit () {
      if (this.isReadOnly) {
        this.cancel()
        return
      }
      const name = String(this.form.name || '').trim()
      if (!name) {
        this.$q.notify({ message: this.$t('noteTemplateNameRequired'), type: 'warning', position: 'top' })
        return
      }
      const payload = {
        id: this.form.id,
        name,
        desc: String(this.form.desc || '').trim(),
        content: String(this.form.content || ''),
        sort_order: Number(this.form.sort_order) || 0,
        created_at: this.form.created_at || null,
        updated_at: this.form.updated_at || null
      }
      this.$emit('submit', payload)
      this.$emit('input', false)
    }
  }
}
</script>

<style scoped>
.note-template-form-card {
  min-width: 560px;
  max-width: 80vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.note-template-form-toolbar {
  min-height: 40px;
  padding: 4px 8px;
}
.note-template-form-body {
  overflow: auto;
  flex: 1 1 auto;
}
.note-template-form-footer {
  border-top: 1px solid rgba(120, 120, 120, 0.18);
  padding: 6px 10px;
}
</style>