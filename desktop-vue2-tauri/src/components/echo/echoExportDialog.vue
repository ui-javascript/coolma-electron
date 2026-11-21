<!--
  echoExportDialog - 回响导出到 JSON 文件（v2026-08-01）
  导出格式：Echo Pack v1 — { format, version, exportedAt, echoes: [...] }
  不导出内置回响、不导出数据库 id / 时间戳 / sort_order。
-->
<template>
  <q-dialog
    :value='value'
    @input='v => $emit("input", v)'
    transition-show='fade'
    transition-hide='fade'
  >
    <q-card class='echo-export-card'>
      <q-toolbar class='echo-export-toolbar'>
        <q-icon name='file_download' color='teal' size='1.4em' class='q-mr-xs' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>导出回响</span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='echo-export-body'>
        <div class='echo-export-info'>
          <q-icon name='info_outline' size='1em' class='q-mr-xs' />
          将导出 <strong>{{ selectedCount }}</strong> 个自定义回响到 JSON 文件
        </div>

        <div v-if='selectedCount > 0' class='echo-export-preview'>
          <div class='echo-export-preview-title'>预览：</div>
          <div class='echo-export-preview-list'>
            <div v-for='echo in previewEchoes' :key='echo.id' class='echo-export-preview-item'>
              <span class='echo-export-preview-icon' :style='{ color: echo.color }'>●</span>
              <span class='echo-export-preview-name'>{{ echo.name }}</span>
              <span class='echo-export-preview-category'>({{ echo.category || 'marker' }})</span>
            </div>
            <div v-if='selectedCount > previewLimit' class='echo-export-preview-more'>
              ... 还有 {{ selectedCount - previewLimit }} 个
            </div>
          </div>
        </div>

        <div v-if='errorMessage' class='echo-export-error'>
          <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
          {{ errorMessage }}
        </div>
      </q-card-section>

      <q-card-actions align='right' class='echo-export-footer'>
        <q-btn flat dense no-caps label='取消' v-close-popup />
        <q-btn
          flat
          dense
          no-caps
          color='teal'
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
.echo-export-card {
  min-width: 420px;
  max-width: 92vw;
  width: 480px;
}

.echo-export-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.echo-export-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.echo-export-info {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
}

.echo-export-info strong {
  color: #26A69A;
}

.echo-export-preview {
  background: rgba(38, 166, 154, 0.06);
  border-radius: 6px;
  padding: 12px;
}

.echo-export-preview-title {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  margin-bottom: 8px;
}

.echo-export-preview-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.echo-export-preview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.echo-export-preview-icon {
  font-size: 10px;
}

.echo-export-preview-name {
  color: rgba(0, 0, 0, 0.8);
  font-weight: 500;
}

.echo-export-preview-category {
  color: rgba(0, 0, 0, 0.45);
  font-size: 11px;
}

.echo-export-preview-more {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  font-style: italic;
  margin-top: 4px;
}

.echo-export-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.echo-export-footer {
  padding: 10px 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

.body--dark .echo-export-toolbar {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.body--dark .echo-export-info {
  color: rgba(255, 255, 255, 0.7);
}

.body--dark .echo-export-preview {
  background: rgba(38, 166, 154, 0.12);
}

.body--dark .echo-export-preview-name {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .echo-export-preview-category {
  color: rgba(255, 255, 255, 0.45);
}

.body--dark .echo-export-error {
  background: rgba(244, 67, 54, 0.16);
  color: #ef9a9a;
}

.body--dark .echo-export-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}
</style>

<script>
import { buildEchoPack } from 'src/services/EchoImportService'

export default {
  name: 'echoExportDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    selectedEchoes: {
      type: Array,
      default: () => []
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
      return this.selectedEchoes ? this.selectedEchoes.length : 0
    },
    previewEchoes () {
      const list = this.selectedEchoes || []
      return list.slice(0, this.previewLimit)
    }
  },
  methods: {
    doExport () {
      if (!this.selectedEchoes || this.selectedEchoes.length === 0) {
        this.errorMessage = '没有选中的回响'
        return
      }
      this.exporting = true
      this.errorMessage = ''
      try {
        const jsonStr = buildEchoPack(this.selectedEchoes)
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const timestamp = new Date().toISOString().slice(0, 10)
        link.href = url
        link.download = `memocast-echoes-${timestamp}.json`
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
