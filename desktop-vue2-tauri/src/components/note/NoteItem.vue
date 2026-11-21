/** * @Description: * @Author: TankNee * @Date: 9/8/2020 1:24 PM **/
<template>
  <q-card
    flat
    :class='`note-card${darkTag} bg-transparent`'
    @click='noteItemClickHandler'
  >
    <div :class='`note-item-title${darkTag} ${denseTag}`'>
      <q-icon :name="fileIcon" class="note-file-icon" size="16px" />
      <span v-html='title'></span>
      <!-- 同步状态图标（dirty=1 显示待同步） -->
      <q-icon
        v-if="isDirty"
        name='cloud_upload'
        class="sync-status-icon sync-pending"
        size="12px"
      />
    </div>

    <div v-if="!dense" :class='`note-item-summary${darkTag}`' v-html='summary'></div>

    <div :class='`note-item-summary${darkTag} flex justify-between no-wrap overflow-hidden fa-align-center`'>
      <span class='text-left note-info-tag'><q-icon name='category' size='17px' /> {{ category }}</span>
      <span class='text-right note-info-tag'><q-icon name='timer' size='17px' /> {{ modifiedDate }}</span>
    </div>
  </q-card>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import DatabaseClient from 'src/utils/DatabaseClient'

const {
  mapActions: mapServerActions,
  mapState: mapServerState
} = createNamespacedHelpers('server')
export default {
  name: 'NoteItem',
  props: {
    data: {
      type: Object,
      default () {
        return {
          abstractText: '',
          docGuid: '',
          category: ''
        }
      }
    },
    maxSummaryLength: {
      type: Number,
      default: 40
    },
    markdown: Boolean,
    contextmenuHandler: {
      type: Function,
      default: () => {}
    },
    dense: {
      type: Boolean,
      default: true
    },
    titleWrap: {
      type: Boolean,
      default: false
    },
    maxTitleLength: {
      type: Number,
      default: 25
    }
  },
  data () {
    return {
      categoryDialogLabel: '',
      categoryDialogHandler: () => {},
      count: 0,
      capturedSaveData: null  // ✅ 新增：预捕获的保存数据
    }
  },
  computed: {
    fileIcon () {
      const title = this.data.title || ''
      if (this.$lodash.endsWith(title, '.md')) return 'description'
      if (this.$lodash.endsWith(title, '.txt')) return 'text_snippet'
      if (this.$lodash.endsWith(title, '.html') || this.$lodash.endsWith(title, '.htm')) return 'html'
      if (this.$lodash.endsWith(title, '.pdf')) return 'pdf'
      return 'note'
    },
    summary () {
      if (this.$utils.emptyUtil.isNullOrEmpty(this.data.abstractText) && !this.$utils.emptyUtil.isNullOrEmpty(this.data.highlight)) {
        const { highlight: { text = [] } } = this.data
        const summary = text.join('')
        return summary.length > this.maxSummaryLength
          ? summary.substring(0, this.maxSummaryLength) + '...'
          : summary
      }
      return this.data.abstractText &&
      this.data.abstractText.length > this.maxSummaryLength
        ? this.data.abstractText.substring(0, this.maxSummaryLength) + '...'
        : this.data.abstractText
    },
    title () {
      if (!this.$utils.emptyUtil.isNullOrEmpty(this.data.highlight)) {
        const { highlight: { title = [] } } = this.data
        const tempTitle = title.join('')
        if (this.titleWrap) {
          return tempTitle &&
          tempTitle.length > this.maxTitleLength
            ? tempTitle.substring(0, this.maxTitleLength) + '...'
            : tempTitle
        }
        return title.join('')
      }
      return this.data.title
    },
    docGuid () {
      return this.data.docGuid
    },
    darkMode () {
      return this.$q.dark.isActive
    },
    darkTag () {
      return this.darkMode ? '-dark' : ''
    },
    denseTag () {
      return this.dense ? 'dense' : ''
    },
    modifiedDate () {
      return this.$utils.dateUtil.displayDateElegantly(this.data.dataModified)
    },
    // 是否待同步（dirty=1）
    isDirty () {
      return this.data.dirty === 1
    },
    category () {
      if (this.$utils.emptyUtil.isNullOrEmpty(this.data.category)) return ''
      try {
        if (this.$utils.treeUtil.wizIsPredefinedLocation(this.data.category)) return this.$t(this.data.category)
        const categoryList = this.data.category.split('/')
        return categoryList[categoryList.length - 2]
      } catch (e) {
        return ''
      }
    },
    ...mapServerState(['noteState', 'currentCategory'])
  },
  methods: {
    noteItemClickHandler: async function () {
      console.log('\n[NoteItem] =========================================')
      console.log('[NoteItem] 🖱️ CLICK DETECTED! Time:', new Date().toISOString())
      console.log('[NoteItem] =========================================\n')
      
      const currentDocGuid = this.$store.state.server.currentNote?.info?.docGuid
      console.log(`[NoteItem] Clicked: docGuid=${this.docGuid}, currentDocGuid=${currentDocGuid}, noteState=${this.noteState}`)
      console.log(`[NoteItem] Need to save? ${currentDocGuid && currentDocGuid !== this.docGuid ? 'YES ✅' : 'NO ❌'}`)
      
      // ✅ 改进：只要当前有打开的笔记就尝试保存（不再依赖 noteState）
      if (currentDocGuid && currentDocGuid !== this.docGuid) {
        // 有不同的笔记正在编辑 → 强制保存
        console.log('\n[NoteItem] ⚡ DIFFERENT NOTE! Starting save process...')
        console.log('[NoteItem] Different note is open, forcing save before switch...')
        
        try {
          // Step 1: 捕获编辑器当前内容
          console.log('[NoteItem] Step 1: Calling captureEditorContent()...')
          const capturedData = this.captureEditorContent()
          console.log(`[NoteItem] Step 1 Result: ${capturedData ? 'SUCCESS ✅ (len=' + capturedData.markdown?.length + ')' : 'FAILED ❌ null'}`)
          
          if (capturedData && capturedData.markdown) {
            // Step 2: 同步等待保存完成
            console.log('[NoteItem] Step 2: Calling saveWithCapturedData()...')
            const saveSuccess = await this.saveWithCapturedData(capturedData)
            console.log(`[NoteItem] Step 2 Result: ${saveSuccess ? 'SUCCESS ✅' : 'FAILED ❌'}`)
            
            if (saveSuccess) {
              console.log('[NoteItem] ✅ Previous note saved successfully, now switching to new note')
            } else {
              // fallback：尝试直接从 store 获取内容保存
              console.warn('[NoteItem] Captured save failed, trying fallback...')
              await this.saveToSQLite()
            }
          } else {
            // fallback：捕获失败，使用原有逻辑
            console.warn('[NoteItem] No captured data, using fallback saveToSQLite()...')
            await this.saveToSQLite()
          }
        } catch (error) {
          console.error('[NoteItem] Error during pre-switch save:', error)
          // 即使保存失败也继续切换（避免卡死）
        }
        
        console.log('\n[NoteItem] ✅ Save process COMPLETED! Now loading new note...\n')
        
        // ✅ 移除自动同步！只在用户手动点击同步按钮时才同步
        // this.asyncSyncToCloud()  ← 已移除，不再自动调用
      } else if (this.noteState !== 'default') {
        // 兼容旧逻辑：noteState 不是 default 时也保存
        console.log('[NoteItem] Same note or no note open, but has unsaved changes, saving...')
        
        try {
          const capturedData = this.captureEditorContent()
          if (capturedData) {
            await this.saveWithCapturedData(capturedData)
          } else {
            await this.saveToSQLite()
          }
        } catch (error) {
          console.error('[NoteItem] Error during save:', error)
        }
      } else {
        console.log('[NoteItem] ℹ️ Same note and no changes, skipping save')
      }
      
      // Step 3: 保存完成（或无需保存）→ 现在安全地切换到新笔记
      console.log(`\n[NoteItem] Loading new note: ${this.docGuid}`)
      console.time('NoteLoadTime')
      await this.getNoteContent({ docGuid: this.docGuid })
      console.timeEnd('NoteLoadTime')
      
      console.log(`[NoteItem] ✅ Switch completed to: ${this.docGuid}`)
      console.log('[NoteItem] =========================================\n')
    },
    
    // ✅ 新增：捕获编辑器当前内容（调用 Muya 组件的方法）
    captureEditorContent: function () {
      try {
        // ✅ 查找当前活跃的编辑器组件（Muya 或 Monaco）
        const findEditorComponent = (root) => {
          const queue = [...root.$children]
          while (queue.length) {
            const child = queue.shift()
            
            // ✅ 检查是否有 captureCurrentContent 方法（Muya 和 Monaco 都有）
            if (child.captureCurrentContent && typeof child.captureCurrentContent === 'function') {
              // ✅ 优先返回活跃的编辑器
              if (child.active === undefined || child.active === true || child.$el?.offsetParent !== null) {
                return child
              }
            }
            
            queue.push(...child.$children)
          }
          return null
        }
        
        const editor = findEditorComponent(this.$root)
        if (editor) {
          this.capturedSaveData = editor.captureCurrentContent()
          const editorName = editor.$options.name || 'Unknown'
          console.log(`[NoteItem] Editor content captured from ${editorName}:`, this.capturedSaveData ? `docGuid=${this.capturedSaveData.docGuid}` : 'null')
        } else {
          console.warn('[NoteItem] No active editor component found (neither Muya nor Monaco)')
          this.capturedSaveData = null
        }
      } catch (error) {
        console.error('[NoteItem] Failed to capture editor content:', error)
        this.capturedSaveData = null
      }
      
      // ✅ 关键修复：返回捕获的数据！（之前缺少这行导致总是返回 undefined）
      return this.capturedSaveData
    },
    
    // ✅ 新增：使用预捕获的数据保存
    saveWithCapturedData: async function (capturedData) {
      try {
        if (!capturedData || !capturedData.docGuid) {
          console.warn('[NoteItem] saveWithCapturedData: no valid data')
          return false
        }
        
        const { markdown, docGuid, title, resources } = capturedData
        
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        console.log(`[NoteItem] 💾 Saving captured data: docGuid=${docGuid}, len=${markdown?.length}, title=${title}`)
        
        if (localNote) {
          console.log(`[NoteItem] 📝 Updating existing note: id=${localNote.id}, current_content_len=${(localNote.content || '').length}`)
          await DatabaseClient.notes.update(localNote.id, {
            content: markdown,
            title: title || localNote.title,
            local_modified: Date.now()
          })
          console.log(`[NoteItem] ✅ Updated SQLite: id=${localNote.id}, dirty=1 (pending manual sync)`)
        } else {
          console.log(`[NoteItem] 🆕 Creating new note: docGuid=${docGuid}`)
          await DatabaseClient.notes.create({
            doc_guid: docGuid,
            title: title || 'Untitled',
            content: markdown,
            local_modified: Date.now(),
            data_created: Date.now(),
            data_modified: Date.now()
          })
          console.log(`[NoteItem] ✅ Created in SQLite: docGuid=${docGuid}, dirty=1 (pending manual sync)`)
        }
        
        // ✅ 验证：保存后立即读取确认
        const verifyNote = await DatabaseClient.notes.getByDocGuidWithPriority(docGuid)
        if (verifyNote) {
          console.log(`[NoteItem] ✅ Verified saved content: id=${verifyNote.id}, content_len=${(verifyNote.content || '').length}, dirty=${verifyNote.dirty}, local_mod=${verifyNote.local_modified}`)
        } else {
          console.error(`[NoteItem] ❌ Verification failed: cannot find note after save: ${docGuid}`)
        }
        
        return true
      } catch (err) {
        console.error('[NoteItem] saveWithCapturedData failed:', err)
        return false
      }
    },
    // 获取当前编辑器的 markdown 内容
    getCurrentMarkdown () {
      // 优先尝试通过 $root 找到 Index 页面组件
      const findIndexPage = (root) => {
        const queue = [...root.$children]
        while (queue.length) {
          const child = queue.shift()
          if (child.$refs?.muya && typeof child.$refs.muya.getValue === 'function') {
            return child
          }
          if (child.$refs?.monaco && typeof child.$refs.monaco.getValue === 'function') {
            return child
          }
          queue.push(...child.$children)
        }
        return null
      }

      const page = findIndexPage(this.$root)
      if (!page) {
        console.warn('[NoteItem] Cannot find editor page')
        return ''
      }

      // Muya 编辑器
      const muya = page.$refs.muya
      if (muya && typeof muya.getValue === 'function') {
        return muya.getValue()
      }
      // Monaco 编辑器
      const monaco = page.$refs.monaco
      if (monaco && typeof monaco.getValue === 'function') {
        return monaco.getValue()
      }
      return ''
    },
    // 保存当前笔记到本地 SQLite（切换时调用，保存编辑器最新内容）
    async saveToSQLite () {
      try {
        const state = this.$store.state.server
        const currentNote = state.currentNote
        const docGuid = currentNote?.info?.docGuid
        const info = currentNote?.info
        console.log('[NoteItem] saveToSQLite called, docGuid:', docGuid, 'hasInfo:', !!info)
        if (!docGuid || !info) {
          console.warn('[NoteItem] saveToSQLite skipped: no docGuid or info')
          return false
        }

        const markdown = this.getCurrentMarkdown()
        console.log('[NoteItem] getCurrentMarkdown returned length:', markdown?.length || 0)
        if (!markdown) {
          console.warn('[NoteItem] saveToSQLite skipped: empty markdown')
          return false
        }

        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        console.log('[NoteItem] SQLite lookup result:', localNote ? `id=${localNote.id}` : 'null')
        if (localNote) {
          await DatabaseClient.notes.update(localNote.id, {
            content: markdown,
            title: info.title,
            category: info.category || '/'
          })
          console.log('[NoteItem] SQLite updated:', docGuid, 'content length:', markdown.length, '(dirty=1 auto-set)')
        } else {
          await DatabaseClient.notes.create({
            doc_guid: docGuid,
            title: info.title,
            content: markdown,
            category: info.category || '/'
          })
          console.log('[NoteItem] SQLite created:', docGuid, 'content length:', markdown.length, '(dirty=1 auto-set)')
        }
        return true
      } catch (err) {
        console.error('[NoteItem] saveToSQLite failed:', err)
        return false
      }
    },
    // 保存当前笔记（云端）
    async saveCurrentNote (markdown) {
      if (markdown && typeof this.$store.dispatch === 'function') {
        await this.$store.dispatch('server/updateNote', markdown)
      }
    },
    // 后台异步同步到云端（不等待）
    asyncSyncToCloud () {
      console.log('[NoteItem] 🚀 Starting async sync to cloud (background)...')
      
      // ✅ 异步执行，不阻塞 UI
      this.$nextTick(async () => {
        try {
          const result = await this.$store.dispatch('client/sync')
          console.log('[NoteItem] ✅ Background sync completed:', result)
        } catch (error) {
          console.error('[NoteItem] ❌ Background sync failed:', error)
        }
      })
    },
    ...mapServerActions(['getNoteContent', 'updateNoteInfo'])
  }
}
</script>

<style scoped>
.sync-status-icon {
  margin-left: 4px;
  vertical-align: middle;
}
.sync-local { color: #999; }
.sync-pending { color: #e6a23c; }
.sync-download { color: var(--themeColor); }
.sync-synced { color: #67c23a; }
</style>
