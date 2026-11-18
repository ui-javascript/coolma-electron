<template>
  <q-dialog ref="dialog" transition-show="fade" transition-hide="fade" persistent>
    <q-card class="blog-deploy-progress-card">
      <q-card-section class="row items-center no-wrap q-pb-sm">
        <q-icon name="rocket_launch" class="text-primary q-mr-sm" size="1.5rem" />
        <div class="text-subtitle1 text-weight-medium">{{ $t('deployInProgress') }}</div>
        <q-space />
        <q-spinner color="primary" size="1.2rem" v-if="status === 'running'" />
      </q-card-section>

      <q-separator />

      <q-card-section class="q-pa-md">
        <!-- 进度条 -->
        <div class="q-mb-md">
          <div class="row items-center justify-between q-mb-xs">
            <span class="text-body2">{{ currentStepLabel }}</span>
            <span class="text-caption text-grey-6">{{ progressPercent }}%</span>
          </div>
          <q-linear-progress
            :value="progressPercent / 100"
            color="primary"
            track-color="grey-3"
            rounded
            size="10px"
          />
        </div>

        <!-- 各阶段状态 -->
        <div class="steps-list">
          <div
            v-for="step in steps"
            :key="step.key"
            class="step-item"
            :class="{ 'step-item--active': step.key === currentStep, 'step-item--done': isStepDone(step.key) }"
          >
            <q-icon
              :name="getStepIcon(step.key)"
              size="16px"
              class="step-icon"
            />
            <span class="step-label">{{ step.label }}</span>
          </div>
        </div>

        <!-- 日志区域 -->
        <div class="log-area">
          <div class="log-header">
            <q-icon name="terminal" size="14px" />
            <span class="q-ml-xs text-caption">日志</span>
            <q-space />
            <q-btn flat round dense icon="content_copy" size="xs" @click="copyLog" />
          </div>
          <div class="log-content" ref="logContent">
            <div v-for="(line, i) in logs" :key="i" class="log-line" :class="'log-line--' + line.type">
              <span class="log-time" v-if="line.time">{{ line.time }}</span>
              <span class="log-text">{{ line.text }}</span>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          v-if="status === 'running'"
          flat
          :label="$t('cancelDeploy')"
          color="negative"
          icon="stop"
          @click="onCancel"
        />
        <template v-else-if="status === 'done'">
          <q-btn flat :label="$t('openInBrowser')" icon="open_in_new" @click="openBlog" />
          <q-btn unelevated color="primary" :label="$t('ok')" v-close-popup />
        </template>
        <template v-else-if="status === 'error'">
          <q-btn flat :label="$t('cancelDeploy')" icon="close" v-close-popup />
          <q-btn unelevated color="primary" :label="$t('rebuild')" @click="onRebuild" />
        </template>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import bus from 'components/common/bus'

