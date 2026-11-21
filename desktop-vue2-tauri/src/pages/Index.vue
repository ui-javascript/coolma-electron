<template>
  <q-page class='flex'>
    <q-splitter
      v-model='splitterWidthValue'
      :limits='splitterLimits'
      class='full-width'
      unit='px'
      separator-class='custom-splitter'
      before-class='overflow-hidden'
      after-class='hide-scrollbar editor-splitter-after'
      :min="300"
    >
      <template v-slot:before>
        <div class='left-panel-wrapper'>
          <q-splitter
            v-model='leftInnerSplitterValue'
            :limits='leftInnerSplitterLimits'
            class='full-width full-height index-left-inner-splitter'
            unit='px'
            horizontal
            separator-class='custom-splitter'
            before-class='overflow-hidden'
            after-class='overflow-hidden'
            :disable="!categoryTreeVisible"
          >
            <template v-slot:before>
              <CategoryTreePanel v-if="sidebarTreeType !== 'calendar'" class='full-height' />
              <CalendarPanel v-else class='full-height' />
            </template>
            <template v-slot:after>
              <transition
                appear
                enter-active-class='animated fadeIn'
                leave-active-class='animated fadeOut'
              >
                <NoteList v-show='noteListVisible' class='full-height' />
              </transition>
            </template>
          </q-splitter>
        </div>
      </template>
      <template v-slot:after>
        <div class='full-height editor-wrapper'>
          <div class='editor-stage'>
            <div v-show='!isSourceMode && dataLoaded'>
              <Muya ref='muya' :active='!isSourceMode && dataLoaded' :data='tempNoteData' />
            </div>
            <Monaco ref='monaco' v-if='dataLoaded' :active='isSourceMode' :data='tempNoteData' v-show='isSourceMode' />
            <transition-group
              appear
              enter-active-class='animated fadeIn'
              leave-active-class='animated fadeOut'
            >
              <Illustration :mode='illustrationMode' key='illustration' />
            </transition-group>
            <!-- Action Bar 底部居中（相对 .editor-stage），水平排列，仿 iOS 毛玻璃药丸 -->
            <div class='editor-action-bar-wrapper'>
              <transition name='action-bar-ios'>
                <div
                  v-show='actionBarVisible'
                  class='editor-action-bar'
                  :class="{ 'action-bar--scroll': isActionBarScrolling }"
                  @mousemove='onActionBarMouseMove'
                  @mouseleave='onActionBarMouseLeaveDock'
                >
                  <div class='editor-action-bar-inner'>
                    <q-btn
                      v-if='showEditorNoteFab'
                      :icon='editorNoteActionsExpanded ? "close" : "post_add"'
                      dense flat round
                      class='fab-icon cursor-pointer material-icons-round editor-note-trigger'
                      @click='toggleEditorNoteActions'
                      size='md' color='#26A69A' v-ripple
                    >
                      <q-tooltip v-if='!editorNoteActionsExpanded' anchor='top middle' self='bottom middle' :offset='[0, 10]'>{{ $t('createNote') }} / {{ $t('import') }}</q-tooltip>
                      <q-tooltip v-else anchor='top middle' self='bottom middle' :offset='[0, 10]'>{{ $t('cancel') }}</q-tooltip>
                    </q-btn>
                    <transition name='sub-actions-ios'>
                      <div v-if='showEditorNoteFab && editorNoteActionsExpanded' class='editor-note-sub-actions'>
                        <q-btn v-if='noteFabIsRootCategory' icon='create_new_folder' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='addCategoryFromEditorBar' size='md' color='#26A69A' v-ripple :title='$t("createCategory")' />
                        <template v-else>
                          <q-btn icon='note_add' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='addNoteFromEditorBar' size='md' color='#26A69A' v-ripple :title='$t("createNote")' />
                          <q-btn icon='add' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='openImportFromEditorBar' size='md' color='#26A69A' v-ripple :title='$t("import")' />
                        </template>
                      </div>
                    </transition>
                    <q-btn :icon='isSourceMode ? "assignment" : "code"' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='isSourceMode = !isSourceMode' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple :title="!isSourceMode ? $t('sourceMode') : $t('previewMode')" />
                    <q-btn :icon='enablePreviewEditor ? "lock_open" : "lock"' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='lockModeHandler' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple :title="enablePreviewEditor ? $t('lock') : $t('unlock')" />
                    <q-btn icon='dashboard' dense flat round class='fab-icon cursor-pointer material-icons-round' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow && !isSourceMode' v-ripple>
                      <q-tooltip transition-show='fade' transition-hide='fade' anchor='top middle' self='bottom middle'>
                        <div class='text-body2'>
                          <p>{{ `${$t('word:', wordCount)}` }}</p>
                          <p>{{ `${$t('character:', wordCount)}` }}</p>
                          <p>{{ `${$t('paragraph:', wordCount)}` }}</p>
                        </div>
                      </q-tooltip>
                    </q-btn>
                    <q-btn icon='format_align_center' dense flat round class='fab-icon cursor-pointer material-icons-round' @click.stop='$refs.outlineDrawer.show' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && contentsListLoaded && !isOutlineShow && !isSourceMode' v-ripple />
                    <q-btn :icon='saveButtonIcon' class='fab-icon cursor-pointer material-icons-round' dense flat round @click='refreshCurrentNote' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple />
                    <q-btn icon='slideshow' class='fab-icon cursor-pointer material-icons-round' dense flat round size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple :title='$t("pptPreview")' @click='openPptPreview' />
                    <q-btn icon='link' class='fab-icon cursor-pointer material-icons-round' dense flat round size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow && canCopyNoteLink' v-ripple :title='$t("copyNoteLink")' @click='copyNoteLink' />
                  </div>
                </div>
              </transition>
            </div>
          </div>
          <ImportDialog ref='importDialog' />
          <BlogDeployDialog ref='blogDeployDialog' @deploy='onBlogDeploy' @cancel='onBlogDeployCancel' />
          <BlogDeployProgressDialog ref='blogDeployProgressDialog' @rebuild='onBlogDeployRebuild' />
        </div>
        <NoteOutlineDrawer ref='outlineDrawer' :change='outlineDrawerChangeHandler' />
        <Loading :visible='isCurrentNoteLoading' />
        <MarkMapDialog ref="markMapDialog" />
        <previewPptDialog ref='pptPreviewDialog' />
      </template>
    </q-splitter>
  </q-page>
