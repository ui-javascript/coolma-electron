<!--
  RuneExportDialog - rune 导出到 JSON 文件（v2026-08-01）
  导出格式：Rune Pack v1 — { format, version, exportedAt, runes: [...] }
  对齐 EchoImportService.buildEchoPack 的顶层结构。
  不导出数据库 id / isBuiltin / sort_order / created_at / updated_at。
-->
<template>
  <q-dialog
    :value='value'
    @input='v => $emit("input", v)'
    transition-show='fade'
    transition-hide='fade'
  >
    <q-card class='rune-export-card'>
      <q-toolbar class='rune-export-toolbar'>
        <q-icon name='file_download' color='primary' size='1.4em' class='q-mr-xs' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>导出符文</span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='rune-export-body'>
        <div class='rune-export-info'>
          <q-icon name='info_outline' size='1em' class='q-mr-xs' />
          将导出 <strong>{{ selectedCount }}</strong> 个符文到 JSON 文件
        </div>

        <div v-if='selectedCount > 0' class='rune-export-preview'>
          <div class='rune-export-preview-title'>预览：</div>
          <div class='rune-export-preview-list'>
            <div v-for='rune in previewRunesWithCategory' :key='rune.id' class='rune-export-preview-item'>
              <span class='rune-export-preview-icon' :style='{ color: rune.color }'>●</span>
              <span class='rune-export-preview-name'>{{ rune.name }}</span>
              <span class='rune-export-preview-category'>({{ rune.resolvedCategory }})</span>
            </div>
            <div v-if='selectedCount > previewLimit' class='rune-export-preview-more'>
              ... 还有 {{ selectedCount - previewLimit }} 个
            </div>
          </div>
        </div>

        <div v-if='errorMessage' class='rune-export-error'>
          <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
          {{ errorMessage }}
        </div>
      </q-card-section>

      <q-card-actions align='right' class='rune-export-footer'>
        <q-btn flat dense no-caps label='取消' v-close-popup />
        <q-btn
          flat
          dense
          no-caps
          color='primary'
          icon='file_download'
          label='导出'
          :loading='exporting'
          :disable='selectedCount === 0'
          @click='doExport'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.rune-export-card {
  min-width: 420px;
  max-width: 92vw;
  width: 480px;
}

.rune-export-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.rune-export-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rune-export-info {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
}

.rune-export-info strong {
  color: #7E57C2;
}

.rune-export-preview {
  background: rgba(126, 87, 194, 0.06);
  border-radius: 6px;
  padding: 12px;
}

.rune-export-preview-title {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  margin-bottom: 8px;
}

.rune-export-preview-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.rune-export-preview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.rune-export-preview-icon {
  font-size: 10px;
}

.rune-export-preview-name {
  color: rgba(0, 0, 0, 0.8);
  font-weight: 500;
}

.rune-export-preview-category {
  color: rgba(0, 0, 0, 0.45);
  font-size: 11px;
}

.rune-export-preview-more {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  font-style: italic;
  margin-top: 4px;
}

.rune-export-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.rune-export-footer {
  padding: 10px 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

.body--dark .rune-export-toolbar {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.body--dark .rune-export-info {
  color: rgba(255, 255, 255, 0.7);
}

.body--dark .rune-export-preview {
  background: rgba(126, 87, 194, 0.12);
}

.body--dark .rune-export-preview-name {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .rune-export-preview-category {
  color: rgba(255, 255, 255, 0.45);
}

.body--dark .rune-export-error {
  background: rgba(244, 67, 54, 0.16);
  color: #ef9a9a;
}

.body--dark .rune-export-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}
</style>

<script>
import { buildRunePack } from 'src/services/RuneImportService'

export default {
  name: 'runeExportDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    selectedRunes: {
      type: Array,
      default: () => []
    },
    allRunes: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      exporting: false,
      errorMessage: '',
      previewLimit: 10
    }
  },
  computed: {
    selectedCount () {
      return this.selectedRunes ? this.selectedRunes.length : 0
    },
    previewRunes () {
      const list = this.selectedRunes || []
      return list.slice(0, this.previewLimit)
    },
    // 兼容 category 和 category_key 两种字段名
    previewRunesWithCategory () {
      return this.previewRunes.map(r => ({
        ...r,
        resolvedCategory: r.category || r.category_key || 'general'
      }))
    }
  },
  methods: {
    doExport () {
      if (!this.selectedRunes || this.selectedRunes.length === 0) {
        this.errorMessage = '没有选中的符文'
        return
      }
      this.exporting = true
      this.errorMessage = ''
      try {
        const jsonStr = buildRunePack(this.selectedRunes)
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const timestamp = new Date().toISOString().slice(0, 10)
        link.href = url
        link.download = `memocast-runes-${timestamp}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        this.$emit('input', false)
      } catch (e) {
        this.errorMessage = '导出失败: ' + (e && e.message ? e.message : String(e))
      } finally {
        this.exporting = false
      }
    }
  }
}
</script>
