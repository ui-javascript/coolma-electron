<template>
  <div class="demo-root">
    <header class="demo-header">
      <h1>Muya Editor Demo</h1>
      <button class="btn" @click="getContent">Get Markdown</button>
    </header>
    <main class="demo-main">
      <div ref="editor" class="editor-container" />
      <aside class="demo-sidebar">
        <div class="panel">
          <h3>Raw Markdown</h3>
          <textarea v-model="markdown" class="markdown-output" readonly />
        </div>
        <div class="panel">
          <h3>Plugins</h3>
          <ul>
            <li v-for="p in activePlugins" :key="p">{{ p }}</li>
          </ul>
        </div>
      </aside>
    </main>
  </div>
</template>

<script>
import {
  default as Muya,
  TablePicker,
  QuickInsert,
  CodePicker,
  EmojiPicker,
  ImagePathPicker,
  ImageSelector,
  FormatPicker,
  FrontMenu,
  ImageToolbar,
  LinkTools,
  TableBarTools,
  Transformer
} from 'libs-muya/lib'
import 'libs-muya/themes/default.css'

const PLUGINS = [
  'TablePicker',
  'QuickInsert',
  'CodePicker',
  'EmojiPicker',
  'ImagePathPicker',
  'ImageToolbar',
  'ImageSelector',
  'FormatPicker',
  'FrontMenu',
  'LinkTools',
  'Transformer',
  'TableBarTools'
]

export default {
  name: 'App',
  data () {
    return {
      editorInstance: null,
      markdown: '# Hello Muya\n\nStart typing your markdown here...',
      activePlugins: PLUGINS
    }
  },
  mounted () {
    this.initMuya()
  },
  beforeDestroy () {
    if (this.editorInstance) {
      this.editorInstance = null
    }
  },
  methods: {
    initMuya () {
      Muya.use(TablePicker)
      Muya.use(QuickInsert)
      Muya.use(CodePicker)
      Muya.use(EmojiPicker)
      Muya.use(ImagePathPicker)
      Muya.use(ImageToolbar)
      Muya.use(ImageSelector)
      Muya.use(FormatPicker)
      Muya.use(FrontMenu)
      Muya.use(LinkTools, { jumpClick: linkInfo => window.open(linkInfo.href) })
      Muya.use(Transformer)
      Muya.use(TableBarTools)

      this.editorInstance = new Muya(this.$refs.editor, {
        markdown: this.markdown,
        imagePathPicker: () => '',
        imageAction: () => ''
      })

      this.editorInstance.on('change', ({ markdown }) => {
        this.markdown = markdown
      })
    },
    getContent () {
      if (this.editorInstance) {
        alert('Markdown:\n\n' + this.editorInstance.getMarkdown())
      }
    }
  }
}
</script>

<style>
.demo-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}
.demo-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.demo-header h1 {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  flex: 1;
}
.btn {
  padding: 6px 16px;
  font-size: 14px;
  color: #fff;
  background: #409eff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn:hover { background: #66b1ff; }
.demo-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.editor-container {
  flex: 1;
  overflow: hidden;
  background: #fff;
}
.demo-sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  background: #f5f5f5;
}
.panel {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 12px;
}
.panel h3 {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;
}
.markdown-output {
  width: 100%;
  height: 200px;
  resize: none;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #333;
  background: #fafafa;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 8px;
}
.panel ul {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.panel li {
  font-size: 11px;
  padding: 2px 6px;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 3px;
}
</style>
