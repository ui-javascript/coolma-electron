<template>
  <div class='settings-ai-panel-layout'>
    <CategoryTabs
      v-model='subTab'
      :tabs='subTabOptions'
      color-theme='warning'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-ai-panel'>
      <!-- 入口 -->
      <SettingsSectionContent v-if='subTab === $enums.AiSubEnum.Entry' :title="$t('aiEntry')" accent-color='yellow-9'>
        <div class='text-caption text-grey-6 q-mb-sm'>
          {{ $t('aiAssistantEntryHint') }}
        </div>
        <div>
          <q-option-group
            :value='aiAssistantProvider'
            :options='aiAssistantProviderOptionsResolved'
            color='yellow-9'
            type='radio' inline
            @input='handleAiAssistantProviderChange'
          />
        </div>
      </SettingsSectionContent>

      <!-- 模型 -->
      <SettingsSectionContent v-if='subTab === $enums.AiSubEnum.Model' :title="$t('aiModel')" accent-color='yellow-9'>
        <template v-slot:actions>
          <q-btn dense flat no-caps color='yellow-9' icon='add' size='sm'
            :label="$t('aiModelAdd')" @click='$emit("open-ai-model-dialog")' />
        </template>
        <div v-if='aiModelsLoading' class='row items-center text-grey-6 q-py-md'>
          <q-spinner size='20px' class='q-mr-sm' /><span>{{ $t('loading') }}</span>
        </div>
        <div v-else-if='aiModelConfigs.length === 0' class='text-center text-grey q-pa-md ai-model-empty'>
          <q-icon name='smart_toy' size='2rem' />
          <div class='q-mt-sm'>{{ $t('aiNoModelConfigured') }}</div>
        </div>
        <div v-else class='column q-gutter-sm'>
          <q-card v-for='item in aiModelConfigs' :key='item.id' flat bordered class='ai-model-card'>
            <q-card-section class='q-pa-sm'>
              <div class='row items-start no-wrap q-col-gutter-sm'>
                <div class='col'>
                  <div class='row items-center no-wrap q-gutter-xs'>
                    <div class='text-body2 text-weight-medium'>{{ item.name }}</div>
                    <q-badge v-if='item.is_default' color='yellow-9' outline>{{ $t('aiDefaultModelBadge') }}</q-badge>
                    <q-badge :color='getAiModelStatusColor(item)' outline>{{ getAiModelStatusLabel(item) }}</q-badge>
                  </div>
                  <div class='text-caption text-grey-6 q-mt-xs'>{{ getAiProviderLabel(item.provider_type) }}</div>
                  <div class='text-caption text-grey-7 q-mt-xs'>{{ item.base_url }}</div>
                  <div class='text-caption text-grey-7 q-mt-xs'>{{ item.model }}</div>
                  <div class='text-caption q-mt-xs' :class='isAiModelUsable(item) ? "text-positive" : "text-warning"'>
                    {{ getAiModelStatusHint(item) }}
                  </div>
                  <div v-if='!isAiModelUsable(item) && getAiModelMissingFieldLabels(item).length > 0' class='row items-center q-gutter-xs q-mt-sm'>
                    <q-badge v-for='field in getAiModelMissingFieldLabels(item)' :key='field' color='warning' outline>{{ field }}</q-badge>
                  </div>
                  <div class='text-caption text-grey-6 q-mt-xs' v-if='item.hasApiKey'>{{ $t('aiApiKey') }}: {{ item.apiKeyMasked }}</div>
                  <div class='text-caption text-grey-6 q-mt-xs' v-if='item.hasVirtualKey'>{{ $t('aiPortkeyVirtualKey') }}: {{ item.portkeyVirtualKeyMasked }}</div>
                  <div class='text-caption q-mt-sm' :class='getAiModelKeyStorageHintColor(item)'>
                    <q-icon :name='getAiModelKeyStorageHintIcon(item)' size='14px' class='q-mr-xs' />
                    {{ getAiModelKeyStorageHint(item) }}
                  </div>
                  <div v-if='aiModelTestResults[item.id]' class='text-caption q-mt-xs' :class='aiModelTestResults[item.id].success ? "text-positive" : "text-negative"'>
                    {{ getAiModelTestResultText(item) }}
                  </div>
                </div>
                <div class='column q-gutter-xs'>
                  <q-btn dense flat no-caps color='yellow-9' size='sm' icon='network_check' :label="$t('aiModelTestConnection')" :loading='testingAiModelId === item.id' :disable='testingAiModelId !== null || !isAiModelUsable(item)' @click='testAiModelConnection(item)' />
                  <q-btn dense flat no-caps color='yellow-9' size='sm' icon='edit' :label="$t('aiModelEdit')" @click='$emit("open-ai-model-dialog", item.id)' />
                  <q-btn v-if='!item.is_default' dense flat no-caps color='positive' size='sm' icon='check_circle' :label="$t('aiSetDefault')" @click='setDefaultAiModel(item)' />
                  <q-btn dense flat no-caps color='negative' size='sm' icon='delete' :label="$t('aiModelDelete')" @click='confirmDeleteAiModel(item)' />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </SettingsSectionContent>

      <!-- 技能 -->
      <SettingsSectionContent v-if='subTab === $enums.AiSubEnum.Skill' :title="$t('aiSkill')" accent-color='yellow-9'>
        <template v-slot:actions>
          <q-btn dense flat no-caps color='yellow-9' icon='add' size='sm'
            :label="$t('aiSkillAdd')" @click='$emit("open-ai-skill-dialog")' />
        </template>
        <div class='text-caption text-grey-6 q-mb-sm'>
          {{ $t('aiSkillSettingsHint') }}
        </div>
        <div v-if='aiSkillsLoading' class='row items-center text-grey-6 q-py-md'>
          <q-spinner size='20px' class='q-mr-sm' /><span>{{ $t('loading') }}</span>
        </div>
        <div v-else-if='aiSkillConfigs.length === 0' class='text-center text-grey q-pa-md ai-model-empty'>
          <q-icon name='auto_fix_high' size='2rem' />
          <div class='q-mt-sm'>{{ $t('aiSkillEmpty') }}</div>
        </div>
        <div v-else class='column q-gutter-sm'>
          <q-card v-for='skill in aiSkillConfigs' :key='skill.id' flat bordered class='ai-model-card'>
            <q-card-section class='q-pa-sm'>
              <div class='row items-start no-wrap q-col-gutter-sm'>
                <div class='col'>
                  <div class='row items-center no-wrap q-gutter-xs'>
                    <div class='text-body2 text-weight-medium'>{{ skill.title }}</div>
                    <q-badge v-if='!skill.enabled' color='grey-6' outline>{{ $t('aiSkillDisabled') }}</q-badge>
                  </div>
                  <div class='text-caption text-grey-6 q-mt-xs'>{{ skill.name }}</div>
                  <div class='text-caption text-grey-7 q-mt-xs ai-skill-content'>{{ truncateText(skill.content, 160) }}</div>
                </div>
                <div class='column q-gutter-xs'>
                  <q-btn dense flat no-caps color='yellow-9' size='sm' icon='edit' :label="$t('aiSkillEdit')" @click='$emit("open-ai-skill-dialog", skill.id)' />
                  <q-btn dense flat no-caps color='negative' size='sm' icon='delete' :label="$t('aiSkillDelete')" @click='confirmDeleteAiSkill(skill)' />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </SettingsSectionContent>

      <!-- 打标（AI 批量给无标签笔记追加标签） -->
      <!-- 注：这两个子面板用 v-show 而不是 v-if —— 打标结果属于「易失状态」，
           切到别的子 tab 再切回来不应该丢；两面板都靠 active 属性懒加载，不打开就不查库。 -->
      <SettingsAiAutoTagPanel
        v-show='subTab === $enums.AiSubEnum.AutoTag'
        :active='subTab === $enums.AiSubEnum.AutoTag'
        @switch-sub-tab='switchSubTab'
      />

      <!-- 标签（维护：新建 / 重命名 / 删除 / 清理未使用） -->
      <SettingsAiTagPanel
        v-show='subTab === $enums.AiSubEnum.Tags'
        :active='subTab === $enums.AiSubEnum.Tags'
      />
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import SettingsAiAutoTagPanel from 'components/settings/SettingsAiAutoTagPanel'
import SettingsAiTagPanel from 'components/settings/SettingsAiTagPanel'
import PortkeyService from 'src/services/PortkeyService'
import DatabaseClient from 'src/utils/DatabaseClient'

