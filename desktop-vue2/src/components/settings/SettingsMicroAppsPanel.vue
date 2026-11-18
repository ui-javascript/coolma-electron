<template>
  <div class="settings-micro-apps-panel">
    <SettingsSectionContent :title="$t('microApps')" accent-color="red-7">
      <q-banner rounded dense class="bg-red-1 text-red-10 q-mb-md">
        <template v-slot:avatar>
          <q-icon name="info_outline" color="red-7" />
        </template>
        {{ $t('microAppsHint') }}
      </q-banner>

      <div class="q-mb-md row q-gutter-sm items-center">
        <q-btn outline color="red-7" icon="add" :label="$t('microAppsAdd')" @click="openAdd" />
        <q-space />
        <q-btn unelevated color="red-7" icon="refresh" :label="$t('microAppsReload')" :loading="reloading" @click="reloadApps" />
      </div>

      <div v-if="apps.length === 0" class="text-center q-pa-md text-grey-6">
        <q-icon name="apps" size="2rem" />
        <div class="q-mt-sm">{{ $t('noData') }}</div>
      </div>

      <div v-else class="micro-apps-list">
        <div
          v-for="app in apps"
          :key="app.id"
          class="micro-app-row q-py-sm q-px-sm q-mb-xs rounded-borders"
        >
          <div class="micro-app-row__main">
            <i
              v-if="isElementIcon(app.icon)"
              :class="[app.icon, 'micro-app-row__icon']"
            />
            <q-icon v-else :name="app.icon || 'apps'" class="micro-app-row__icon" size="20px" />

            <div class="micro-app-row__name">
              <span :class="{ 'text-grey-5': !app.enabled }">{{ app.name || app.id }}</span>
              <!-- v2026-08-08 新增：内置徽章（区别于 isDefault 红徽章） -->
              <q-badge v-if="app.isBuiltIn" outline color="grey-7" :label="$t('microAppsBuiltin')" class="q-ml-sm">
                <q-tooltip>{{ $t('microAppsBuiltinHint') }}</q-tooltip>
              </q-badge>
              <q-badge v-else-if="app.isDefault" color="red-7" :label="$t('microAppsDefault')" class="q-ml-sm" />
              <!-- v2026-08-08 新增：displayMode 标签（drawer / fullscreen） -->
              <q-badge v-if="app.displayMode === 'fullscreen'" outline color="purple-7" :label="$t('microAppsDisplayModeFullscreen')" class="q-ml-sm" />
              <q-icon
                v-if="!app.enabled"
                name="block"
                size="14px"
                color="grey-5"
                class="q-ml-sm"
              >
                <q-tooltip>{{ $t('microAppsDisabled') }}</q-tooltip>
              </q-icon>
            </div>

            <div class="micro-app-row__url text-caption text-grey-7 ellipsis">
              <q-icon
                :name="isDevEnv() ? 'code' : 'cloud'"
                size="14px"
                class="q-mr-xs"
              />
              {{ isDevEnv() ? (app.devUrl || app.url) : (app.url || app.devUrl) }}
            </div>
          </div>

          <div class="micro-app-row__actions">
            <q-btn
              flat
              dense
              round
              icon="edit"
              color="red-7"
              size="sm"
              @click="openEdit(app)"
            >
              <q-tooltip>{{ $t('edit') }}</q-tooltip>
            </q-btn>
            <!-- v2026-08-08 新增：内置条目不显示删除按钮（不可删） -->
            <q-btn
              v-if="!app.isBuiltIn"
              flat
              dense
              round
              icon="delete"
              color="negative"
              size="sm"
              @click="confirmDelete(app)"
            >
              <q-tooltip>{{ $t('delete') }}</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
    </SettingsSectionContent>

    <microAppEditDialog
      v-model="editDialogVisible"
      :source="editingApp"
      @submit="onEditSubmit"
    />
  </div>
</template>

<script>
import DatabaseClient from 'src/utils/DatabaseClient'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import bus from 'components/common/bus'
import {
  buildDefaultMicroApps,
  diffMicroAppsForReload,
  isDevEnv,
  mergeBuiltInApps,
  normalizeMicroApps
} from 'components/microApp/microAppService'
import microAppEditDialog from 'components/microApp/microAppEditDialog.vue'

