  <template>
  <div id='q-app'>
    <a-config-provider :locale='antdZhCN'>
      <router-view />
    </a-config-provider>
    <!-- 离线笔记同步提示对话框 -->
    <syncOfflinePromptDialog ref="offlineSyncDialog" @sync="handleOfflineSync" @skip="handleOfflineSkipSync" />
    <!-- 全屏火焰效果 -->
    <FireEffect ref="fireEffect" />
    <HeartEffect ref="heartEffect" />
    <ButterflyEffect ref="butterflyEffect" />
  </div>
</template>
<script>
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import ErrorHandler from './ErrorHandler'
import ScheduleHandler from './ScheduleHandler'
import ApiHandler from 'src/ApiHandler'
import { createNamespacedHelpers } from 'vuex'
import bus from './components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import { checkUpdate } from './ApiInvoker'
import syncOfflinePromptDialog from './components/sync/syncOfflinePromptDialog.vue'
import FireEffect from './components/common/FireEffect.vue'
import HeartEffect from './components/common/HeartEffect.vue'
import ButterflyEffect from './components/common/ButterflyEffect.vue'
import { bindBusDialogHost, startBusDialogs, stopBusDialogs } from './components/common/busDialogRegistry'

const { RegisterErrorHandler } = ErrorHandler
const { RegisterScheduleJobs } = ScheduleHandler
const { RegisterApiHandler } = ApiHandler

const { mapActions: mapClientActions, mapState: mapClientState } = createNamespacedHelpers('client')
const {
  mapActions: mapServerActions,
  mapState: mapServerState
} = createNamespacedHelpers('server')
export default {
  name: 'App',
  // vue-layerx 要求 setup() 同步阶段调 bindHost() 把 layer parent 桥到主 app，
  // 这样 LayerApp 子树能通过 $root / parent chain 找到主 Vue app 的 $store / $i18n
  // （vuex / vue-i18n v8 都是 mixin beforeCreate 取 this.$root.$xxx）。
  // 这是 vue-layerx + Options API 项目里唯一需要的 setup() 钩子；其余代码保持 Options API。
  setup () {
    bindBusDialogHost()
    return {}
  },
  components: { syncOfflinePromptDialog, FireEffect, HeartEffect, ButterflyEffect },
  data () {
    return {
      autoSaveInterval: null,
      antdZhCN: zhCN
    }
  },
  computed: {
    ...mapServerState(['isLogin'])
  },
  async mounted () {
    this.initWindowEdgeSafe()
    startBusDialogs()
    RegisterErrorHandler()
    RegisterScheduleJobs(this)
    RegisterApiHandler()
    bus.$on(events.RELOGIN, this.reLogin)
    bus.$on('showOfflineSyncPrompt', this.showOfflineSyncPrompt)
    bus.$on(events.UI_EVENTS.playFireEffect, this.handlePlayFireEffect)
    bus.$on(events.UI_EVENTS.playHeartEffect, this.handlePlayHeartEffect)
    bus.$on(events.UI_EVENTS.playButterflyEffect, this.handlePlayButterflyEffect)
    this.registerSyncListener()
    checkUpdate()
    this.initClientStore().then()
    this.initServerStore().then()
    // 运行时数据初始化（v2026-11-03）：
    // 原先只有打开「设置」弹框才会加载，导致不打开设置时编辑器里
    // 用户自建符文和自定义回响都不在。改为应用启动即加载（异步，不阻塞渲染）。
    this.initRuntimeData().catch(err => {
      console.warn('[App] initRuntimeData failed:', err)
    })
  },
  methods: {
    /**
     * Windows 无边框窗口（frame:false）的窗口边缘有一圈系统级 resize 热区
     * （约 8px，四角更大，且随 DPI 缩放）。它位于渲染层之上，CSS 无法覆盖，
     * 贴边的滚动条/抽屉关闭按钮会被它抢走点击。这里给 body 打标记，
     * 由 CSS 通过 --win-edge-safe 把可交互内容从边缘让开（见 style.css）。
     * 最大化时窗口贴屏幕边，无需让位，设为 0。
     */
    initWindowEdgeSafe () {
      if (process.platform !== 'win32') return
      document.body.classList.add('win-frameless')

      if (window.__coolmaWinEdgeSafeBound) return
      window.__coolmaWinEdgeSafeBound = true

      try {
        const { ipcRenderer } = require('electron')
        ipcRenderer.invoke('window-is-maximized').then((maximized) => {
          document.body.classList.toggle('is-maximized', !!maximized)
        })
        ipcRenderer.on('window-maximized', (_, maximized) => {
          document.body.classList.toggle('is-maximized', !!maximized)
        })
      } catch (err) {
        console.warn('[App] initWindowEdgeSafe failed:', err)
      }
    },

    // 显示离线笔记同步提示对话框
    showOfflineSyncPrompt (offlineNotes) {
      if (this.$refs.offlineSyncDialog) {
        this.$refs.offlineSyncDialog.show(offlineNotes)
      }
    },
    // 注册同步完成监听器，刷新服务器笔记列表
    async registerSyncListener () {
      const SyncService = (await import('./services/SyncService')).default
      this._syncListener = (event) => {
        if (event.type === 'sync_complete') {
          this.getAllCategories()
          this.getCategoryNotes()
        }
      }
      SyncService.addListener(this._syncListener)
    },
    // 确认同步离线笔记
    async handleOfflineSync () {
      console.log('[App] handleOfflineSync: starting sync...')
      try {
        const result = await this.runClientSync()
        if (result && result.success) {
          console.log('[App] Offline sync completed successfully')
        } else {
          console.warn('[App] Offline sync completed with issues:', result)
        }
      } catch (err) {
        console.error('[App] Offline sync failed:', err)
      }
    },
    // 跳过同步离线笔记
    handleOfflineSkipSync () {
      console.log('[App] handleOfflineSkipSync: skipped')
    },
    // 播放火焰效果
    handlePlayFireEffect () {
      if (this.$refs.fireEffect) {
        this.$refs.fireEffect.start()
      }
    },
    // 播放爱心效果
    handlePlayHeartEffect () {
      if (this.$refs.heartEffect) {
        this.$refs.heartEffect.start()
      }
    },
    // 播放蝴蝶效果
    handlePlayButterflyEffect () {
      if (this.$refs.butterflyEffect) {
        this.$refs.butterflyEffect.start()
      }
    },
    ...mapClientActions({
      initClientStore: 'initClientStore',
      initRuntimeData: 'initRuntimeData',
      runClientSync: 'sync'
    }),
    ...mapServerActions(['initServerStore', 'reLogin', 'getAllCategories', 'getCategoryNotes'])
  },
  beforeDestroy () {
    stopBusDialogs()
    bus.$off('showOfflineSyncPrompt', this.showOfflineSyncPrompt)
    bus.$off(events.UI_EVENTS.playFireEffect, this.handlePlayFireEffect)
    bus.$off(events.UI_EVENTS.playHeartEffect, this.handlePlayHeartEffect)
    bus.$off(events.UI_EVENTS.playButterflyEffect, this.handlePlayButterflyEffect)
    if (this._syncListener) {
      import('./services/SyncService').then(({ default: SyncService }) => {
        SyncService.removeListener(this._syncListener)
      })
    }
  }
}
</script>
