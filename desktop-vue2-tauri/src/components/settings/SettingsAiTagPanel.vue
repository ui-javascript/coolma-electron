<template>
  <div class='settings-ai-tag-panel'>
    <SettingsSectionContent :title="$t('aiTagsTitle')" accent-color='yellow-9'>
      <template v-slot:actions>
        <div class='settings-section-actions'>
          <q-btn dense flat no-caps size='sm' color='yellow-9' icon='add'
            :label="$t('aiTagCreate')" :disable='loadingTags || renaming' @click='openCreateTagDialog' />
          <q-btn dense flat no-caps size='sm' color='yellow-9' icon='refresh'
            :label="$t('aiTagRefresh')" :loading='loadingTags' @click='refreshTags' />
          <q-btn dense flat no-caps size='sm' color='orange-8' icon='cleaning_services'
            :label="$t('aiTagCleanupUnused')" :disable='loadingTags || unusedCount === 0'
            @click='confirmCleanupUnused' />
        </div>
      </template>

      <div class='text-caption text-grey-6 q-mb-xs'>
        <q-icon name='info' size='14px' class='q-mr-xs' />
        {{ cloudMode ? $t('aiTagModeHintCloud') : $t('aiTagModeHintLocal') }}
      </div>

      <!-- 搜索 + 过滤 -->
      <div class='row items-center q-gutter-sm'>
        <q-input class='col' dense outlined clearable :placeholder="$t('aiTagSearchPlaceholder')"
          :value='searchText' @input='value => { searchText = value }' :disable='loadingTags'>
          <template v-slot:prepend>
            <q-icon name='search' size='18px' />
          </template>
        </q-input>
        <q-btn-toggle
          v-model='filterMode'
          dense no-caps unelevated toggle-color='yellow-9' color='grey-3' text-color='grey-8'
          :options='filterOptions'
        />
      </div>

      <!-- 统计 -->
      <div class='row items-center q-gutter-sm q-mt-xs'>
        <div class='text-caption text-grey-7'>
          {{ $t('aiTagTotalStats', { total: totalCount, used: usedCount, unused: unusedCount }) }}
        </div>
        <q-space />
        <template v-if='selectionMode'>
          <div class='text-caption text-grey-7'>{{ $t('aiTagSelectedCount', { count: selected.length }) }}</div>
          <q-btn dense flat no-caps size='sm' color='negative' icon='delete_sweep'
            :label="$t('aiTagBatchDelete')" :disable='selected.length === 0' @click='confirmBatchDelete' />
          <q-btn dense flat no-caps size='sm' color='grey-7' icon='close'
            :label="$t('aiTagCancelSelection')" @click='exitSelectionMode' />
        </template>
        <template v-else>
          <q-btn dense flat no-caps size='sm' color='grey-7' icon='check_box_outline_blank'
            :label="$t('aiTagBatchDelete')" :disable='tagRows.length === 0' @click='enterSelectionMode' />
        </template>
      </div>

      <q-separator class='q-my-xs' />

      <div v-if='loadingTags' class='row items-center text-grey-6 q-py-md'>
        <q-spinner size='20px' class='q-mr-sm' /><span>{{ $t('aiTagLoading') }}</span>
      </div>
      <div v-else-if='tagRows.length === 0' class='text-center text-grey q-pa-lg ai-tag-empty'>
        <q-icon name='bookmarks' size='2rem' />
        <div class='q-mt-sm'>{{ $t('aiTagEmpty') }}</div>
        <div class='text-caption text-grey-6 q-mt-xs'>{{ $t('aiTagEmptyHint') }}</div>
      </div>
      <div v-else-if='filteredTags.length === 0' class='text-center text-grey q-pa-md'>
        <q-icon name='search_off' size='1.6rem' />
        <div class='q-mt-sm text-caption'>{{ $t('aiTagNoMatch') }}</div>
      </div>
      <div v-else class='ai-tag-list'>
        <div v-for='tag in filteredTags' :key='tag.tagGuid' class='ai-tag-row'>
          <q-checkbox v-if='selectionMode' dense size='sm' color='yellow-9'
            :value='selected.includes(tag.tagGuid)' @input='() => toggleSelect(tag.tagGuid)' />
          <span class='ai-tag-dot' :style='{ backgroundColor: tag.color }' />

          <template v-if='editingId === tag.tagGuid'>
            <q-input class='col' dense outlined autofocus :value='editingName'
              :disable='renaming'
              @input='value => { editingName = value }'
              @keyup.enter='commitRename(tag)'
              @keyup.esc='cancelRename' />
            <q-btn dense flat round size='sm' color='positive' icon='check'
              :loading='renaming' @click='commitRename(tag)' />
            <q-btn dense flat round size='sm' color='grey-7' icon='close'
              :disable='renaming' @click='cancelRename' />
          </template>
          <template v-else>
            <div class='col ellipsis ai-tag-name'>{{ tag.name }}</div>
            <q-badge :color='tag.count > 0 ? "teal" : "grey-6"' outline class='q-mr-xs'>
              {{ $t('aiTagNoteCount', { count: tag.count }) }}
            </q-badge>
            <q-btn dense flat round size='sm' color='yellow-9' icon='edit'
              :disable='renaming' @click='startRename(tag)'>
              <q-tooltip>{{ $t('rename') }}</q-tooltip>
            </q-btn>
            <q-btn dense flat round size='sm' color='negative' icon='delete_outline'
              :disable='renaming' @click='confirmDeleteTag(tag)'>
              <q-tooltip>{{ $t('delete') }}</q-tooltip>
            </q-btn>
          </template>
        </div>
      </div>
    </SettingsSectionContent>
  </div>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import TagService from 'src/services/TagService'
