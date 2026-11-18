<template>
  <div class='settings-cloudfn-panel-layout'>
    <CategoryTabs
      v-model='subTab'
      :tabs='subTabOptions'
      color-theme='cyan'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-cloudfn-panel'>
      <!-- 配置 -->
      <SettingsSectionContent v-if='subTab === $enums.CloudFnSubEnum.Config' :title="$t('cloudFnConfig')" accent-color='cyan-7'>
        <template v-slot:actions>
          <q-btn flat dense size='sm' icon='help_outline' @click='openCloudFnHelp'>
            <q-tooltip>{{ $t('cloudFunctionDoc') }}</q-tooltip>
          </q-btn>
        </template>
        <cloudFunctionConfigDialog />
      </SettingsSectionContent>

      <!-- 导航中心 -->
      <SettingsSectionContent v-if='subTab === $enums.CloudFnSubEnum.Navigation' :title="$t('cloudFnNavigation')" accent-color='cyan-7'>
        <q-banner rounded dense class='bg-cyan-1 text-cyan-10 q-mb-md'>
          <template v-slot:avatar>
            <q-icon name='info_outline' color='cyan-7' />
          </template>
          {{ $t('navigationCenterHint') }}
        </q-banner>
        <div class='text-center q-pa-lg'>
          <q-btn color='cyan-7' unelevated icon='explore' :label="$t('openNavigationCenter')" @click='$emit("open-navigation-dialog")' />
        </div>
      </SettingsSectionContent>
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import cloudFunctionConfigDialog from 'components/cloud/cloudFunctionConfigDialog'
import cloud from 'src/services/cloud/CloudFunctionProvider'
import { CLOUDFN_PROVIDER_MAGIC_API } from 'src/utils/cloud-router'

const HELP_URL_UNICLOUD = 'https://vkdoc.fsq.pub/client/pages/callFunctionForUrl.html'
const HELP_URL_MAGIC_API = 'https://ssssssss.org/magic-api/'

export default {
  name: 'SettingsCloudFnPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent,
    cloudFunctionConfigDialog
  },
  props: {},
  data () {
    return {
      subTab: this.$enums.CloudFnSubEnum.Config
    }
  },
  computed: {
    subTabOptions () {
      return this.$enums.CloudFnSubEnum.items.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon
      }))
    },
    helpUrl () {
      const cfg = (() => {
        try { return cloud.getConfig() } catch (e) { return {} }
      })()
      return cfg.provider === CLOUDFN_PROVIDER_MAGIC_API ? HELP_URL_MAGIC_API : HELP_URL_UNICLOUD
    }
  },
  methods: {
    openCloudFnHelp: function () {
      window.open(this.helpUrl, '_blank')
    }
  }
}
</script>

<style scoped>
.settings-cloudfn-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-cloudfn-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-cloudfn-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-cloudfn-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-cloudfn-panel::-webkit-scrollbar-track {
  background: transparent;
}

.settings-dialog-sep {
  flex-shrink: 0;
}
</style>
