<template>
  <q-dialog
    ref='dialog'
    transition-show='fade'
    transition-hide='fade'
    class='ppt-preview-dialog'
    maximized
    @hide='handleHide'
    @show='handleShow'
    @keydown.esc='hide'
  >
    <q-card class='ppt-preview-card'>
      <q-toolbar class='ppt-preview-toolbar'>
        <div class='row items-center no-wrap q-gutter-sm'>
          <q-icon name='slideshow' class='text-primary' style='font-size: 1.8em' />
          <q-toolbar-title>
            <span class='text-weight-bold non-selectable'>{{ $t('pptPreview') }}</span>
          </q-toolbar-title>
        </div>

        <q-space />

        <div class='row items-center q-gutter-sm'>
          <q-btn-toggle
            v-model='splitMode'
            dense
            no-caps
            unelevated
            toggle-color='primary'
            color='grey-8'
            text-color='white'
            :options='splitModeOptions'
          />
          <q-btn flat dense icon='download' :label='$t("pptExport")' @click='chooseExportMode' />
          <q-btn flat round dense icon='close' @click='hide' />
        </div>
      </q-toolbar>
      <div ref='container' class='ppt-preview-container reveal'>
        <div class='slides' v-html='slidesHtml'></div>
      </div>
    </q-card>
  </q-dialog>
</template>

<script>
import Reveal from 'reveal.js/js/reveal'
import Markdown from 'reveal.js/plugin/markdown/markdown'
import Highlight from 'reveal.js/plugin/highlight/highlight'
import Notes from 'reveal.js/plugin/notes/notes'
import 'reveal.js/dist/reveal.css'
import 'reveal.js/dist/theme/white.css'
import 'reveal.js/plugin/highlight/monokai.css'
import { escapeHtml } from 'libs-muya/lib'