</template>

<script>
import NoteList from '../components/note/NoteList.vue'
import CategoryTreePanel from '../components/category/CategoryTreePanel.vue'
import CalendarPanel from '../components/calendar/CalendarPanel.vue'
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import helper from 'src/utils/helper'
import { createNamespacedHelpers } from 'vuex'
import NoteOutlineDrawer from 'components/note/NoteOutlineDrawer.vue'
import { initLoadingPageMixins } from '../mixins'
import Loading from 'components/common/Loading.vue'
import Monaco from 'components/monaco/Monaco.vue'
import Muya from 'components/muya/Muya.vue'
import MarkMapDialog from '../components/markmap/MarkMapDialog.vue'
import previewPptDialog from '../components/preview/previewPptDialog.vue'
import Illustration from 'components/common/Illustration.vue'
import ImportDialog from 'components/import/ImportDialog.vue'
import BlogDeployDialog from 'components/blog/BlogDeployDialog.vue'
import BlogDeployProgressDialog from 'components/blog/BlogDeployProgressDialog.vue'
import * as serverActions from 'src/store/server/actions'

const {
  mapGetters: mapServerGetters,
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')
const { mapState: mapClientState, mapActions: mapClientActions } = createNamespacedHelpers('client')
// import Sidebar from '../components/layout'
export default {
  name: 'PageIndex',
  mixins: [initLoadingPageMixins],
  components: {
    MarkMapDialog,
    previewPptDialog,
    Muya,
    Monaco,
    Loading,
    NoteOutlineDrawer,
    NoteList,
    CategoryTreePanel,
    CalendarPanel,
    Illustration,
    ImportDialog,
    BlogDeployDialog,
    BlogDeployProgressDialog
  },
  computed: {
    thumbStyle () {
      return {
        backgroundColor: '#E8ECF1',
        width: '5px',
        opacity: 0.75
      }
    },

    barStyle () {
      return {
        width: '5px'
      }
    },
    dataLoaded: function () {
      return !helper.isNullOrEmpty(this.currentNote) && this.currentNoteInfo?.type !== 'collaboration'
    },
    illustrationMode: function () {
      if (this.isCurrentNoteLoading) return 'loading-background'
      if (this.currentNoteInfo?.type === 'collaboration') return 'collaboration'
      if (this.dataLoaded) return 'none'
      return 'memocast'
    },
    contentsListLoaded: function () {
      return this.contentsList && !!this.contentsList.length
    },
    noteFabIsRootCategory: function () {
      return helper.isNullOrEmpty(this.currentCategory)
    },
    noteFabIsTagCategory: function () {
      return this.tags?.map(t => t.tagGuid).includes(this.currentCategory)
    },
    showEditorNoteFab: function () {
      return (this.isLogin || !this.isLogin) && !this.noteFabIsTagCategory
    },
    canCopyNoteLink: function () {
      return !!this.currentNoteInfo?.docGuid && !!this.currentNoteInfo?.kbGuid
    },
    ...mapServerGetters(['currentNote', 'currentNoteInfo']),
    ...mapServerState([
      'contentsList',
      'isCurrentNoteLoading',
      'noteState',
      'isLogin',
      'currentCategory',
      'tags'
    ]),
    ...mapClientState([
      'noteListVisible',
      'categoryTreeVisible',
      'enablePreviewEditor',
      'splitterWidth',
      'leftInnerSplitterRatio',
      'rightClickCategoryItem',
      'sidebarTreeType',
      'noteTemplates'
    ])
  },
  data () {
    return {
      isOutlineShow: false,
      isSourceMode: false,
      isMindmapMode: false,
      splitterWidthValue: 580,
      splitterLimits: [300, Infinity],
      leftInnerSplitterValue: 240,
      leftInnerSplitterLimits: [120, Infinity],
      leftInnerSplitterSaveTimer: null,
      splitterWidthSaveTimer: null,
      tempNoteData: {},
      wordCount: {
        word: '0',
        paragraph: '0',
        character: '0'
      },
      saveButtonIcon: 'save',
      editorNoteActionsExpanded: false,
      // iOS 风格底部工具栏：滚动时收缩，恢复时弹回
      actionBarVisible: true,
      isActionBarScrolling: false,
      _actionBarScrollTimer: null
    }
  },
  methods: {
    refreshCurrentNote: function () {
      bus.$emit(events.NOTE_SHORTCUT_CALL.save)
    },
    outlineDrawerChangeHandler: function (state) {
      this.isOutlineShow = state
    },
    sourceModeHandler: function () {
      this.isSourceMode = !this.isSourceMode
    },
    getTempValue: function () {
      let markdown
      if (this.isSourceMode) {
        markdown = this.$refs.monaco?.getValue()
      } else {
        markdown = this.$refs.muya?.getValue()
      }
      return markdown
    },
    generateMindmapHandler: function () {
      const markdown = this.getTempValue()
      this.$refs.markMapDialog.toggle(markdown)
    },
    openPptPreview: function () {
      const markdown = this.getTempValue()
      this.$refs.pptPreviewDialog.show(markdown)
    },
    copyNoteLink: function () {
      const { docGuid, kbGuid } = this.currentNoteInfo || {}
      if (!docGuid || !kbGuid) return
      const baseUrl = (this.$store.state.server.kbServer || this.$store.getters.noteViewUrl || '').replace(/\/ks\/note\/view\/.*/, '')
      if (!baseUrl) return
      const noteViewUrl = `${baseUrl}/ks/note/view/${kbGuid}/${docGuid}/`
      const clipboard = window.__electronClipboard
      if (clipboard?.writeText) {
        clipboard.writeText(noteViewUrl)
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(noteViewUrl)
      }
      this.$q.notify({
        color: 'primary',
        icon: 'link',
        message: this.$t('noteLinkCopied')
      })
    },
    wordCountUpdateHandler: function (wordCount) {
      this.wordCount = Object.assign({
        word: '',
        paragraph: '',
        character: ''
      }, wordCount)
    },
    editorScrollHandler: function (e) {
      bus.$emit(events.EDITOR_SCROLL, e)
    },
    lockModeHandler: function () {
      this.toggleChanged({
        key: 'enablePreviewEditor',
        value: !this.enablePreviewEditor
      })
      this.$q.notify({
        color: 'primary',
        icon: 'info',
        message: this.enablePreviewEditor ? this.$t('lockModeOff') : this.$t('lockModeOn')
      })
    },
    persistLeftInnerSplitter () {
      if (!this.categoryTreeVisible) return
      this.updateStateAndStore({ leftInnerSplitterRatio: this.leftInnerSplitterValue })
    },
    persistSplitterWidth () {
      this.updateStateAndStore({ splitterWidth: this.splitterWidthValue })
    },
    addNoteHandler: function () {
      const now = new Date()
      const yyyy = now.getFullYear()
      const category = this.currentCategory || ''
      const categoryName = category.split('/').filter(Boolean).pop() || ''
      const defaultTitle = this.$t('defaultNoteTitle', {
        category: categoryName,
        date: `${yyyy}${String(now.getMonth() + 1).padStart(2, '0')}`
      })

      // 模板下拉选项：空（默认）置首位，其余按 sort_order 升序
      const templateOptions = this.buildTemplateOptions()
      const templateFieldClass = 'memocast-template-select-field'
      const noteTitleInputClass = 'memocast-note-title-input'
      const container = document.createElement('div')
      container.className = 'normal-create-note-dialog'
      container.innerHTML = `
        <div class="q-mb-md">
          <div class="text-caption text-grey-7 q-mb-xs">${this.$t('noteTemplate')}</div>
          <select class="q-field__native q-placeholder ${templateFieldClass}">
            ${templateOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="text-caption text-grey-7 q-mb-xs">${this.$t('title')}</div>
          <input class="q-input-target q-field__native ${noteTitleInputClass}" type="text" spellcheck="false" value="${defaultTitle.replace(/"/g, '&quot;')}">
        </div>
      `
      const dialog = this.$q.dialog({
        title: this.$t('createNote'),
        message: '<div class="normal-create-note-dialog-mount"></div>',
        html: true,
        ok: this.$t('confirm'),
        cancel: this.$t('cancel'),
        focus: 'ok'
      })
      dialog.onOk(() => {
        const titleEl = container.querySelector(`.${noteTitleInputClass}`)
        const tplEl = container.querySelector(`.${templateFieldClass}`)
        const title = titleEl ? titleEl.value : defaultTitle
        const templateId = tplEl ? tplEl.value : ''
        this.createNote({ title, templateId })
      })
      dialog.onDismiss(() => {
        if (container.parentNode) container.parentNode.removeChild(container)
      })
      this.$nextTick(() => {
        const mountPoint = document.querySelector('.normal-create-note-dialog-mount')
        if (!mountPoint) return
        mountPoint.appendChild(container)
        const titleEl = container.querySelector(`.${noteTitleInputClass}`)
        if (titleEl) {
          titleEl.focus()
          titleEl.select()
        }
      })
    },
    buildTemplateOptions () {
      const list = Array.isArray(this.noteTemplates) ? this.noteTemplates : []
      const emptyOption = { value: '', label: this.$t('noteTemplateEmptyOption') }
      const custom = list
        .filter(t => t && t.id && String(t.name || '').trim())
        .sort((a, b) => {
          const sa = Number(a.sort_order) || 0
          const sb = Number(b.sort_order) || 0
          if (sa !== sb) return sa - sb
          return (Number(a.created_at) || 0) - (Number(b.created_at) || 0)
        })
        .map(t => ({ value: String(t.id), label: String(t.name) }))
      return [emptyOption, ...custom]
    },
    addCategoryHandler: function () {
      this.$q
        .dialog({
          title: this.$t('createCategory'),
          prompt: {
            model: this.$t('categoryName'),
            type: 'text',
            attrs: {
              spellcheck: false
            }
          },
          ok: this.$t('confirm'),
          cancel: this.$t('cancel')
        })
        .onOk(data => {
          this.createCategory({
            childCategoryName: data,
            parentCategory: helper.isNullOrEmpty(this.currentCategory) ? '' : this.rightClickCategoryItem
          })
        })
    },
    toggleEditorNoteActions: function () {
      this.editorNoteActionsExpanded = !this.editorNoteActionsExpanded
    },
    addCategoryFromEditorBar: function () {
      this.addCategoryHandler()
      this.editorNoteActionsExpanded = false
    },
    addNoteFromEditorBar: function () {
      this.addNoteHandler()
      this.editorNoteActionsExpanded = false
    },
    openImportFromEditorBar: function () {
      this.$refs.importDialog.toggle()
      this.editorNoteActionsExpanded = false
    },
    openImportHandler: function () {
      this.$refs.importDialog.toggle()
    },
    // Action bar 贴边隐藏相关方法
    // iOS 风格：滚动时工具栏收缩 + 透明度降低，停下后恢复
    onEditorStageScroll: function () {
      this.isActionBarScrolling = true
      if (this._actionBarScrollTimer) {
        clearTimeout(this._actionBarScrollTimer)
      }
      this._actionBarScrollTimer = setTimeout(() => {
        this.isActionBarScrolling = false
        this._actionBarScrollTimer = null
      }, 220)
    },
    // 仿 magicui dock：每个 icon 独立按"距离鼠标 X"做连续插值
    // useTransform([-distance, 0, distance], [size, magnification, size]) + useSpring 平滑
    // Vue2 等价物：每帧算出 scale 写入行内 style，CSS transition 做 spring 平滑
    onActionBarMouseMove: function (e) {
      // rAF 节流：1 帧最多 1 次，避免高频 getBoundingClientRect + 多次 style 写
      if (this._actionBarDockRaf) return
      this._actionBarDockRaf = window.requestAnimationFrame(() => {
        this._actionBarDockRaf = null
        const inner = document.querySelector('.editor-action-bar-inner')
        if (!inner) return
        const buttons = inner.querySelectorAll('.fab-icon')
        if (!buttons.length) return
        const mouseX = e.clientX
        const ICON_DISTANCE = 100   // 与 mouseX 距离 <100px 时开始缩放
        const BASE_SCALE = 0.85
        const PEAK_SCALE = 1.45
        const scaleRange = PEAK_SCALE - BASE_SCALE
        buttons.forEach((btn) => {
          const rect = btn.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const absDist = Math.abs(mouseX - centerX)
          // 三角插值：absDist=0 → PEAK_SCALE；absDist>=DISTANCE → BASE_SCALE
          const t = absDist >= ICON_DISTANCE ? 1 : absDist / ICON_DISTANCE
          // ease-out 让靠近中心时增长更陡（更接近 magicui 的视觉效果）
          const eased = 1 - Math.pow(1 - t, 2)
          const scale = PEAK_SCALE - scaleRange * eased
          btn.style.transform = `scale(${scale.toFixed(3)})`
        })
      })
    },
    // 鼠标离开 dock：所有 icon 立刻弹回基础尺寸（iOS 行为）
    onActionBarMouseLeaveDock: function () {
      if (this._actionBarDockRaf) {
        window.cancelAnimationFrame(this._actionBarDockRaf)
        this._actionBarDockRaf = null
      }
      const inner = document.querySelector('.editor-action-bar-inner')
      if (!inner) return
      inner.querySelectorAll('.fab-icon').forEach((btn) => {
        btn.style.transform = ''
      })
    },
    async exportToBlogHandler () {
      const category = this.$store.state.client.rightClickCategoryItem
      if (!category) return
      this.$store.dispatch('server/blogDeploy', { category })
    },
    async copyMarkdownHandler () {
      const category = this.$store.state.client.rightClickCategoryItem
      if (!category) return
      const kbGuid = this.$store.state.server.kbGuid
      const notes = await this.$store.dispatch('server/getCategoryNotesForExport', { kbGuid, category })
      if (!notes || notes.length === 0) {
        this.$q.notify({ message: 'No notes found', type: 'warning' })
        return
      }
      const _getContent = serverActions._getContent
      const sections = []
      for (const noteField of notes) {
        const docGuid = noteField.docGuid || noteField.doc_guid
        if (!docGuid) {
          sections.push(`## ${noteField.title || ''}\n\n`)
          continue
        }
        let result
        try {
          result = await _getContent(kbGuid, docGuid)
        } catch (err) {
          console.warn(`[copyMarkdown] _getContent failed for ${docGuid}:`, err)
          continue
        }
        if (!result || !result.info) continue
        const isHtml = !this.$lodash.endsWith(result.info.title, '.md')
        const { html, resources } = result
        let content
        if (isHtml) {
          content = helper.convertHtml2Markdown(html, kbGuid, docGuid, resources || [])
        } else {
          content = helper.extractMarkdownFromMDNote(html, kbGuid, docGuid, resources || [])
        }
        const displayTitle = isHtml
          ? result.info.title
          : result.info.title.replace(/\.md$/, '')
        sections.push(`## ${displayTitle}\n\n${content || ''}`)
      }
      if (sections.length === 0) {
        this.$q.notify({ message: 'No notes found', type: 'warning' })
        return
      }
      const text = sections.join('\n\n---\n\n')
      this.$q.electron.clipboard.writeText(text)
      this.$q.notify({ message: `Copied ${sections.length} notes`, type: 'positive', icon: 'check' })
    },
    async onBlogDeploy ({ config }) {
      this.$refs.blogDeployProgressDialog.show()
      await this.$store.dispatch('server/blogDeploy', { config })
    },
    onBlogDeployCancel () {
      this.$refs.blogDeployProgressDialog.onCancel()
      this.$store.dispatch('server/cancelBlogDeploy')
    },
    async onBlogDeployRebuild () {
      const config = await this.getBlogDeployConfig()
      if (config) {
        this.$refs.blogDeployProgressDialog.show()
        await this.$store.dispatch('server/blogDeploy', { config })
      }
    },
    async getBlogDeployConfig () {
      try {
        const { getBlogDeployConfig } = require('src/ApiInvoker')
        return await getBlogDeployConfig()
      } catch (err) {
        console.warn('Failed to get blog deploy config:', err)
        return null
      }
    },
    onShowBlogDeployDialog ({ category }) {
      this.$refs.blogDeployDialog.show()
    },
    /**
     * 把编辑器返回的 cursor 归一化到 lineNumber >= 1 / column >= 1。
     * 子组件内部也会再兜底一次，但父组件提前保证 props 合法可以减少一次 watcher 抛错的窗口。
     */
    safeCursorPosition: function (cursor) {
      if (!cursor || typeof cursor !== 'object') {
        return { lineNumber: 1, column: 1 }
      }
      const line = Number(cursor.lineNumber)
      const column = Number(cursor.column)
      return {
        lineNumber: Number.isFinite(line) && line >= 1 ? Math.floor(line) : 1,
        column: Number.isFinite(column) && column >= 1 ? Math.floor(column) : 1
      }
    },
    ...mapServerActions(['createNote', 'createCategory']),
    ...mapClientActions(['toggleChanged', 'updateStateAndStore'])
  },
  mounted () {
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.createCategory, this.addCategoryHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.createNote, this.addNoteFromEditorBar)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.openImport, this.openImportHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.exportToBlog, this.exportToBlogHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.copyMarkdown, this.copyMarkdownHandler)
    bus.$on('showBlogDeployDialog', this.onShowBlogDeployDialog)
    bus.$on(events.VIEW_SHORTCUT_CALL.lockMode, this.lockModeHandler)
    bus.$on(events.VIEW_SHORTCUT_CALL.sourceMode, this.sourceModeHandler)
    bus.$on(events.GENERATE_MINDMAP, this.generateMindmapHandler)
    bus.$on(events.UPDATE_WORD_COUNT, this.wordCountUpdateHandler)
    // 监听编辑器滚动，触发 iOS 风格的工具栏收缩动效
    this.$nextTick(() => {
      const editorStage = document.querySelector('.editor-stage')
      if (editorStage) {
        editorStage.addEventListener('scroll', this.onEditorStageScroll, { passive: true })
      }
      // 初始化时把 tempNoteData 用合法的 cursor 补齐，避免 Monaco/Muya watcher 第一次跑时
      // 拿到 lineNumber=0 / column=0 触发 "Illegal value for lineNumber"。
      if (!this.tempNoteData || typeof this.tempNoteData !== 'object' || !this.tempNoteData.cursor) {
        this.tempNoteData = {
          markdown: '',
          cursor: { lineNumber: 1, column: 1 }
        }
      }
    })
    this.$nextTick(this.hideInitLoadingPage)
    if (!this.noteListVisible) {
      this.splitterLimits = [0, Infinity]
      this.splitterWidthValue = 0
    } else {
      this.splitterLimits = [300, Infinity]
      this.splitterWidthValue = Number.isFinite(this.splitterWidth) ? this.splitterWidth : 580
    }
    if (!this.categoryTreeVisible) {
      this.leftInnerSplitterLimits = [0, Infinity]
      this.leftInnerSplitterValue = 0
    } else {
      this.leftInnerSplitterLimits = [120, Infinity]
      this.leftInnerSplitterValue = Number.isFinite(this.leftInnerSplitterRatio) ? this.leftInnerSplitterRatio : 240
    }
  },
  beforeDestroy () {
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.createCategory, this.addCategoryHandler)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.createNote, this.addNoteFromEditorBar)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.openImport, this.openImportHandler)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.exportToBlog, this.exportToBlogHandler)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.copyMarkdown, this.copyMarkdownHandler)
    bus.$off('showBlogDeployDialog', this.onShowBlogDeployDialog)
    if (this.leftInnerSplitterSaveTimer) {
      clearTimeout(this.leftInnerSplitterSaveTimer)
    }
    if (this.splitterWidthSaveTimer) {
      clearTimeout(this.splitterWidthSaveTimer)
    }
    if (this._actionBarScrollTimer) {
      clearTimeout(this._actionBarScrollTimer)
    }
    if (this._actionBarDockRaf) {
      window.cancelAnimationFrame(this._actionBarDockRaf)
    }
    const editorStage = document.querySelector('.editor-stage')
    if (editorStage) {
      editorStage.removeEventListener('scroll', this.onEditorStageScroll)
    }
  },
  watch: {
    splitterWidthValue (val) {
      if (this.splitterWidthSaveTimer) {
        clearTimeout(this.splitterWidthSaveTimer)
      }
      this.splitterWidthSaveTimer = setTimeout(() => {
        this.persistSplitterWidth()
        this.splitterWidthSaveTimer = null
        bus.$emit(events.TAG_TREEMAP_RESIZE)
      }, 350)
    },
    leftInnerSplitterValue (val) {
      if (this.leftInnerSplitterSaveTimer) {
        clearTimeout(this.leftInnerSplitterSaveTimer)
      }
      this.leftInnerSplitterSaveTimer = setTimeout(() => {
        this.persistLeftInnerSplitter()
        this.leftInnerSplitterSaveTimer = null
        bus.$emit(events.TAG_TREEMAP_RESIZE)
      }, 350)
    },
    isSourceMode: function (val) {
      if (!val) {
        // 退出源码模式：先把当前 Monaco 内容 + 光标位置同步给 Muya。
        // cursor 兜底成 (1, 1)，避免 Monaco 内部「Illegal value for lineNumber」抛错。
        this.tempNoteData = {
          markdown: this.$refs.monaco?.getValue() || '',
          cursor: this.safeCursorPosition(this.$refs.monaco?.getCursorPosition())
        }
      } else {
        this.tempNoteData = {
          markdown: this.$refs.muya?.getValue() || '',
          cursor: this.safeCursorPosition(this.$refs.muya?.getCursorPosition())
        }
      }
    },
    noteState: function (val, oldVal) {
      if (val === 'default' && oldVal === 'changed') {
        this.saveButtonIcon = 'check'
        setTimeout(() => {
          this.saveButtonIcon = 'save'
        }, 3000)
      }
    },
    noteListVisible: function (val) {
      if (!val) {
        this.persistSplitterWidth()
        this.persistLeftInnerSplitter()
        this.splitterLimits = [0, Infinity]
        this.splitterWidthValue = 0
      } else {
        this.splitterLimits = [300, Infinity]
        this.splitterWidthValue = Number.isFinite(this.splitterWidth) ? this.splitterWidth : 580
        if (this.categoryTreeVisible) {
          this.leftInnerSplitterLimits = [120, Infinity]
          this.leftInnerSplitterValue = Number.isFinite(this.leftInnerSplitterRatio) ? this.leftInnerSplitterRatio : 240
        } else {
          this.leftInnerSplitterLimits = [0, Infinity]
          this.leftInnerSplitterValue = 0
        }
      }
    },
    categoryTreeVisible: function (val) {
      if (!val) {
        this.leftInnerSplitterLimits = [0, Infinity]
        this.leftInnerSplitterValue = 0
      } else {
        this.leftInnerSplitterLimits = [120, Infinity]
        this.leftInnerSplitterValue = Number.isFinite(this.leftInnerSplitterRatio) ? this.leftInnerSplitterRatio : 240
      }
    },
    showEditorNoteFab: function (val) {
      if (!val) this.editorNoteActionsExpanded = false
    },
    dataLoaded: function (val) {
      this.actionBarVisible = val
    },
    isOutlineShow: function (val) {
      this.actionBarVisible = !val
    }
  }
}
</script>
<style lang="scss">
.editor-wrapper {
  position: relative;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 将 Muya/Monaco 限制在右侧面板可视区域内 */
.editor-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* 加粗 Muya 编辑器滚动条 - 全局样式 */
#muya,
.muya,
.muya-wrapper {
  &::-webkit-scrollbar {
    width: 12px !important;
  }
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05) !important;
    border-radius: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.25) !important;
    border-radius: 6px !important;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.4) !important;
    background-clip: padding-box;
  }
}

