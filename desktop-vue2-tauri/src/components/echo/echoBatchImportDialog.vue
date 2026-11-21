<!--
  echoBatchImportDialog - 回响批量导入弹框（v2026-08-01）
  从 SettingsEchoPanel 触发，支持从 Echo Pack v1 JSON 文件批量导入回响。
  与 Rune 弹框的差异：
    1. JSON 格式：Echo Pack v1（{ format, version, exportedAt, echoes }），禁止裸数组。
    2. 内置回响名冲突：直接走 builtinBlocked 列表（拒绝导入），不进入预览。
    3. 文件内重复：单独标记为 fileDuplicates（不静默合并）。
    4. 默认分类：来自 SettingsEchoPanel 入参，传到主进程 IPC。

  v2026-08-01 在线 URL 支持：
    弹框顶部加 Tab：选择文件 / 在线 URL。
    - 文件：FileReader 读 text → parseEchoPack → 预览（与历史完全一致）
    - URL：填 GitHub URL → 主进程 IPC echo-pack:fetchRemote 抓 text → parseEchoPack → 预览
    两条路径解析失败时复用同一套错误码与 UI 文案（service 端透传 message）。
-->
<template>
  <q-dialog
    :value='value'
    @input='v => $emit("input", v)'
    transition-show='fade'
    transition-hide='fade'
  >
    <q-card class='echo-batch-import-card'>
      <q-toolbar class='echo-batch-import-toolbar'>
        <q-icon name='file_upload' color='teal' size='1.4em' class='q-mr-xs' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>批量导入回响</span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='echo-batch-import-body'>
        <!-- v2026-08-01：导入源 Tab（文件 / 在线 URL），切换不重置已选分类/解析结果 -->
        <div class='echo-batch-import-source-tabs'>
          <q-tabs
            v-model='sourceTab'
            dense
            align='left'
            no-caps
            active-color='teal'
            indicator-color='teal'
            class='echo-batch-import-tabs'
          >
            <q-tab name='file' icon='description' label='选择文件' />
            <q-tab name='url' icon='cloud_download' label='在线 URL' />
          </q-tabs>
        </div>

        <div v-show='sourceTab === "file"' class='echo-batch-import-source-pane'>
          <div class='echo-batch-import-field'>
            <div class='echo-batch-import-label'>选择 Echo Pack v1 文件</div>
            <div class='echo-batch-import-file-area' @click='triggerFileInput'>
              <input
                ref='fileInput'
                type='file'
                accept='.json'
                style='display: none'
                @change='onFileSelected'
              />
              <div v-if='!selectedFile' class='echo-batch-import-file-placeholder'>
                <q-icon name='upload_file' size='2.5em' color='grey-5' />
                <div class='q-mt-sm text-grey-6'>点击选择 JSON 文件</div>
              </div>
              <div v-else class='echo-batch-import-file-selected'>
                <q-icon name='description' size='1.5em' color='teal-7' />
                <span class='q-ml-sm'>{{ selectedFile.name }}</span>
                <q-btn flat round dense icon='close' size='xs' @click.stop='clearFile' />
              </div>
            </div>
          </div>
        </div>

        <div v-show='sourceTab === "url"' class='echo-batch-import-source-pane'>
          <div class='echo-batch-import-field'>
            <div class='echo-batch-import-label'>Echo Pack URL</div>
            <el-input
              v-model='remoteUrl'
              placeholder='https://github.com/<u>/<r>/blob/<b>/<p>.json 或 raw 形式'
              clearable
              size='small'
              :disable='fetchingRemote'
              class='echo-batch-import-url-input'
              @keyup.enter.native='onRemoteUrlSubmit'
            />
            <div class='echo-batch-import-hint'>
              支持 <code>github.com/.../blob/...</code>、<code>github.com/.../raw/...</code>、
              <code>raw.githubusercontent.com</code>、<code>gist.githubusercontent.com</code>。
              URL 抓取在主进程完成，错误信息与文件路径完全一致。
            </div>
            <div class='echo-batch-import-url-actions'>
              <q-btn
                flat
                dense
                no-caps
                color='teal'
                icon='cloud_download'
                :label='fetchingRemote ? "抓取中..." : "抓取并解析"'
                :disable='!remoteUrl || fetchingRemote'
                :loading='fetchingRemote'
                @click='onRemoteUrlSubmit'
              />
            </div>
          </div>
        </div>

        <div class='echo-batch-import-field'>
          <div class='echo-batch-import-label'>导入分类</div>
          <q-select
            v-model='localCategory'
            dense
            outlined
            :options='categoryOptions'
            option-label='label'
            option-value='value'
            emit-value
            map-options
            class='echo-batch-import-select'
          >
            <template v-slot:selected-item='scope'>
              <span>{{ scope.opt ? scope.opt.label : '' }}</span>
            </template>
            <template v-slot:option='scope'>
              <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <div class='echo-batch-import-hint'>
            未重名回响将以该分类新增；重名回响覆盖原分类保留不变。
          </div>
        </div>

        <div v-if='parsedEntries.length > 0' class='echo-batch-import-preview'>
          <div class='echo-batch-import-preview-title'>
            共 {{ parsedEntries.length }} 个回响
            <span v-if='builtinBlockedCount > 0' class='text-warning q-ml-xs'>
              （内置冲突 {{ builtinBlockedCount }} 个）
            </span>
            <span v-if='totalInvalidCount > 0' class='text-deep-orange q-ml-xs'>
              （无效 {{ totalInvalidCount }} 个）
            </span>
            <span v-if='fileDuplicates.length > 0' class='text-deep-orange q-ml-xs'>
              （文件内重复 {{ fileDuplicates.length }} 组）
            </span>
          </div>

          <!-- v2026-08-01：当所有条目都因为重名落入 conflictItems 时，给出强提示，避免用户误以为按钮 bug -->
          <div
            v-if='newItems.length === 0 && conflictItems.length > 0'
            class='echo-batch-import-all-conflict'
          >
            <q-icon name='info' size='1.1em' class='q-mr-xs' />
            全部 {{ conflictItems.length }} 项与现有回响重名，默认不勾选不会导入。
            <span class='text-weight-medium q-ml-xs'>如需覆盖，请点击「重名」栏的「全选」按钮。</span>
          </div>

          <div class='echo-batch-import-sides'>
            <div class='echo-batch-import-side'>
              <div class='echo-batch-import-side-title'>
                <q-icon name='fiber_new' size='1em' color='positive' class='q-mr-xs' />
                未重名（{{ newItems.length }}，默认勾选）
              </div>
              <div class='echo-batch-import-side-actions'>
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全选'
                  :disable='newItems.length === 0'
                  @click='selectAll(true, false)'
                />
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全不选'
                  :disable='newItems.length === 0'
                  @click='selectAll(false, false)'
                />
              </div>
              <div v-if='newItems.length === 0' class='echo-batch-import-side-empty'>
                没有未重名的回响
              </div>
              <div v-else class='echo-batch-import-grid'>
                <el-tooltip
                  v-for='item in newItems'
                  :key='item.key'
                  placement='top-start'
                  :open-delay='250'
                  :disabled='!item.desc'
                  popper-class='echo-batch-import-tooltip'
                >
                  <label
                    class='echo-batch-import-tile'
                    :class='{ "is-selected": item.selected }'
                  >
                    <el-checkbox
                      v-model='item.selected'
                      class='echo-batch-import-tile-checkbox'
                    >
                      <span class='echo-batch-import-tile-name'>{{ item.name }}</span>
                    </el-checkbox>
                  </label>
                  <template #content>
                    <div class='echo-batch-import-tooltip-content'>{{ item.desc }}</div>
                  </template>
                </el-tooltip>
              </div>
            </div>

            <div class='echo-batch-import-side'>
              <div class='echo-batch-import-side-title'>
                <q-icon name='warning' size='1em' color='warning' class='q-mr-xs' />
                重名（{{ conflictItems.length }}，默认不勾选）
              </div>
              <div class='echo-batch-import-side-actions'>
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全选'
                  :disable='conflictItems.length === 0'
                  @click='selectAll(true, true)'
                />
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全不选'
                  :disable='conflictItems.length === 0'
                  @click='selectAll(false, true)'
                />
              </div>
              <div v-if='conflictItems.length === 0' class='echo-batch-import-side-empty'>
                没有与现有回响重名的项
              </div>
              <div v-else class='echo-batch-import-grid'>
                <el-tooltip
                  v-for='item in conflictItems'
                  :key='item.key'
                  placement='top-start'
                  :open-delay='250'
                  :disabled='!item.desc'
                  popper-class='echo-batch-import-tooltip'
                >
                  <label
                    class='echo-batch-import-tile echo-batch-import-tile--conflict'
                    :class='{ "is-selected": item.selected }'
                  >
                    <el-checkbox
                      v-model='item.selected'
                      class='echo-batch-import-tile-checkbox'
                    >
                      <span class='echo-batch-import-tile-name'>{{ item.name }}</span>
                    </el-checkbox>
                  </label>
                  <template #content>
                    <div class='echo-batch-import-tooltip-content'>{{ item.desc }}</div>
                  </template>
                </el-tooltip>
              </div>
            </div>
          </div>

          <div v-if='builtinBlockedNames.length > 0' class='echo-batch-import-blocked'>
            <div class='echo-batch-import-blocked-title'>
              <q-icon name='block' size='1em' color='negative' class='q-mr-xs' />
              内置冲突（{{ builtinBlockedNames.length }}）—— 无法导入
            </div>
            <div class='echo-batch-import-blocked-list'>
              <span
                v-for='name in builtinBlockedNames'
                :key='name'
                class='echo-batch-import-blocked-chip'
              >{{ name }}</span>
            </div>
          </div>

          <div v-if='fileDuplicates.length > 0' class='echo-batch-import-dup'>
            <div class='echo-batch-import-dup-title'>
              <q-icon name='content_copy' size='1em' color='deep-orange' class='q-mr-xs' />
              文件内重复（{{ fileDuplicates.length }} 组）—— 仅取每组首条
            </div>
            <div class='echo-batch-import-dup-list'>
              <div
                v-for='dup in fileDuplicates'
                :key='dup.name'
                class='echo-batch-import-dup-item'
              >
                <span class='echo-batch-import-dup-name'>{{ dup.name }}</span>
                <span class='echo-batch-import-dup-count'>出现 {{ dup.indexes.length }} 次</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if='errorMessage' class='echo-batch-import-error'>
          <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
          {{ errorMessage }}
        </div>

        <div v-if='importResult' class='echo-batch-import-result'>
          <div v-if='importResult.success' class='echo-batch-import-result-success'>
            <q-icon name='check_circle' size='1.1em' class='q-mr-xs' />
            成功导入 {{ importResult.created }} 个，新增 {{ importResult.created }}、覆盖 {{ importResult.replaced }}
          </div>
          <div v-else class='echo-batch-import-result-error'>
            <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
            {{ importResult.message || '导入失败' }}
          </div>
        </div>
      </q-card-section>

      <q-card-actions align='right' class='echo-batch-import-footer'>
        <q-btn flat dense no-caps label='取消' v-close-popup />
        <q-btn
          flat
          dense
          no-caps
          color='teal'
          icon='file_upload'
          label='导入所选'
          :loading='importing'
          :disable='!hasSelectedItem'
          @click='doImport'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.echo-batch-import-card {
  min-width: 640px;
  max-width: 92vw;
  width: 760px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.echo-batch-import-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.echo-batch-import-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.echo-batch-import-source-tabs {
  margin-bottom: -4px;
}

.echo-batch-import-tabs {
  border-bottom: 1px solid rgba(38, 166, 154, 0.2);
}

.echo-batch-import-source-pane {
  display: flex;
  flex-direction: column;
}

.echo-batch-import-url-input {
  width: 100%;
}

.echo-batch-import-url-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.echo-batch-import-field {
  display: flex;
  flex-direction: column;
}

.echo-batch-import-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  font-weight: 500;
  margin-bottom: 6px;
}

