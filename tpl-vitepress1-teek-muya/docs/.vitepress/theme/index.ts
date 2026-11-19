import type { Theme } from 'vitepress'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/index.css'
import 'katex/dist/katex.min.css'
import MuyaLive from './components/MuyaLive.vue'

export default {
  extends: Teek,
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
    app.component('MuyaLive', MuyaLive)
  }
} satisfies Theme
