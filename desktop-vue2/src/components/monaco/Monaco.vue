<template>
  <div class='monaco-root flex justify-center full-width' style="height: calc(100vh - 45px);">
    <div
      id='monaco'
      class='full-height full-width'
      v-show='!isCurrentNoteLoading && dataLoaded'
      v-close-popup
    ></div>
  </div>
</template>

<script>
import * as monaco from 'monaco-editor'
import { createNamespacedHelpers } from 'vuex'
import debugLogger from 'src/utils/debugLogger'
import helper from 'src/utils/helper'
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import { setupMonacoClipboard } from 'src/utils/monacoClipboardBridge'
import { escape } from 'lodash'

const {
  mapGetters: mapServerGetters,
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const { mapState: mapClientState } = createNamespacedHelpers('client')
export default {
  name: 'Monaco',
  props: {
    data: {
      type: Object,
      default: () => ({
        markdown: '',
        cursor: {
          // Monaco 要求 lineNumber / column >= 1，0 会被 validateLineNumber 抛错。
          // 父组件 Index.vue 会传入真实光标，这里只是兜底。
          lineNumber: 1,
          column: 1
        }
      })
    },
    active: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      contentEditor: {},
      pendingSaveData: null  // ✅ 编辑变化时预捕获的数据（与 Muya 保持一致）
    }
  },
  computed: {
    dataLoaded: function () {
      return !helper.isNullOrEmpty(this.currentNote)
    },
    ...mapServerState(['isCurrentNoteLoading', 'contentsList']),
    ...mapServerGetters(['currentNote', 'uploadImageUrl', 'currentNoteResources', 'currentNoteResourceUrl']),
    ...mapClientState(['darkMode'])
  },
  methods: {
    initMonaco: function () {
      monaco.editor.defineTheme('Memocast-Dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#34383e',
          'editorCursor.foreground': '#FFCC00'
        }
      })
      monaco.editor.defineTheme('Memocast-Light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#ffffff',
          'editorCursor.foreground': '#FFCC00'
        }
      })
      this.contentEditor = monaco.editor.create(document.getElementById('monaco'), {
        value: this.data.markdown,
        language: 'markdown',
        automaticLayout: true,
        theme: this.darkMode ? 'Memocast-Dark' : 'Memocast-Light',
        fontSize: 17,
        scrollBeyondLastLine: false,
        // ✅ 软换行：与 Muya 习惯一致，长行自动换行而非出现横向滚动条
        wordWrap: 'on',
        fontLigatures: true,
        fontFamily: 'JetBrains Mono, Fira Code, Monaco, PingFang SC, Hiragino Sans GB, 微软雅黑, Arial, sans-serif, Microsoft YaHei',
        accessibilitySupport: 'on',
        // Ensure Monaco uses the correct clipboard operations in Electron
        automaticClipboardScrollMode: 'toCursor',
        multiCursorPaste: 'all',
        // 禁用可能触发 worker 加载的功能
        'semanticHighlighting.enabled': false,
        // 限制 hover 行为以避免 worker 加载
        hover: {
          enabled: true,
          delay: 500,
          sticky: true
        },
        // 禁用 inlay hints（会触发 TS worker）
        inlayHints: {
          enabled: 'off'
        }
      })

      // Track note change state via content change (replaces onKeyDown)
      this.contentEditor.onDidChangeModelContent(() => {
        // ✅ 关键改进：移除 active 检查，确保所有变化都被捕获
        // 即使编辑器不是当前活跃的，也要记录内容变化
        const curData = this.contentEditor.getValue()
        
        console.log(`\n[Monaco Change Event] 🔔 FIRED! Time: ${new Date().toISOString()}`)
        console.log(`[Monaco Change Event] Content len: ${curData.length}`)
        console.log(`[Monaco Change Event] Preview: "${curData.substring(0, 50)}..."`)
        console.log(`[Monaco Change Event] Active state: ${this.active}`)
        
        // ✅ 兼容新格式：提取 currentNote 的真实内容
        let currentNoteContent = ''
        if (typeof this.currentNote === 'string') {
          currentNoteContent = this.currentNote || ''
        } else if (this.currentNote && typeof this.currentNote === 'object') {
          currentNoteContent = this.currentNote.__markdown || ''
        }
        
        console.log(`[Monaco Change Event] Store content len: ${currentNoteContent.length}`)
        
        // ✅ 使用提取后的内容进行比较
        if (curData !== currentNoteContent) {
          if (this.active) {
            this.updateNoteState('changed')
            console.log('[Monaco Change Event] State updated to: changed')
          }
          
          // ✅ 关键：无条件预捕获数据（不依赖 active 状态）
          // 这样即使编辑器即将被切换，也能保存最新内容
          const currentNote = this.$store.state.server.currentNote
          if (currentNote?.info) {
            this.pendingSaveData = {
              markdown: curData,
              docGuid: currentNote.info.docGuid,
              title: currentNote.info.title,
              resources: currentNote.resources || [],
              timestamp: Date.now()
            }
            console.log(`[Monaco Change Event] ✅ PRE-CAPTURED! docGuid=${currentNote.info.docGuid}, len=${curData.length}, timestamp=${Date.now()}`)
            console.log(`[Monaco Change Event] pendingSaveData is now ready for save!`)
          } else {
            console.warn('[Monaco Change Event] ⚠️ No currentNote.info, cannot pre-capture')
          }
        } else {
          if (this.active) {
            this.updateNoteState('default')
            console.log('[Monaco Change Event] State updated to: default (content matches)')
          }
          console.log('[Monaco Change Event] Content unchanged, no pre-capture needed')
        }
      })

      // Register custom shortcuts
      this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_COMMA, () => bus.$emit(events.VIEW_SHORTCUT_CALL.switchView, 'switchView'))
      this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_DOT, () => bus.$emit(events.VIEW_SHORTCUT_CALL.sourceMode, 'sourceMode'))
      this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, this.saveHandler)

      // Override Monaco's built-in clipboard to use Electron clipboard via shared bridge.
      // This ensures copy/paste/cut works correctly in Electron environment.
      this._monacoClipboardDisposable = setupMonacoClipboard(this.contentEditor, monaco)

      // Register copyAsMarkdown, copyAsHtml, pasteAsPlainText actions consumed by the app
      this.contentEditor.addAction({
        id: 'copyAsMarkdown',
        label: 'Copy As Markdown',
        keybindings: [],
        run: () => bus.$emit(events.EDIT_SHORTCUT_CALL.copyAsMarkdown, 'copyAsMarkdown')
      })
      this.contentEditor.addAction({
        id: 'copyAsHtml',
        label: 'Copy As HTML',
        keybindings: [],
        run: () => bus.$emit(events.EDIT_SHORTCUT_CALL.copyAsHtml, 'copyAsHtml')
      })
      this.contentEditor.addAction({
        id: 'pasteAsPlainText',
        label: 'Paste As Plain Text',
        keybindings: [],
        run: () => bus.$emit(events.EDIT_SHORTCUT_CALL.pasteAsPlainText, 'pasteAsPlainText')
      })

      // ✅ 右键菜单 / 命令面板的 复制 / 剪切 / 粘贴 显式动作
      // 走 Electron 剪贴板桥接（与 Ctrl/Cmd+C/X/V 共用 setupMonacoClipboard 的实现），
      // 保证在沙箱环境、光标未聚焦、右键菜单触发等场景下也能正常工作。
      this.contentEditor.addAction({
        id: 'memocast.copySelection',
        label: '复制',
        contextMenuGroupId: 'clipboard',
        contextMenuOrder: 1,
        run: () => this._runClipboardFromMenu('copy')
      })
      this.contentEditor.addAction({
        id: 'memocast.cutSelection',
        label: '剪切',
        contextMenuGroupId: 'clipboard',
        contextMenuOrder: 2,
        run: () => this._runClipboardFromMenu('cut')
      })
      this.contentEditor.addAction({
        id: 'memocast.pasteFromClipboard',
        label: '粘贴',
        contextMenuGroupId: 'clipboard',
        contextMenuOrder: 3,
        run: () => this._runClipboardFromMenu('paste')
      })
    },
    /**
     * 通过右键菜单触发的复制 / 剪切 / 粘贴
     * 调用同一套 Electron clipboard 桥接逻辑，避免沙箱环境下原生 clipboard 不可用。
     */
    _runClipboardFromMenu: function (type) {
      if (!this.contentEditor) return
      if (type === 'copy') {
        const selection = this.contentEditor.getSelection()
        const model = this.contentEditor.getModel()
        const text = model && selection ? model.getValueInRange(selection) : ''
        if (text) {
          if (window.__electronClipboard && window.__electronClipboard.writeText) {
            window.__electronClipboard.writeText(text)
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
          }
        }
        this.contentEditor.trigger('keyboard', 'editor.action.clipboardCopyAction', null)
      } else if (type === 'cut') {
        const selection = this.contentEditor.getSelection()
        const model = this.contentEditor.getModel()
        const text = model && selection ? model.getValueInRange(selection) : ''
        if (text) {
          if (window.__electronClipboard && window.__electronClipboard.writeText) {
            window.__electronClipboard.writeText(text)
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
          }
        }
        this.contentEditor.trigger('keyboard', 'editor.action.clipboardCutAction', null)
      } else if (type === 'paste') {
        const text = window.__electronClipboard && typeof window.__electronClipboard.readText === 'function'
          ? window.__electronClipboard.readText()
          : ''
        const selection = this.contentEditor.getSelection()
        if (text && selection) {
          this.contentEditor.executeEdits('paste', [{
            range: selection,
            text,
            forceMoveMarkers: true
          }])
        } else {
          this.contentEditor.trigger('keyboard', 'editor.action.clipboardPasteAction', null)
        }
      }
    },
    editCopyPasteHandler: function (type) {
      if (!this.active || !this.contentEditor) return
      const editor = this.contentEditor

      if (type === 'copyAsMarkdown') {
        // Copy selected text to clipboard as plain text
        const selection = editor.getSelection()
        const selectedText = editor.getModel().getValueInRange(selection)
        if (window.__electronClipboard) {
          window.__electronClipboard.writeText(selectedText)
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(selectedText)
        }
      } else if (type === 'copyAsHtml') {
        const selection = editor.getSelection()
        const selectedText = editor.getModel().getValueInRange(selection)
        const html = `<pre>${selectedText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
        if (window.__electronClipboard) {
          window.__electronClipboard.writeHTML(html)
          window.__electronClipboard.writeText(selectedText)
        }
      } else if (type === 'pasteAsPlainText') {
        // Read plain text from Electron clipboard and insert directly
        const text = window.__electronClipboard && window.__electronClipboard.readText()
        if (text !== undefined) {
          const selection = editor.getSelection()
          editor.executeEdits('pasteAsPlainText', [{
            range: selection,
            text: text,
            forceMoveMarkers: true
          }])
        }
      } else if (type === 'undo') {
        editor.trigger('source', 'undo')
      } else if (type === 'redo') {
        editor.trigger('source', 'redo')
      }
    },
    /**
     * 把 AI 助手的整段回复追加到 Monaco 末尾。
     * 由 appBus 事件 INSERT_AI_TEXT 触发，payload 为 { text }。
     * 仅在 Monaco 处于当前激活编辑器时执行（避免 Muya/Monaco 同时挂载时双写）。
     */
    insertAiTextHandler: function (text) {
      if (!this.active) return
      if (!text || !this.contentEditor) return

      const model = this.contentEditor.getModel()
      if (!model) return

      const lineCount = model.getLineCount()
      const lastLineMaxColumn = model.getLineMaxColumn(lineCount)
      const lastRange = {
        startLineNumber: lineCount,
        startColumn: lastLineMaxColumn,
        endLineNumber: lineCount,
        endColumn: lastLineMaxColumn
      }

      // 替换段前是否需要补换行：如果末尾不是空行，AI 段前先补一个换行避免粘在最后一行后面
      const lastLineText = model.getLineContent(lineCount) || ''
      const padding = lastLineText.length === 0 ? '' : '\n'
      const insertText = `${padding}${text}`

      this.contentEditor.executeEdits('insert-ai-text', [{
        range: lastRange,
        text: insertText,
        forceMoveMarkers: true
      }])

      // 把光标移到追加段的尾部
      const insertedLineCount = (insertText.match(/\n/g) || []).length
      const finalLineNumber = lineCount + insertedLineCount
      const finalColumn = insertedLineCount === 0
        ? lastLineMaxColumn + insertText.length
        : model.getLineMaxColumn(finalLineNumber)
      this.contentEditor.setPosition({
        lineNumber: finalLineNumber,
        column: finalColumn
      })
      this.contentEditor.revealLine(finalLineNumber)
      this.contentEditor.focus()

      if (this.active) {
        this.updateNoteState('changed')
      }
    },
    saveHandler: function () {
      if (this.active && this.contentEditor) {
        // ✅ 关键改进：优先使用 pendingSaveData（预捕获的最新内容）
        // 这样可以确保保存的是用户最后编辑的内容，而不是可能过时的 getValue()
        const contentToSave = this.pendingSaveData?.markdown || this.contentEditor.getValue()
        
        console.log(`\n[Monaco.saveHandler] 💾 Saving note...`)
        console.log(`[Monaco.saveHandler] Source: ${this.pendingSaveData ? 'pendingSaveData ✅' : 'getValue() fallback'}`)
        console.log(`[Monaco.saveHandler] Content len: ${contentToSave.length}`)
        
        this.updateNote(contentToSave)
      }
    },
    
    handleGlobalKeyDown: function (event) {
      // Handle Ctrl+S (Cmd+S on Mac) globally to ensure save works in Monaco
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        // Only intercept if Monaco editor is active and has content
        if (this.active && this.contentEditor) {
          // ✅ 改进：不再阻止事件冒泡，让其他监听器也能处理（但避免重复保存）
          event.preventDefault()
          // 移除 stopPropagation()，允许事件继续传播
          
          // 使用统一的 saveHandler（已优化为优先使用 pendingSaveData）
          this.saveHandler()
        } else {
          // Monaco 不活跃时，通知其他编辑器（Muya）处理
          bus.$emit(events.NOTE_SHORTCUT_CALL.save)
        }
      }
    },
    getValue: function () {
      return this.contentEditor?.getValue()
    },
    getCursorPosition: function () {
      const raw = this.contentEditor?.getPosition()
      if (!raw) {
        return { lineNumber: 1, column: 1 }
      }
      return {
        lineNumber: Math.max(1, Number(raw.lineNumber) || 1),
        column: Math.max(1, Number(raw.column) || 1)
      }
    },
    setCursorPosition: function (position) {
      if (!this.contentEditor) return
      const model = this.contentEditor.getModel()
      if (!model) return

      // Monaco 的 Position 要求 lineNumber >= 1、column >= 1、且不能超过模型行数 / 列数；
      // 父组件在编辑器首次挂载时会传 { lineNumber: 0, column: 0 } 这种「未知」默认值，
      // 不归一化直接 setPosition 会触发 "Illegal value for lineNumber" 抛错。
      const lineCount = model.getLineCount()
      const rawLine = Number(position && position.lineNumber)
      const rawColumn = Number(position && position.column)
      const safeLineNumber = Number.isFinite(rawLine) && rawLine >= 1 && rawLine <= lineCount
        ? Math.floor(rawLine)
        : 1
      const maxColumn = model.getLineMaxColumn(safeLineNumber)
      const safeColumn = Number.isFinite(rawColumn) && rawColumn >= 1 && rawColumn <= maxColumn
        ? Math.floor(rawColumn)
        : 1
      this.contentEditor.setPosition({ lineNumber: safeLineNumber, column: safeColumn })
      this.contentEditor.revealPositionInCenter({ lineNumber: safeLineNumber, column: safeColumn }, 0)
    },
    getWordCount: function (markdown) {
      return this.contentEditor.getWordCount(markdown)
    },
    
    // ✅ 捕获当前编辑器内容（与 Muya 保持一致的接口）
    captureCurrentContent: function () {
      console.log('\n[Monaco.captureCurrentContent] ====== START ======')
      console.log(`[Monaco.captureCurrentContent] Time: ${new Date().toISOString()}`)
      console.log(`[Monaco.captureCurrentContent] contentEditor exists: ${!!this.contentEditor}`)
      
      if (!this.contentEditor) {
        console.warn('[Monaco.captureCurrentContent] ❌ No contentEditor, returning null')
        return null
      }
      
      // ✅ 关键改进：优先使用预捕获的 pendingSaveData
      // 这样可以避免在切换笔记时因 watcher 触发导致获取到旧内容的问题
      if (this.pendingSaveData && this.pendingSaveData.markdown && this.pendingSaveData.docGuid) {
        const age = Date.now() - this.pendingSaveData.timestamp
        console.log(`[Monaco.captureCurrentContent] ✅ Using PENDING data: docGuid=${this.pendingSaveData.docGuid}, len=${this.pendingSaveData.markdown.length}, age=${age}ms, timestamp=${this.pendingSaveData.timestamp}`)
        console.log(`[Monaco.captureCurrentContent] Content preview: "${this.pendingSaveData.markdown.substring(0, 50)}..."`)
        console.log('[Monaco.captureCurrentContent] ====== END (pending) ======\n')
        return this.pendingSaveData
      }
      
      // fallback：如果没有 pendingSaveData，则实时获取
      console.log('[Monaco.captureCurrentContent] ⚠️ No pendingSaveData, falling back to realtime getValue()')
      const markdown = this.contentEditor.getValue()
      const currentNote = this.$store.state.server.currentNote
      
      let docGuid = null
      let title = null
      let resources = []
      
      if (currentNote?.info) {
        docGuid = currentNote.info.docGuid
        title = currentNote.info.title
        resources = currentNote.resources || []
        console.log(`[Monaco.captureCurrentContent] Current note from store: docGuid=${docGuid}, title=${title}`)
      } else {
        console.warn('[Monaco.captureCurrentContent] ⚠️ No currentNote.info in store!')
      }
      
      if (!docGuid || !markdown) {
        console.warn(`[Monaco.captureCurrentContent] ❌ Invalid data: docGuid=${docGuid}, markdown_len=${markdown?.length || 0}`)
        console.log('[Monaco.captureCurrentContent] ====== END (invalid) ======\n')
        return null
      }
      
      const captureData = {
        markdown,
        docGuid,
        title,
        resources,
        timestamp: Date.now(),
        noteState: this.noteState,
        source: 'realtime'
      }
      
      console.log(`[Monaco.captureCurrentContent] ✅ Realtime capture: docGuid=${docGuid}, len=${markdown.length}`)
      console.log(`[Monaco.captureCurrentContent] Content preview: "${markdown.substring(0, 50)}..."`)
      console.log('[Monaco.captureCurrentContent] ====== END (realtime) ======\n')
      
      return captureData
    },
    
    ...mapServerActions(['updateNote', 'updateNoteState'])
  },
  mounted () {
    // Add global keydown listener for Ctrl+S to ensure save works even when Monaco captures the event
    document.addEventListener('keydown', this.handleGlobalKeyDown)
    this.initMonaco()
    bus.$on(events.EDIT_SHORTCUT_CALL.save, this.saveHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.copyAsMarkdown, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.copyAsHtml, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.pasteAsPlainText, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.undo, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.redo, this.editCopyPasteHandler)
    bus.$on(events.INSERT_AI_TEXT, this.insertAiTextHandler)
  },
  beforeDestroy () {
    document.removeEventListener('keydown', this.handleGlobalKeyDown)
    bus.$off(events.EDIT_SHORTCUT_CALL.save)
    bus.$off(events.EDIT_SHORTCUT_CALL.copyAsMarkdown)
    bus.$off(events.EDIT_SHORTCUT_CALL.copyAsHtml)
    bus.$off(events.EDIT_SHORTCUT_CALL.pasteAsPlainText)
    bus.$off(events.EDIT_SHORTCUT_CALL.undo)
    bus.$off(events.EDIT_SHORTCUT_CALL.redo)
    bus.$off(events.INSERT_AI_TEXT)
    if (this._monacoClipboardDisposable && typeof this._monacoClipboardDisposable.dispose === 'function') {
      try { this._monacoClipboardDisposable.dispose() } catch (_) { /* noop */ }
    }
    this._monacoClipboardDisposable = null
    if (this.contentEditor) {
      this.contentEditor.dispose()
    }
  },
  watch: {
    currentNote: function (currentData) {
      console.log('\n[Monaco watcher] ====== START ======')
      console.log(`[Monaco watcher] ⚡ FIRED! Time: ${new Date().toISOString()}`)
      console.log(`[Monaco watcher] Type: ${typeof currentData}`)
      console.log(`[Monaco watcher] ⚠️ WARNING: This will CLEAR pendingSaveData after setting value!`)
      console.log(`[Monaco watcher] Current pendingSaveData before clear: ${this.pendingSaveData ? 'EXISTS (docGuid=' + this.pendingSaveData.docGuid + ', len=' + this.pendingSaveData.markdown?.length + ')' : 'NULL'}`)
      
      // ✅ 兼容新格式：currentNote 可能是字符串或对象
      let markdownContent = ''
      
      if (typeof currentData === 'string') {
        // 旧格式：直接是字符串
        markdownContent = currentData || ''
        console.log(`[Monaco watcher] 📄 String format, len=${markdownContent.length}`)
      } else if (currentData && typeof currentData === 'object') {
        // 新格式：提取 __markdown 字段
        markdownContent = currentData.__markdown || ''
        console.log(`[Monaco watcher] 📦 Object format: markdown len=${markdownContent.length}, timestamp=${currentData.__timestamp}`)
        
        if (currentData.isEmpty) {
          console.log(`[Monaco watcher] ℹ️ Content is empty, will show blank editor`)
        }
      } else {
        // 异常情况
        console.warn('[Monaco watcher] ⚠️ Unexpected data type, clearing editor')
        markdownContent = ''
      }
      
      try {
        // ✅ 使用提取后的内容设置到编辑器
        this.contentEditor.setValue(markdownContent)
        console.log(`[Monaco watcher] ✅ Done! Editor now has content (len=${markdownContent.length})`)
        
        // ✅ 暂时注释掉这行！看看是不是这里导致的问题
        // this.pendingSaveData = null
        console.log('[Monaco watcher] ℹ️ SKIPPED clearing pendingSaveData for debugging!')
        console.log('[Monaco watcher] ====== END ======\n')
      } catch (e) {
        if (e.message.indexOf('Md2V') !== -1) return
        debugLogger.Error(e.message)
        console.error('[Monaco watcher] ❌ Error:', e)
        console.log('[Monaco watcher] ====== END (error) ======\n')
      }
    },
    darkMode: function (darkMode) {
      const currentTheme = darkMode ? 'Memocast-Dark' : 'Memocast-Light'
      monaco.editor.setTheme(currentTheme)
    },
    data: function ({ markdown, cursor }) {
      this.contentEditor.setValue(markdown)
      this.setCursorPosition(cursor)
      this.contentEditor.focus()
    }
  }
}
</script>

<style scoped>
.monaco-root {
  min-height: 0;
  min-width: 0;
}
</style>
