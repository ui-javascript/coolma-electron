<template>
  <div class='settings-echo-panel-layout'>
    <CategoryTabs
      v-model='category'
      :tabs='categoryOptions'
      color-theme='blue'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-echo-panel'>
      <SettingsSectionContent :title='currentCategoryLabel' accent-color='blue-7'>
        <template v-slot:actions>
          <div class='settings-section-actions'>
            <template v-if='!isCurrentCategoryBuiltin'>
              <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("echoCardAdd")' icon='add' color='blue-7' size='sm' @click='$emit("add-echo")' />
              <template v-else>
                <q-btn dense flat no-caps :label='$t("cancelBatchDelete")' icon='close' color='grey-6' size='sm' @click='exitSelectionMode' />
                <q-btn dense flat no-caps :label="$t('selectedCount', { count: selected.length })" icon='delete_sweep' color='negative' size='sm' :disable='selected.length === 0' @click='$emit("batch-delete", [...selected])' />
              </template>
              <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("echoBatchImport")' icon='file_upload' color='blue-7' size='sm' @click='onBatchImport' />
              <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("echoBatchExport")' icon='file_download' color='blue-7' size='sm' :disable='localEchoesInCategory.length === 0' @click='onExportCurrentCategory' />
              <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("batchDelete")' icon='delete_sweep' color='negative' size='sm' @click='enterSelectionMode' />
            </template>
          </div>
        </template>
        <div v-if='isCurrentCategoryBuiltin && isProd' class='text-caption text-grey-6 q-mb-sm'>
          <q-icon name='info' size='xs' /> {{ $t('echoBuiltinCategoryHint') }}
        </div>
        <div v-else-if='!isCurrentCategoryBuiltin' class='text-caption text-grey-6 q-mb-sm'>
          <q-icon name='drag_indicator' size='xs' /> {{ $t('echoDragTip') }}
        </div>
        <div class='rune-grid'>
          <div
            v-for='(echo, index) in sortedEchoes'
            :key='echo.id'
            :draggable='!echo.isBuiltin'
            class='rune-card-wrapper echo-card-wrapper'
            :class='{"echo-card-wrapper--builtin": echo.isBuiltin}'
            @dragstart='onDragStart($event, index)'
            @dragover.prevent='onDragOver($event, index)'
            @drop='onDrop($event, index)'
            @dragend='onDragEnd($event)'
          >
            <runeCard
              class='rune-card-item'
              :rune='echo'
              :selectable='!echo.isBuiltin'
              :selection-mode='selectionMode'
              :selected='selected.includes(echo.id)'
              :name-label='$t("echoCardName")'
              :desc-label='$t("echoCardDesc")'
              :edit-label='$t("echoCardEdit")'
              :delete-label='$t("echoCardDelete")'
              :disable-delete='echo.isBuiltin'
              :disable-drag='echo.isBuiltin || selectionMode'
              :is-builtin='echo.isBuiltin'
              :view-only='echo.isBuiltin && isProd'
              :i18n-desc-key='echoI18nDescKey(echo)'
              @edit='$emit("edit-echo", echo)'
              @delete='$emit("delete-echo", echo)'
              @toggle-select='toggleSelect(echo.id)'
            />
          </div>
        </div>
        <div v-if='!sortedEchoes || sortedEchoes.length === 0' class='text-center text-grey q-pa-xl'>
          <q-icon name='graphic_eq' size='3rem' />
          <div class='q-mt-sm'>{{ $t('echoCardAdd') }}</div>
        </div>
      </SettingsSectionContent>
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import runeCard from 'components/rune/runeCard'
import { EchoCategoryEnum } from 'src/utils/enum'
import { normalizeEchoCategory } from 'src/utils/const/runeEchoCategoryLogic'

