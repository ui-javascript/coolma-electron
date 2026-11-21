<template>
  <q-dialog
    :value='value'
    transition-show='jump-down'
    transition-hide='jump-up'
    @input='onInput'
  >
    <q-card class='bspapp-demo-card'>
      <q-toolbar class='bspapp-demo-toolbar'>
        <q-toolbar-title class='row items-center no-wrap text-white'>
          <q-icon name='science' size='1.4em' class='q-mr-sm' />
          <span class='text-weight-medium'>{{ $t('bspappDemoTitle') }}</span>
          <q-chip
            v-if='status'
            dense
            color='white'
            text-color='purple-7'
            :label='`HTTP ${status}`'
            class='q-ml-sm'
          />
        </q-toolbar-title>
        <q-btn
          flat
          round
          dense
          icon='settings'
          color='white'
          @click='showConfig = !showConfig'
        >
          <q-tooltip>{{ $t('bspappDemoConfigTitle') }}</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          icon='play_arrow'
          color='white'
          :loading='loading'
          :disable='loading'
          @click='runDemo'
        >
          <q-tooltip>{{ $t('bspappDemoRun') }}</q-tooltip>
        </q-btn>
        <q-btn flat round dense icon='close' color='white' v-close-popup />
      </q-toolbar>

      <q-card-section class='bspapp-demo-body'>
        <q-banner
          v-if='!hasConfig'
          class='bg-orange-1 text-orange-10 q-mb-sm'
          rounded
          dense
        >
          <template v-slot:avatar>
            <q-icon name='vpn_key' color='orange-7' />
          </template>
          <div class='text-body2'>{{ $t('bspappDemoNeedConfig') }}</div>
        </q-banner>

        <q-banner
          v-if='errorMsg'
          class='bg-red-1 text-red-10 q-mb-sm'
          rounded
          dense
        >
          <template v-slot:avatar>
            <q-icon name='error_outline' color='red-7' />
          </template>
          <div class='text-body2'>{{ errorMsg }}</div>
        </q-banner>

        <q-card v-if='showConfig' flat bordered class='q-mb-sm'>
          <q-card-section>
            <div class='text-subtitle2 text-grey-8 q-mb-sm'>
              {{ $t('bspappDemoConfigTitle') }}
            </div>
            <q-input
              dense
              outlined
              v-model='configForm.spaceId'
              :label='$t("bspappDemoSpaceId")'
              class='q-mb-sm'
            />
            <q-input
              dense
              outlined
              v-model='configForm.appToken'
              :label='$t("bspappDemoAppToken")'
              class='q-mb-sm'
            />
            <q-input
              dense
              outlined
              v-model='configForm.uniIdToken'
              :label='$t("bspappDemoUniIdToken")'
              type='password'
              class='q-mb-sm'
            />
            <div class='text-caption text-grey-6 q-mb-sm'>
              {{ $t('bspappDemoConfigHint') }}
            </div>
            <div class='row justify-end q-gutter-sm'>
              <q-btn
                flat
                dense
                color='grey-7'
                icon='delete_outline'
                :label="$t('bspappDemoClearConfig')"
                @click='clearConfig'
              />
              <q-btn
                unelevated
                dense
                color='purple-7'
                icon='save'
                :label="$t('bspappDemoSaveConfig')"
                @click='saveConfig'
              />
            </div>
          </q-card-section>
        </q-card>

        <div v-if='loading && !responseText' class='row items-center q-gutter-sm text-grey-7'>
          <q-spinner-puff color='purple-6' size='2em' />
          <span class='text-body2'>{{ $t('bspappDemoRunning') }}</span>
        </div>

        <pre v-if='responseText' class='bspapp-demo-response'>{{ responseText }}</pre>

        <div v-if='!loading && !responseText && !errorMsg' class='bspapp-demo-empty'>
          <q-icon name='touch_app' size='3em' color='purple-4' />
          <div class='text-subtitle1 text-grey-7 q-mt-md'>
            {{ $t('bspappDemoIdle') }}
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align='right' class='q-pa-sm'>
        <q-btn
          v-if='responseText'
          flat
          dense
          color='purple-7'
          icon='content_copy'
          :label="$t('copy')"
          @click='copyResponse'
        />
        <q-btn flat :label="$t('close')" color='primary' v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import {
  invokeDemo,
  getDemoConfig,
  setDemoConfig,
  clearDemoConfig
} from 'src/services/cloud/BspAppDemoService'

function emptyForm () {
  return { spaceId: '', appToken: '', uniIdToken: '' }
}

export default {
  name: 'cloudBspAppDemoDialog',
  props: {
    value: { type: Boolean, default: false }
  },
  data () {
    return {
      loading: false,
      status: null,
      responseText: '',
      errorMsg: '',
      showConfig: false,
      hasConfig: false,
      configForm: emptyForm()
    }
  },
  created () {
    this.refreshConfig()
  },
  methods: {
    onInput (val) {
      this.$emit('input', val)
    },
    refreshConfig () {
      const cfg = getDemoConfig()
      this.configForm = { ...emptyForm(), ...cfg }
      this.hasConfig = !!(cfg.spaceId && cfg.appToken && cfg.uniIdToken)
    },
    saveConfig () {
      setDemoConfig({ ...this.configForm })
      this.refreshConfig()
      this.$message && this.$message.success(this.$t('bspappDemoConfigSaved'))
    },
    clearConfig () {
      clearDemoConfig()
      this.configForm = emptyForm()
      this.refreshConfig()
      this.$message && this.$message.success(this.$t('bspappDemoConfigCleared'))
    },
    async runDemo () {
      if (!this.hasConfig) {
        this.showConfig = true
        this.errorMsg = this.$t('bspappDemoNeedConfig')
        return
      }
      this.loading = true
      this.errorMsg = ''
      this.status = null
      this.responseText = ''
      try {
        const { status, data } = await invokeDemo()
        this.status = status
        this.responseText = this.formatJson(data)
      } catch (e) {
        const detail = (e && e.message) || String(e)
        this.errorMsg = `${this.$t('bspappDemoFailed')}: ${detail}`
        if (e && e.response && e.response.data) {
          this.responseText = this.formatJson(e.response.data)
        }
      } finally {
        this.loading = false
      }
    },
    formatJson (data) {
      if (typeof data === 'string') return data
      try {
        return JSON.stringify(data, null, 2)
      } catch (e) {
        return String(data)
      }
    },
    copyResponse () {
      if (!this.responseText) return
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(this.responseText).then(() => {
          this.$message && this.$message.success(this.$t('copied'))
        }).catch(() => {})
      }
    }
  }
}
</script>

<style lang='scss' scoped>
.bspapp-demo-card {
  width: 720px;
  max-width: 92vw;
}
.bspapp-demo-toolbar {
  background: linear-gradient(135deg, #6d28d9 0%, #db2777 100%);
}
.bspapp-demo-body {
  min-height: 320px;
  max-height: 60vh;
  overflow: auto;
}
.bspapp-demo-response {
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 12px 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.bspapp-demo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}
</style>
