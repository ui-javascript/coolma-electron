<template>
  <q-drawer
    ref="drawer"
    :width="drawerWidth"
    side="right"
    overlay
    elevated
    behavior="desktop"
    no-swipe-close
    no-swipe-open
    content-class="hide-scrollbar"
    class="im-drawer"
    z-index="9999"
  >
    <div class="im-drawer-container">
      <!-- 顶部横向切换标签栏 + 关闭按钮 -->
      <div class="im-drawer-tabs">
        <div class="im-drawer-tabs-scroll">
          <div
            v-for="app in enabledApps"
            :key="app.id"
            class="im-drawer-tab"
            :class="{ 'im-drawer-tab--active': app.id === activeId }"
            @click="onAppSelect(app)"
          >
            <i v-if="isElementIcon(app.icon)" :class="[app.icon, 'im-drawer-tab__icon']" />
            <q-icon v-else :name="app.icon || 'apps'" class="im-drawer-tab__icon" size="18px" />
            <span class="im-drawer-tab__name">{{ app.name }}</span>
          </div>
        </div>
        <q-btn
          dense
          flat
          round
          icon="close"
          size="sm"
          class="im-drawer-close-btn"
          @click="hide"
        />
      </div>

      <div class="im-drawer-body">
        <microAppHost
          class="im-drawer-host"
          :app="activeApp"
          :reload-key="reloadKey"
        />
      </div>
    </div>
  </q-drawer>
</template>

<script>
import WujieVue from 'wujie-vue2'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'components/common/bus'
import microAppHost from './microAppHost.vue'
import {
  buildDefaultMicroApps,
  mergeBuiltInApps,
  normalizeMicroApps,
  pickDefaultApp
} from './microAppService'

export default {
  name: 'microAppDrawer',
  components: {
    microAppHost
  },
  data () {
    return {
      apps: [],
      activeId: '',
      reloadNonce: 0,
      ready: false
    }
  },
  computed: {
    enabledApps () {
      return normalizeMicroApps(this.apps).filter(a => a.enabled)
    },
    activeApp () {
      const list = this.enabledApps
      if (!list.length) return null
      return list.find(a => a.id === this.activeId) || list[0]
    },
    reloadKey () {
      return String(this.reloadNonce)
    },
    drawerWidth () {
      if (this.activeApp && this.activeApp.isMobile) {
        return Math.min(this.$q.screen.width * 0.6, 480)
      }
      return this.$q.screen.width * 0.8
    }
  },
  methods: {
    isElementIcon (icon) {
      return typeof icon === 'string' && icon.startsWith('el-icon-')
    },
    async loadApps () {
      const stored = await DatabaseClient.microApps.getAll()
      let list = normalizeMicroApps(stored)
      if (!list.length) {
        // v2026-08-08：首次启动 → 用完整默认列表（含内置条目）。
        list = normalizeMicroApps(buildDefaultMicroApps())
        await DatabaseClient.microApps.saveAll(list)
      } else {
        // v2026-08-08：对齐 SettingsMicroAppsPanel.load() 的升级场景。
        // 用户先打开抽屉（而不是 settings 面板）→ list 非空但缺内置条目；
        // mergeBuiltInApps 把缺失的内置条目补进去（保留用户已有修改），
        // 真正出现新增条目时才落库，避免重复 IO。
        const merged = mergeBuiltInApps(list)
        if (merged.length !== list.length) {
          list = merged
          await DatabaseClient.microApps.saveAll(list)
        } else {
          list = merged
        }
      }
      this.apps = list
      const defaultApp = pickDefaultApp(list)
      this.activeId = defaultApp ? defaultApp.id : ''
    },
    onAppSelect (app) {
      this.activeId = app.id
    },
    show () {
      if (!this.ready) {
        this.loadApps().then(() => { this.ready = true })
      }
      this.$nextTick(() => {
        if (this.$refs.drawer) this.$refs.drawer.show()
      })
    },
    hide () {
      if (this.$refs.drawer) this.$refs.drawer.hide()
    },
    toggle () {
      if (this.$refs.drawer && this.$refs.drawer.showing) {
        this.hide()
      } else {
        this.show()
      }
    },
    // 主动销毁已挂载（即便 keep-alive 模式）的 wujie 子应用，确保下次重新加载
    destroyAppsById (ids) {
      if (!ids || !ids.length) return Promise.resolve()
      return Promise.all(ids.map(id => {
        if (!id) return Promise.resolve()
        try {
          const ret = WujieVue.destroyApp(id)
          return ret && typeof ret.then === 'function' ? ret : Promise.resolve()
        } catch (err) {
          console.warn('[microAppDrawer] destroyApp failed for', id, err)
          return Promise.resolve()
        }
      }))
    },
    async onMicroAppsChanged (payload) {
      // 兼容旧格式（直接传列表）
      const list = Array.isArray(payload) ? payload : (payload && payload.list)
      const dirtyIds = payload && Array.isArray(payload.dirtyIds) ? payload.dirtyIds : []
      if (!Array.isArray(list)) return

      const oldActiveId = this.activeId
      const activeStillValid = list.some(a => a.id === oldActiveId && a.enabled)

      // 先按 dirty 销毁（被改 url / devUrl 的、被删的）；等待销毁完成再递增 nonce，避免与 host 重渲染争抢
      if (dirtyIds.length) {
        await this.destroyAppsById(dirtyIds)
      }

      this.apps = normalizeMicroApps(list)

      const enabled = this.apps.filter(a => a.enabled)
      if (activeStillValid) {
        this.activeId = oldActiveId
      } else {
        const fallback = pickDefaultApp(this.apps)
        this.activeId = fallback ? fallback.id : ''
      }

      if (dirtyIds.length) {
        // 等数据流就位后再递增，使 :key 变化时机略晚于 destroy 完成
        this.reloadNonce += 1
      }
    }
  },
  mounted () {
    this.loadApps().then(() => { this.ready = true })
    bus.$on('microAppsChanged', this.onMicroAppsChanged)
  },
  beforeDestroy () {
    bus.$off('microAppsChanged', this.onMicroAppsChanged)
    // 抽屉销毁时也清一遍，避免内存里残留 iframe
    this.destroyAppsById(this.enabledApps.map(a => a.id))
  }
}
</script>

