<template>
  <div class="micro-app-host" :class="$attrs.class">
    <WujieVue
      v-if="app && resolvedUrl"
      :key="hostKey"
      :name="app.id"
      :url="resolvedUrl"
      :alive="true"
      :sync="false"
      :attrs="wujieAttrs"
    />
    <div v-else class="micro-app-host__placeholder">
      <q-icon name="apps" size="3rem" color="grey-5" />
      <div class="text-h6 q-mt-sm text-grey-7">{{ $t('microAppsEmpty') }}</div>
      <div class="text-caption text-grey-5 q-mt-xs">{{ $t('microAppsEmptyHint') }}</div>
    </div>
  </div>
</template>

<script>
import WujieVue from 'wujie-vue2'
import { resolveActiveUrl } from './microAppService'
import { installMicroAppParseBridge } from './microAppIpcBridge'

export default {
  name: 'microAppHost',
  components: {
    WujieVue
  },
  inheritAttrs: false,
  props: {
      app: {
        type: Object,
        default: null
      },
      // 来自 microAppDrawer：每次保存后递增，触发整个 host 重建（wujie 子应用也会随之重新初始化）
      reloadKey: {
        type: String,
        default: '0'
      }
    },
  mounted () {
    // 注册 wujie bus 上的 /parse 桥，让子应用（vue2-sfc-playground 等）
    // 通过 bus.$emit('microapp:parse:request', ...) 调用本进程 vue-sfc:parse IPC。
    // 微应用整体生命周期内只需要一个 bridge 句柄；hostKey 变化触发 v-if 重建时会重走 mounted。
    this._uninstallBridge = installMicroAppParseBridge()
  },
  beforeDestroy () {
    if (typeof this._uninstallBridge === 'function') {
      this._uninstallBridge()
      this._uninstallBridge = null
    }
  },
  computed: {
    resolvedUrl () {
      return resolveActiveUrl(this.app) || ''
    },
    // 切换 app / url 时强制重建 iframe，使 wujie 重新初始化子应用（keep-alive 模式下仍想换新 url 时需要 key 变化）
    hostKey () {
      const app = this.app || {}
      return `${app.id || 'empty'}::${this.resolvedUrl || 'empty'}::${this.reloadKey}`
    },
    wujieAttrs () {
      return { data: {} }
    }
  }
}
</script>

<style scoped>
.micro-app-host {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
  background-color: var(--editorBgColor, #fff);
}

.micro-app-host__frame {
  display: block;
  width: 100%;
  height: 100%;
}

.micro-app-host__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
</style>