.echo-batch-import-file-area {
  border: 2px dashed rgba(38, 166, 154, 0.35);
  border-radius: 8px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;

  &:hover {
    border-color: #26A69A;
    background: rgba(38, 166, 154, 0.04);
  }
}

.echo-batch-import-file-placeholder {
  color: rgba(0, 0, 0, 0.4);
}

.echo-batch-import-file-selected {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.78);
}

.echo-batch-import-select {
  font-size: 13px;
}

.echo-batch-import-hint {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  margin-top: 4px;
}

.echo-batch-import-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.echo-batch-import-preview-title {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.7);
  font-weight: 500;
}

.echo-batch-import-all-conflict {
  display: flex;
  align-items: center;
  background: rgba(255, 152, 0, 0.1);
  color: #e65100;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.body--dark .echo-batch-import-all-conflict {
  background: rgba(255, 152, 0, 0.18);
  color: #ffb74d;
}

.echo-batch-import-sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.echo-batch-import-side {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.echo-batch-import-side-title {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.7);
  font-weight: 500;
  display: flex;
  align-items: center;
}

.echo-batch-import-side-actions {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.echo-batch-import-side-empty {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.4);
  padding: 8px 0;
}

.echo-batch-import-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.echo-batch-import-tile {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid transparent;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(38, 166, 154, 0.08);
  }

  &.is-selected {
    background: rgba(38, 166, 154, 0.12);
    border-color: rgba(38, 166, 154, 0.4);
  }

  &--conflict {
    background: rgba(255, 152, 0, 0.04);

    &.is-selected {
      background: rgba(255, 152, 0, 0.12);
      border-color: rgba(255, 152, 0, 0.4);
    }
  }
}