<style scoped lang="scss">
.im-drawer {
  background-color: transparent !important;
  box-shadow: none !important;
}

.im-drawer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--editorBgColor, #ffffff);
  border-radius: 8px 0 0 8px;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
}

/* 顶部横向标签栏 */
.im-drawer-tabs {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  background-color: var(--floatBgColor, rgba(255, 255, 255, 0.4));
  border-bottom: 1px solid var(--floatBorderColor, #e8e8e8);
  padding-right: 8px;
}

.im-drawer-tabs-scroll {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.im-drawer-tabs-scroll::-webkit-scrollbar {
  display: none;
}

.im-drawer-close-btn {
  flex-shrink: 0;
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }
}

.im-drawer-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background-color: var(--themeColor10, rgba(64, 158, 255, 0.08));
  }
}

.im-drawer-tab--active {
  background: linear-gradient(135deg, rgba(67, 160, 71, 0.18) 0%, rgba(67, 160, 71, 0.08) 100%);
  color: #2e7d32;

  .im-drawer-tab__icon {
    color: #2e7d32;
  }
}

.im-drawer-tab__icon {
  font-size: 18px;
  color: var(--iconColor, #6b7280);
}

.im-drawer-tab__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--editorColor, #333);
}

.im-drawer-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: row;
  min-height: 0;
  position: relative;
}

.im-drawer-host {
  flex: 1 1 auto;
  min-width: 0;
}

.body--dark {
  .im-drawer-tabs {
    background-color: rgba(40, 40, 40, 0.4);
  }

  .im-drawer-tab--active {
    background: linear-gradient(135deg, rgba(102, 187, 106, 0.3) 0%, rgba(102, 187, 106, 0.12) 100%);
    color: #c8e6c9;

    .im-drawer-tab__icon {
      color: #c8e6c9;
    }
  }
}
</style>