const SLIDE_SEPARATOR_RE = /^---\s*$/m
const VERTICAL_SEPARATOR_RE = /^--\s*$/m
const HEADING_RE = /^(#{1,2})\s+(.+)$/

export default {
  name: 'previewPptDialog',
  data () {
    return {
      markdown: '',
      revealInstance: null,
      slidesHtml: '',
      splitMode: 'manual',
      revealInitToken: 0
    }
  },
  computed: {
    splitModeOptions () {
      return [
        { label: this.$t('pptSplitManual'), value: 'manual' },
        { label: this.$t('pptSplitAuto'), value: 'auto' }
      ]
    }
  },
  methods: {
    show (markdown = '') {
      this.markdown = String(markdown || '')
      this.refreshSlides()
      this.$refs.dialog.show()
    },
    hide () {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
      this.$refs.dialog.hide()
    },
    handleShow () {
      this.$nextTick(() => {
        this.initReveal()
      })
    },
    handleHide () {
      this.destroyReveal()
    },
    refreshSlides () {
      this.slidesHtml = this.buildSlidesHtml(this.markdown)
      if (this.$refs.dialog && this.$refs.dialog.showing) {
        this.$nextTick(() => {
          this.initReveal()
        })
      }
    },
    buildSlidesHtml (markdown = '') {
      const normalized = String(markdown || '').replace(/\r\n/g, '\n').trim()
      if (!normalized) {
        return `
          <section data-markdown>
            <textarea data-template>
# ${this.$t('pptEmptyTitle')}

${this.$t('pptEmptyHint')}
            </textarea>
          </section>
        `
      }

      if (this.splitMode === 'auto') {
        return this.buildAutoSlidesHtml(normalized)
      }

      const sections = normalized.split(SLIDE_SEPARATOR_RE)
      return sections.map(section => {
        const trimmedSection = section.trim()
        if (!trimmedSection) return ''

        const verticalSlides = trimmedSection.split(VERTICAL_SEPARATOR_RE)
        if (verticalSlides.length === 1) {
          return this.renderMarkdownSection(verticalSlides[0])
        }

        return `<section>${verticalSlides.map(slide => this.renderMarkdownSection(slide)).join('')}</section>`
      }).join('')
    },
    buildAutoSlidesHtml (markdown = '') {
      const lines = markdown.split('\n')
      const sections = []
      let currentSection = []

      lines.forEach(line => {
        if (HEADING_RE.test(line) && currentSection.length) {
          sections.push(currentSection.join('\n').trim())
          currentSection = [line]
          return
        }
        currentSection.push(line)
      })

      if (currentSection.length) {
        sections.push(currentSection.join('\n').trim())
      }

      const normalizedSections = sections.filter(Boolean)
      if (!normalizedSections.length) {
        return this.renderMarkdownSection(markdown)
      }

      return normalizedSections.map(section => this.renderMarkdownSection(section)).join('')
    },
    renderMarkdownSection (content = '') {
      return `
        <section data-markdown>
          <textarea data-template>${escapeHtml(content.trim() || ' ')}</textarea>
        </section>
      `
    },
    async initReveal () {
      this.destroyReveal()

      if (!this.$refs.container) return

      const token = ++this.revealInitToken
      const deck = new Reveal(this.$refs.container, {
        embedded: true,
        hash: false,
        controls: true,
        progress: true,
        center: true,
        transition: 'slide',
        plugins: [Markdown, Highlight, Notes],
        markdown: {
          smartypants: true
        },
        pdfSeparateFragments: false
      })

      this.revealInstance = deck

      try {
        await deck.initialize()

        if (token !== this.revealInitToken || this.revealInstance !== deck) {
          if (typeof deck.destroy === 'function') {
            deck.destroy()
          }
          return
        }

        deck.layout()
      } catch (error) {
        if (this.revealInstance === deck) {
          this.revealInstance = null
        }
        if (typeof deck.destroy === 'function') {
          deck.destroy()
        }
        console.error('[previewPptDialog] Failed to initialize reveal.js', error)
      }
    },
    destroyReveal () {
      this.revealInitToken += 1
      if (this.revealInstance) {
        if (typeof this.revealInstance.destroy === 'function') {
          this.revealInstance.destroy()
        }
        this.revealInstance = null
      }
    },
    buildPrintDocument ({ mode = 'native' } = {}) {
      const isPdfMode = mode === 'pdf'
      const title = this.$t('pptPreview')
      const pdfStyle = isPdfMode
        ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/print-pdf/print-pdf.css" media="print">'
        : ''
      const initConfig = isPdfMode
        ? {
            plugins: ['RevealMarkdown', 'RevealHighlight', 'RevealNotes'],
            pdfSeparateFragments: false,
            showNotes: false,
            margin: 0.04
          }
        : {
            plugins: ['RevealMarkdown', 'RevealHighlight', 'RevealNotes'],
            pdfSeparateFragments: false
          }
      const initConfigJson = JSON.stringify(initConfig)
      const afterInit = isPdfMode ? '' : 'window.print();'
      const htmlParts = [
        '<!doctype html>',
        '<html>',
        '<head>',
        '  <meta charset="utf-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        `  <title>${title}</title>`,
        '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.css">',
        '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/theme/white.css">',
        '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/highlight/monokai.css">',
        `  ${pdfStyle}`,
        '  <style>',
        '    body { margin: 0; background: #111827; }',
        '    .reveal { height: 100vh; }',
        '  </style>',
        '</head>',
        '<body>',
        '  <div class="reveal">',
        '    <div class="slides">',
        this.slidesHtml,
        '    </div>',
        '  </div>',
        '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.js"><\/script>',
        '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/markdown/markdown.js"><\/script>',
        '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/highlight/highlight.js"><\/script>',
        '  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/plugin/notes/notes.js"><\/script>',
        '  <script>',
        `    const rawConfig = ${initConfigJson};`,
        '    const pluginMap = {',
        '      RevealMarkdown,',
        '      RevealHighlight,',
        '      RevealNotes',
        '    };',
        '    const deckConfig = Object.assign({}, rawConfig, {',
        '      plugins: (rawConfig.plugins || []).map(name => pluginMap[name]).filter(Boolean)',
        '    });',
        '    const deck = new Reveal(deckConfig);',
        '    deck.initialize().then(() => {',
        `      ${afterInit}`,
        '    });',
        '  <\/script>',
        '</body>',
        '</html>'
      ]

      return htmlParts.join('\n')
    },
    openExportWindow (mode = 'native') {
      const exportWindow = window.open('', '_blank', 'width=1400,height=900')
      if (!exportWindow) return
      exportWindow.document.open()
      exportWindow.document.write(this.buildPrintDocument({ mode }))
      exportWindow.document.close()
    },
    exportByNativePrint () {
      this.openExportWindow('native')
    },
    exportByRevealPdf () {
      this.openExportWindow('pdf')
    },
    chooseExportMode () {
      this.$q.dialog({
        title: this.$t('pptExport'),
        message: this.$t('pptExportChooseHint'),
        options: {
          type: 'radio',
          model: 'native',
          items: [
            {
              label: this.$t('pptExportNativeOption'),
              value: 'native'
            },
            {
              label: this.$t('pptExportRevealOption'),
              value: 'pdf'
            }
          ]
        },
        cancel: true,
        persistent: true,
        ok: {
          label: this.$t('confirm')
        }
      }).onOk(mode => {
        if (mode === 'pdf') {
          this.exportByRevealPdf()
          return
        }
        this.exportByNativePrint()
      })
    }
  },
  watch: {
    splitMode () {
      this.refreshSlides()
    }
  },
  beforeDestroy () {
    this.destroyReveal()
  }
}
</script>

<style scoped>
.ppt-preview-card {
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  background: #0f172a;
}

.ppt-preview-toolbar {
  background: rgba(15, 23, 42, 0.92);
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 12px;
  gap: 12px;
}

.ppt-preview-container {
  flex: 1;
  min-height: 0;
  background: radial-gradient(circle at top, #1e293b 0%, #020617 70%);
}

.ppt-preview-container :deep(.reveal) {
  width: 100%;
  height: 100%;
  color: #e2e8f0;
}

.ppt-preview-container :deep(.slides) {
  text-align: left;
}

.ppt-preview-container :deep(.slides section) {
  font-size: 0.9em;
}

.ppt-preview-container :deep(.slides h1),
.ppt-preview-container :deep(.slides h2),
.ppt-preview-container :deep(.slides h3) {
  color: #f8fafc;
  text-transform: none;
}

.ppt-preview-container :deep(.slides p),
.ppt-preview-container :deep(.slides li),
.ppt-preview-container :deep(.slides blockquote) {
  color: #cbd5e1;
}

.ppt-preview-container :deep(.slides code) {
  color: #f8fafc;
}

.ppt-preview-container :deep(.controls),
.ppt-preview-container :deep(.progress) {
  color: var(--themeColor);
}
</style>
