import type { Theme } from 'vitepress'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/index.css'
import 'katex/dist/katex.min.css'

export default {
  extends: Teek,
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
  }
} satisfies Theme
