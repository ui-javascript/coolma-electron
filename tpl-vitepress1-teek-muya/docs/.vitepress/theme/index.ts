import type { Theme } from 'vitepress'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/index.css'
import 'katex/dist/katex.min.css'
import MuyaLive from './components/MuyaLive.vue'
import RuneHost from './rune/RuneHost.vue'
import EchoHost from './rune/EchoHost.vue'
import catalog from './rune/catalog.json'

export default {
  extends: Teek,
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
    app.component('MuyaLive', MuyaLive)
    app.component('RuneHost', RuneHost)
    app.component('EchoHost', EchoHost)

    // 全局组件在 app 创建时就注册好；远端 melt 包在浏览器启动阶段预热，
    // 首屏出现 <RuneHost> 时不必再等一次 meta + 资源的冷启动。
    if (typeof window !== 'undefined') {
      const meltRunes = (catalog as { runes?: Array<{ template?: string }> }).runes || []
      import('libs-muya-rune-vue3/meltRune')
        .then(({ preloadMeltRunes }) => preloadMeltRunes(meltRunes))
        .catch((error) => console.warn('[rune] preload failed', error))
    }
  }
} satisfies Theme
