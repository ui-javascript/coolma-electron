<template>
  <div class='cloudfn-config'>
    <div class='cloudfn-form'>
      <div class='cloudfn-provider-toggle q-mb-md'>
        <div class='cloudfn-provider-label text-caption text-grey-6'>
          {{ $t('cloudFunctionProvider') }}
        </div>
        <q-option-group
          v-model='provider'
          :options='providerOptions'
          color='cyan-7'
          type='radio'
          inline
          class='cloudfn-provider-options'
        />
        <div class='cloudfn-provider-hint text-caption text-grey-7'>
          {{ $t('cloudFunctionProviderHint') }}
        </div>
      </div>

      <div class='text-caption text-grey-6 q-mb-sm'>
        {{ $t('cloudFunctionIntro') }}
      </div>

      <q-input
        dense
        debounce='300'
        v-model='form.baseUrl'
        :label="$t('cloudFunctionBaseUrl')"
        :hint="$t('cloudFunctionBaseUrlHint')"
        :rules="[val => !val || /^https?:\/\//.test(val) || $t('fieldShouldStartWithHTTP')]"
        spellcheck='false'
        class='q-mb-sm'
        @blur='save'
      >
        <template v-slot:append>
          <q-icon
            v-if='form.baseUrl'
            name='clear'
            class='cursor-pointer'
            @click="form.baseUrl = ''"
          />
        </template>
      </q-input>

      <template v-if='!isMagicApi'>
        <q-input
          dense
          debounce='300'
          v-model='form.appId'
          :label="$t('cloudFunctionAppId')"
          :hint="$t('cloudFunctionAppIdHint')"
          spellcheck='false'
          class='q-mb-sm'
          @blur='save'
        />

        <q-select
          dense
          options-dense
          v-model='form.platform'
          :options='platformOptions'
          :label="$t('cloudFunctionPlatform')"
          :hint="$t('cloudFunctionPlatformHint')"
          emit-value
          map-options
          class='q-mb-sm'
          @input='save'
        />
      </template>

      <q-input
        dense
        debounce='300'
        v-model='form.token'
        :type="showToken ? 'text' : 'password'"
        :label="isMagicApi ? $t('cloudFunctionMagicApiToken') : $t('cloudFunctionToken')"
        :hint="isMagicApi ? $t('cloudFunctionMagicApiTokenHint') : $t('cloudFunctionTokenHint')"
        spellcheck='false'
        class='q-mb-sm'
        @blur='save'
      >
        <template v-slot:append>
          <q-icon
            :name='showToken ? "visibility_off" : "visibility"'
            class='cursor-pointer'
            @click='showToken = !showToken'
          />
        </template>
      </q-input>

      <div class='row items-center q-gutter-sm q-mt-md'>
        <q-btn
          unelevated
          color='primary'
          icon='save'
          :label="$t('save')"
          @click='save'
        />
        <q-btn
          flat
          color='grey-7'
          icon='cloud_done'
          :label="$t('cloudFunctionTest')"
          :loading='testing'
          @click='testConnection'
        />
        <q-btn
          flat
          color='cyan-7'
          icon='science'
          :label="$t('cloudFunctionDemo')"
          :disable='testing || isMagicApi'
          @click='openDemo'
        />
        <q-btn
          flat
          color='red-7'
          icon='logout'
          :label="$t('cloudFunctionClearToken')"
          @click='clearToken'
        />
        <q-space />
        <q-chip
          v-if='savedAt'
          dense
          color='green-2'
          text-color='green-9'
          icon='check'
        >{{ $t('savedAt', { time: savedAt }) }}</q-chip>
      </div>

      <q-banner
        v-if='testResult'
        :class="testResult.ok ? 'bg-green-1 text-green-10' : 'bg-red-1 text-red-10'"
        rounded
        dense
        class='q-mt-md'
      >
        <template v-slot:avatar>
          <q-icon :name="testResult.ok ? 'cloud_done' : 'cloud_off'" />
        </template>
        {{ testResult.message }}
      </q-banner>
    </div>

    <cloudBspAppDemoDialog v-model='demoDialogOpen' />
  </div>
</template>

<script>
import cloud from 'src/services/cloud/CloudFunctionProvider'
import { CLOUDFN_PROVIDER_MAGIC_API } from 'src/utils/cloud-router'
import cloudBspAppDemoDialog from 'components/cloud/cloudBspAppDemoDialog'

export default {
  name: 'cloudFunctionConfigDialog',
  components: {
    cloudBspAppDemoDialog
  },
  data () {
    return {
      provider: 'uniCloud',
      form: {
        baseUrl: '',
        appId: '',
        platform: 'h5',
        token: ''
      },
      showToken: false,
      savedAt: '',
      testing: false,
      testResult: null,
      providerOptions: [
        { label: 'uniCloud', value: 'uniCloud' },
        { label: 'Supabase', value: 'supabase' },
        { label: 'magic-api', value: 'magic-api' }
      ],
      platformOptions: [
        { label: 'h5', value: 'h5' },
        { label: 'electron', value: 'electron' },
        { label: 'app-plus', value: 'app-plus' },
        { label: 'mp-weixin', value: 'mp-weixin' }
      ],
      demoDialogOpen: false
    }
  },
  computed: {
    isMagicApi () {
      return this.provider === CLOUDFN_PROVIDER_MAGIC_API
    }
  },
  created () {
    const cfg = cloud.getConfig()
    this.provider = cfg.provider || 'uniCloud'
    this.form = {
      baseUrl: cfg.baseUrl,
      appId: cfg.appId,
      platform: cfg.platform || 'h5',
      token: cfg.token
    }
  },
  methods: {
    save () {
      cloud.setConfig({
        provider: this.provider,
        baseUrl: this.form.baseUrl,
        appId: this.form.appId,
        platform: this.form.platform
      })
      cloud.setToken(this.form.token)
      const d = new Date()
      const pad = n => String(n).padStart(2, '0')
      this.savedAt = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    },
    clearToken () {
      this.form.token = ''
      cloud.clearToken()
      this.savedAt = ''
      this.$message && this.$message.success(this.$t('cloudFunctionTokenCleared'))
    },
    async testConnection () {
      this.save()
      this.testResult = null
      this.testing = true
      try {
        const cfg = cloud.getConfig()
        if (!cfg.baseUrl) {
          this.testResult = { ok: false, message: this.$t('cloudFunctionNoBaseUrl') }
          return
        }
        await cloud.testConnection()
        this.testResult = { ok: true, message: this.$t('cloudFunctionPingOk') }
      } catch (e) {
        console.warn('[cloudFunctionConfigDialog] testConnection failed:', e)
        this.testResult = { ok: false, message: `${e.code || ''} ${e.message || ''}` }
      } finally {
        this.testing = false
      }
    },
    openDemo () {
      if (this.isMagicApi) {
        this.$message && this.$message.warning(this.$t('cloudFunctionMagicApiDemoDisabled'))
        return
      }
      this.demoDialogOpen = true
    }
  }
}
</script>

<style lang='scss' scoped>
.cloudfn-config {
  padding: 4px 2px;
}
.cloudfn-form {
  max-width: 560px;
}

.cloudfn-provider-toggle {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(120, 120, 120, 0.25);
  background: rgba(0, 0, 0, 0.02);
}
.body--dark .cloudfn-provider-toggle {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}
.cloudfn-provider-label {
  margin-bottom: 4px;
}
.cloudfn-provider-options {
  margin-bottom: 2px;
}
.cloudfn-provider-hint {
  margin-top: 2px;
}

</style>
