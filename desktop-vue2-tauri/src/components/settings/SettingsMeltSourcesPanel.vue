<template>
  <div class='settings-melt-panel'>
    <SettingsSectionContent :title='$t("remoteComps")' accent-color='deep-orange-7'>
      <template v-slot:actions>
        <q-btn dense flat no-caps icon='add' :label='$t("remoteCompsAdd")' color='deep-orange-7' size='sm' @click='addSource' />
      </template>

      <div class='text-caption text-grey-7 q-mb-sm melt-hint'>
        {{ $t('remoteCompsHint') }}
      </div>
      <div class='text-caption text-grey-7 q-mb-sm melt-hint'>
        {{ $t('remoteCompsCorsHint') }}
      </div>

      <div v-if='decorated.length === 0' class='text-center text-grey q-pa-lg'>
        <q-icon name='extension' size='2.5rem' />
        <div class='q-mt-sm'>{{ $t('remoteCompEmpty') }}</div>
      </div>

      <q-card v-for='(item, index) in decorated' :key='item.row.key' flat bordered class='melt-card q-mb-sm'>
        <q-card-section class='q-py-sm'>
          <div class='row items-center q-gutter-xs no-wrap'>
            <q-input
              v-model='item.row.name'
              dense outlined
              class='col'
              :label='$t("remoteCompName")'
              placeholder='@melt-js/comps-vue2-meme'
              @change='persist'
            />
            <q-select
              v-model='item.row.type'
              dense outlined
              emit-value map-options
              class='melt-type-select'
              :label='$t("remoteCompType")'
              :options='typeOptions'
              @input='onTypeChange(item.row)'
            />
            <q-toggle v-model='item.row.enabled' dense size='sm' :label='$t("remoteCompEnabled")' @input='persist' />
            <q-btn dense flat round size='sm' icon='arrow_upward' :disable='index === 0' @click='move(index, -1)' />
            <q-btn dense flat round size='sm' icon='arrow_downward' :disable='index === decorated.length - 1' @click='move(index, 1)' />
            <q-btn dense flat round size='sm' icon='delete_outline' color='negative' @click='removeSource(index)' />
          </div>

          <div class='row items-center q-gutter-xs q-mt-xs no-wrap'>
            <q-input
              v-model='item.row.base'
              dense outlined
              class='col'
              :disable='item.row.type === "unpkg"'
              :label='$t("remoteCompBase")'
              :hint='baseHintFor(item.row)'
              placeholder='http://82.156.212.243'
              @change='persist'
            />
            <q-input
              v-model='item.row.version'
              dense outlined
              class='melt-version-input'
              :disable='item.row.type !== "unpkg"'
              :label='$t("remoteCompVersion")'
              :hint='item.row.type !== "unpkg" ? $t("remoteCompNoVersion") : $t("remoteCompVersionHint")'
              @change='persist'
            />
            <q-input
              v-model='item.row.distDir'
              dense outlined
              class='melt-dist-input'
              :label='$t("remoteCompDistDir")'
              :hint='$t("remoteCompDistDirHint")'
              @change='persist'
            />
          </div>

          <div class='melt-preview q-mt-xs'>
            <q-icon name='link' size='xs' />
            <span class='melt-preview__label'>{{ $t('remoteCompPreview') }}：</span>
            <span class='melt-preview__url' :class='{ "melt-preview__url--empty": !item.url }'>{{ item.url || $t('remoteCompInvalidHint') }}</span>
          </div>
          <div v-if='item.overridden' class='melt-warn'>
            <q-icon name='warning' size='xs' /> {{ $t('remoteCompOverridden') }}
          </div>
          <div v-if='item.warnings.length' class='melt-warn'>
            <q-icon name='info' size='xs' /> {{ item.warnings.join('；') }}
          </div>
        </q-card-section>
      </q-card>
    </SettingsSectionContent>
  </div>
</template>

