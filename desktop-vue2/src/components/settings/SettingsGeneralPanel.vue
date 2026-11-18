<template>
  <div class='settings-general-panel-layout'>
    <CategoryTabs
      v-model='subTab'
      :tabs='subTabOptions'
      color-theme='red'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-general-panel'>
      <!-- 语言 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Language" :title="$t('generalLanguage')" accent-color='red-7'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            {{ $t('language') }}
          </div>
          <q-select
            dense options-dense
            :value='$t(language)'
            :options='languageOptions'
            @input='languageChangeHandler'
          />
        </div>
      </SettingsSectionContent>

      <!-- 主题 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Theme" :title="$t('generalTheme')" accent-color='red-7'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            {{ $t('theme') }}
          </div>
          <q-select
            dense options-dense
            :value='$t(theme)'
            :options='themeOptions'
            @input='themeChangeHandler'
          >
            <template v-slot:after>
              <q-btn round dense flat size="sm" icon="contact_support" @click="themeHelpHandler" />
              <q-btn round dense flat size="sm" icon="refresh" @click="refreshThemeFolderHandler" />
              <q-btn round dense flat size="sm" icon="open_in_new" @click="openThemeFolderHandler" />
            </template>
          </q-select>
        </div>
      </SettingsSectionContent>

      <!-- 日志 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Log" :title="$t('generalLog')" accent-color='red-7'>
        <div class='setting-item--row fa-align-center'>
          <span>{{ $t('openLogFiles') }}</span>
          <q-btn
            class='fab-btn' flat round dense size='sm'
            color='red-7' icon='open_in_new'
            @click='$emit("open-log-files")'
          />
        </div>
      </SettingsSectionContent>

      <!-- 数据库 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Database" :title="$t('generalDatabase')" accent-color='red-7'>
        <div class='setting-item--row fa-align-center'>
          <span>{{ $t('openSqliteFile') }}</span>
          <q-btn
            class='fab-btn' flat round dense size='sm'
            color='red-7' icon='open_in_new'
            @click='$emit("open-sqlite-file")'
          />
        </div>
        <q-separator class='q-my-md' />
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('resetSqlite') }}</span>
            <q-btn
              class='fab-btn reset-sqlite-btn'
              flat no-caps color='negative'
              icon='delete_forever'
              :label="$t('resetSqlite')"
              @click='$emit("reset-sqlite")'
            />
          </div>
          <div class='text-caption text-grey-6'>
            {{ $t('resetSqliteHint') }}
          </div>
        </div>
        <q-separator class='q-my-md' />
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('resetRunes') }}</span>
            <q-btn
              class='fab-btn'
              flat no-caps color='purple-7'
              icon='auto_fix_high'
              :label="$t('resetRunes')"
              @click='$emit("reset-runes")'
            />
          </div>
          <div class='text-caption text-grey-6'>
            {{ $t('resetRunesHint') }}
          </div>
        </div>
        <div class='q-mt-md'>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('resetEchoes') }}</span>
            <q-btn
              class='fab-btn'
              flat no-caps color='blue-7'
              icon='graphic_eq'
              :label="$t('resetEchoes')"
              @click='$emit("reset-echoes")'
            />
          </div>
          <div class='text-caption text-grey-6'>
            {{ $t('resetEchoesHint') }}
          </div>
        </div>
      </SettingsSectionContent>

      <!-- 版本 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Version" :title="$t('generalVersion')" accent-color='red-7'>
        <div class='setting-item--row fa-align-center'>
          <span>{{ $t('currentVersion', { version }) }}</span>
          <q-btn
            class='fab-btn' flat round dense size='sm'
            color='red-7' icon='cached'
            @click='$emit("check-update")'
          />
        </div>
      </SettingsSectionContent>

      <!-- CDN注入（v2026-08-01 起从 ServerSubEnum 挪到 GeneralSubEnum） -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Cdn" :title="$t('cdnInjectTitle')" accent-color='red-7'>
        <q-banner rounded dense class='bg-red-1 text-red-10 q-mb-md'>
          <template v-slot:avatar>
            <q-icon name='info_outline' color='red-7' />
          </template>
          {{ $t('cdnInjectHint') }}
        </q-banner>
        <!-- 操作按钮 -->
        <div class='q-mb-md row q-gutter-sm'>
          <q-btn outline color='red-7' icon='add' :label="$t('cdnInjectAdd')" @click='openCdnEdit(null)' />
          <q-btn unelevated color='red-7' icon='rocket_launch' :label="$t('cdnInject')" :loading='cdnDepsSaving' @click='saveCdnDeps' />
        </div>
        <!-- CDN 依赖列表（v2026-08-01 起改为只读 + 弹框编辑） -->
        <div v-if='cdnDeps.length === 0' class='text-center q-pa-md text-grey-6'>
          <q-icon name='link_off' size='2rem' />
          <div class='q-mt-sm'>{{ $t('noData') }}</div>
        </div>
        <div v-else class='cdn-deps-list'>
          <div v-for='dep in cdnDeps' :key='dep.id' class='cdn-dep-item q-pa-sm q-mb-xs rounded-borders'>
            <div class='row items-center q-col-gutter-sm no-wrap'>
              <div class='col-auto'>
                <q-icon
                  :name='dep.enabled ? "link" : "link_off"'
                  :color='dep.enabled ? "red-7" : "grey-5"'
                  size='1.2em'
                />
              </div>
              <div class='col cdn-dep-item__name'>
                <div class='text-body2 text-weight-medium ellipsis'>{{ dep.name || '(未命名)' }}</div>
                <div class='text-caption text-grey-6 ellipsis'>{{ dep.url }}</div>
              </div>
              <div class='col-auto'>
                <q-badge v-if='dep.isBuiltIn' outline color='grey-7' :label='$t("cdnDepsBuiltIn")' />
              </div>
              <div class='col-auto'>
                <q-icon
                  v-if='dep.applyToBlog'
                  name='web'
                  color='red-7'
                  size='1.2em'
                >
                  <q-tooltip>{{ $t('cdnDepsApplyToBlog') }}</q-tooltip>
                </q-icon>
              </div>
              <div class='col-auto text-right'>
                <q-btn flat dense round icon='edit' color='red-7' size='sm' @click='openCdnEdit(dep)'>
                  <q-tooltip>{{ $t('cdnDepsEdit') }}</q-tooltip>
                </q-btn>
                <q-btn v-if='!dep.isBuiltIn' flat dense round icon='delete' color='negative' size='sm' @click='deleteCdnDep(dep.id)' />
                <q-icon v-else name='lock' color='grey-5' size='sm'>
                  <q-tooltip>{{ $t('cdnDepsBuiltIn') }}</q-tooltip>
                </q-icon>
              </div>
            </div>
          </div>
        </div>

        <!-- CDN 依赖编辑弹框（v2026-08-01 起从行内编辑改为弹框） -->
        <cdnDepEditDialog
          v-model='cdnEditVisible'
          :source='cdnEditSource'
          @submit='onCdnEditSubmit'
        />
      </SettingsSectionContent>

      <!-- 微应用（v2026-08-01 起从 ServerSubEnum 挪到 GeneralSubEnum） -->
      <SettingsMicroAppsPanel v-if='subTab === $enums.GeneralSubEnum.MicroApps' ref='microAppsPanel' />

      <!-- 个人信息（v2026-08-01 起从 ServerSubEnum 挪到 GeneralSubEnum） -->
      <SettingsProfilePanel v-if='subTab === $enums.GeneralSubEnum.Profile' />
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import SettingsMicroAppsPanel from 'components/settings/SettingsMicroAppsPanel'
import SettingsProfilePanel from 'components/settings/settingsProfilePanel'
import CdnDepEditDialog from 'components/settings/cdnDepEditDialog'
import { i18n, updateDialogDefaults } from 'boot/i18n'
import { openThemeFolder, refreshThemeFolder } from 'src/ApiInvoker'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'components/common/bus'

