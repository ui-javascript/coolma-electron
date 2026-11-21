<template>
  <q-dialog ref='dialog' persistent>
    <q-card class='settings-ai-skill-form-card'>
      <q-card-section class='row items-center no-wrap q-pb-sm'>
        <div class='text-subtitle1 text-weight-medium'>{{ skillForm.id ? $t('aiSkillEdit') : $t('aiSkillAdd') }}</div>
        <q-space />
        <q-btn flat round dense icon='close' v-close-popup />
      </q-card-section>

      <q-card-section class='q-pt-none'>
        <q-input
          v-model.trim='skillForm.name'
          dense
          outlined
          class='q-mb-sm'
          :label="$t('aiSkillName')"
          :hint="$t('aiSkillNameHint')"
          :error='!!nameError'
          :error-message='nameError'
        />
        <q-input
          v-model.trim='skillForm.title'
          dense
          outlined
          class='q-mb-sm'
          :label="$t('aiSkillTitle')"
          :hint="$t('aiSkillTitleHint')"
        />
        <q-input
          v-model='skillForm.content'
          dense
          outlined
          type='textarea'
          rows='6'
          class='q-mb-sm'
          :label="$t('aiSkillContent')"
          :hint="$t('aiSkillContentHint')"
          :error='!!contentError'
          :error-message='contentError'
        />
        <q-toggle
          v-model='skillForm.enabled'
          color='positive'
          :label="$t('aiSkillEnabled')"
        />
      </q-card-section>

      <q-card-actions align='right'>
        <q-btn flat :label="$t('cancel')" v-close-popup />
        <q-btn color='yellow-9' unelevated :label="$t('save')" :loading='saving' @click='handleSubmit' />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import DatabaseClient from 'src/utils/DatabaseClient'

export default {
  name: 'SettingsAiSkillDialog',
  props: {},
  data () {
    return {
      skillForm: this.createEmptyForm(),
      nameError: '',
      contentError: '',
      saving: false
    }
  },
  methods: {
    createEmptyForm () {
      return {
        id: null,
        name: '',
        title: '',
        content: '',
        enabled: true
      }
    },
    async open (skillId = null) {
      this.nameError = ''
      this.contentError = ''
      this.skillForm = {
        id: null,
        name: '',
        title: '',
        content: '',
        enabled: true
      }
      if (skillId) {
        const skill = await DatabaseClient.aiSkills.getById(skillId)
        if (!skill) {
          this.$q.notify({ message: this.$t('aiSkillLoadFailed'), type: 'negative', position: 'top' })
          return
        }
        this.skillForm = {
          id: skill.id,
          name: skill.name || '',
          title: skill.title || '',
          content: skill.content || '',
          enabled: skill.enabled !== false
        }
      }
      this.$refs.dialog.show()
    },
    toggle () {
      return this.$refs.dialog.toggle()
    },
    hide () {
      return this.$refs.dialog.hide()
    },
    validate () {
      this.nameError = ''
      this.contentError = ''
      const name = String(this.skillForm.name || '').trim()
      const title = String(this.skillForm.title || '').trim()
      const content = String(this.skillForm.content || '').trim()
      if (!name) {
        this.nameError = this.$t('aiSkillNameRequired')
        return false
      }
      if (!title) {
        this.$q.notify({ message: this.$t('aiSkillTitleRequired'), type: 'warning', position: 'top' })
        return false
      }
      if (!content) {
        this.contentError = this.$t('aiSkillContentRequired')
        return false
      }
      return true
    },
    async handleSubmit () {
      if (!this.validate()) return
      this.saving = true
      try {
        const payload = {
          id: this.skillForm.id || null,
          name: this.skillForm.name.trim(),
          title: this.skillForm.title.trim(),
          content: this.skillForm.content,
          enabled: this.skillForm.enabled
        }
        const result = await DatabaseClient.aiSkills.save(payload)
        if (!result || result.success === false) {
          const code = result && result.code
          let message = this.$t('aiSkillSaveFailed')
          if (code === 'AI_SKILL_DUPLICATE_NAME') {
            message = this.$t('aiSkillNameExists')
            this.nameError = message
          } else if (code === 'AI_SKILL_REQUIRED_FIELDS') {
            message = this.$t('aiSkillRequiredFields')
          } else if (result && result.message) {
            message = `${message}: ${result.message}`
          }
          this.$q.notify({ message, type: 'warning', position: 'top' })
          return
        }
        this.$emit('saved')
        this.hide()
        this.$q.notify({ message: this.$t('aiSkillSaved'), type: 'positive', position: 'top' })
      } catch (error) {
        const isDuplicateNameError = /UNIQUE constraint failed:\s*ai_skills\.name/i.test(
          String(error && error.message ? error.message : error)
        )
        if (isDuplicateNameError) {
          this.nameError = this.$t('aiSkillNameExists')
        }
        this.$q.notify({
          message: this.$t(isDuplicateNameError ? 'aiSkillNameExists' : 'aiSkillSaveFailed'),
          type: isDuplicateNameError ? 'warning' : 'negative',
          position: 'top'
        })
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.settings-ai-skill-form-card {
  width: 520px;
  max-width: 92vw;
}
</style>
