<template>
  <q-dialog ref="dialog" transition-show="fade" transition-hide="fade" persistent>
    <q-card class="blog-deploy-dialog-card">
      <q-toolbar class="blog-deploy-toolbar">
        <q-icon name="cloud_upload" class="text-primary q-mr-sm" size="1.5rem" />
        <q-toolbar-title class="text-subtitle1 text-weight-medium">
          {{ $t('blogDeployConfig') }}
        </q-toolbar-title>
        <q-btn flat round dense icon="close" size="sm" v-close-popup @click="onCancel" />
      </q-toolbar>

      <q-card-section class="blog-deploy-content">
        <!-- 博客目录 -->
        <div class="config-section">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('blogDir') }} *
          </div>
          <div class="row items-center no-wrap q-gutter-xs">
            <q-input
              v-model="localConfig.blogDir"
              dense
              outlined
              class="col"
              :placeholder="$t('selectBlogDir')"
            />
            <q-btn
              unelevated
              color="primary"
              icon="folder_open"
              :label="$t('selectBlogDir')"
              @click="selectBlogDir"
            />
          </div>
        </div>

        <!-- 主题选择 -->
        <div class="config-section q-mt-md">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('blogTheme') }}
          </div>
          <div class="theme-options">
            <q-btn-toggle
              v-model="localConfig.theme"
              toggle-color="primary"
              :options="[
                { label: $t('blogThemeDefault'), value: 'default' },
                { label: $t('blogThemeVdoing'), value: 'vdoing' },
                { label: $t('blogThemeHope'), value: 'hope' },
                { label: $t('blogThemeReco'), value: 'reco' }
              ]"
              unelevated
              no-caps
              class="theme-toggle"
            />
            <div class="text-caption text-grey-6 q-mt-xs">
              {{ $t('blogThemeAutoDetectHint') }}
            </div>
          </div>
        </div>

        <!-- 部署 base 路径（VuePress publicPath） -->
        <div class="config-section q-mt-md">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('blogBasePath') }}
          </div>
          <q-input
            v-model="localConfig.base"
            dense
            outlined
            :placeholder="$t('blogBasePathPlaceholder')"
            lazy-rules
            :rules="baseRules"
          />
          <div class="text-caption text-grey-6 q-mt-xs">
            {{ $t('blogBasePathHint') }}
          </div>
        </div>

        <!-- 包管理器 -->
        <div class="config-section q-mt-md">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('packageManager') }}
          </div>
          <q-btn-toggle
            v-model="localConfig.packageManager"
            toggle-color="primary"
            :options="[
              { label: 'npm', value: 'npm' },
              { label: 'yarn', value: 'yarn' },
              { label: 'pnpm', value: 'pnpm' }
            ]"
            unelevated
            no-caps
            class="package-manager-toggle"
          />
          <div class="text-caption text-grey-6 q-mt-xs">
            {{ $t('packageManagerHint') }}
          </div>
        </div>

        <!-- 自定义构建命令（基于包管理器自动生成，可手动调整） -->
        <div class="config-section q-mt-md">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('customBuildCommand') }}
          </div>
          <q-input
            v-model="localConfig.customBuildCommand"
            dense
            outlined
            :placeholder="$t('customBuildCommandPlaceholder')"
          />
          <div class="text-caption text-grey-6 q-mt-xs">
            {{ $t('customBuildCommandHint') }}
          </div>
        </div>

        <q-separator class="q-my-md" />

        <!-- 部署方式 Tab 切换 -->
        <q-tabs
          v-model="activeDeployTab"
          dense
          align="left"
          class="deploy-tabs q-mb-sm"
          active-color="primary"
          indicator-color="primary"
          narrow-indicator
        >
          <q-tab name="github" :label="$t('githubDeploy')" icon="code" />
          <q-tab name="ci" :label="$t('exportBlogCi')" icon="build" />
          <q-tab name="sftp" :label="$t('sftpDeploy')" icon="cloud_upload" />
        </q-tabs>

        <q-tab-panels v-model="activeDeployTab" animated class="deploy-tab-panels">
          <!-- GitHub 部署 -->
          <q-tab-panel name="github" class="q-pa-none">
            <q-input
              v-model="localConfig.github.owner"
              dense
              outlined
              class="q-mb-sm"
              :label="$t('githubRepo')"
              placeholder="owner/repo"
            />

            <q-input
              v-model="localConfig.github.workflowId"
              dense
              outlined
              class="q-mb-sm"
              :label="$t('githubWorkflowId')"
              placeholder="deploy.yml"
            />

            <q-input
              v-model="localConfig.github.branch"
              dense
              outlined
              class="q-mb-sm"
              :label="$t('githubBranch')"
              placeholder="main"
            />

            <q-input
              v-model="localConfig.github.token"
              dense
              outlined
              class="q-mb-xs"
              :label="$t('githubToken')"
              :type="showToken ? 'text' : 'password'"
            >
              <template v-slot:append>
                <q-btn flat round dense :icon="showToken ? 'visibility_off' : 'visibility'" @click="showToken = !showToken" />
              </template>
            </q-input>
            <div class="text-caption text-grey-6">
              {{ $t('githubToken') }}: 需要 <code>workflow</code> 范围。
              <a href="#" @click.prevent="openGithubTokenGuide">生成 Token</a>
            </div>
          </q-tab-panel>

          <!-- 导出 CI 配置 -->
          <q-tab-panel name="ci" class="q-pa-none">
            <div class="text-caption text-grey-6 q-mb-sm">
              {{ $t('exportBlogCiHint') }}
            </div>
            <q-btn
              flat
              color="primary"
              icon="code"
              :label="$t('exportBlogCi')"
              :disable="!localConfig.blogDir"
              :loading="exportingCI"
              @click="exportCI"
            >
              <q-tooltip v-if="!localConfig.blogDir">
                {{ $t('blogDeployConfigRequired') }}
              </q-tooltip>
            </q-btn>
          </q-tab-panel>

          <!-- SFTP 部署 -->
          <q-tab-panel name="sftp" class="q-pa-none">
            <q-toggle
              v-model="localConfig.sftp.enabled"
              :label="$t('sftpEnabled')"
              class="q-mb-sm"
            />

            <template v-if="localConfig.sftp.enabled">
              <div class="row q-gutter-sm">
                <q-input
                  v-model="localConfig.sftp.host"
                  dense
                  outlined
                  class="col-8"
                  :label="$t('sftpHost')"
                  placeholder="example.com"
                />
                <q-input
                  v-model.number="localConfig.sftp.port"
                  dense
                  outlined
                  class="col-4"
                  :label="$t('sftpPort')"
                  type="number"
                />
              </div>

              <q-input
                v-model="localConfig.sftp.username"
                dense
                outlined
                class="q-mb-sm q-mt-sm"
                :label="$t('sftpUsername')"
              />

              <div class="text-caption text-grey-6 q-mb-xs">{{ $t('sftpAuthType') }}</div>
              <q-btn-toggle
                v-model="localConfig.sftp.authType"
                toggle-color="primary"
                :options="[
                  { label: $t('sftpAuthPassword'), value: 'password' },
                  { label: $t('sftpAuthKey'), value: 'key' }
                ]"
                unelevated
                no-caps
                class="q-mb-sm"
              />

              <template v-if="localConfig.sftp.authType === 'password'">
                <q-input
                  v-model="localConfig.sftp.password"
                  dense
                  outlined
                  class="q-mb-sm"
                  :label="$t('sftpPassword')"
                  :type="showSftpPassword ? 'text' : 'password'"
                >
                  <template v-slot:append>
                    <q-btn flat round dense :icon="showSftpPassword ? 'visibility_off' : 'visibility'" @click="showSftpPassword = !showSftpPassword" />
                  </template>
                </q-input>
              </template>

              <template v-else>
                <div class="row items-center no-wrap q-gutter-xs q-mb-sm">
                  <q-input
                    v-model="localConfig.sftp.privateKeyPath"
                    dense
                    outlined
                    class="col"
                    :label="$t('sftpPrivateKeyPath')"
                    readonly
                  />
                  <q-btn
                    unelevated
                    color="primary"
                    icon="attach_file"
                    :label="$t('sftpSelectKeyFile')"
                    @click="selectPrivateKey"
                  />
                </div>
                <q-input
                  v-model="localConfig.sftp.passphrase"
                  dense
                  outlined
                  class="q-mb-sm"
                  :label="$t('sftpPassphrase')"
                  type="password"
                />
              </template>

              <q-input
                v-model="localConfig.sftp.remotePath"
                dense
                outlined
                class="q-mb-sm"
                :label="$t('sftpRemotePath')"
                placeholder="/var/www/blog"
              />

              <q-toggle
                v-model="localConfig.sftp.backupEnabled"
                :label="$t('sftpBackupEnabled')"
                class="q-mb-sm"
              />

              <q-btn
                flat
                :label="$t('sftpTestConnection')"
                color="primary"
                icon="wifi"
                :loading="testingConnection"
                @click="testSftpConnection"
              />
            </template>
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="blog-deploy-actions">
        <q-btn flat :label="$t('cancelDeploy')" color="grey" v-close-popup @click="onCancel" />
        <q-btn
          flat
          :label="$t('saveConfig')"
          color="primary"
          :disable="!localConfig.blogDir"
          :loading="savingConfig"
          @click="saveOnly"
        />
        <q-btn
          unelevated
          color="primary"
          icon="rocket_launch"
          :label="$t('saveAndDeploy')"
          :disable="!localConfig.blogDir"
          :loading="savingAndDeploying"
          @click="saveAndDeploy"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { getBlogDeployConfig, saveBlogDeployConfig, selectDirectory, invokeApi, sftpTestConnection, exportBlogCI } from 'src/ApiInvoker'

