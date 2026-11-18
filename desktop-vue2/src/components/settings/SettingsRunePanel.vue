<template>
  <div class='settings-rune-panel-layout'>
    <CategoryTabs
      v-model='category'
      :tabs='categoryOptions'
      color-theme='purple'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-rune-panel'>
      <SettingsSectionContent :title='currentCategoryLabel' accent-color='purple-7'>
        <template v-slot:actions>
          <div class='settings-section-actions'>
            <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("runeCardAdd")' icon='add' color='purple-7' size='sm' @click='$emit("add-rune", category)' />
            <template v-else>
              <q-btn dense flat no-caps :label='$t("cancelBatchDelete")' icon='close' color='grey-6' size='sm' @click='exitSelectionMode' />
              <q-btn dense flat no-caps :label="$t('selectedCount', { count: selected.length })" icon='delete_sweep' color='negative' size='sm' :disable='selected.length === 0' @click='$emit("batch-delete", getSelectedRunes())' />
            </template>
            <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("runeBatchImport")' icon='file_upload' color='purple-7' size='sm' @click='onBatchImport' />
            <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("runeBatchExport")' icon='file_download' color='purple-7' size='sm' :disable='localRunesInCategory.length === 0' @click='onExportCurrentCategory' />
            <q-btn v-if='!selectionMode' dense flat no-caps :label='$t("batchDelete")' icon='delete_sweep' color='negative' size='sm' @click='enterSelectionMode' />
          </div>
        </template>
        <div class='text-caption text-grey-6 q-mb-sm'>
          <q-icon name='drag_indicator' size='xs' /> {{ $t('runeDragTip') }}
        </div>
        <div class='rune-grid'>
          <div
            v-for='(rune, index) in localRunesInCategory'
            :key='rune.id'
            draggable='true'
            class='rune-card-wrapper'
            @dragstart='onDragStart($event, index)'
            @dragover.prevent='onDragOver($event, index)'
            @drop='onDrop($event, index)'
            @dragend='onDragEnd($event)'
          >
            <runeCard
              class='rune-card-item'
              :rune='rune'
              :selectable='true'
              :selection-mode='selectionMode'
              :selected='selected.includes(rune.id)'
              :disable-drag='selectionMode'
              @edit='$emit("edit-rune", rune)'
              @delete='$emit("delete-rune", rune)'
              @toggle-select='toggleSelect(rune.id)'
            />
          </div>
        </div>
        <div v-if='!localRunesInCategory || localRunesInCategory.length === 0' class='text-center text-grey q-pa-xl'>
          <q-icon name='star' size='3rem' />
          <div class='q-mt-sm'>{{ $t('runeCardAdd') }}</div>
        </div>
      </SettingsSectionContent>
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import runeCard from 'components/rune/runeCard'
import { RuneCategoryEnum } from 'src/utils/enum'

const resolveRuneCategory = (raw) => RuneCategoryEnum.has(raw) ? raw : RuneCategoryEnum.General

// 兼容两种字段名：category（导出格式）和 category_key（数据库字段）
const resolveRuneCategoryFromRune = (rune) => {
  if (!rune) return RuneCategoryEnum.General
  return resolveRuneCategory(rune.category || rune.category_key)
}

export default {
  name: 'SettingsRunePanel',
  components: {
    CategoryTabs,
    SettingsSectionContent,
    runeCard
  },
  props: {
    runeCards: {
      type: Array,
      required: true
    }
  },
  data () {
    return {
      category: RuneCategoryEnum.General,
      selected: [],
      selectionMode: false,
      dragFromIndex: null
    }
  },
  computed: {
    categoryOptions () {
      const opts = RuneCategoryEnum.items.map((c) => ({
        value: c.value,
        label: c.label,
        count: (this.runeCards || []).filter(r => resolveRuneCategoryFromRune(r) === c.value).length
      }))
      return opts.sort((a, b) => {
        if (a.value === RuneCategoryEnum.General) return -1
        if (b.value === RuneCategoryEnum.General) return 1
        return b.count - a.count
      })
    },
    localRunesInCategory () {
      const target = this.category
      return (this.runeCards || []).filter(r => resolveRuneCategoryFromRune(r) === target)
    },
    currentCategoryLabel () {
      return RuneCategoryEnum.label(this.category)
    }
  },
  watch: {
    category () {
      this.selected = []
      this.selectionMode = false
    }
  },
  methods: {
    getSelectedRunes () {
      const cards = this.runeCards || []
      return this.selected.map(id => cards.find(r => r && r.id === id)).filter(Boolean)
    },
    onExportCurrentCategory () {
      this.$emit('export-current-category', this.localRunesInCategory)
    },
    onBatchImport () {
      this.$emit('batch-import', this.category)
    },
    enterSelectionMode () {
      this.selectionMode = true
    },
    exitSelectionMode () {
      this.selectionMode = false
      this.selected = []
    },
    toggleSelect (runeId) {
      const idx = this.selected.indexOf(runeId)
      if (idx >= 0) {
        this.selected.splice(idx, 1)
      } else {
        this.selected.push(runeId)
      }
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
      const visible = this.localRunesInCategory || []
      const moved = visible[fromIndex]
      if (!moved) return
      if (moved === visible[toIndex]) return
      const allCards = [...this.runeCards]
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
      this.$emit('update-rune-cards', allCards)
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
.settings-rune-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-rune-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-rune-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-rune-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-rune-panel::-webkit-scrollbar-track {
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
  box-shadow: 0 0 0 3px #7E57C2;
  transform: translateY(-2px);
}
</style>