/* Dark mode */
.body--dark #muya,
.body--dark .muya,
.body--dark .muya-wrapper {
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05) !important;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25) !important;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4) !important;
  }
}

/* ============== 编辑器操作栏：底部居中 + 水平 iOS 药丸 ==============
 * 锚定到 .editor-stage (position: relative) 而非视口 */
.editor-action-bar-wrapper {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
  z-index: 6000;
  pointer-events: none; /* 让 mousemove 穿透；子元素仍可点 */
}

.editor-action-bar {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  /* iOS 毛玻璃药丸背景 */
  background: rgba(245, 245, 247, 0.72);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border-radius: 22px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.6) inset,
    0 0 0 0.5px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1),
              opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform, opacity;
}

/* 滚动时收缩 + 淡化（仿 iOS Safari 底部工具栏） */
.editor-action-bar.action-bar--scroll {
  transform: scale(0.92);
  opacity: 0.6;
}

/* iOS 滑入/滑出：从底部弹出 + 缩放回弹 */
.action-bar-ios-enter-active {
  transition: transform 0.45s cubic-bezier(0.32, 1.6, 0.4, 1),
              opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}
.action-bar-ios-leave-active {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1),
              opacity 0.2s ease;
}
.action-bar-ios-enter,
.action-bar-ios-leave-to {
  transform: translateY(120%) scale(0.85);
  opacity: 0;
}