.echo-batch-import-tile-checkbox {
  margin-right: 0 !important;
}

.echo-batch-import-tile-name {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.82);
}

.echo-batch-import-tooltip-content {
  max-width: 320px;
  line-height: 1.5;
  font-size: 12px;
}

.echo-batch-import-blocked,
.echo-batch-import-dup {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.echo-batch-import-blocked {
  background: rgba(244, 67, 54, 0.06);
}

.echo-batch-import-blocked-title {
  color: #c62828;
  font-weight: 500;
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.echo-batch-import-blocked-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.echo-batch-import-blocked-chip {
  background: rgba(244, 67, 54, 0.12);
  color: #c62828;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
}

.echo-batch-import-dup {
  background: rgba(255, 87, 34, 0.06);
}

.echo-batch-import-dup-title {
  color: #e64a19;
  font-weight: 500;
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.echo-batch-import-dup-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.echo-batch-import-dup-item {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.7);
}

.echo-batch-import-dup-count {
  color: rgba(0, 0, 0, 0.45);
  font-size: 11px;
}

.echo-batch-import-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.echo-batch-import-result {
  font-size: 13px;
}

.echo-batch-import-result-success {
  display: flex;
  align-items: center;
  background: rgba(76, 175, 80, 0.08);
  color: #2e7d32;
  border-radius: 4px;
  padding: 8px 10px;
}

.echo-batch-import-result-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
  border-radius: 4px;
  padding: 8px 10px;
}

.echo-batch-import-footer {
  padding: 10px 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

.body--dark .echo-batch-import-toolbar {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.body--dark .echo-batch-import-tabs {
  border-bottom-color: rgba(38, 166, 154, 0.32);
}

.body--dark .echo-batch-import-label {
  color: rgba(255, 255, 255, 0.65);
}

.body--dark .echo-batch-import-file-area:hover {
  background: rgba(38, 166, 154, 0.1);
}

.body--dark .echo-batch-import-file-selected {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .echo-batch-import-side {
  background: rgba(255, 255, 255, 0.04);
}

.body--dark .echo-batch-import-tile {
  background: rgba(255, 255, 255, 0.04);
  &:hover {
    background: rgba(38, 166, 154, 0.14);
  }
  &.is-selected {
    background: rgba(38, 166, 154, 0.18);
  }
  &--conflict {
    background: rgba(255, 152, 0, 0.06);
    &.is-selected {
      background: rgba(255, 152, 0, 0.18);
    }
  }
}

.body--dark .echo-batch-import-tile-name {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .echo-batch-import-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.echo-batch-import-tooltip {
  max-width: 360px;
  &[x-placement^='top'] .popper__arrow {
    border-top-color: rgba(40, 40, 40, 0.92) !important;
  }
  &[x-placement^='bottom'] .popper__arrow {
    border-bottom-color: rgba(40, 40, 40, 0.92) !important;
  }
}
</style>

<script>
import {
  parseEchoPack,
  previewImport,
  commitImport,
  computeFileDuplicates
} from 'src/services/EchoImportService'
import DatabaseClient from 'src/utils/DatabaseClient'

const ECHO_CATEGORY_OPTIONS = [
  { value: 'marker', label: '标记' },
  { value: 'showy', label: '展示' },
  { value: 'typography', label: '排版' }
]

export default {
  name: 'echoBatchImportDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    defaultCategory: {
      type: String,
      default: 'marker'
    }
  },
  data () {
    return {
      // v2026-08-01：导入源 Tab（file = 本地 JSON 文件；url = 在线 URL）
      sourceTab: 'file',
      remoteUrl: '',
      fetchingRemote: false,
      selectedFile: null,
      parsedEntries: [],
      newItems: [],
      conflictItems: [],
      builtinBlockedNames: [],
      builtinBlockedCount: 0,
      totalInvalidCount: 0,
      fileDuplicates: [],
      localCategory: this.defaultCategory || 'marker',
      previewAt: 0,
      importing: false,
      errorMessage: '',
      importResult: null
    }
  },
  computed: {
    categoryOptions () {
      return ECHO_CATEGORY_OPTIONS
    },
    hasSelectedItem () {
      if (this.importing) return false
      return this.newItems.some(it => it.selected) || this.conflictItems.some(it => it.selected)
    }
  },
  watch: {
    defaultCategory: {
      immediate: true,
      handler (v) {
        if (v && !this.localCategory) {
          this.localCategory = v
        }
      }
    },
    value (v) {
      if (v) {
        this.localCategory = this.defaultCategory || 'marker'
        this.clearState()
      }
    }
  },
  methods: {
    triggerFileInput () {
      this.$refs.fileInput.click()
    },
    clearFile () {
      this.selectedFile = null
      this.parsedEntries = []
      this.newItems = []
      this.conflictItems = []
      this.builtinBlockedNames = []
      this.builtinBlockedCount = 0
      this.totalInvalidCount = 0
      this.fileDuplicates = []
      this.previewAt = 0
      this.errorMessage = ''
      this.importResult = null
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },
    clearState () {
      this.selectedFile = null
      this.sourceTab = 'file'
      this.remoteUrl = ''
      this.fetchingRemote = false
      this.parsedEntries = []
      this.newItems = []
      this.conflictItems = []
      this.builtinBlockedNames = []
      this.builtinBlockedCount = 0
      this.totalInvalidCount = 0
      this.fileDuplicates = []
      this.localCategory = this.defaultCategory || 'marker'
      this.previewAt = 0
      this.importing = false
      this.errorMessage = ''
      this.importResult = null
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },
    readFileAsText (file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target && e.target.result)
        reader.onerror = e => reject(e)
        reader.readAsText(file)
      })
    },
    /**
     * v2026-08-01：抽离 file/url 两条路径共用的"text → parse → preview"流程。
     * 调用方在调本方法前应已清空错误/结果状态。
     */
    async applyParsedText (text) {
      try {
        const parsed = parseEchoPack(text)
        if (!parsed.success) {
          this.errorMessage = parsed.message || 'JSON 解析失败'
          this.parsedEntries = []
          this.newItems = []
          this.conflictItems = []
          return
        }
        this.parsedEntries = parsed.entries
        this.totalInvalidCount = parsed.invalidItems.length
        this.fileDuplicates = computeFileDuplicates(parsed.entries)
        await this.runPreview()
      } catch (e) {
        this.errorMessage = 'JSON 解析失败: ' + (e && e.message ? e.message : String(e))
        this.parsedEntries = []
        this.newItems = []
        this.conflictItems = []
      }
    },
    async onFileSelected (event) {
      const file = event.target.files && event.target.files[0]
      if (!file) return
      this.selectedFile = file
      this.errorMessage = ''
      this.importResult = null
      await this.applyParsedText(await this.readFileAsText(file))
    },
    async onRemoteUrlSubmit () {
      const url = (this.remoteUrl || '').trim()
      if (!url) {
        this.errorMessage = '请输入 Echo Pack URL'
        return
      }
      this.fetchingRemote = true
      this.errorMessage = ''
      this.importResult = null
      try {
        const res = await DatabaseClient.echoPacks.fetchRemote({ sourceUrl: url })
        if (!res || !res.success) {
          this.errorMessage = (res && res.message) || '抓取失败'
          return
        }
        await this.applyParsedText(res.text || '')
      } catch (e) {
        this.errorMessage = '抓取失败: ' + (e && e.message ? e.message : String(e))
      } finally {
        this.fetchingRemote = false
      }
    },
    async runPreview () {
      const targetCategory = this.localCategory || this.defaultCategory || 'marker'
      try {
        const result = await previewImport(this.parsedEntries, targetCategory)
        if (!result.success) {
          this.errorMessage = result.message || '预览失败'
          return
        }
        this.previewAt = result.previewAt
        this.builtinBlockedNames = (result.builtinBlocked || []).map(b => b.name).filter(Boolean)
        this.builtinBlockedCount = this.builtinBlockedNames.length
        // 仅保留首个文件内重复（其余跳过），与 computeFileDuplicates 对齐
        const dupIndexes = new Set()
        for (const dup of this.fileDuplicates) {
          const idx = (dup.indexes || []).slice(1)
          for (const i of idx) dupIndexes.add(i)
        }
        this.newItems = (result.newItems || []).map(item => ({
          key: `new-${item.index}-${item.key}`,
          name: item.name,
          desc: item.desc,
          color: item.color,
          icon: item.icon,
          category: item.sourceCategory,
          targetCategory: item.targetCategory,
          selected: true
        }))
        this.conflictItems = (result.conflictItems || []).map(item => ({
          key: `conflict-${item.index}-${item.key}`,
          name: item.name,
          desc: item.desc,
          color: item.color,
          icon: item.icon,
          category: item.sourceCategory,
          targetCategory: item.targetCategory,
          existingId: item.existingId,
          existingCategory: item.existingCategory,
          selected: false
        }))
      } catch (e) {
        this.errorMessage = '预览失败: ' + (e && e.message ? e.message : String(e))
      }
    },
    selectAll (selected, isConflict) {
      const list = isConflict ? this.conflictItems : this.newItems
      list.forEach(it => { it.selected = selected })
    },
    async doImport () {
      const newChosen = this.newItems.filter(it => it.selected)
      const conflictChosen = this.conflictItems.filter(it => it.selected)
      if (newChosen.length === 0 && conflictChosen.length === 0) {
        this.errorMessage = '请至少勾选一个回响'
        return
      }
      this.importing = true
      this.errorMessage = ''
      this.importResult = null
      try {
        const result = await commitImport({
          entries: this.parsedEntries,
          newItems: newChosen,
          conflictItems: conflictChosen,
          targetCategory: this.localCategory || this.defaultCategory || 'marker',
          previewAt: this.previewAt
        })
        if (!result.success) {
          this.errorMessage = result.message || '导入失败'
          this.importResult = { success: false, message: this.errorMessage }
          return
        }
        this.importResult = {
          success: true,
          created: result.created,
          replaced: result.replaced
        }
        this.$emit('imported', {
          created: result.created,
          replaced: result.replaced,
          targetCategory: result.targetCategory
        })
      } catch (e) {
        this.errorMessage = '导入失败: ' + (e && e.message ? e.message : String(e))
        this.importResult = { success: false, message: this.errorMessage }
      } finally {
        this.importing = false
      }
    }
  }
}
</script>
