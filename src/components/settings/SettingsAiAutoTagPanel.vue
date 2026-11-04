<template>
  <div class='settings-ai-auto-tag-panel'>
    <SettingsSectionContent :title="$t('aiAutoTagTitle')" accent-color='yellow-9'>
      <template v-slot:actions>
        <div class='settings-section-actions'>
          <q-btn dense flat no-caps size='sm' color='yellow-9' icon='refresh'
            :label="$t('aiAutoTagRefresh')" :loading='notesLoading'
            :disable='running || applyRunning' @click='refreshCandidates' />
          <q-btn dense flat no-caps size='sm' color='yellow-9' icon='auto_awesome'
            :label="$t('aiAutoTagGenerate')" :loading='running' :disable='!canGenerate' @click='runTagging' />
          <q-btn dense flat no-caps size='sm' color='positive' icon='done_all'
            :label="$t('aiAutoTagApplyAll')" :disable='!hasPending ||
              applyRunning || running' @click='applyAllSuggestions' />
        </div>
      </template>

      <!-- 默认模型状态：复用既有 AI 模型配置，没配好就直接引导去「模型」页 -->
      <div class='ai-auto-tag-model-bar' :class='modelUsable ? "text-positive" : "text-warning"'>
        <q-icon :name='modelUsable ? "check_circle" : "error_outline"' size='16px' class='q-mr-xs' />
        <span v-if='modelUsable'>{{ $t('aiAutoTagModelReady', { model: modelLabel }) }}</span>
        <span v-else>{{ $t('aiAutoTagModelMissing') }}</span>
        <q-btn v-if='!modelUsable' dense flat no-caps size='sm' color='warning'
          icon='settings' :label="$t('aiAutoTagGoConfig')" @click="$emit('switch-sub-tab', 'model')" />
      </div>

      <!-- 参数区 -->
      <div class='row items-center q-gutter-md q-mt-sm'>
        <q-input class='ai-auto-tag-number' dense outlined type='number' min='1' max='8'
          v-model.number='maxTagsPerNote' :label="$t('aiAutoTagMaxTags')"
          :disable='running || applyRunning' />
        <q-input class='ai-auto-tag-number' dense outlined type='number' min='1' max='200'
          v-model.number='runLimit' :label="$t('aiAutoTagRunLimit')"
          :disable='running || applyRunning' />
      </div>
      <div class='text-caption text-grey-6 q-mt-xs'>
        <q-icon name='info' size='14px' class='q-mr-xs' />
        {{ $t('aiAutoTagHint') }}
      </div>

      <!-- 选择 / 统计条 -->
      <div class='row items-center q-gutter-sm q-mt-sm ai-auto-tag-toolbar'>
        <q-checkbox dense size='sm' color='yellow-9' :value='allSelected'
          :label="$t('aiAutoTagSelectAll')" :disable='running || applyRunning || notes.length === 0'
          @input='toggleSelectAll' />
        <div class='text-caption text-grey-7'>
          {{ $t('aiAutoTagSelectedCount', { selected: selectedCount, total: notes.length }) }}
        </div>
        <q-space />
        <div v-if='stats.appliedNotes > 0' class='text-caption text-teal'>
          {{ $t('aiAutoTagStats', { notes: stats.appliedNotes, reused: stats.reused, created: stats.created }) }}
        </div>
        <q-btn v-if='hasAnyResult' dense flat no-caps size='sm' color='grey-7' icon='clear_all'
          :label="$t('aiAutoTagClearResults')" :disable='running || applyRunning' @click='clearSuggestions' />
      </div>

      <!-- 进度 -->
      <div v-if='running' class='q-mt-sm'>
        <q-linear-progress :value='progressRatio' color='yellow-9' track-color='grey-4'
          size='6px' rounded />
        <div class='text-caption text-grey-7 q-mt-xs ellipsis'>
          {{ $t('aiAutoTagProgress', { done: progress.done, total: progress.total, title: currentTitle }) }}
        </div>
      </div>

      <!-- 候选列表 -->
      <div v-if='notesLoading' class='row items-center text-grey-6 q-py-md'>
        <q-spinner size='20px' class='q-mr-sm' /><span>{{ $t('aiAutoTagScanning') }}</span>
      </div>
      <div v-else-if='notes.length === 0' class='text-center text-grey q-pa-lg ai-auto-tag-empty'>
        <q-icon name='sell' size='2rem' />
        <div class='q-mt-sm'>{{ $t('aiAutoTagEmpty') }}</div>
        <div class='text-caption text-grey-6 q-mt-xs'>{{ $t('aiAutoTagEmptyHint') }}</div>
      </div>
      <div v-else class='ai-auto-tag-pager'>
        <!-- 横向单卡分页：一张卡占满一列（100% 宽），左右滚动切换，不做多列换行，
             这样卡片宽高完全一致，不会再出现「被挤宽 / 宽度参差」的错位。 -->
        <div ref='autoTagList' class='ai-auto-tag-list' @scroll.passive='onListScroll' @wheel='onListWheel'>
          <q-card v-for='row in visibleNotes' :key='row.id' flat bordered class='ai-auto-tag-card'>
            <q-card-section class='q-pa-sm'>
              <div class='row items-start no-wrap q-gutter-xs'>
                <q-checkbox dense size='sm' color='yellow-9' :value='row.selected'
                  :disable='running || applyRunning || row.status === "applied"'
                  @input='value => { row.selected = value }' />
                <div class='col ai-auto-tag-card-body'>
                  <div class='row items-center no-wrap q-gutter-xs'>
                    <div class='col text-body2 text-weight-medium ellipsis'>{{ row.title }}</div>
                    <q-badge v-if='row.status !== "idle"' :color='statusColor(row.status)' outline>
                      {{ statusLabel(row.status) }}
                    </q-badge>
                  </div>
                  <div class='text-caption text-grey-6 ellipsis'>{{ formatCategory(row.category) }}</div>
                  <div class='text-caption text-grey-7 ai-auto-tag-preview'>{{ row.preview || '—' }}</div>

                  <!-- 建议标签：可自由增删（回车即新增） -->
                  <div v-if='showSuggestionEditor(row)' class='q-mt-sm'>
                    <q-select :value='row.names' :options='tagSelectOptions'
                      dense outlined multiple use-chips use-input input-debounce='0'
                      class='ai-auto-tag-select' :label="$t('aiAutoTagSuggestion')"
                      :disable='applyRunning'
                      @filter='filterTagOptions'
                      @input='value => onNamesChange(row, value)'
                      @new-value='(value, done) => onNewTagName(row, value, done)'>
                      <template v-slot:no-option>
                        <q-item>
                          <q-item-section class='text-grey-6 text-caption'>
                            {{ $t('aiAutoTagInputHint') }}
                          </q-item-section>
                        </q-item>
                      </template>
                    </q-select>
                    <div v-if='row.reusedNames.length > 0' class='row items-center q-gutter-xs q-mt-xs'>
                      <q-badge v-for='name in row.reusedNames' :key='name' color='teal' outline>
                        {{ name }} · {{ $t('aiAutoTagReusedBadge') }}
                      </q-badge>
                    </div>
                  </div>
                  <div v-if='row.status === "failed" && row.error' class='text-caption text-negative q-mt-xs'>
                    {{ row.error }}
                  </div>
                </div>
                <div class='column q-gutter-xs'>
                  <q-btn v-if='canApplyRow(row)' dense flat no-caps size='sm' color='positive'
                    icon='check' :label="$t('aiAutoTagApply')"
                    :loading='applyRunningId === row.id' :disable='applyRunning'
                    @click='applyRow(row)' />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 分页条：滚轮 / 触摸板横向滑动，也可以点箭头 -->
        <div class='ai-auto-tag-pager-bar'>
          <q-btn dense flat round size='sm' icon='chevron_left' color='yellow-9'
            :disable='activeIndex <= 0' @click='scrollToIndex(activeIndex - 1)'>
            <q-tooltip>{{ $t('aiAutoTagPrev') }}</q-tooltip>
          </q-btn>
          <div class='text-caption text-grey-7 ai-auto-tag-pager-index'>
            {{ $t('aiAutoTagPager', { index: activeIndex + 1, total: visibleNotes.length }) }}
          </div>
          <q-btn dense flat round size='sm' icon='chevron_right' color='yellow-9'
            :disable='activeIndex >= visibleNotes.length - 1' @click='scrollToIndex(activeIndex + 1)'>
            <q-tooltip>{{ $t('aiAutoTagNext') }}</q-tooltip>
          </q-btn>
          <q-space />
          <q-btn v-if='notes.length > visibleLimit' dense flat no-caps size='sm' color='yellow-9'
            icon='expand_more'
            :label="$t('aiAutoTagLoadMore', { count: notes.length - visibleLimit })"
            @click='visibleLimit += PAGE_SIZE' />
        </div>
      </div>
    </SettingsSectionContent>
  </div>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import DatabaseClient from 'src/utils/DatabaseClient'
