<template>
  <q-dialog ref='dialog' persistent>
    <q-card class='settings-ai-model-form-card'>
      <q-card-section class='row items-center no-wrap q-pb-sm'>
        <div class='text-subtitle1 text-weight-medium'>{{ modelForm.id ? $t('aiModelEdit') : $t('aiModelAdd') }}</div>
        <q-space />
        <q-btn flat round dense icon='close' v-close-popup />
      </q-card-section>

      <q-card-section class='q-pt-none'>
        <q-input
          v-model.trim='modelForm.name'
          dense
          outlined
          class='q-mb-sm'
          :label="$t('aiModelConfigName')"
        />
        <q-select
          v-model='modelForm.provider_type'
          dense
          outlined
          emit-value
          map-options
          class='q-mb-sm'
          :label="$t('aiProviderType')"
          :options='aiProviderOptions'
        />
        <q-input
          v-model.trim='modelForm.base_url'
          dense
          outlined
          class='q-mb-sm'
          :label="$t('aiBaseUrl')"
        />
        <q-input
          v-model.trim='modelForm.model'
          dense
          outlined
          class='q-mb-sm'
          :label="$t('aiModelName')"
        />
        <q-input
          v-model.trim='modelForm.api_key'
          dense
          outlined
          class='q-mb-sm'
          :type='showApiKey ? "text" : "password"'
          :label='isPortkeyProvider ? $t("aiPortkeyApiKey") : $t("aiApiKey")'
          :hint='apiKeyHint'
        >
          <template v-slot:append>
            <q-btn flat round dense :icon='showApiKey ? "visibility_off" : "visibility"' @click='showApiKey = !showApiKey' />
          </template>
        </q-input>
        <q-input
          v-if='isPortkeyProvider'
          v-model.trim='modelForm.virtual_key'
          dense
          outlined
          class='q-mb-sm'
          :type='showApiKey ? "text" : "password"'
          :label="$t('aiPortkeyVirtualKey')"
          :hint='virtualKeyHint'
        />
        <q-toggle
          v-model='modelForm.clear_api_key'
          color='negative'
          :label='isPortkeyProvider ? $t("aiClearPortkeyApiKey") : $t("aiClearApiKey")'
          class='q-mb-sm'
        />
        <q-toggle
          v-if='isPortkeyProvider'
          v-model='modelForm.clear_virtual_key'
          color='negative'
          :label="$t('aiClearVirtualKey')"
          class='q-mb-sm'
        />
        <q-toggle
          v-model='modelForm.is_default'
          color='yellow-9'
          :label="$t('aiSetDefault')"
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
  name: 'SettingsAiModelDialog',
  props: {
    modelId: {
      type: [String, Number],
      default: null
    },
    markAsDefault: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      modelForm: this.createEmptyForm(),
      showApiKey: false,
      saving: false,
      aiProviderOptions: [
        { label: 'OpenAI-compatible', value: 'openai-compatible' },
        { label: 'Portkey', value: 'portkey' }
      ]
    }
  },
  computed: {
    isPortkeyProvider () {
      return this.modelForm.provider_type === 'portkey'
    },
    apiKeyHint () {
      if (!this.modelForm.id) return ''
      if (this.modelForm.clear_api_key) return this.$t('aiApiKeyWillBeCleared')
      return this.modelForm.apiKeyMasked
        ? this.$t('aiApiKeySavedMasked', { masked: this.modelForm.apiKeyMasked })
        : this.$t('aiApiKeyOptionalOnEdit')
    },
    virtualKeyHint () {
      if (!this.modelForm.id) return ''
      if (this.modelForm.clear_virtual_key) return this.$t('aiVirtualKeyWillBeCleared')
      return this.modelForm.virtualKeyMasked
        ? this.$t('aiVirtualKeySavedMasked', { masked: this.modelForm.virtualKeyMasked })
        : this.$t('aiVirtualKeyOptionalOnEdit')
    }
  },
  methods: {
    createEmptyForm () {
      return {
        id: null,
        name: '',
        provider_type: 'openai-compatible',
        base_url: '',
        model: '',
        api_key: '',
        virtual_key: '',
        is_default: false,
        clear_api_key: false,
        clear_virtual_key: false,
        apiKeyMasked: '',
        virtualKeyMasked: ''
      }
    },
    async open (modelId = null, options = {}) {
      this.showApiKey = false
      this.modelForm = {
        ...this.createEmptyForm(),
        ...(options.markAsDefault ? { is_default: true } : {})
      }
      if (modelId) {
        const config = await DatabaseClient.aiModels.getById(modelId)
        if (!config) {
          this.$q.notify({
            message: this.$t('aiConfigLoadFailed'),
            type: 'negative',
            position: 'top'
          })
          return
        }
        this.modelForm = {
          id: config.id,
          name: config.name || '',
          provider_type: config.provider_type || 'openai-compatible',
          base_url: config.base_url || '',
          model: config.model || '',
          api_key: config.api_key || '',
          virtual_key: config.virtual_key || '',
          is_default: Boolean(config.is_default),
          clear_api_key: false,
          clear_virtual_key: false,
          apiKeyMasked: config.apiKeyMasked || '',
          virtualKeyMasked: config.portkeyVirtualKeyMasked || ''
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
    normalizeFields () {
      const form = this.modelForm || {}
      return {
        name: String(form.name || '').trim(),
        provider_type: String(form.provider_type || 'openai-compatible').trim() || 'openai-compatible',
        base_url: String(form.base_url || '').trim(),
        model: String(form.model || '').trim(),
        api_key: String(form.api_key || '').trim(),
        virtual_key: String(form.virtual_key || '').trim()
      }
    },
    validate () {
      const form = this.modelForm
      const normalized = this.normalizeFields()
      if (!normalized.name || !normalized.base_url || !normalized.model) {
        this.$q.notify({ message: this.$t('aiModelRequiredFields'), type: 'warning', position: 'top' })
        return false
      }
      try {
        const parsed = new URL(normalized.base_url)
        if (!/^https?:$/.test(parsed.protocol)) {
          throw new Error('invalid protocol')
        }
      } catch (error) {
        this.$q.notify({ message: this.$t('aiBaseUrlInvalid'), type: 'warning', position: 'top' })
        return false
      }
      if (!form.id && !normalized.api_key && normalized.provider_type !== 'portkey') {
        this.$q.notify({ message: this.$t('aiApiKeyRequired'), type: 'warning', position: 'top' })
        return false
      }
      if (normalized.provider_type === 'portkey') {
        if (!normalized.api_key && !form.id) {
          this.$q.notify({ message: this.$t('aiPortkeyApiKeyRequired'), type: 'warning', position: 'top' })
          return false
        }
        if (!normalized.virtual_key && !form.id) {
          this.$q.notify({ message: this.$t('aiVirtualKeyRequired'), type: 'warning', position: 'top' })
          return false
        }
      }
      return true
    },
    async handleSubmit () {
      if (!this.validate()) return
      this.saving = true
      try {
        const payload = {
          id: this.modelForm.id,
          name: this.modelForm.name,
          provider_type: this.modelForm.provider_type,
          base_url: this.modelForm.base_url,
          model: this.modelForm.model,
          api_key: this.modelForm.clear_api_key ? '' : this.modelForm.api_key,
          virtual_key: this.modelForm.clear_virtual_key ? '' : this.modelForm.virtual_key,
          is_default: this.modelForm.is_default,
          clear_api_key: this.modelForm.clear_api_key,
          clear_virtual_key: this.modelForm.clear_virtual_key
        }
        const result = await DatabaseClient.aiModels.save(payload)
        if (!result || result.success === false) {
          const errorCode = result && result.code
          const messageKeyMap = {
            AI_MODEL_DUPLICATE_NAME: 'aiConfigNameExists',
            AI_MODEL_REQUIRED_FIELDS: 'aiModelRequiredFields',
            AI_MODEL_SECRET_REQUIRED: this.modelForm.provider_type === 'portkey' ? 'aiVirtualKeyRequired' : 'aiApiKeyRequired'
          }
          const messageKey = messageKeyMap[errorCode] || 'aiConfigSaveFailed'
          const notifyType = errorCode === 'AI_MODEL_DUPLICATE_NAME' || errorCode === 'AI_MODEL_REQUIRED_FIELDS' || errorCode === 'AI_MODEL_SECRET_REQUIRED'
            ? 'warning'
            : 'negative'
          this.$q.notify({ message: this.$t(messageKey), type: notifyType, position: 'top' })
          return
        }
        this.$emit('saved')
        this.hide()
        this.$q.notify({ message: this.$t('aiConfigSaved'), type: 'positive', position: 'top' })
      } catch (error) {
        const isDuplicateNameError = /UNIQUE constraint failed:\s*ai_model_configs\.name/i.test(String(error && error.message ? error.message : error))
        this.$q.notify({
          message: this.$t(isDuplicateNameError ? 'aiConfigNameExists' : 'aiConfigSaveFailed'),
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
.settings-ai-model-form-card {
  width: 520px;
  max-width: 92vw;
}
</style>