import { pickTagColor, normalizeTagName, splitTagGuids, buildTagsString } from 'src/utils/tagUtil'

const {
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const FILTER_ALL = 'all'
const FILTER_USED = 'used'
const FILTER_UNUSED = 'unused'

export default {
  name: 'SettingsAiTagPanel',
  components: {
    SettingsSectionContent
  },
  props: {
    active: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      loaded: false,
      loadingTags: false,
      searchText: '',
      filterMode: FILTER_ALL,
      localUsage: {},
      editingId: null,
      editingName: '',
      renaming: false,
      selectionMode: false,
      selected: []
    }
  },
  computed: {
    ...mapServerState(['tags', 'tagNotesCount', 'isLogin', 'kbGuid']),
    cloudMode () {
      return Boolean(this.isLogin && this.kbGuid)
    },
    filterOptions () {
      return [
        { label: this.$t('aiTagFilterAll'), value: FILTER_ALL },
        { label: this.$t('aiTagFilterUsed'), value: FILTER_USED },
        { label: this.$t('aiTagFilterUnused'), value: FILTER_UNUSED }
      ]
    },
    /**
     * 标签行：把「当前标签列表」（离线=本地 tags / 登录=云端标签）
     * 与「引用次数」（优先用 vuex 的 tagNotesCount，缺省时用本地笔记统计）合到一起。
     */
    tagRows () {
      const countMap = this.tagNotesCount || {}
      const localUsage = this.localUsage || {}
      const rows = (this.tags || [])
        .filter(tag => tag && tag.tagGuid)
        .map(tag => {
          const guid = tag.tagGuid
          const hasVuexCount = Object.prototype.hasOwnProperty.call(countMap, guid)
          const rawCount = hasVuexCount ? Number(countMap[guid]) : Number(localUsage[guid])
          return {
            tagGuid: guid,
            name: String(tag.name || '').trim(),
            color: tag.color || pickTagColor(tag.name),
            isLocal: String(guid).startsWith('local_tag_'),
            count: Number.isFinite(rawCount) ? rawCount : 0
          }
        })
      return rows.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' })
      })
    },
    filteredTags () {
      const keyword = String(this.searchText || '').trim().toLowerCase()
      return this.tagRows.filter(tag => {
        if (this.filterMode === FILTER_USED && tag.count <= 0) return false
        if (this.filterMode === FILTER_UNUSED && tag.count > 0) return false
        if (!keyword) return true
        return tag.name.toLowerCase().includes(keyword)
      })
    },
    totalCount () {
      return this.tagRows.length
    },
    usedCount () {
      return this.tagRows.filter(tag => tag.count > 0).length
    },
    unusedCount () {
      return this.tagRows.filter(tag => tag.count <= 0).length
    }
  },
  watch: {
    active: {
      immediate: true,
      handler (value) {
        if (value) this.ensureLoaded()
      }
    },
    searchText () {
      this.selected = []
    },
    filterMode () {
      this.selected = []
    }
  },
  methods: {
    ...mapServerActions(['createTag', 'renameTag', 'deleteTag', 'getAllTags']),

    ensureLoaded () {
      if (this.loaded) return
      this.loaded = true
      this.refreshTags()
    },

    async loadLocalUsage () {
      this.localUsage = await TagService.computeLocalTagUsage()
    },

    async refreshTags () {
      this.loadingTags = true
      try {
        await Promise.all([
          // 复用既有 action：离线读本地 tags 表，登录后读云端标签并刷新计数
          this.getAllTags(),
          this.loadLocalUsage()
        ])
      } catch (err) {
        console.error('[SettingsAiTagPanel] refreshTags failed', err)
        this.$q.notify({ message: this.$t('aiTagLoadFailed'), type: 'negative', position: 'top' })
      } finally {
        this.loadingTags = false
        this.editingId = null
        this.editingName = ''
      }
    },

    hasTagName (name, exceptGuid = '') {
      const key = String(name || '').trim().toLowerCase()
      if (!key) return false
      return this.tagRows.some(tag => tag.tagGuid !== exceptGuid && tag.name.toLowerCase() === key)
    },

    openCreateTagDialog () {
      this.$q.dialog({
        title: this.$t('aiTagCreateTitle'),
        prompt: {
          model: '',
          type: 'text',
          outlined: true,
          label: this.$t('aiTagNamePlaceholder'),
          maxlength: 24,
          isValid: value => String(value || '').trim().length > 0
        },
        cancel: { label: this.$t('cancel'), flat: true },
        ok: { label: this.$t('confirm'), color: 'yellow-9', flat: true }
      }).onOk(async value => {
        await this.submitCreateTag(value)
      })
    },

    async submitCreateTag (value) {
      const name = normalizeTagName(value)
      if (!name) {
        this.$q.notify({ message: this.$t('aiTagNameRequired'), type: 'warning', position: 'top' })
        return
      }
      if (this.hasTagName(name)) {
        this.$q.notify({ message: this.$t('tagExisted'), type: 'warning', position: 'top' })
        return
      }
      try {
        // 复用既有 action：离线写本地 tags 表，登录走云端 createTag
        const created = await this.createTag({ name })
        if (!created) {
          this.$q.notify({ message: this.$t('createTagFailed'), type: 'negative', position: 'top' })
          return
        }
        await this.refreshTags()
        this.$q.notify({
          message: this.$t('aiTagCreated', { name }),
          type: 'positive',
          position: 'top'
        })
      } catch (err) {
        console.error('[SettingsAiTagPanel] create tag failed', err)
        this.$q.notify({ message: this.$t('createTagFailed'), type: 'negative', position: 'top' })
      }
    },

    startRename (tag) {
      if (!tag) return
      this.editingId = tag.tagGuid
      this.editingName = tag.name
    },

    cancelRename () {
      this.editingId = null
      this.editingName = ''
    },

    async commitRename (tag) {
      if (!tag || this.renaming) return
      const name = normalizeTagName(this.editingName)
      if (!name) {
        this.$q.notify({ message: this.$t('aiTagNameRequired'), type: 'warning', position: 'top' })
        return
      }
      if (name === tag.name) {
        this.cancelRename()
        return
      }
      if (this.hasTagName(name, tag.tagGuid)) {
        this.$q.notify({ message: this.$t('tagExisted'), type: 'warning', position: 'top' })
        return
      }

      this.renaming = true
      try {
        const result = await this.renameTag({ tagGuid: tag.tagGuid, name })
        if (result && result.success === false) {
          const message = result.code === 'TAG_DUPLICATE_NAME' ? this.$t('tagExisted') : this.$t('aiTagRenameFailed')
          this.$q.notify({ message, type: 'negative', position: 'top' })
          return
        }
        await this.refreshTags()
        this.$q.notify({ message: this.$t('aiTagRenamed'), type: 'positive', position: 'top' })
      } catch (err) {
        console.error('[SettingsAiTagPanel] rename tag failed', err)
        this.$q.notify({ message: this.$t('aiTagRenameFailed'), type: 'negative', position: 'top' })
      } finally {
        this.renaming = false
      }
    },

    confirmDeleteTag (tag) {
      if (!tag) return
      this.$q.dialog({
        title: this.$t('aiTagDelete'),
        message: this.$t('aiTagDeleteConfirm', { name: tag.name, count: tag.count }),
        cancel: { label: this.$t('cancel'), flat: true },
        ok: { label: this.$t('delete'), color: 'negative', flat: true }
      }).onOk(async () => {
        await this.deleteTagAndRefresh([tag])
      })
    },

    confirmBatchDelete () {
      if (this.selected.length === 0) return
      const tags = this.tagRows.filter(tag => this.selected.includes(tag.tagGuid))
      if (tags.length === 0) return
      this.$q.dialog({
        title: this.$t('aiTagBatchDelete'),
        message: this.$t('aiTagBatchDeleteConfirm', { count: tags.length }),
        cancel: { label: this.$t('cancel'), flat: true },
        ok: { label: this.$t('delete'), color: 'negative', flat: true }
      }).onOk(async () => {
        await this.deleteTagAndRefresh(tags)
        this.exitSelectionMode()
      })
    },

    async deleteTagAndRefresh (tags) {
      let deleted = 0
      this.loadingTags = true
      try {
        for (const tag of tags) {
          try {
            const ok = await this.deleteTag({ tagGuid: tag.tagGuid })
            if (ok !== false) {
              deleted += 1
              this.dropGuidFromCurrentNote(tag.tagGuid)
            }
          } catch (err) {
            console.error('[SettingsAiTagPanel] delete tag failed', tag, err)
          }
        }
        await this.refreshTags()
        if (deleted > 0) {
          this.$q.notify({
            message: this.$t('aiTagDeletedCount', { count: deleted }),
            type: 'positive',
            position: 'top'
          })
        } else {
          this.$q.notify({ message: this.$t('aiTagDeleteFailed'), type: 'negative', position: 'top' })
        }
      } finally {
        this.loadingTags = false
      }
    },

    confirmCleanupUnused () {
      const unused = this.tagRows.filter(tag => tag.count <= 0)
      if (unused.length === 0) {
        this.$q.notify({ message: this.$t('aiTagCleanupNone'), type: 'info', position: 'top' })
        return
      }
      this.$q.dialog({
        title: this.$t('aiTagCleanupUnused'),
        message: this.$t('aiTagCleanupConfirm', { count: unused.length }),
        cancel: { label: this.$t('cancel'), flat: true },
        ok: { label: this.$t('aiTagCleanupUnused'), color: 'orange-8', flat: true }
      }).onOk(async () => {
        await this.cleanupUnused(unused)
      })
    },

    async cleanupUnused (unused) {
      this.loadingTags = true
      try {
        if (this.cloudMode) {
          // 云端标签没有本地行，只能逐个调云端删除接口
          for (const tag of unused) {
            try {
              await this.deleteTag({ tagGuid: tag.tagGuid })
            } catch (err) {
              console.error('[SettingsAiTagPanel] delete cloud tag failed', tag, err)
            }
          }
          await this.refreshTags()
          this.$q.notify({
            message: this.$t('aiTagCleanupDone', { count: unused.length }),
            type: 'positive',
            position: 'top'
          })
          return
        }

        // 离线模式：交给主进程一次性清理（同时清 note_tags / notes.tags 里的悬空引用）
        const result = await TagService.cleanupUnusedTags()
        await this.refreshTags()
        if (result && result.success) {
          this.$q.notify({
            message: this.$t('aiTagCleanupDone', { count: (result.removed || []).length }),
            type: 'positive',
            position: 'top'
          })
        } else {
          this.$q.notify({ message: this.$t('aiTagCleanupFailed'), type: 'negative', position: 'top' })
        }
      } catch (err) {
        console.error('[SettingsAiTagPanel] cleanup unused tags failed', err)
        this.$q.notify({ message: this.$t('aiTagCleanupFailed'), type: 'negative', position: 'top' })
      } finally {
        this.loadingTags = false
      }
    },

    enterSelectionMode () {
      this.selectionMode = true
      this.selected = []
    },

    exitSelectionMode () {
      this.selectionMode = false
      this.selected = []
    },

    toggleSelect (tagGuid) {
      const index = this.selected.indexOf(tagGuid)
      if (index >= 0) this.selected.splice(index, 1)
      else this.selected.push(tagGuid)
    },

    /**
     * 标签被永久删除后，同步剥掉 vuex 里当前打开笔记的 info.tags。
     * 否则编辑器下次保存会用内存里的旧 tags 把已删标签写回去（云端还会复活它）。
     */
    dropGuidFromCurrentNote (tagGuid) {
      if (!tagGuid) return
      const serverState = this.$store && this.$store.state && this.$store.state.server
      const current = serverState && serverState.currentNote
      if (!current || !current.info) return
      const guids = splitTagGuids(current.info.tags)
      if (!guids.includes(tagGuid)) return
      const nextTags = buildTagsString(guids.filter(guid => guid !== tagGuid))
      this.$store.commit('server/update_current_note_tags', nextTags)
    }
  }
}
</script>

<style scoped>
.settings-section-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ai-tag-list {
  max-height: 42vh;
  overflow-y: auto;
  padding: 2px 2px 4px 2px;
  scrollbar-width: thin;
}

.ai-tag-list::-webkit-scrollbar {
  width: 6px;
}

.ai-tag-list::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.ai-tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 6px;
  min-height: 34px;
}

.ai-tag-row:hover {
  background: rgba(127, 127, 127, 0.08);
}

.ai-tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ai-tag-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.85rem;
}

.ai-tag-empty {
  border: 1px dashed rgba(127, 127, 127, 0.35);
  border-radius: 8px;
}
</style>