/* 子操作（新建笔记/导入）从右侧滑入 */
.sub-actions-ios-enter-active,
.sub-actions-ios-leave-active {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1),
              opacity 0.2s ease;
}
.sub-actions-ios-enter,
.sub-actions-ios-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

/* 按钮组：水平排列 */
.editor-action-bar-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.editor-note-sub-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

/* 全局 .fab-icon { margin: 40px } 在堆叠时会叠成巨大间距，此处恢复为紧凑感 */
.editor-action-bar .fab-icon {
  margin: 0 !important;
}

/* 仿 magicui dock：transform 由 JS 行内 style 驱动；CSS transition 做 spring 平滑
 * cubic-bezier(0.16, 1, 0.3, 1) ≈ framer-motion { mass: 0.1, stiffness: 150, damping: 12 } 的视觉曲线 */
.editor-action-bar-inner .fab-icon {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.2s ease,
              background-color 0.2s ease;
  transform-origin: center center;
  border-radius: 50%;
  position: relative;
  z-index: 1;
  transform: scale(0.85);
  will-change: transform;
}

/* hover 由行内 transform 接管；这里仅加阴影微调保留 iOS dock 高亮感 */
.editor-action-bar-inner .fab-icon:hover {
  box-shadow: 0 4px 16px rgba(38, 166, 154, 0.35);
  z-index: 10;
}