<script>
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import {
  MELT_SOURCE_TYPES,
  MELT_SOURCE_TYPE_OPTIONS,
  buildSourceEntryUrl,
  createEmptyRuneSource,
  loadRuneSources,
  normalizeRuneSource,
  saveRuneSources
} from 'libs-muya-vue2/lib/rune/runeSourceRegistry'

let rowSeed = 0

function toRow (source) {
  const normalized = normalizeRuneSource(source)
  return {
    key: `melt-source-${rowSeed++}`,
    ...normalized
  }
}

export default {
  name: 'SettingsMeltSourcesPanel',
  components: { SettingsSectionContent },
  computed: {
    typeOptions () {
      return MELT_SOURCE_TYPE_OPTIONS.map(item => ({ value: item.value, label: this.$t(`remoteCompType_${item.value}`) }))
    },
    decorated () {
      // 只做展示派生（产物地址 / 警告 / 是否被覆盖），不改动 localRows，
      // 否则 v-model 会改到副本、persist 存不到原数组。
      return this.localRows.map((row, index) => ({
        row,
        url: buildSourceEntryUrl(row).url,
        warnings: buildSourceEntryUrl(row).warnings,
        overridden: this.isOverridden(index)
      }))
    }
  },
  data () {
    return {
      localRows: loadRuneSources().map(toRow)
    }
  },
  methods: {
    addSource () {
      this.localRows.push(toRow(createEmptyRuneSource({ type: MELT_SOURCE_TYPES.SFTP })))
      this.persist()
    },
    removeSource (index) {
      this.localRows.splice(index, 1)
      this.persist()
    },
    move (index, offset) {
      const target = index + offset
      if (target < 0 || target >= this.localRows.length) return
      const list = this.localRows
      const item = list.splice(index, 1)[0]
      list.splice(target, 0, item)
      this.persist()
    },
    baseHintFor (row) {
      if (row.type === MELT_SOURCE_TYPES.GITHUB) return this.$t('remoteCompBaseHintGithub')
      if (row.type === MELT_SOURCE_TYPES.UNPKG) return this.$t('remoteCompBaseHintUnpkg')
      return this.$t('remoteCompBaseHint')
    },
    onTypeChange (row) {
      // 切到非 unpkg 时清掉版本，避免留下「已忽略」的脏值
      if (row.type !== MELT_SOURCE_TYPES.UNPKG) row.version = ''
      this.persist()
    },
    isOverridden (idx) {
      const row = this.localRows[idx] || {}
      const name = String(row.name || '').trim().toLowerCase()
      if (!name) return false
      const bare = name.slice(name.lastIndexOf('/') + 1)
      return this.localRows.some((other, i) => {
        if (i <= idx || other.enabled === false) return false
        const otherName = String(other.name || '').trim().toLowerCase()
        if (!otherName) return false
        return otherName === name || otherName.slice(otherName.lastIndexOf('/') + 1) === bare
      })
    },
    persist () {
      const saved = saveRuneSources(this.localRows)
      // 回写规范化结果，让 warning/版本清空立刻反映到表单
      saved.forEach((item, i) => {
        if (!this.localRows[i]) return
        this.localRows[i].base = item.base
        this.localRows[i].version = item.version
        this.localRows[i].distDir = item.distDir
      })
    }
  }
}
</script>

<style scoped>
.settings-melt-panel {
  height: 100%;
  overflow-y: auto;
  padding: 4px 6px 12px;
}

.melt-hint {
  line-height: 1.4;
}

.melt-card {
  border-radius: 6px;
}

.melt-type-select {
  width: 9.5rem;
  flex: 0 0 auto;
}

.melt-version-input {
  width: 8rem;
  flex: 0 0 auto;
}

.melt-dist-input {
  width: 9rem;
  flex: 0 0 auto;
}

.melt-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgba(0, 0, 0, 0.55);
  font-size: 0.72rem;
  overflow: hidden;
}

.melt-preview__label {
  flex: 0 0 auto;
}

.melt-preview__url {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.melt-preview__url--empty {
  color: #c62828;
}

.melt-warn {
  margin-top: 2px;
  color: #b26a00;
  font-size: 0.72rem;
}
</style>