export default {
  name: 'SettingsAiPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent,
    SettingsAiAutoTagPanel,
    SettingsAiTagPanel
  },
  props: {
    aiAssistantProvider: {
      type: String,
      required: true
    },
    aiModelConfigs: {
      type: Array,
      required: true
    },
    aiSkillsLoading: {
      type: Boolean,
      required: true
    },
    aiSkillConfigs: {
      type: Array,
      required: true
    },
    aiModelsLoading: {
      type: Boolean,
      required: true
    }
  },
  data () {
    return {
      subTab: this.$enums.AiSubEnum.Entry,
      testingAiModelId: null,
      aiModelTestResults: {}
    }
  },
  computed: {
    aiAssistantProviderOptions () {
      return [
        { labelKey: 'aiAssistantProviderBuiltin', label: '', value: 'builtin' },
        { labelKey: 'aiAssistantProviderDoubao', label: '', value: 'doubao' }
      ]
    },
    aiAssistantProviderOptionsResolved: function () {
      return this.aiAssistantProviderOptions.map(opt => ({
        ...opt,
        label: this.$t(opt.labelKey)
      }))
    },
    subTabOptions () {
      return this.$enums.AiSubEnum.items.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon
      }))
    }
  },
  methods: {
    /**
     * 供子面板（打标 / 标签）在「还没配置模型」时跳转到「模型」子 tab。
     */
    switchSubTab (value) {
      if (!value || value === this.subTab) return
      if (!this.$enums.AiSubEnum.has(value)) return
      this.subTab = value
    },
    handleAiAssistantProviderChange (value) {
      if (value !== 'builtin' && value !== 'doubao') return
      if (value === this.aiAssistantProvider) return
      this.$emit('update-ai-assistant-provider', value)
      this.$q.notify({
        message: this.$t('aiAssistantProviderChanged', { name: this.$t(value === 'doubao' ? 'aiAssistantProviderDoubao' : 'aiAssistantProviderBuiltin') }),
        color: 'primary',
        icon: 'check',
        position: 'top'
      })
    },
    getAiProviderLabel (providerType) {
      return PortkeyService.getProviderLabel(providerType)
    },
    isAiModelUsable (item) {
      return PortkeyService.isConfigUsable(item)
    },
    getAiModelMissingFieldLabels (item) {
      return PortkeyService.getMissingFields(item).map(field => this.$t(`aiField_${field}`))
    },
    getAiModelStatusColor (item) {
      return this.isAiModelUsable(item) ? 'positive' : 'warning'
    },
    getAiModelStatusLabel (item) {
      return this.isAiModelUsable(item) ? this.$t('aiDefaultModelStatusReady') : this.$t('aiDefaultModelStatusIncomplete')
    },
    getAiModelStatusHint (item) {
      if (this.isAiModelUsable(item)) {
        return this.$t('aiDefaultModelStatusReadyHint')
      }
      return this.$t('aiDefaultModelStatusIncompleteHint', {
        fields: this.getAiModelMissingFieldLabels(item).join('、')
      })
    },
    getAiModelTestResultText (item) {
      const result = this.aiModelTestResults[item.id]
      if (!result) return ''
      return result.success
        ? this.$t('aiModelTestConnectionSuccess')
        : this.$t('aiModelTestConnectionFailed', { message: result.message || this.$t('aiConfigSaveFailed') })
    },
    async testAiModelConnection (item) {
      if (!item || !item.id || this.testingAiModelId !== null) return
      if (!this.isAiModelUsable(item)) {
        this.$q.notify({ message: this.getAiModelStatusHint(item), type: 'warning', position: 'top' })
        return
      }
      this.testingAiModelId = item.id
      this.aiModelTestResults = { ...this.aiModelTestResults, [item.id]: null }
      try {
        const config = await DatabaseClient.aiModels.getById(item.id)
        await PortkeyService.testConnection(config)
        this.aiModelTestResults = { ...this.aiModelTestResults, [item.id]: { success: true } }
        this.$q.notify({ message: this.$t('aiModelTestConnectionSuccess'), type: 'positive', position: 'top' })
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        this.aiModelTestResults = { ...this.aiModelTestResults, [item.id]: { success: false, message } }
        this.$q.notify({ message: this.$t('aiModelTestConnectionFailed', { message }), type: 'negative', position: 'top' })
      } finally {
        this.testingAiModelId = null
      }
    },
    async setDefaultAiModel (item) {
      const success = await DatabaseClient.aiModels.setDefault(item.id)
      if (!success) {
        this.$q.notify({ message: this.$t('aiConfigSaveFailed'), type: 'negative', position: 'top' })
        return
      }
      this.$emit('reload-ai-model-configs')
      this.$q.notify({ message: this.$t('aiDefaultModelUpdated'), type: 'positive', position: 'top' })
    },
    confirmDeleteAiModel (item) {
      this.$q.dialog({
        title: this.$t('aiModelDelete'),
        message: this.$t('aiModelDeleteConfirm', { name: item.name }),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('aiModelDelete'), color: 'negative' }
      }).onOk(async () => {
        const success = await DatabaseClient.aiModels.remove(item.id)
        if (!success) {
          this.$q.notify({ message: this.$t('aiConfigDeleteFailed'), type: 'negative', position: 'top' })
          return
        }
        this.$emit('reload-ai-model-configs')
        this.$q.notify({ message: this.$t('aiConfigDeleted'), type: 'positive', position: 'top' })
      })
    },
    confirmDeleteAiSkill (skill) {
      this.$q.dialog({
        title: this.$t('aiSkillDelete'),
        message: this.$t('aiSkillDeleteConfirm', { title: skill.title }),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('aiSkillDelete'), color: 'negative' }
      }).onOk(async () => {
        const success = await DatabaseClient.aiSkills.remove(skill.id)
        if (!success) {
          this.$q.notify({ message: this.$t('aiSkillDeleteFailed'), type: 'negative', position: 'top' })
          return
        }
        this.$emit('reload-ai-skill-configs')
        this.$q.notify({ message: this.$t('aiSkillDeleted'), type: 'positive', position: 'top' })
      })
    },
    truncateText (text, maxLen = 120) {
      if (!text) return ''
      return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
    },
    getAiModelKeyStorageHint (item) {
      if (!item || !item.hasApiKey) return ''
      // api_key_encrypted_version 是后端写入的字段：
      //   2 = safeStorage（OS 钥匙串，最稳）
      //   1 = 旧版 CryptoJS AES（机器派生，可能因环境变化失效）
      //   0 = 未知 / 老库残留
      if (Number(item.api_key_encrypted_version) === 2) {
        return this.$t('aiApiKeyStorageOsKeychainHint')
      }
      if (Number(item.api_key_encrypted_version) === 1) {
        return this.$t('aiApiKeyStorageLegacyHint')
      }
      return this.$t('aiApiKeyStorageLegacyHint')
    },
    getAiModelKeyStorageHintColor (item) {
      if (Number(item && item.api_key_encrypted_version) === 2) {
        return 'text-positive'
      }
      return 'text-warning'
    },
    getAiModelKeyStorageHintIcon (item) {
      if (Number(item && item.api_key_encrypted_version) === 2) {
        return 'lock'
      }
      return 'lock_open'
    }
  }
}
</script>

<style scoped>
.settings-ai-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-ai-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-ai-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-ai-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-ai-panel::-webkit-scrollbar-track {
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

.ai-model-default-card,
.ai-model-card {
  border-radius: 8px;
}

.ai-model-empty {
  border: 1px dashed rgba(127, 127, 127, 0.35);
  border-radius: 8px;
}
</style>