export default {
  name: 'SettingsGeneralPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent,
    SettingsMicroAppsPanel,
    SettingsProfilePanel,
    CdnDepEditDialog
  },
  props: {
    language: {
      type: String,
      required: true
    },
    theme: {
      type: String,
      required: true
    },
    themes: {
      type: Array,
      required: true
    },
    version: {
      type: String,
      required: true
    },
    cdnDeps: {
      type: Array,
      required: true
    }
  },
  data () {
    return {
      subTab: this.$enums.GeneralSubEnum.Language,
      cdnDepsSaving: false,
      // v2026-08-01：CDN 注入改用弹框形式编辑，记录当前编辑的源（新增时为 null）
      cdnEditVisible: false,
      cdnEditSource: null
    }
  },
  computed: {
    languageOptions: function () {
      return i18n.availableLocales.map(l => i18n.t(l))
    },
    themeOptions: function () {
      return this.themes.map(t => i18n.t(t.name))
    },
    subTabOptions () {
      return this.$enums.GeneralSubEnum.items.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon
      }))
    }
  },
  methods: {
    languageChangeHandler: function (lan) {
      lan = i18n.availableLocales.find(l => {
        return i18n.t(l) === lan
      })
      this.$emit('update-language', lan)
      i18n.locale = lan
      updateDialogDefaults()
      this.$q.notify({
        message: this.$t('switchLanguageHint'),
        color: 'primary',
        icon: 'info'
      })
    },
    themeChangeHandler: function (theme) {
      theme = this.themes.find(t => {
        return i18n.t(t.name) === theme
      })
      this.$emit('update-theme', theme.name)
      this.$q.dark.set(theme.dark)
      this.$emit('update-dark-mode', theme.dark)
    },
    themeHelpHandler: function () {
      this.$q.electron.shell.openExternal('https://www.tanknee.cn/Memocast/docs/tutorial-development/create-theme')
    },
    openThemeFolderHandler: function () {
      openThemeFolder()
    },
    refreshThemeFolderHandler: async function () {
      const themes = await refreshThemeFolder()
      this.$emit('update-themes', themes)
    },
    // ===== CDN 注入（v2026-08-01 起从 SettingsServerPanel 挪到通用面板） =====
    // v2026-08-01：参考微应用的弹框形式，新增 / 编辑改为 cdnDepEditDialog，
    // 列表只读展示，避免在表格里行内编辑体验割裂。
    openCdnEdit: function (source) {
      this.cdnEditSource = source || null
      this.cdnEditVisible = true
    },
    onCdnEditSubmit: function (payload) {
      // 新增 / 编辑统一处理：按 id 找，命中则替换；未命中则追加
      const idx = this.cdnDeps.findIndex(d => d.id === payload.id)
      if (idx === -1) {
        this.cdnDeps.push({ ...payload })
      } else {
        // 保留内置标记 isBuiltIn，避免被弹框覆盖
        this.cdnDeps.splice(idx, 1, {
          ...this.cdnDeps[idx],
          ...payload,
          isBuiltIn: this.cdnDeps[idx].isBuiltIn
        })
      }
      this.cdnEditVisible = false
    },
    deleteCdnDep: function (id) {
      const dep = this.cdnDeps.find(d => d.id === id)
      if (dep && dep.isBuiltIn) {
        this.$q.notify({
          message: this.$t('cdnDepsBuiltInCannotDelete'),
          type: 'warning',
          position: 'top'
        })
        return
      }
      this.$q.dialog({
        title: this.$t('confirm'),
        message: this.$t('cdnDepsDeleteConfirm'),
        ok: { label: this.$t('confirm'), color: 'negative' },
        cancel: { label: this.$t('cancel'), flat: true }
      }).onOk(() => {
        const idx = this.cdnDeps.findIndex(d => d.id === id)
        if (idx !== -1) {
          this.cdnDeps.splice(idx, 1)
        }
      })
    },
    saveCdnDeps: async function () {
      this.cdnDepsSaving = true
      try {
        await DatabaseClient.cdnDeps.saveAll(this.cdnDeps)
        localStorage.setItem('v__2_client_cdnDeps', JSON.stringify(this.cdnDeps))
        // 同步进 vuex：博客部署读 client.cdnDeps
        this.$store.dispatch('client/setCdnDeps', this.cdnDeps)
        bus.$emit('cdnDepsChanged')
        this.$q.notify({
          message: this.$t('cdnDepsSaveSuccess'),
          type: 'positive',
          position: 'top',
          timeout: 1500
        })
      } catch (err) {
        console.error('[Settings] saveCdnDeps error:', err)
        this.$q.notify({
          message: this.$t('cdnDepsSaveFailed') || '保存失败',
          type: 'negative',
          position: 'top'
        })
      } finally {
        this.cdnDepsSaving = false
      }
    }
  },
  watch: {
    // 微应用：进入 tab 时自动 load（与 SettingsServerPanel 原行为一致）
    subTab (val) {
      if (val === this.$enums.GeneralSubEnum.MicroApps) {
        this.$nextTick(() => {
          const panel = this.$refs.microAppsPanel
          if (panel && typeof panel.load === 'function') {
            panel.load()
          }
        })
      }
    }
  }
}
</script>

<style scoped>
.settings-general-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-general-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-general-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-general-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-general-panel::-webkit-scrollbar-track {
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

/* CDN 注入（v2026-08-01 起从 SettingsServerPanel 挪到通用面板） */
.cdn-deps-list {
  /* 内容自然流出，由父容器 settings-general-panel 统一滚动 */
}

.cdn-dep-item {
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.cdn-dep-item__name {
  min-width: 0;
}

.body--dark .cdn-dep-item {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}
</style>
