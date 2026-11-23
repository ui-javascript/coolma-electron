import type { Theme } from 'vitepress'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/index.css'
import 'katex/dist/katex.min.css'
import MuyaLive from './components/MuyaLive.vue'
import RuneHost from './rune/RuneHost.vue'
import EchoHost from './rune/EchoHost.vue'

export default {
  extends: Teek,
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
    app.component('MuyaLive', MuyaLive)
    app.component('RuneHost', RuneHost)
    app.component('EchoHost', EchoHost)
  }
} satisfies Theme
