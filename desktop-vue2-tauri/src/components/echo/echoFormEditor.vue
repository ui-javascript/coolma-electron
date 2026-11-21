<template>
  <div class='echo-form-editor-wrap'>
    <!-- 工具栏 -->
    <div class='row items-center justify-between q-mb-xs'>
      <div class='row items-center no-wrap q-gutter-xs'>
        <div class='echo-form-label q-mb-none'>
          Anno 源码
          <span v-if='isReadonly' class='echo-form-readonly-tag'>{{ $t('echoBuiltinReadonlyTag') || '只读' }}</span>
        </div>
        <q-icon name='info' size='14px' class='echo-form-info-icon'>
          <q-tooltip anchor='top middle' self='bottom middle' :offset='[0, 6]'>
            导出默认对象，支持 <code>render(node, props)</code> 和 <code>afterRender(node, props)</code>。可通过 <code>$(node)</code> 拿到 echo host jQuery 对象；<code>props</code> 是编译期算好的实例参数（含 resolved value）。
          </q-tooltip>
        </q-icon>
      </div>
      <q-btn
        flat
        dense
        no-caps
        size='sm'
        color='teal-5'
        icon='refresh'
        :label="$t('echoBuiltinResetSource')"
        @click='resetTemplate'
      />
    </div>

    <!-- Monaco 编辑器 -->
    <div
      ref='editorContainer'
      class='echo-monaco-editor'
      :class="{ 'echo-monaco-editor--readonly': isReadonly }"
      :style='monacoEditorStyle'
    />
  </div>
</template>

<script>
import * as monaco from 'monaco-editor'
import { setupMonacoClipboard } from 'src/utils/monacoClipboardBridge'
import { createDefaultEchoAnnoSource, BUILTIN_ECHO_CARDS } from 'src/components/echo/echoCore'