/* Dark mode 适配 */
.body--dark .editor-action-bar {
  background: rgba(40, 40, 42, 0.72);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 0 0 0.5px rgba(255, 255, 255, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.4);
}

.editor-splitter-after {
  min-height: 0;
}

.index-left-inner-splitter {
  min-height: 0;
}

.left-panel-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-component {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
}

/* QSplitter：separatorClass 加在 .q-splitter__separator 自身，勿写子选择器 */
.q-splitter.q-splitter--vertical > .q-splitter__separator.custom-splitter {
  background-color: #dfe3ea !important;
  transition: background-color 0.15s ease, width 0.15s ease, box-shadow 0.15s ease;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.q-splitter.q-splitter--vertical > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--vertical.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
  width: 3px !important;
  box-shadow: 0 0 0 1px var(--themeColor30, rgba(64, 158, 255, 0.35));
}

.q-splitter.q-splitter--dark.q-splitter--vertical > .q-splitter__separator.custom-splitter {
  background-color: rgba(255, 255, 255, 0.14) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.q-splitter.q-splitter--dark.q-splitter--vertical > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--dark.q-splitter--vertical.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
}

.q-splitter.q-splitter--horizontal > .q-splitter__separator.custom-splitter {
  background-color: #dfe3ea !important;
  transition: background-color 0.15s ease, height 0.15s ease, box-shadow 0.15s ease;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.q-splitter.q-splitter--horizontal > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--horizontal.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
  height: 3px !important;
  box-shadow: 0 0 0 1px var(--themeColor30, rgba(64, 158, 255, 0.35));
}

.q-splitter.q-splitter--dark.q-splitter--horizontal > .q-splitter__separator.custom-splitter {
  background-color: rgba(255, 255, 255, 0.14) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.q-splitter.q-splitter--dark.q-splitter--horizontal > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--dark.q-splitter--horizontal.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
}
</style>
