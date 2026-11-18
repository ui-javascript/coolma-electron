
<template>
  <div class="full-height column note-list-root">
    <q-scroll-area
      class="fit note-list-scroll"
      :thumb-style="thumbStyle"
      :bar-style="barStyle"
      :content-style="{ minWidth: 'auto' }"
    >
      <q-pull-to-refresh @refresh="refreshNoteListHandler">
        <q-list v-if="displayNotes.length > 0" class="note-list-content">
          <q-item
            clickable
            v-ripple="{ color: '#212121' }"
            v-for="(noteField, index) in displayNotes"
            :key="index"
            :class="`note-item${$q.dark.isActive ? '-dark' : ''} no-padding`"
            :active="activeNote(noteField)"
            :active-class="`active-note-item${$q.dark.isActive ? '-dark' : ''}`"
          >
            <q-item-section>
              <div @contextmenu="(e) => noteItemContextMenuHandler(e, noteField)">
                <NoteItem :data="noteField" :dense="noteListDenseMode"/>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="note-list-empty">
          <a-empty :description="$t('noNotes')" />
        </div>
      </q-pull-to-refresh>
      <Loading :visible="isCurrentNotesLoading" />
    </q-scroll-area>
    <q-card
      class="note-list-bottom text-center"
      v-ripple
      v-if="isLogin"
    >
      <span>{{ category }}</span>
    </q-card>
    <CategoryDialog ref='categoryDialog' :note-info='rightClickNoteItem' :label='categoryDialogLabel'
                    :handler='categoryDialogHandler' />
    <rankingTierDialog ref="tierRankingDialog" />
    <!--
      全屏透明 wujie 子应用壳（generic 版）。
      appEntry 是「当前微应用列表里 displayMode=fullscreen 的某个内置条目」，
      由 mounted 时 deleteEffectBuiltinHook._findBuiltinEntry() 异步加载，
      通过 bus 'microAppsChanged' 实时刷新。
      若列表里没有内置条目 / enabled=false，overlay.wujieUrl 回退到空字符串 → wujie 不挂载。
      下架任意全屏业务：删除对应子项目目录 + 删除 components/microApp/builtins/<name>.js 的
      install 调用 + 在 boot/microapp-builtins.js 注释掉对应注册行，主项目其它代码完全不动。
    -->
    <fullscreenOverlay ref='fullscreenOverlay' :app-entry='fullscreenAppEntry' />
  </div>
</template>

<script>
import NoteItem from './NoteItem.vue'
import CategoryDialog from '../category/CategoryDialog.vue'
import rankingTierDialog from '../ranking/rankingTierDialog.vue'
import fullscreenOverlay from '../microApp/fullscreenOverlay.vue'
import DatabaseClient from 'src/utils/DatabaseClient'
import { createNamespacedHelpers } from 'vuex'
import { Loading, QSpinnerGears } from 'quasar'
import LoadingComponent from '../common/Loading.vue'
import helper from 'src/utils/helper'
import bus from '../common/bus.js'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import { showContextMenu as showNoteItemContextMenu } from 'src/components/contextMenu/noteList'
import {
  installDeleteEffectConfirmHook,
  DELETE_EFFECT_APP_ID
} from '../microApp/builtins/deleteEffect.js'