import AiTagService from 'src/services/AiTagService'
import TagService from 'src/services/TagService'
import {
  normalizeTagName,
  findTagInPool,
  clampNumber,
  MAX_SUGGESTED_TAGS,
  DEFAULT_SUGGESTED_TAGS
} from 'src/utils/tagUtil'

const PAGE_SIZE = 50
const DEFAULT_RUN_LIMIT = 20

const {
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

export default {
  name: 'SettingsAiAutoTagPanel',
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
      PAGE_SIZE,
      loaded: false,
      notesLoading: false,
      notes: [],
      visibleLimit: PAGE_SIZE,
      maxTagsPerNote: DEFAULT_SUGGESTED_TAGS,
      runLimit: DEFAULT_RUN_LIMIT,
      // 打标并发数：推理型模型单篇要 15~30s，串行跑 20 篇太慢；
      // 3 路并发在 deepseek 这类服务上比较安全（失败只影响单篇，可重跑）。
      runConcurrency: 3,
      running: false,
      applyRunning: false,
      applyRunningId: null,
      progress: { done: 0, total: 0 },
      currentTitle: '',
      // 横向分页当前卡片下标（用于「第 i / N 篇」与左右箭头）
      activeIndex: 0,
      modelStatus: { config: null, usable: false, model: '', name: '' },
      tagPool: [],
      // 标签下拉的本地过滤结果（同一时刻只会有一个下拉展开，共享一份即可）
      filteredTagOptions: null,
      stats: { reused: 0, created: 0, appliedNotes: 0 }
    }
  },
  computed: {
    ...mapServerState(['tags', 'isLogin', 'kbGuid']),
    cloudMode () {
      return Boolean(this.isLogin && this.kbGuid)
    },
    modelUsable () {
      return Boolean(this.modelStatus && this.modelStatus.usable)
    },
    modelLabel () {
      const status = this.modelStatus || {}
      return String(status.name || '').trim() || String(status.model || '').trim() || '—'
    },
    tagNameOptions () {
      return (this.tagPool || []).map(tag => tag.name)
    },
    tagSelectOptions () {
      return this.filteredTagOptions === null ? this.tagNameOptions : this.filteredTagOptions
    },
    visibleNotes () {
      return (this.notes || []).slice(0, this.visibleLimit)
    },
    selectedCount () {
      return (this.notes || []).filter(row => row.selected && row.status !== 'applied').length
    },
    allSelected () {
      const rows = (this.notes || []).filter(row => row.status !== 'applied')
      return rows.length > 0 && rows.every(row => row.selected)
    },
    canGenerate () {
      return this.modelUsable && !this.running && !this.applyRunning && this.selectedCount > 0
    },
    progressRatio () {
      const total = this.progress.total || 0
      if (!total) return 0
      return Math.min(this.progress.done / total, 1)
    },
    hasAnyResult () {
      return (this.notes || []).some(row => row.names.length > 0 || row.status === 'applied')
    },
    hasPending () {
      return (this.notes || []).some(row => row.names.length > 0 && row.status !== 'applied')
    }
  },
  watch: {
    active: {
      immediate: true,
      handler (value) {
        if (value) this.ensureLoaded()
      }
    }
  },
  methods: {
    ...mapServerActions(['createTag', 'getAllTags']),

    ensureLoaded () {
      if (this.loaded) return
      this.loaded = true
      this.loadModelStatus()
      this.loadTagPool()
      this.loadCandidates()
    },

    async loadModelStatus () {
      try {
        this.modelStatus = await AiTagService.getDefaultModelStatus()
      } catch (err) {
        console.warn('[SettingsAiAutoTagPanel] loadModelStatus failed', err)
        this.modelStatus = { config: null, usable: false, model: '', name: '' }
      }
    },

    async loadTagPool () {
      try {
        const { pool } = await TagService.loadTagPool({
          cloudTags: this.cloudMode ? (this.tags || []) : [],
          // 登录态只用云端标签：本地 tags 行的 tagGuid 是 `local_tag_<id>`，
          // 一旦写进 notes.tags 会被同步当成真正的 tagGuid 推到云端（脏数据）。
          includeLocalTags: !this.cloudMode
        })
        this.tagPool = pool
      } catch (err) {
        console.warn('[SettingsAiAutoTagPanel] loadTagPool failed', err)
        this.tagPool = []
      }
      this.filteredTagOptions = null
    },

    async loadCandidates () {
      this.notesLoading = true
      try {
        const notes = await TagService.fetchUntaggedNotes()
        this.notes = notes.map(note => ({
          ...note,
          selected: true,
          names: [],
          reusedNames: [],
          status: 'idle',
          error: ''
        }))
        this.visibleLimit = PAGE_SIZE
        this.$nextTick(() => this.resetListScroll())
      } catch (err) {
        console.error('[SettingsAiAutoTagPanel] loadCandidates failed', err)
        this.notes = []
        this.notifyError(err)
      } finally {
        this.notesLoading = false
      }
    },

    async refreshCandidates () {
      this.stats = { reused: 0, created: 0, appliedNotes: 0 }
      await this.loadModelStatus()
      await this.loadTagPool()
      await this.loadCandidates()
    },

    getMaxTags () {
      return clampNumber(this.maxTagsPerNote, 1, MAX_SUGGESTED_TAGS, DEFAULT_SUGGESTED_TAGS)
    },

    getRunLimit () {
      return clampNumber(this.runLimit, 1, 200, DEFAULT_RUN_LIMIT)
    },

    toggleSelectAll (value) {
      for (const row of (this.notes || [])) {
        if (row.status === 'applied') continue
        row.selected = Boolean(value)
      }
    },

    statusColor (status) {
      if (status === 'applied') return 'teal'
      if (status === 'ready') return 'positive'
      if (status === 'running') return 'yellow-9'
      if (status === 'failed') return 'negative'
      return 'grey-6'
    },

    statusLabel (status) {
      if (status === 'applied') return this.$t('aiAutoTagStatusApplied')
      if (status === 'ready') return this.$t('aiAutoTagStatusReady')
      if (status === 'running') return this.$t('aiAutoTagStatusRunning')
      if (status === 'failed') return this.$t('aiAutoTagStatusFailed')
      return this.$t('aiAutoTagStatusIdle')
    },

    showSuggestionEditor (row) {
      return Boolean(row) && (row.status === 'ready' || (row.status === 'failed' && row.names.length > 0) || row.status === 'applied')
    },

    canApplyRow (row) {
      return Boolean(row) && row.status !== 'applied' && row.names.length > 0 && !this.applyRunning
    },

    formatCategory (category) {
      const value = String(category || '').trim()
      if (!value || value === '/') return this.$t('aiAutoTagRootCategory')
      return value
    },

    sanitizeNames (names) {
      const limit = this.getMaxTags()
      const result = []
      const seen = new Set()
      for (const raw of (names || [])) {
        const name = normalizeTagName(raw)
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(name)
        if (result.length >= limit) break
      }
      return result
    },

    onNamesChange (row, value) {
      const nextNames = this.sanitizeNames(Array.isArray(value) ? value : [value])
      row.names = nextNames
      row.reusedNames = nextNames.filter(name => Boolean(findTagInPool(this.tagPool, name)))
      if (row.status === 'failed') row.error = ''
    },

    filterTagOptions (val, update) {
      update(() => {
        const keyword = String(val || '').trim().toLowerCase()
        this.filteredTagOptions = keyword
          ? this.tagNameOptions.filter(name => String(name).toLowerCase().includes(keyword))
          : null
      })
    },

    // ---------- 横向分页（一列一张卡） ----------
    getListEl () {
      const el = this.$refs.autoTagList
      return el && el.nodeType === 1 ? el : null
    },

    // 每张卡相对第一张卡的横向偏移（直接用 offsetLeft，天然兼容 column-gap）
    getCardOffsets (el) {
      const cards = el && el.children ? Array.from(el.children) : []
      if (!cards.length) return []
      const base = cards[0].offsetLeft
      return cards.map(card => Math.max(0, card.offsetLeft - base))
    },

    onListScroll () {
      const el = this.getListEl()
      if (!el) return
      const offsets = this.getCardOffsets(el)
      if (!offsets.length) return
      const left = el.scrollLeft
      let nearest = 0
      let best = Infinity
      offsets.forEach((offset, index) => {
        const distance = Math.abs(offset - left)
        if (distance < best) {
          best = distance
          nearest = index
        }
      })
      if (this.activeIndex !== nearest) this.activeIndex = nearest
    },

    /**
     * 桌面端主要用滚轮：把纵向滚动转成横向翻页。
     * 只在卡片条还能继续翻的时候拦截，翻到头就放行，避免卡住设置面板本身的纵向滚动。
     */
    onListWheel (event) {
      const el = this.getListEl()
      if (!el) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      const atStart = el.scrollLeft <= 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      if ((delta > 0 && atEnd) || (delta < 0 && atStart)) return
      event.preventDefault()
      el.scrollLeft += delta
    },

    scrollToIndex (index) {
      const el = this.getListEl()
      const max = Math.max((this.visibleNotes || []).length - 1, 0)
      const target = Math.min(Math.max(Number(index) || 0, 0), max)
      this.activeIndex = target
      if (!el) return
      const offsets = this.getCardOffsets(el)
      if (!offsets.length) return
      const left = offsets[Math.min(target, offsets.length - 1)] || 0
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ left, behavior: 'smooth' })
      } else {
        el.scrollLeft = left
      }
    },

    resetListScroll () {
      const el = this.getListEl()
      if (el) el.scrollLeft = 0
      this.activeIndex = 0
    },

    onNewTagName (row, value, done) {
      const name = normalizeTagName(value)
      if (!name) {
        if (typeof done === 'function') done()
        return
      }
      if (row.names.length >= this.getMaxTags()) {
        this.$q.notify({
          message: this.$t('aiAutoTagMaxTagsReached', { count: this.getMaxTags() }),
          type: 'warning',
          position: 'top'
        })
        if (typeof done === 'function') done()
        return
      }
      if (typeof done === 'function') done(name, 'add-unique')
    },

    describeError (error) {
      const code = error && error.code
      if (code === 'AI_TAG_NO_DEFAULT_CONFIG') return this.$t('aiAutoTagNoConfig')
      if (code === 'AI_TAG_CONFIG_INCOMPLETE') return this.$t('aiAutoTagConfigIncomplete')
      if (code === 'AI_TAG_EMPTY_INPUT') return this.$t('aiAutoTagEmptyNote')
      if (code === 'NOTE_NOT_FOUND') return this.$t('aiAutoTagNoteNotFound')
      return (error && error.message) || this.$t('aiAutoTagGenerateFailed')
    },

    notifyError (error) {
      this.$q.notify({
        message: this.describeError(error),
        type: 'negative',
        position: 'top'
      })
    },

    async runTagging () {
      if (this.running || this.applyRunning) return
      if (!this.modelUsable) {
        this.$q.notify({ message: this.$t('aiAutoTagNoConfig'), type: 'warning', position: 'top' })
        return
      }

      const limit = this.getRunLimit()
      const batch = (this.notes || [])
        .filter(row => row.selected && row.status !== 'applied' && row.status !== 'running')
        .slice(0, limit)
      if (batch.length === 0) {
        this.$q.notify({ message: this.$t('aiAutoTagNothingSelected'), type: 'warning', position: 'top' })
        return
      }

      await this.loadTagPool()

      this.running = true
      this.progress = { done: 0, total: batch.length }
      let readyCount = 0
      let failedCount = 0
      let cursor = 0

      // 单篇打标 = 一次完整 chat 请求（推理型模型 15~30s），串行会让 20 篇跑十几分钟，
      // 这里用固定并发数的 worker 池；失败只影响单篇，进度按篇累加。
      const processOne = async (row) => {
        row.status = 'running'
        this.currentTitle = row.title
        try {
          const detail = await DatabaseClient.notes.getById(row.id)
          const result = await AiTagService.suggestTags({
            title: row.title,
            content: (detail && detail.content) || row.preview,
            existingTagNames: this.tagNameOptions,
            maxTags: this.getMaxTags()
          })
          const names = this.sanitizeNames(result.names)
          if (names.length === 0) {
            row.status = 'failed'
            // 被 max_tokens 截断（推理型模型常见）和「模型确实没给出标签」要分开提示
            row.error = result && result.truncated
              ? this.$t('aiAutoTagTruncated')
              : this.$t('aiAutoTagNoResult')
            failedCount++
          } else {
            row.names = names
            row.reusedNames = names.filter(name => Boolean(findTagInPool(this.tagPool, name)))
            row.status = 'ready'
            row.error = ''
            readyCount++
          }
        } catch (err) {
          console.error('[SettingsAiAutoTagPanel] suggest tags failed', err)
          row.status = 'failed'
          row.error = this.describeError(err)
          failedCount++
        }
        this.progress.done += 1
      }

      const worker = async () => {
        while (cursor < batch.length) {
          // 组件被销毁（切换一级 tab）后停止后续请求，避免无意义的 token 消耗
          if (this._isDestroyed) return
          await processOne(batch[cursor++])
        }
      }

      try {
        const workerCount = Math.max(1, Math.min(Number(this.runConcurrency) || 1, batch.length))
        await Promise.all(Array.from({ length: workerCount }, () => worker()))
      } finally {
        this.running = false
        this.currentTitle = ''
      }

      if (!this._isDestroyed) {
        this.$q.notify({
          message: this.$t('aiAutoTagRunDone', { ready: readyCount, failed: failedCount }),
          type: failedCount > 0 && readyCount === 0 ? 'warning' : 'positive',
          position: 'top'
        })
      }
    },

    async applyRow (row, { silent = false } = {}) {
      if (!row || this.applyRunning) return false
      const names = this.sanitizeNames(row.names)
      if (names.length === 0) {
        if (!silent) {
          this.$q.notify({ message: this.$t('aiAutoTagNoResult'), type: 'warning', position: 'top' })
        }
        return false
      }

      this.applyRunning = true
      this.applyRunningId = row.id
      try {
        const { refs, reused, created } = await TagService.resolveTagRefs({
          names,
          pool: this.tagPool,
          createTag: name => this.createTag({ name })
        })
        if (refs.length === 0) {
          row.status = 'failed'
          row.error = this.$t('aiAutoTagApplyFailed')
          return false
        }

        const applied = await TagService.applyTagsToNote({ noteId: row.id, tagRefs: refs })
        row.status = 'applied'
        row.reusedNames = reused
        row.error = ''
        this.stats.reused += reused.length
        this.stats.created += created.length
        this.stats.appliedNotes += 1
        this.syncCurrentNoteTags(row.docGuid, applied && applied.note ? applied.note.tags : '')
        this.refreshSidebarTags()
        if (!silent) {
          this.$q.notify({
            message: this.$t('aiAutoTagAppliedOne', { title: row.title, count: refs.length }),
            type: 'positive',
            position: 'top'
          })
        }
        return true
      } catch (err) {
        console.error('[SettingsAiAutoTagPanel] apply tags failed', err)
        row.status = 'failed'
        row.error = this.describeError(err)
        if (!silent) {
          this.$q.notify({ message: this.describeError(err), type: 'negative', position: 'top' })
        }
        return false
      } finally {
        this.applyRunning = false
        this.applyRunningId = null
      }
    },

    async applyAllSuggestions () {
      if (this.applyRunning || this.running) return
      const rows = (this.notes || []).filter(row =>
        row.names.length > 0 && row.status !== 'applied' && row.status !== 'running'
      )
      if (rows.length === 0) return

      const beforeReused = this.stats.reused
      const beforeCreated = this.stats.created
      let appliedCount = 0
      for (const row of rows) {
        if (this._isDestroyed) break
        const ok = await this.applyRow(row, { silent: true })
        if (ok) appliedCount += 1
      }

      const reused = this.stats.reused - beforeReused
      const created = this.stats.created - beforeCreated
      this.$q.notify({
        message: this.$t('aiAutoTagAppliedAll', { count: appliedCount, reused, created }),
        type: appliedCount > 0 ? 'positive' : 'warning',
        position: 'top'
      })
    },

    clearSuggestions () {
      for (const row of (this.notes || [])) {
        row.names = []
        row.reusedNames = []
        row.error = ''
        if (row.status !== 'applied') row.status = 'idle'
      }
    },

    refreshSidebarTags () {
      // 让左侧标签树 / 标签计数立即反映新标签（复用既有 action）
      Promise.resolve(this.getAllTags()).catch(err => {
        console.warn('[SettingsAiAutoTagPanel] getAllTags failed', err)
      })
    },

    /**
     * 如果被打标的正好是编辑器里打开的那篇笔记，同步 vuex 里的 info.tags。
     * 否则用户之后在编辑器里保存这篇笔记时，会用内存里的旧 tags 覆盖掉刚打的标。
     */
    syncCurrentNoteTags (docGuid, tags) {
      if (!docGuid || !tags) return
      const serverState = this.$store && this.$store.state && this.$store.state.server
      const currentGuid = serverState && serverState.currentNote && serverState.currentNote.info
        ? serverState.currentNote.info.docGuid
        : ''
      if (!currentGuid || currentGuid !== docGuid) return
      this.$store.commit('server/update_current_note_tags', tags)
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

.ai-auto-tag-model-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 0.75rem;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.08);
}