function generateId () {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function makeBlankApp () {
  return {
    id: generateId(),
    name: '',
    icon: 'el-icon-chat-dot-round',
    url: '',
    devUrl: '',
    isDefault: false,
    enabled: true,
    isMobile: false,
    // v2026-08-08：用户新增条目默认抽屉模式、非内置
    displayMode: 'drawer',
    isBuiltIn: false
  }
}

export default {
  name: 'SettingsMicroAppsPanel',
  components: {
    SettingsSectionContent,
    microAppEditDialog
  },
  data () {
    return {
      apps: [],
      persisting: false,
      reloading: false,
      loaded: false,
      editDialogVisible: false,
      editingApp: null
    }
  },
  methods: {
    isDevEnv,
    isElementIcon (icon) {
      return typeof icon === 'string' && icon.startsWith('el-icon-')
    },
    async load () {
      if (this.loaded) return
      const stored = await DatabaseClient.microApps.getAll()
      let list = normalizeMicroApps(stored)
      // v2026-08-08：首次启动 → 用完整默认列表（含内置条目）；
      // 升级场景 → 把缺失的内置条目合并进现有列表（保留用户修改）。
      if (!list.length) {
        list = normalizeMicroApps(buildDefaultMicroApps())
        await DatabaseClient.microApps.saveAll(list)
      } else {
        const merged = mergeBuiltInApps(list)
        // mergeBuiltInApps 已 normalize；只在列表真的有变化（追加了缺失内置）时落库
        if (merged.length !== list.length) {
          list = merged
          await DatabaseClient.microApps.saveAll(list)
        } else {
          list = merged
        }
      }
      this.apps = list
      this.loaded = true
    },
    openAdd () {
      this.editingApp = null
      this.editDialogVisible = true
    },
    openEdit (app) {
      // 把现有记录克隆一份给弹框，编辑完成再回写到 this.apps
      this.editingApp = { ...app }
      this.editDialogVisible = true
    },
    onEditSubmit (form) {
      const idx = this.apps.findIndex(a => a.id === form.id)
      let next
      if (idx === -1) {
        // 新增 —— 新增的条目强制 isBuiltIn=false（用户不能新增内置条目）
        next = [...this.apps, { ...form, isBuiltIn: false }]
      } else {
        // 更新：内置条目和普通条目一样，全字段以表单为准（可编辑、不可删除）。
        next = this.apps.slice()
        next.splice(idx, 1, { ...form })
      }
      // isDefault 唯一性
      if (form.isDefault) {
        next = next.map(a => ({ ...a, isDefault: a.id === form.id }))
      }
      this.editDialogVisible = false
      this.editingApp = null
      // 编辑/新增完成后立刻落库，并通知 drawer 重建被改/新增的子应用
      this._persistAndBroadcast(next, this.apps)
    },
    confirmDelete (app) {
      // v2026-08-08：内置条目不可删（防御性兜底——UI 上删除按钮已隐藏，这里再次保险）。
      if (app.isBuiltIn) {
        this.$q.notify({ message: this.$t('microAppsBuiltinCannotDelete'), type: 'warning', position: 'top' })
        return
      }
      this.$q.dialog({
        title: this.$t('microAppsDelete'),
        message: this.$t('microAppsDeleteConfirm', { name: app.name || app.id }),
        cancel: { label: this.$t('cancel'), flat: true },
        ok: { label: this.$t('confirm'), color: 'negative' },
        persistent: true
      }).onOk(async () => {
        const next = this.apps.filter(a => a.id !== app.id)
        const normalized = normalizeMicroApps(next)
        if (!normalized.length) {
          this.$q.notify({ message: this.$t('microAppsEmptySave'), type: 'warning', position: 'top' })
          return
        }
        await this._persistAndBroadcast(normalized, this.apps)
      })
    },
    /**
     * 内部通用：把 next 落库，diff 出本次相对 prev 的 dirtyIds，再广播 microAppsChanged。
     * 同时把 this.apps 同步成归一化结果。
     *
     * @param {Array} next  落库后应有的列表（已更新过的内存值）
     * @param {Array} prev  落库前的内存值，用于 diff 出本次 dirtyIds
     */
    async _persistAndBroadcast (next, prev) {
      const normalized = normalizeMicroApps(next)
      if (!normalized.length) {
        this.$q.notify({ message: this.$t('microAppsEmptySave'), type: 'warning', position: 'top' })
        return false
      }
      const dirtyIds = diffMicroAppsForReload(prev || [], normalized)
      this.persisting = true
      try {
        const ok = await DatabaseClient.microApps.saveAll(normalized)
        if (!ok) {
          this.$q.notify({ message: this.$t('saveFailed'), type: 'negative', position: 'top' })
          return false
        }
        this.apps = normalized
        bus.$emit('microAppsChanged', { list: normalized, dirtyIds })
        this.$q.notify({
          message: this.$t('microAppsSaved'),
          type: 'positive',
          position: 'top',
          timeout: 1200
        })
        return true
      } catch (err) {
        console.error('[Settings] persistMicroApps error:', err)
        this.$q.notify({ message: this.$t('saveFailed'), type: 'negative', position: 'top' })
        return false
      } finally {
        this.persisting = false
      }
    },
    /**
     * 「刷新应用」按钮：把当前已落库的列表里所有 enabled 应用都标记为 dirty，
     * 让 drawer 销毁并重新挂载它们，用于「修改了 url/devUrl 但本地没 dirty 时强制刷新」。
     */
    async reloadApps () {
      const enabled = normalizeMicroApps(this.apps).filter(a => a.enabled)
      if (!enabled.length) {
        this.$q.notify({ message: this.$t('microAppsEmpty'), type: 'info', position: 'top' })
        return
      }
      this.reloading = true
      try {
        // 把列表原样 emit 一次，dirtyIds = 所有 enabled 应用的 id
        bus.$emit('microAppsChanged', {
          list: normalizeMicroApps(this.apps),
          dirtyIds: enabled.map(a => a.id)
        })
        this.$q.notify({
          message: this.$t('microAppsReloaded'),
          type: 'positive',
          position: 'top',
          timeout: 1000
        })
      } finally {
        // 简单防抖：200ms 后解除 loading（drawer 的 destroy 是异步的，这里只是反馈层）
        setTimeout(() => { this.reloading = false }, 200)
      }
    }
  }
}
</script>

<style scoped>
.micro-apps-list {
  /* 内容自然流出 */
}

.micro-app-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.micro-app-row__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.micro-app-row__icon {
  font-size: 18px;
  color: var(--iconColor, #6b7280);
  flex-shrink: 0;
}

.micro-app-row__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--editorColor, #333);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  max-width: 30%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.micro-app-row__url {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.micro-app-row__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.body--dark .micro-app-row {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.body--dark .micro-app-row__name {
  color: var(--editorColor, #ddd);
}
</style>