export default {
  name: 'BlogDeployDialog',
  data () {
    return {
      activeDeployTab: 'github',
      localConfig: {
        blogDir: '',
        theme: 'default',
        base: './',
        packageManager: 'npm',
        customBuildCommand: 'npm run build',
        github: {
          owner: '',
          repo: '',
          workflowId: '',
          branch: 'main',
          token: ''
        },
        sftp: {
          enabled: false,
          host: '',
          port: 22,
          username: '',
          authType: 'password',
          password: '',
          privateKeyPath: '',
          passphrase: '',
          remotePath: '',
          backupEnabled: true
        }
      },
      showToken: false,
      showSftpPassword: false,
      savingConfig: false,
      savingAndDeploying: false,
      testingConnection: false,
      exportingCI: false
    }
  },
  computed: {
    baseRules () {
      // 留空 = 不强制覆盖,允许主进程"已有 base 时保留、缺失时跳过"
      // 非空必须以 / 开头或为 ./ 或 ../
      return [
        v => !v || v.trim() === '' || /^(?:\.\/|\.\.\/|\/)/.test(v.trim()) ||
          this.$t('blogBasePathInvalid')
      ]
    }
  },
  watch: {
    'localConfig.packageManager' (pm) {
      // 自动把 customBuildCommand 从旧 pm 前缀改成新前缀（仅当用户还没改过时）
      const oldPms = ['npm', 'yarn', 'pnpm']
      const oldPrefix = oldPms.find(p => this.localConfig.customBuildCommand.startsWith(p + ' run'))
      if (oldPrefix && oldPrefix !== pm) {
        this.localConfig.customBuildCommand = pm + this.localConfig.customBuildCommand.slice(oldPrefix.length)
      }
    }
  },
  async mounted () {
    await this.loadConfig()
  },
  methods: {
    async loadConfig () {
      try {
        const config = await getBlogDeployConfig()
        if (config) {
        const defaultCmd = (config.packageManager || 'npm') + ' run build'
        this.localConfig = {
          blogDir: config.blogDir || '',
          theme: config.theme || 'default',
          base: typeof config.base === 'string' ? config.base : './',
          packageManager: config.packageManager || 'npm',
          customBuildCommand: config.customBuildCommand || defaultCmd,
          github: {
              owner: config.github?.owner || '',
              repo: config.github?.repo || '',
              workflowId: config.github?.workflowId || '',
              branch: config.github?.branch || 'main',
              token: config.github?.token || ''
            },
            sftp: {
              enabled: config.sftp?.enabled || false,
              host: config.sftp?.host || '',
              port: config.sftp?.port || 22,
              username: config.sftp?.username || '',
              authType: config.sftp?.authType || 'password',
              password: config.sftp?.password || '',
              privateKeyPath: config.sftp?.privateKeyPath || '',
              passphrase: config.sftp?.passphrase || '',
              remotePath: config.sftp?.remotePath || '',
              backupEnabled: config.sftp?.backupEnabled !== false
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load blog deploy config:', err)
      }
    },
    async selectBlogDir () {
      try {
        const result = await selectDirectory(this.$t('selectBlogDir'))
        if (!result.canceled && result.filePath) {
          this.localConfig.blogDir = result.filePath
        }
      } catch (err) {
        console.error('Failed to select directory:', err)
      }
    },
    async selectPrivateKey () {
      try {
        const result = await selectDirectory(this.$t('sftpSelectKeyFile'))
        if (!result.canceled && result.filePath) {
          this.localConfig.sftp.privateKeyPath = result.filePath
        }
      } catch (err) {
        console.error('Failed to select key file:', err)
      }
    },
    openGithubTokenGuide () {
      this.$q.electron.shell.openExternal('https://github.com/settings/tokens/new?scopes=workflow')
    },
    async testSftpConnection () {
      this.testingConnection = true
      try {
        const result = await sftpTestConnection(this.localConfig.sftp)
        if (result.success) {
          this.$q.notify({
            message: this.$t('sftpTestSuccess'),
            type: 'positive',
            icon: 'check'
          })
        } else {
          this.$q.notify({
            message: this.$t('sftpTestFailed') + ': ' + (result.error?.message || result.error),
            type: 'negative',
            icon: 'close'
          })
        }
      } catch (err) {
        this.$q.notify({
          message: this.$t('sftpTestFailed') + ': ' + err.message,
          type: 'negative',
          icon: 'close'
        })
      } finally {
        this.testingConnection = false
      }
    },
    async saveConfigToBackend () {
      await saveBlogDeployConfig(this.localConfig)
    },
    async saveOnly () {
      this.savingConfig = true
      try {
        await this.saveConfigToBackend()
        this.$q.notify({
          message: this.$t('blogDeployConfigSaved'),
          type: 'positive',
          icon: 'check'
        })
        this.$refs.dialog.hide()
      } catch (err) {
        console.error('Failed to save config:', err)
        this.$q.notify({
          message: 'Failed to save config: ' + (err.message || String(err)),
          type: 'negative'
        })
      } finally {
        this.savingConfig = false
      }
    },
    async saveAndDeploy () {
      this.savingAndDeploying = true
      try {
        await this.saveConfigToBackend()
        this.$refs.dialog.hide()
        this.$emit('deploy', { config: this.localConfig })
      } catch (err) {
        console.error('Failed to save config:', err)
        this.$q.notify({
          message: 'Failed to save config: ' + (err.message || String(err)),
          type: 'negative'
        })
      } finally {
        this.savingAndDeploying = false
      }
    },
    async exportCI () {
      if (!this.localConfig.blogDir) return
      this.exportingCI = true
      try {
        const result = await exportBlogCI(this.localConfig.blogDir)
        if (result.error) {
          this.$q.notify({
            message: this.$t('exportBlogCiFailed') + ': ' + (result.message || result.error),
            type: 'negative',
            icon: 'close'
          })
          return
        }
        const written = (result.written || []).length
        const skipped = (result.skipped || []).length
        const msg = this.$t('exportBlogCiSuccess', {
          written,
          skipped,
          targetDir: result.targetDir || ''
        })
        this.$q.notify({
          message: msg,
          type: written > 0 ? 'positive' : 'info',
          icon: written > 0 ? 'check' : 'info',
          timeout: 4500
        })
      } catch (err) {
        this.$q.notify({
          message: this.$t('exportBlogCiFailed') + ': ' + (err.message || String(err)),
          type: 'negative',
          icon: 'close'
        })
      } finally {
        this.exportingCI = false
      }
    },
    onCancel () {
      this.$emit('cancel')
    },
    toggle () {
      return this.$refs.dialog.toggle()
    },
    show () {
      return this.$refs.dialog.show()
    },
    hide () {
      return this.$refs.dialog.hide()
    }
  }
}
</script>

<style scoped>
.blog-deploy-dialog-card {
  width: 520px;
  max-width: 90vw;
  height: 70vh;
  display: flex;
  flex-direction: column;
}

.blog-deploy-toolbar {
  flex: 0 0 auto;
  min-height: 48px;
  padding: 4px 8px;
}

.blog-deploy-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 16px;
}

.blog-deploy-actions {
  flex: 0 0 auto;
  padding: 12px 16px;
}

.config-section {
  margin-bottom: 4px;
}

.config-label {
  color: var(--q-color-primary);
}

.config-label::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 0.9em;
  background: var(--q-color-primary);
  margin-right: 6px;
  vertical-align: middle;
  border-radius: 1px;
}

code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.85em;
}

.theme-options {
  margin-top: 4px;
}

.package-manager-toggle {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  overflow: hidden;
}

.theme-toggle {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  overflow: hidden;
}

.deploy-tabs {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.body--dark .deploy-tabs {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.deploy-tab-panels {
  background: transparent;
}

.deploy-tab-panels .q-tab-panel {
  padding: 12px 0;
}

.body--dark .theme-toggle,
.body--dark .package-manager-toggle {
  border-color: rgba(255, 255, 255, 0.12);
}

.body--dark code {
  background: rgba(255, 255, 255, 0.1);
}
</style>
