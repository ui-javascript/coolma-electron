<template>
  <div class="muya-live">
    <div ref="editor" class="muya-live-editor"></div>
    <p v-if="loadError" class="muya-live-error">引擎加载失败：{{ loadError }}</p>
    <p class="muya-live-tip">
      输入 <code>@</code> 唤起快捷面板：符文/回响分组的数据来自
      <code>libs-rune-core</code> / <code>libs-echo-core</code> 的 pure 层（CJS lib），
      与 desktop-vue2 / vitepress 模板共用同一份构造逻辑。
    </p>
  </div>
</template>

<script>
import 'libs-muya-vue2/themes/default.css'
import { buildEchoItems } from 'libs-echo-core'
import { buildRuneItems } from 'libs-rune-core'

/**
 * 模板内的演示卡片。桌面端这两份列表来自 SQLite，
 * 文档站没有库，固定给几张样例——构造逻辑与桌面端完全一致。
 */
const demoRunes = [
  { id: 'r-todo', name: '待办', desc: '插入一个待办勾选块', color: '#F06292' },
  { id: 'r-book', name: '书摘', desc: '书名 + 页码 + 摘录', color: '#7E57C2' },
  { id: 'r-review', name: '复盘', desc: '三行复盘模板', color: '#4CAF50' }
]
const demoEchoes = [
  { id: 'e-timer', name: '计时', desc: '当前段落计时回响', color: '#26A69A' },
  { id: 'e-vocab', name: '词汇', desc: '可编辑的生词卡', color: '#42A5F5' }
]

// Muya.use 是全局静态注册，dev 热重载会重复执行，记个标记
let pluginsRegistered = false

export default {
  name: 'MuyaLive',
  data () {
    return {
      editorInstance: null,
      loadError: '',
      markdown: [
        '# Muya 引擎实机演示（VuePress）',
        '',
        '这是一块真正跑起来的 Muya 编辑器（libs-muya-vue2，Vue2 引擎 CJS lib）。',
        '',
        '- 输入 `@` 唤起快捷面板，试试「符文」「回响」分组',
        '- 数据构造走 libs-echo-core / libs-rune-core，插入语义在引擎内置层（vue2 引擎现状）',
        ''
      ].join('\n')
    }
  },
  mounted () {
    this.initEditor()
  },
  beforeDestroy () {
    this.editorInstance = null
  },
  methods: {
    async initEditor () {
      try {
        // 编辑器依赖浏览器环境，等组件挂载后再加载。
        const { default: Muya, QuickInsert, Transformer } = await import('libs-muya-vue2/lib')
        if (!this.$refs.editor) return
        if (!pluginsRegistered) {
          Muya.use(QuickInsert)
          Muya.use(Transformer)
          pluginsRegistered = true
        }
        this.editorInstance = new Muya(this.$refs.editor, {
          markdown: this.markdown,
          // 面板数据源：谁调 buildXxxItems 谁就是数据的主人（桌面端=SQLite，文档站=样例卡片）
          quickInsertProvider () {
            return {
              sectionName: '符文',
              echoSectionName: '回响',
              items: {
                符文: buildRuneItems(demoRunes, '符文'),
                回响: buildEchoItems(demoEchoes, '回响')
              }
            }
          },
          imagePathPicker: () => '',
          imageAction: () => ''
        })
        this.editorInstance.on('change', ({ markdown }) => {
          this.markdown = markdown
        })
      } catch (error) {
        this.loadError = error && error.message ? error.message : String(error)
        console.error('[MuyaLive] failed to load editor:', error)
      }
    }
  }
}
</script>

<style scoped>
.muya-live {
  border: 1px solid #eaecef;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}

.muya-live-editor {
  min-height: 320px;
  text-align: left;
}

.muya-live-error {
  color: #c62828;
  font-size: 13px;
  margin: 8px 0 0;
}

.muya-live-tip {
  font-size: 13px;
  color: #6a737d;
  margin: 10px 0 0;
}
</style>