export default {
  name: 'BlogDeployProgressDialog',
  data () {
    return {
      status: 'running', // running | done | error | cancelled
      currentStep: 'export', // export | config | build | trigger
      progressPercent: 0,
      logs: [],
      blogUrl: ''
    }
  },
  computed: {
    steps () {
      return [
        { key: 'export', label: this.$t('stepExport') },
        { key: 'config', label: this.$t('stepBuild') },
        { key: 'build', label: this.$t('stepBuild') },
        { key: 'trigger', label: this.$t('stepTrigger') },
        { key: 'sftp', label: this.$t('stepSftp') }
      ]
    },
    currentStepLabel () {
      const step = this.steps.find(s => s.key === this.currentStep)
      return step ? step.label : ''
    },
    stepProgressMap () {
      return {
        export: { start: 0, end: 20 },
        config: { start: 20, end: 35 },
        build: { start: 35, end: 70 },
        trigger: { start: 70, end: 85 },
        sftp: { start: 85, end: 100 }
      }
    }
  },
  methods: {
    getStepIcon (key) {
      const stepOrder = ['export', 'config', 'build', 'trigger', 'sftp']
      const idx = stepOrder.indexOf(key)
      const currentIdx = stepOrder.indexOf(this.currentStep)
      if (idx < currentIdx || this.status === 'done') return 'check_circle'
      if (idx === currentIdx && this.status === 'running') return 'play_arrow'
      return 'radio_button_unchecked'
    },
    isStepDone (key) {
      const stepOrder = ['export', 'config', 'build', 'trigger', 'sftp']
      const idx = stepOrder.indexOf(key)
      const currentIdx = stepOrder.indexOf(this.currentStep)
      return idx < currentIdx || this.status === 'done'
    },
    onProgress ({ stage, message, percent }) {
      this.currentStep = stage
      if (percent !== undefined) {
        this.progressPercent = Math.round(percent)
      } else if (stage && this.stepProgressMap[stage]) {
        const range = this.stepProgressMap[stage]
        this.progressPercent = Math.round((range.start + range.end) / 2)
      }
      if (message) {
        this.appendLog(message, 'info')
      }
    },
    onLog (text) {
      this.appendLog(text, 'log')
    },
    appendLog (text, type = 'info') {
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      this.logs.push({ text, type, time })
      this.$nextTick(() => {
        if (this.$refs.logContent) {
          this.$refs.logContent.scrollTop = this.$refs.logContent.scrollHeight
        }
      })
    },
    onDone ({ success, outputDir, url }) {
      this.status = success ? 'done' : 'error'
      this.progressPercent = 100
      if (success) {
        this.blogUrl = url || outputDir || ''
        this.appendLog(this.$t('deploySuccess'), 'success')
      } else {
        this.appendLog(this.$t('deployFailed'), 'error')
      }
    },
    onCancelled () {
      this.status = 'cancelled'
      this.appendLog(this.$t('deployCancelled'), 'warn')
    },
    onCancel () {
      this.$emit('cancel')
      this.status = 'cancelled'
      this.appendLog(this.$t('deployCancelled'), 'warn')
      this.hide()
    },
    onRebuild () {
      this.$emit('rebuild')
      this.hide()
    },
    openBlog () {
      if (this.blogUrl) {
        this.$q.electron.shell.openExternal(this.blogUrl)
      }
    },
    copyLog () {
      const text = this.logs.map(l => `${l.time || ''} ${l.text}`).join('\n')
      this.$q.electron.clipboard.writeText(text)
      this.$q.notify({ message: 'Log copied', type: 'positive', icon: 'check' })
    },
    reset () {
      this.status = 'running'
      this.currentStep = 'export'
      this.progressPercent = 0
      this.logs = []
      this.blogUrl = ''
    },
    toggle () {
      return this.$refs.dialog.toggle()
    },
    show () {
      this.reset()
      return this.$refs.dialog.show()
    },
    hide () {
      return this.$refs.dialog.hide()
    }
  },
  mounted () {
    bus.$on('blog-deploy-progress', this.onProgress)
    bus.$on('blog-deploy-log', this.onLog)
    bus.$on('blog-deploy-done', this.onDone)
    bus.$on('blog-deploy-cancelled', this.onCancelled)
  },
  beforeDestroy () {
    bus.$off('blog-deploy-progress', this.onProgress)
    bus.$off('blog-deploy-log', this.onLog)
    bus.$off('blog-deploy-done', this.onDone)
    bus.$off('blog-deploy-cancelled', this.onCancelled)
  }
}
</script>

<style scoped>
.blog-deploy-progress-card {
  width: 560px;
  max-width: 90vw;
}

.steps-list {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.04);
  color: #9e9e9e;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.body--dark .step-item {
  background: rgba(255, 255, 255, 0.06);
}

.step-item--active {
  background: rgba(33, 133, 208, 0.12);
  color: #1976d2;
}

.body--dark .step-item--active {
  background: rgba(33, 133, 208, 0.2);
}

.step-item--done {
  background: rgba(76, 175, 80, 0.1);
  color: #4caf50;
}

.body--dark .step-item--done {
  background: rgba(76, 175, 80, 0.15);
}

.step-icon {
  font-size: 14px;
}

.step-label {
  font-size: 0.78rem;
}

.log-area {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  overflow: hidden;
}

.body--dark .log-area {
  border-color: rgba(255, 255, 255, 0.1);
}

.log-header {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.04);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  color: #9e9e9e;
}

.body--dark .log-header {
  background: rgba(255, 255, 255, 0.04);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.log-content {
  max-height: 180px;
  overflow-y: auto;
  padding: 6px 10px;
  background: #1e1e1e;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 0.75rem;
  line-height: 1.6;
  scrollbar-width: thin;
  scrollbar-color: #555 transparent;
}

.log-content::-webkit-scrollbar {
  width: 5px;
}

.log-content::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.log-line {
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line--success {
  color: #4ec9b0;
}

.log-line--error {
  color: #f14c4c;
}

.log-line--warn {
  color: #cca700;
}

.log-time {
  color: #6a9955;
  margin-right: 8px;
}
</style>