const { mapGetters: mapServerGetters, mapState: mapServerState, mapActions: mapServerActions } = createNamespacedHelpers('server')
const { mapState: mapClientState, mapActions: mapClientActions } = createNamespacedHelpers('client')
export default {
  name: 'NoteList',
  components: { Loading, NoteItem, CategoryDialog, rankingTierDialog, Loading: LoadingComponent, fullscreenOverlay },
  // 注意：deleteConfirmHook 不能放在组件选项顶层（与 data/methods 同级），
  // 因为 Vue 2 不会把自定义选项挂到 this 上 → this.deleteConfirmHook === undefined。
  // 正确做法：在 created() 里赋值为实例属性（非响应式，无需 data）。
  data () {
    return {
      categoryDialogLabel: '',
      categoryDialogHandler: () => {},
      tierRankingNoteDocGuid: '', // 缓存当前右键点击的笔记 docGuid
      // 【v2026-08-08】displayMode=fullscreen 的微应用条目（来自微应用列表）。
      // 由 deleteConfirmHook._findBuiltinEntry() 异步加载，并通过 bus 'microAppsChanged' 实时刷新。
      // null 表示「还没加载完」或「列表里没有对应条目」，overlay.wujieUrl 回退到空字符串 → wujie 不挂载。
      // 注意：这里**不硬编码 id**，通过 DELETE_EFFECT_APP_ID 注入；
      // 下架怪兽特效时这个 prop 自然变为 null，overlay 自动 fallback 到空 url。
      fullscreenAppEntry: null
    }
  },
  computed: {
    thumbStyle () {
      return {
        background: '#E8ECF1',
        width: '5px',
        opacity: 0.75,
        borderRadius: '10px'
      }
    },

    barStyle () {
      return {
        width: '5px'
      }
    },
    category: function () {
      if (this.sidebarTreeType === 'calendar' && this.calendarSelectedDate) {
        return this.calendarSelectedDate.replace(/-/g, '/')
      }
      if (helper.isNullOrEmpty(this.currentCategory)) return ''
      if (!this.tags) return ''
      const tagIndex = this.tags.findIndex(
        t => t.tagGuid === this.currentCategory
      )
      if (tagIndex !== -1) {
        return this.tags[tagIndex].name
      } else {
        try {
          if (helper.wizIsPredefinedLocation(this.currentCategory)) return this.$t(this.currentCategory)
          const categoryList = this.currentCategory.split('/')
          return categoryList[categoryList.length - 2]
        } catch (e) {
          return ''
        }
      }
    },
    isOfflineMode () {
      return !this.isLogin
    },
    displayNotes () {
      return this.currentNotes
    },
    ...mapServerGetters(['activeNote', 'currentNotes']),
    ...mapServerState(['isCurrentNotesLoading', 'currentCategory', 'isLogin', 'tags', 'currentNote']),
    ...mapClientState(['rightClickCategoryItem', 'rightClickNoteItem', 'noteListDenseMode', 'sidebarTreeType', 'calendarSelectedDate']),
  },
  methods: {
    deleteCategoryHandler: async function (eventData) {
      // eventData 由主进程透传过来，形态可能是 { category }（packClickFunction 默认形态）
      // 或 string（旧链路透传 category 字符串）。两边都要兼容。
      // contextData（右键的 category）优先级最高 —— 不依赖 vuex state rightClickCategoryItem，
      // 因为异步时序下它可能被上次的右键污染。
      const ipcCategory = (typeof eventData === 'string')
        ? eventData
        : (eventData && typeof eventData === 'object' ? eventData.category : '') || ''
      const targetCategory = ipcCategory || this.rightClickCategoryItem
      if (helper.isNullOrEmpty(targetCategory)) return
      // 用本次右键的 category 作为唯一真实来源——不要 fallback 到 this.category，
      // 因为 this.category 是 currentCategory 的派生，右键 ≠ 选中，二者不一致时
      // overlay 上显示的瞄准名就会是错的（看的是 currentCategory 的名字）。
      const targetName = targetCategory.split('/').filter(Boolean).pop() || targetCategory

      // 【v2026-08-08】先读业务内置 hook「deleteConfirmHook.isEnabled()」：
      //   - 默认关闭（builtins/deleteEffect.js installDeleteEffectBuiltin 返回的条目 enabled=false）
      //   - 走原本的 $q.dialog 二次确认
      //   - 用户在「设置 → 通用 → 微应用」开启该内置条目后，hook 自动返回 true → 走 fullscreenOverlay
      const overlayEnabled = await this.deleteConfirmHook.isEnabled()
      if (overlayEnabled) {
        const overlay = this.$refs.fullscreenOverlay
        if (overlay && typeof overlay.summon === 'function') {
          try {
            const target = {
              guid: 'category:' + targetCategory,
              name: targetName,
              icon: '📁',
              size: '',
              corrupt: false
            }
            const result = await this.deleteConfirmHook.runSummon(overlay, target)
            if (result && result.outcome === 'destroyed') {
              this.deleteCategory(targetCategory, { silentNotify: true })
            }
            return
          } catch (err) {
            console.warn('[NoteList] fullscreenOverlay.summon 失败，回退到默认确认框：', err)
          }
        }
      }

      // 回退路径：开关关闭 / overlay 不存在 / 调失败 → 用原本的 $q.dialog 二次确认
      this.$q
        .dialog({
          title: this.$t('deleteCategory'),
          ok: this.$t('confirm'),
          cancel: this.$t('cancel')
        })
        .onOk(() => {
          this.deleteCategory(targetCategory)
        })
    },
    exportCategoryHandler: async function () {
      const categoryToExport = this.rightClickCategoryItem
      if (!categoryToExport) return
      Loading.show({
        spinner: QSpinnerGears,
        message: this.$t('prepareExportData'),
        delay: 400
      })
      const kbGuid = this.$store.state.server.kbGuid
      const notes = await this.getCategoryNotesForExport({ kbGuid, category: categoryToExport })
      Loading.hide()
      this.exportMarkdownFiles(notes, categoryToExport)
    },
    async refreshNoteListHandler () {
      const tagIndex = this.tags?.findIndex(
        t => t.tagGuid === this.currentCategory
      ) ?? -1
      await this.updateCurrentCategory({
        type: tagIndex === -1 ? 'category' : 'tag',
        data: this.currentCategory ?? ''
      })
    },
    /** NoteItem Action Following */
    renameNoteHandler: function () {
      this.$q.dialog({
        title: this.$t('renameNote'),
        prompt: {
          model: this.rightClickNoteItem.title,
          type: 'text',
          attrs: {
            spellcheck: false
          },
          label: this.$t('title')
        },
        ok: this.$t('confirm'),
        cancel: this.$t('cancel')
      }).onOk(data => {
        const info = JSON.parse(JSON.stringify(this.rightClickNoteItem))
        info.title = data
        info.infoModified = new Date().getTime()
        this.updateNoteInfo(info)
      })
    },
    deleteNoteHandler: function () {
      this.$q.dialog({
        title: this.$t('deleteNote'),
        ok: this.$t('confirm'),
        cancel: this.$t('cancel')
      }).onOk(() => {
        this.deleteNote(this.rightClickNoteItem)
      })
    },
    copyNoteHandler: function () {
      this.categoryDialogLabel = 'copyToAnotherCategory'
      this.categoryDialogHandler = this.copyNote
      this.$refs.categoryDialog.toggle()
    },
    copyMarkdownContentHandler: async function () {
      const noteField = this.rightClickNoteItem
      if (!noteField) return
      const note = await DatabaseClient.notes.getByDocGuid(noteField.docGuid)
      if (!note) return
      const markdownContent = note.content || ''
      this.$q.electron.clipboard.writeText(markdownContent)
      this.$q.notify({ message: this.$t('noteContentCopied'), type: 'positive' })
    },
    moveNoteHandler: function () {
      this.categoryDialogLabel = 'moveToAnotherCategory'
      this.categoryDialogHandler = this.moveNote
      this.$refs.categoryDialog.toggle()
    },
    exportNoteAsMdHandler: function (current = false) {
      this.exportMarkdownFile({ noteField: this.rightClickNoteItem, current })
    },
    exportNoteAsPngHandler: function (current = false) {
      this.exportPng({ noteField: this.rightClickNoteItem, current })
    },
    noteItemContextMenuHandler: function (e, noteField) {
      const isCurrentNote = noteField.docGuid === this.currentNote?.info?.docGuid
      this.setRightClickNoteItem(noteField)
      // 缓存 docGuid 用于从夯到拉
      this.tierRankingNoteDocGuid = noteField.docGuid
      showNoteItemContextMenu(e, isCurrentNote, { docGuid: noteField.docGuid })
    },
    /**
     * 打开笔记的从夯到拉排行榜（从夯到拉）
     */
    openTierRankingForNoteHandler: async function (eventData) {
      const docGuid = eventData?.noteData?.docGuid || this.tierRankingNoteDocGuid
      if (!docGuid) {
        this.$q.notify({ message: '未选择笔记', color: 'warning' })
        return
      }
      // 读取笔记内容
      const note = await DatabaseClient.notes.getByDocGuid(docGuid)
      const noteContent = note?.content || ''
      this.$refs.tierRankingDialog.toggle({
        mode: 'note',
        contextKey: docGuid,
        noteContent
      })
    },
    /**
     * 【v2026-08-08】microAppsChanged 总线回调：刷新 fullscreenAppEntry。
     * 业务 hook 已经封装好了从 microApps 列表里找内置条目的逻辑；
     * NoteList 只负责把最新条目通过 props 推给 fullscreenOverlay。
     *
     * 兼容 payload 形态：
     *   - { list, dirtyIds }    （新格式）
     *   - Array（兼容旧链路直接传列表）
     */
    async _onMicroAppsChanged (payload) {
      const list = Array.isArray(payload)
        ? payload
        : (payload && Array.isArray(payload.list) ? payload.list : null)
      if (!Array.isArray(list)) return
      const normalized = list.filter(Boolean).map(a => {
        // 内联归一化（避免重新 import normalizeMicroApps，保持 NoteList 不依赖 microAppService 内部函数）
        const id = String(a.id || '').trim()
        if (!id) return null
        return {
          id,
          name: String(a.name || id),
          icon: String(a.icon || 'el-icon-chat-dot-round'),
          url: typeof a.url === 'string' ? a.url : '',
          devUrl: typeof a.devUrl === 'string' ? a.devUrl : '',
          isDefault: Boolean(a.isDefault),
          enabled: a.enabled === undefined ? true : Boolean(a.enabled),
          isMobile: a.isMobile === true,
          displayMode: a.displayMode === 'fullscreen' ? 'fullscreen' : 'drawer',
          isBuiltIn: Boolean(a.isBuiltIn)
        }
      }).filter(Boolean)
      // 业务 hook 不直接维护 NoteList 自身的 state；
      // 我们重新跑一遍查找逻辑拿最新条目（DELETE_EFFECT_APP_ID 由 builtins/deleteEffect.js 提供）。
      try {
        const found = normalized.find(a => a && a.id === DELETE_EFFECT_APP_ID) || null
        this.fullscreenAppEntry = found
      } catch (_) { /* noop */ }
    },
    ...mapServerActions([
      'deleteCategory',
      'updateCurrentCategory',
      'exportMarkdownFiles',
      'updateNoteInfo',
      'deleteNote',
      'moveNote',
      'copyNote',
      'exportMarkdownFile',
      'exportPng',
      'getCategoryNotesForExport'
    ]),
    ...mapClientActions(['setRightClickNoteItem']),
    /**
     * 私有方法：从 SQLite 读取 microApps 列表，注入 fullscreenAppEntry。
     * 走业务 hook 的私有 _findBuiltinEntry（内置了 try/catch 兜底）。
     * 注意：必须放在 methods 里，放在组件选项顶层会被 Vue 2 忽略 → this 访问不到。
     */
    async _loadFullscreenAppEntry () {
      try {
        const entry = await this.deleteConfirmHook._findBuiltinEntry()
        this.fullscreenAppEntry = entry
      } catch (err) {
        console.warn('[NoteList] loadFullscreenAppEntry failed:', err)
        this.fullscreenAppEntry = null
      }
    }
  },
  created () {
    // 业务「删除确认」hook：从 builtins/deleteEffect.js 注入（默认行为是「关闭就走 $q.dialog 二次确认」）。
    // 下架怪兽特效：删 builtins/deleteEffect.js + boot 处 install 调用即可，这里会自动 fallback 到 $q.dialog。
    // 必须赋值到实例属性 this.deleteConfirmHook，deleteCategoryHandler / _loadFullscreenAppEntry 里才能通过 this 访问到。
    this.deleteConfirmHook = installDeleteEffectConfirmHook()
  },
  mounted () {
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.exportCategory.markdown, this.exportCategoryHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.delete, this.deleteCategoryHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.rename, this.renameNoteHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.copyNote, this.copyNoteHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.copyMarkdownContent, this.copyMarkdownContentHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.move, this.moveNoteHandler)
    bus.$on(events.NOTE_SHORTCUT_CALL.exportNoteAsMarkdown, this.exportNoteAsMdHandler)
    bus.$on(events.NOTE_SHORTCUT_CALL.exportNoteAsPNG, this.exportNoteAsPngHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.delete, this.deleteNoteHandler)
    // 从夯到拉相关事件
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.openTierRankingForNote, this.openTierRankingForNoteHandler)
    // v2026-08-08：订阅微应用列表变更，确保 fullscreenOverlay.appEntry 实时同步
    bus.$on('microAppsChanged', this._onMicroAppsChanged)
    // 首次加载：从 SQLite 取一次内置条目（hooks 里内置了 fallback）
    this._loadFullscreenAppEntry()
  },
  beforeDestroy () {
    bus.$off(events.NOTE_ITEM_CONTEXT_MENU.copyNote, this.copyNoteHandler)
    bus.$off(events.NOTE_ITEM_CONTEXT_MENU.copyMarkdownContent, this.copyMarkdownContentHandler)
    bus.$off(events.NOTE_ITEM_CONTEXT_MENU.openTierRankingForNote, this.openTierRankingForNoteHandler)
    // v2026-08-08：取消微应用变更订阅
    bus.$off('microAppsChanged', this._onMicroAppsChanged)
  }
}
</script>

<style scoped lang="scss">

:deep(.q-scrollarea__content) {
  width: 100%;
}

.note-list-root {
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
  height: 100%;
}

.note-list-scroll {
  flex: 1;
  min-height: 0;
}

.note-list-empty {
  padding-top: 20px;
  width: 100%;
  text-align: center;
}

.note-list-bottom {
  flex-shrink: 0;
  height: 24px;
  padding: 2px !important;
  color: #9b9b9b;
  user-select: none;
  font-size: 11px;
  font-weight: bold;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif, 黑体;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
}

/* 减少笔记项之间的间距 */
.note-item,
.note-item-dark {
  min-height: 0 !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

/* 移除分割线（如果有的话） */
.note-item::after,
.note-item-dark::after {
  display: none !important;
}
</style>