export default {
  name: 'SettingsEchoPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent,
    runeCard
  },
  props: {
    echoCards: {
      type: Array,
      required: true
    }
  },
  data () {
    return {
      category: EchoCategoryEnum.Marker,
      selected: [],
      selectionMode: false,
      dragFromIndex: null
    }
  },
  computed: {
    isProd () {
      return process.env.PROD === true
    },
    categoryOptions () {
      const opts = EchoCategoryEnum.items.map((c) => ({
        value: c.value,
        label: c.label,
        count: (this.echoCards || []).filter(e => {
          const cat = normalizeEchoCategory(e && e.category, Boolean(e && e.isBuiltin), e && e.category)
          return cat === c.value
        }).length
      }))
      return opts.sort((a, b) => {
        if (a.value === EchoCategoryEnum.Builtin) return -1
        if (b.value === EchoCategoryEnum.Builtin) return 1
        return b.count - a.count
      })
    },
    localEchoesInCategory () {
      const target = this.category
      return (this.echoCards || []).filter(e => {
        const cat = normalizeEchoCategory(e && e.category, Boolean(e && e.isBuiltin), e && e.category)
        return cat === target
      })
    },
    sortedEchoes () {
      if (this.category === EchoCategoryEnum.Builtin) {
        return [...this.localEchoesInCategory].sort((a, b) => {
          if (Boolean(a.isBuiltin) === Boolean(b.isBuiltin)) return 0
          return a.isBuiltin ? -1 : 1
        })
      }
      return this.localEchoesInCategory
    },
    currentCategoryLabel () {
      return EchoCategoryEnum.label(this.category)
    },
    isCurrentCategoryBuiltin () {
      return this.category === EchoCategoryEnum.Builtin
    }
  },
  watch: {
    category () {
      this.selected = []
      this.selectionMode = false
    }
  },
  methods: {
    onBatchImport () {
      this.$emit('batch-import', this.category)
    },
    onExportCurrentCategory () {
      this.$emit('export-current-category', this.localEchoesInCategory)
    },
    enterSelectionMode () {
      this.selectionMode = true
    },
    exitSelectionMode () {
      this.selectionMode = false
      this.selected = []
    },
    toggleSelect (echoId) {
      const idx = this.selected.indexOf(echoId)
      if (idx >= 0) {
        this.selected.splice(idx, 1)
      } else {
        this.selected.push(echoId)
      }
    },
    echoI18nDescKey (echo = {}) {
      if (!echo || !echo.isBuiltin || !echo.id) return ''
      const idMap = {
        '__builtin_nice__': 'echoBuiltinNiceDesc',
        '__builtin_growth__': 'echoBuiltinGrowthDesc',
        '__builtin_shatter__': 'echoBuiltinShatterDesc',
        '__builtin_skywalk__': 'echoBuiltinSkywalkDesc',
        '__builtin_twinbloom__': 'echoBuiltinTwinbloomDesc',
        '__builtin_mindsteal__': 'echoBuiltinMindstealDesc',
        '__builtin_lucky__': 'echoBuiltinLuckyDesc',
        '__builtin_scapegoat__': 'echoBuiltinScapegoatDesc',
        '__builtin_calamity__': 'echoBuiltinCalamityDesc',
        '__builtin_disperse__': 'echoBuiltinDisperseDesc'
      }
      return idMap[String(echo.id)] || ''
    },
    onDragStart (e, index) {
      this.dragFromIndex = index
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', index)
      e.target.closest('.rune-card-wrapper').classList.add('rune-dragging')
    },
    onDragOver (e, index) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper && this.dragFromIndex !== index) {
        document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
        wrapper.classList.add('rune-dragover')
      }
    },
    onDrop (e, toIndex) {
      e.preventDefault()
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      const fromIndex = this.dragFromIndex
      if (fromIndex === null || fromIndex === toIndex) return
      const visible = this.sortedEchoes || []
      const moved = visible[fromIndex]
      if (!moved || moved.isBuiltin) return
      if (moved === visible[toIndex]) return
      const allCards = [...this.echoCards]
      const oldGlobalIdx = allCards.findIndex(item => item.id === moved.id)
      if (oldGlobalIdx < 0) return
      allCards.splice(oldGlobalIdx, 1)
      let insertAt = allCards.length
      if (toIndex > 0) {
        const prevVisible = visible[toIndex - 1]
        if (prevVisible && prevVisible.id !== moved.id) {
          const prevGlobalIdx = allCards.findIndex(item => item.id === prevVisible.id)
          if (prevGlobalIdx >= 0) insertAt = prevGlobalIdx + 1
        }
      } else {
        const nextVisible = visible[toIndex]
        if (nextVisible && nextVisible.id !== moved.id) {
          const nextGlobalIdx = allCards.findIndex(item => item.id === nextVisible.id)
          if (nextGlobalIdx >= 0) insertAt = nextGlobalIdx
        }
      }
      allCards.splice(insertAt, 0, moved)
      this.$emit('update-echo-cards', allCards)
    },
    onDragEnd (e) {
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper) {
        wrapper.classList.remove('rune-dragging')
      }
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      this.dragFromIndex = null
    }
  }
}
</script>

<style scoped>
.settings-echo-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-echo-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-echo-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-echo-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-echo-panel::-webkit-scrollbar-track {
  background: transparent;
}

.settings-dialog-sep {
  flex-shrink: 0;
}

.settings-section-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rune-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 132px);
  justify-content: space-around;
  gap: 8px;
  padding: 4px 2px;
  min-height: 80px;
  align-items: stretch;
}

.rune-card-wrapper {
  display: flex;
  width: 132px;
  min-width: 132px;
  max-width: 132px;
}

.rune-card-item {
  width: 100%;
}

.rune-card-wrapper.rune-dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

.rune-card-wrapper.rune-dragover .rune-card {
  box-shadow: 0 0 0 3px #00ACC1;
  transform: translateY(-2px);
}

.echo-card-wrapper--builtin {
  opacity: 0.85;
}
</style>