export default {
  name: 'echoFormEditor',
  props: {
    source: {
      type: String,
      default: ''
    },
    echoName: {
      type: String,
      default: ''
    },
    isReadonly: {
      type: Boolean,
      default: false
    },
    isBuiltin: {
      type: Boolean,
      default: false
    },
    visible: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      monacoInitTimer: null,
      monacoReady: false,
      _monacoRo: null,
      _dialogRo: null,
      _dialogHeightPollTimer: null,
      _windowResizeHandler: null,
      _monacoClipboardDisposable: null,
      monacoEditor: null,
      monacoEditorHeight: 250
    }
  },
  computed: {
    monacoEditorStyle () {
      return { height: `${this.monacoEditorHeight}px` }
    }
  },
  watch: {
    visible (val) {
      if (val) {
        this.scheduleMonacoInit()
        this._scheduleDialogHeightInstall()
      } else {
        this.clearMonacoInitTimer()
        this.uninstallDialogHeightListener()
        if (this._dialogHeightPollTimer) {
          clearTimeout(this._dialogHeightPollTimer)
          this._dialogHeightPollTimer = null
        }
      }
    },
    source (val) {
      if (this.monacoEditor && this.monacoReady && val !== this.monacoEditor.getValue()) {
        this.monacoEditor.setValue(val)
      }
    }
  },
  mounted () {
    this.scheduleMonacoInit()
  },
  beforeDestroy () {
    this.clearMonacoInitTimer()
    this.uninstallDialogHeightListener()
    if (this._monacoRo) {
      this._monacoRo.disconnect()
      this._monacoRo = null
    }
    if (this._dialogHeightPollTimer) {
      clearTimeout(this._dialogHeightPollTimer)
      this._dialogHeightPollTimer = null
    }
    this.disposeMonaco()
  },
  methods: {
    resetTemplate () {
      // builtin echo：用代码版默认镜像（BUILTIN_ECHO_CARDS）还原 anno_source
      // 非 builtin echo：用 createDefaultEchoAnnoSource 工厂还原
      let nextSource
      if (this.isBuiltin && this.echoName) {
        const builtin = BUILTIN_ECHO_CARDS.find(e => e.name === this.echoName)
        nextSource = builtin ? builtin.anno_source : createDefaultEchoAnnoSource(this.echoName || '回响')
      } else {
        nextSource = createDefaultEchoAnnoSource(this.echoName || '回响')
      }
      this.$emit('update-source', nextSource)
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextSource)
      }
    },

    // ==================== Monaco 编辑器 ====================
    installDialogHeightListener () {
      this.uninstallDialogHeightListener()
      const dialogEl = this._resolveDialogElement()
      if (!dialogEl) return
      this.recomputeMonacoHeight()
      this._dialogRo = new ResizeObserver(() => {
        this.recomputeMonacoHeight()
      })
      this._dialogRo.observe(dialogEl)
      this._windowResizeHandler = () => {
        this.recomputeMonacoHeight()
      }
      window.addEventListener('resize', this._windowResizeHandler)
    },

    uninstallDialogHeightListener () {
      if (this._dialogRo) {
        this._dialogRo.disconnect()
        this._dialogRo = null
      }
      if (this._windowResizeHandler) {
        window.removeEventListener('resize', this._windowResizeHandler)
        this._windowResizeHandler = null
      }
    },

    _resolveDialogElement () {
      const ref = this.$parent && this.$parent.$refs && this.$parent.$refs.dialog
      if (!ref) return null
      const candidate = ref.$el || (ref.$refs && ref.$refs.content) || ref
      if (candidate && candidate.nodeType === 1) return candidate
      let node = candidate
      while (node && node.nodeType !== 1) node = node.parentNode
      return node || null
    },

    _scheduleDialogHeightInstall () {
      if (this._dialogHeightPollTimer) {
        clearTimeout(this._dialogHeightPollTimer)
        this._dialogHeightPollTimer = null
      }
      let attempt = 0
      const maxAttempts = 20
      const tryInstall = () => {
        attempt += 1
        if (!this.visible) return
        const el = this._resolveDialogElement()
        if (el && el.clientHeight > 0) {
          this.installDialogHeightListener()
          return
        }
        if (attempt >= maxAttempts) {
          this.installDialogHeightListener()
          return
        }
        this._dialogHeightPollTimer = setTimeout(tryInstall, 50)
      }
      this._dialogHeightPollTimer = setTimeout(tryInstall, 0)
    },

    recomputeMonacoHeight () {
      const dialogEl = this._resolveDialogElement()
      if (!dialogEl || !dialogEl.clientHeight) return
      const next = Math.max(120, dialogEl.clientHeight - 300)
      if (next !== this.monacoEditorHeight) {
        this.monacoEditorHeight = next
      }
    },

    clearMonacoInitTimer () {
      if (this.monacoInitTimer) {
        clearTimeout(this.monacoInitTimer)
        this.monacoInitTimer = null
      }
    },

    scheduleMonacoInit () {
      this.clearMonacoInitTimer()
      this.monacoInitTimer = setTimeout(() => {
        this.monacoInitTimer = null
        this._initMonacoViaObserver()
      }, 120)
    },

    _initMonacoViaObserver () {
      if (!this.visible) return
      const container = this.$refs.editorContainer
      if (!container) return
      this._monacoRo && this._monacoRo.disconnect()
      this._monacoRo = new ResizeObserver(() => {
        this.$nextTick(() => {
          const c = this.$refs.editorContainer
          if (c && c.clientWidth > 40 && c.clientHeight > 120) {
            this._monacoRo.disconnect()
            this._monacoRo = null
            this._createMonacoEditor(this.source || createDefaultEchoAnnoSource(this.echoName))
          }
        })
      })
      this._monacoRo.observe(container)
      if (this._monacoRo.checkingTimeout) {
        clearTimeout(this._monacoRo.checkingTimeout)
      }
      this._monacoRo.checkingTimeout = setTimeout(() => {
        if (this._monacoRo) {
          this._monacoRo.disconnect()
          this._monacoRo = null
          this.$nextTick(() => this._createMonacoEditor(this.source || createDefaultEchoAnnoSource(this.echoName)))
        }
      }, 1200)
    },

    _createMonacoEditor (source) {
      if (!this.$refs.editorContainer) return
      this.disposeMonaco()

      const isDark = document.body.classList.contains('body--dark')
      const editorBg = isDark ? '#34383e' : '#ffffff'

      monaco.editor.defineTheme('Memocast-Dark', {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': editorBg,
          'editorCursor.foreground': '#26A69A'
        }
      })

      this.monacoEditor = monaco.editor.create(this.$refs.editorContainer, {
        value: source,
        language: 'javascript',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineHeight: 20,
        tabSize: 2,
        wordWrap: 'on',
        readOnly: this.isReadonly,
        theme: 'Memocast-Dark'
      })

      this._monacoClipboardDisposable = setupMonacoClipboard(this.monacoEditor, monaco)
      this.monacoReady = true

      this.monacoEditor.onDidChangeModelContent(() => {
        if (this.isReadonly) return
        this.$emit('update-source', this.monacoEditor.getValue())
      })
    },

    disposeMonaco () {
      this.monacoReady = false
      if (this._monacoClipboardDisposable && typeof this._monacoClipboardDisposable.dispose === 'function') {
        try { this._monacoClipboardDisposable.dispose() } catch (_) { /* noop */ }
      }
      this._monacoClipboardDisposable = null
      if (this.monacoEditor) {
        this.monacoEditor.dispose()
        this.monacoEditor = null
      }
    },

    // ==================== 公开方法 ====================
    isMonacoReady () {
      return this.monacoReady
    },

    getSource () {
      if (this.monacoEditor) {
        return this.monacoEditor.getValue()
      }
      return this.source
    },

    setSource (code) {
      if (!code) return
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(code)
      }
      this.$emit('update-source', code)
    }
  }
}
</script>

<style lang="scss" scoped>
.echo-form-editor-wrap {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.echo-form-editor-wrap > .row.items-center.justify-between {
  flex: 0 0 auto;
}

.echo-form-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  font-weight: 500;
}

.echo-form-info-icon {
  color: rgba(0, 0, 0, 0.45);
  cursor: help;
}

.body--dark .echo-form-info-icon {
  color: rgba(255, 255, 255, 0.55);
}

.echo-monaco-editor {
  flex: 0 0 auto;
  width: 100%;
  min-height: 120px;
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.echo-monaco-editor--readonly {
  border-color: rgba(38, 166, 154, 0.4);
  box-shadow: inset 0 0 0 1px rgba(38, 166, 154, 0.1);
}

.echo-form-readonly-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
  color: #fff;
  background: rgba(38, 166, 154, 0.85);
  vertical-align: middle;
}

.body--dark .echo-monaco-editor {
  border-color: #434343;
}

/* Dark mode */
.body--dark .echo-form-label {
  color: rgba(255, 255, 255, 0.55);
}
</style>