.ai-auto-tag-number {
  width: 9.5rem;
}

.ai-auto-tag-toolbar {
  border-top: 1px dashed rgba(127, 127, 127, 0.25);
  padding-top: 6px;
}

/* ---------- 横向单卡分页 ---------- */
/* 一列一张卡：卡片宽度固定为容器宽度的 100%，绝不参与多列换行，
   也就不可能出现「被内容撑宽 / 宽度参差 / 高度参差」的错位。 */
.ai-auto-tag-list {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  column-gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding: 2px 0 4px 0;
  min-height: 92px;
  scrollbar-width: thin;
}

.ai-auto-tag-list::-webkit-scrollbar {
  height: 6px;
}

.ai-auto-tag-list::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.ai-auto-tag-list::-webkit-scrollbar-track {
  background: transparent;
}

.ai-auto-tag-card {
  flex: 0 0 100%;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  border-radius: 8px;
}

/* 卡片内部必须能收缩，否则长标题 / 多个标签 chip 会把卡片顶出可视宽度 */
.ai-auto-tag-card ::v-deep(.q-card__section) {
  min-width: 0;
}

.ai-auto-tag-card-body {
  min-width: 0;
}

.ai-auto-tag-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
  margin-top: 2px;
}

.ai-auto-tag-select {
  min-width: 0;
  max-width: 100%;
}

.ai-auto-tag-select ::v-deep(.q-field__inner),
.ai-auto-tag-select ::v-deep(.q-field__control),
.ai-auto-tag-select ::v-deep(.q-field__native) {
  min-width: 0;
}

.ai-auto-tag-select ::v-deep(.q-chip) {
  margin: 1px 3px 1px 0;
  max-width: 100%;
}

.ai-auto-tag-pager-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 4px;
}

.ai-auto-tag-pager-index {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ai-auto-tag-empty {
  border: 1px dashed rgba(127, 127, 127, 0.35);
  border-radius: 8px;
}
</style>
