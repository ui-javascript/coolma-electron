<!--
  RuneBatchImportDialog - rune 批量导入弹框（v2026-08-01）
  从 SettingsRunePanel 触发，支持从 Rune Pack v1 JSON 文件批量导入符文到当前分类。
  格式与 EchoImportService 对齐：
    1. JSON 顶层必须为 { format: 'memocast.rune-pack', version: 1, exportedAt, runes }
       裸数组（v2026-08-01 之前的旧版 rune JSON）或 Echo Pack 格式都会立即拒绝。
    2. 与内置符文名冲突的项目直接过滤，不进入预览。
    3. 提交时按所选项调用 batchImport：未重名走 normal，重名走 replace。

  v2026-08-01 改造：
    1. 解析文件后立刻在弹框内展示「未重名（默认勾选）/ 重名（默认不勾选）」两栏可复选方块；
    2. 符文选项悬浮显示 desc；
    3. 与内置符文名冲突的项目直接过滤，不进入预览；
    4. 提交时按所选项调用 batchImport：未重名走 normal，重名走 replace。

  v2026-08-01 在线 URL 支持：
    弹框顶部加 Tab：选择文件 / 在线 URL。
    - 文件：FileReader 读 text → parseRunePack → 预览
    - URL：填 GitHub URL → 主进程 IPC rune-pack:fetchRemote 抓 text → parseRunePack → 预览
    两条路径解析失败时复用同一套错误码与 UI 文案（service 端透传 message）。
-->
<template>
  <q-dialog
    :value='value'
    @input='v => $emit("input", v)'
    transition-show='fade'
    transition-hide='fade'
  >
    <q-card class='rune-batch-import-card'>
      <q-toolbar class='rune-batch-import-toolbar'>
        <q-icon name='file_upload' color='primary' size='1.4em' class='q-mr-xs' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>批量导入符文</span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='rune-batch-import-body'>
        <!-- v2026-08-01：导入源 Tab（文件 / 在线 URL），切换不重置已选分类/解析结果 -->
        <div class='rune-batch-import-source-tabs'>
          <q-tabs
            v-model='sourceTab'
            dense
            align='left'
            no-caps
            active-color='primary'
            indicator-color='primary'
            class='rune-batch-import-tabs'
          >
            <q-tab name='file' icon='description' label='选择文件' />
            <q-tab name='url' icon='cloud_download' label='在线 URL' />
          </q-tabs>
        </div>

        <div v-show='sourceTab === "file"' class='rune-batch-import-source-pane'>
          <div class='rune-batch-import-field'>
            <div class='rune-batch-import-label'>选择 JSON 文件</div>
            <div class='rune-batch-import-file-area' @click='triggerFileInput'>
              <input
                ref='fileInput'
                type='file'
                accept='.json'
                style='display: none'
                @change='onFileSelected'
              />
              <div v-if='!selectedFile' class='rune-batch-import-file-placeholder'>
                <q-icon name='upload_file' size='2.5em' color='grey-5' />
                <div class='q-mt-sm text-grey-6'>点击选择 JSON 文件</div>
              </div>
              <div v-else class='rune-batch-import-file-selected'>
                <q-icon name='description' size='1.5em' color='purple-7' />
                <span class='q-ml-sm'>{{ selectedFile.name }}</span>
                <q-btn flat round dense icon='close' size='xs' @click.stop='clearFile' />
              </div>
            </div>
          </div>
        </div>

        <div v-show='sourceTab === "url"' class='rune-batch-import-source-pane'>
          <div class='rune-batch-import-field'>
            <div class='rune-batch-import-label'>Rune Pack URL</div>
            <el-input
              v-model='remoteUrl'
              placeholder='https://github.com/<u>/<r>/blob/<b>/<p>.json 或 raw 形式'
              clearable
              size='small'
              :disable='fetchingRemote'
              class='rune-batch-import-url-input'
              @keyup.enter.native='onRemoteUrlSubmit'
            />
            <div class='rune-batch-import-hint'>
              支持 <code>github.com/.../blob/...</code>、<code>github.com/.../raw/...</code>、
              <code>raw.githubusercontent.com</code>、<code>gist.githubusercontent.com</code>。
              URL 抓取在主进程完成，错误信息与文件路径完全一致。
            </div>
            <div class='rune-batch-import-url-actions'>
              <q-btn
                flat
                dense
                no-caps
                color='primary'
                icon='cloud_download'
                :label='fetchingRemote ? "抓取中..." : "抓取并解析"'
                :disable='!remoteUrl || fetchingRemote'
                :loading='fetchingRemote'
                @click='onRemoteUrlSubmit'
              />
            </div>
          </div>
        </div>

        <div class='rune-batch-import-field'>
          <div class='rune-batch-import-label'>导入分类</div>
          <q-select
            v-model='localCategory'
            dense
            outlined
            :options='categoryOptions'
            option-label='label'
            option-value='value'
            emit-value
            map-options
            class='rune-batch-import-select'
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
          <div class='rune-batch-import-hint'>
            未重名符文将以该分类新增；重名符文覆盖原分类保留不变。
          </div>
        </div>

        <div v-if='parsedEntries.length > 0' class='rune-batch-import-preview'>
          <div class='rune-batch-import-preview-title'>
            共 {{ parsedEntries.length }} 个符文
            <span v-if='builtinFilteredCount > 0' class='text-grey-6 q-ml-xs'>
              （已过滤 {{ builtinFilteredCount }} 个内置）
            </span>
            <span v-if='totalInvalidCount > 0' class='text-warning q-ml-xs'>
              （无效 {{ totalInvalidCount }} 个）
            </span>
          </div>

          <!-- v2026-08-01：当所有条目都因为重名落入 conflictItems 时，给出强提示，避免用户误以为按钮 bug -->
          <div
            v-if='newItems.length === 0 && conflictItems.length > 0'
            class='rune-batch-import-all-conflict'
          >
            <q-icon name='info' size='1.1em' class='q-mr-xs' />
            全部 {{ conflictItems.length }} 项与现有符文重名，默认不勾选不会导入。
            <span class='text-weight-medium q-ml-xs'>如需覆盖，请点击「重名」栏的「全选」按钮。</span>
          </div>

          <div class='rune-batch-import-sides'>
            <div class='rune-batch-import-side'>
              <div class='rune-batch-import-side-title'>
                <q-icon name='fiber_new' size='1em' color='positive' class='q-mr-xs' />
                未重名（{{ newItems.length }}，默认勾选）
              </div>
              <div class='rune-batch-import-side-actions'>
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
              <div v-if='newItems.length === 0' class='rune-batch-import-side-empty'>
                没有未重名的符文
              </div>
              <div v-else class='rune-batch-import-grid'>
                <el-tooltip
                  v-for='item in newItems'
                  :key='item.key'
                  placement='top-start'
                  :open-delay='250'
                  :disabled='!item.desc'
                  popper-class='rune-batch-import-tooltip'
                >
                  <label
                    class='rune-batch-import-tile'
                    :class='{ "is-selected": item.selected }'
                  >
                    <el-checkbox
                      v-model='item.selected'
                      class='rune-batch-import-tile-checkbox'
                    >
                      <span class='rune-batch-import-tile-name'>{{ item.name }}</span>
                    </el-checkbox>
                  </label>
                  <template #content>
                    <div class='rune-batch-import-tooltip-content'>{{ item.desc }}</div>
                  </template>
                </el-tooltip>
              </div>
            </div>

            <div class='rune-batch-import-side'>
              <div class='rune-batch-import-side-title'>
                <q-icon name='warning' size='1em' color='warning' class='q-mr-xs' />
                重名（{{ conflictItems.length }}，默认不勾选）
              </div>
              <div class='rune-batch-import-side-actions'>
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
              <div v-if='conflictItems.length === 0' class='rune-batch-import-side-empty'>
                没有与现有符文重名的项
              </div>
              <div v-else class='rune-batch-import-grid'>
                <el-tooltip
                  v-for='item in conflictItems'
                  :key='item.key'
                  placement='top-start'
                  :open-delay='250'
                  :disabled='!item.desc'
                  popper-class='rune-batch-import-tooltip'
                >
                  <label
                    class='rune-batch-import-tile rune-batch-import-tile--conflict'
                    :class='{ "is-selected": item.selected }'
                  >
                    <el-checkbox
                      v-model='item.selected'
                      class='rune-batch-import-tile-checkbox'
                    >
                      <span class='rune-batch-import-tile-name'>{{ item.name }}</span>
                    </el-checkbox>
                  </label>
                  <template #content>
                    <div class='rune-batch-import-tooltip-content'>{{ item.desc }}</div>
                  </template>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>

        <div v-if='errorMessage' class='rune-batch-import-error'>
          <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
          {{ errorMessage }}
        </div>

        <div v-if='importResult' class='rune-batch-import-result'>
          <div v-if='importResult.success' class='rune-batch-import-result-success'>
            <q-icon name='check_circle' size='1.1em' class='q-mr-xs' />
            成功导入 {{ importResult.count }} 个符文
          </div>
          <div v-else class='rune-batch-import-result-error'>
            <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
            {{ importResult.message || '导入失败' }}
          </div>
        </div>
      </q-card-section>

      <q-card-actions align='right' class='rune-batch-import-footer'>
        <q-btn flat dense no-caps label='取消' v-close-popup />
        <q-btn
          flat
          dense
          no-caps
          color='primary'
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
.rune-batch-import-card {
  min-width: 640px;
  max-width: 92vw;
  width: 760px;
}

.rune-batch-import-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.rune-batch-import-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rune-batch-import-source-tabs {
  margin-bottom: -4px;
}

.rune-batch-import-tabs {
  border-bottom: 1px solid rgba(126, 87, 194, 0.18);
}

.rune-batch-import-source-pane {
  display: flex;
  flex-direction: column;
}

.rune-batch-import-url-input {
  width: 100%;
}

.rune-batch-import-url-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.rune-batch-import-field {
  display: flex;
  flex-direction: column;
}

.rune-batch-import-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  font-weight: 500;
  margin-bottom: 6px;
}

.rune-batch-import-file-area {
  border: 2px dashed rgba(126, 87, 194, 0.35);
  border-radius: 8px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;

  &:hover {
    border-color: #7E57C2;
    background: rgba(126, 87, 194, 0.04);
  }
}

.rune-batch-import-file-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rune-batch-import-file-selected {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rune-batch-import-select {
  width: 100%;
}

.rune-batch-import-hint {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}

.rune-batch-import-preview {
  background: rgba(126, 87, 194, 0.06);
  border-radius: 6px;
  padding: 12px;
}

.rune-batch-import-preview-title {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  margin-bottom: 8px;
}

.rune-batch-import-all-conflict {
  display: flex;
  align-items: center;
  background: rgba(255, 152, 0, 0.1);
  color: #e65100;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  margin-bottom: 8px;
  line-height: 1.5;
}

.body--dark .rune-batch-import-all-conflict {
  background: rgba(255, 152, 0, 0.18);
  color: #ffb74d;
}

.rune-batch-import-sides {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 2px;
}

.rune-batch-import-side {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(126, 87, 194, 0.18);
  border-radius: 6px;
  padding: 10px;
}

.rune-batch-import-side-title {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.75);
}

.rune-batch-import-side-actions {
  display: flex;
  gap: 4px;
  margin: 4px 0 8px 0;
}

.rune-batch-import-side-empty {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.4);
  padding: 6px 2px;
}

.rune-batch-import-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px;
}

.rune-batch-import-tile {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  color: rgba(0, 0, 0, 0.85);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    border-color: rgba(126, 87, 194, 0.4);
    background: rgba(126, 87, 194, 0.06);
  }

  &.is-selected {
    border-color: #7E57C2;
    background: rgba(126, 87, 194, 0.12);
  }
}

.rune-batch-import-tile--conflict {
  border-color: rgba(255, 193, 7, 0.45);

  &.is-selected {
    border-color: #f57c00;
    background: rgba(255, 193, 7, 0.14);
  }
}

.rune-batch-import-tile-checkbox {
  margin-right: 0;

  ::v-deep .el-checkbox__label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
}

.rune-batch-import-tile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.rune-batch-import-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.rune-batch-import-result {
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.rune-batch-import-result-success {
  display: flex;
  align-items: center;
  background: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
  border-radius: 4px;
  padding: 8px 10px;
}

.rune-batch-import-result-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
}

.rune-batch-import-footer {
  padding: 10px 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

.body--dark .rune-batch-import-toolbar {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.body--dark .rune-batch-import-tabs {
  border-bottom-color: rgba(126, 87, 194, 0.32);
}

.body--dark .rune-batch-import-label {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .rune-batch-import-file-area {
  border-color: rgba(126, 87, 194, 0.45);

  &:hover {
    border-color: #7E57C2;
    background: rgba(126, 87, 194, 0.08);
  }
}

.body--dark .rune-batch-import-hint {
  color: rgba(255, 255, 255, 0.45);
}

.body--dark .rune-batch-import-preview {
  background: rgba(126, 87, 194, 0.12);
}

.body--dark .rune-batch-import-side {
  background: rgba(40, 40, 40, 0.45);
  border-color: rgba(126, 87, 194, 0.3);
}

.body--dark .rune-batch-import-side-title {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .rune-batch-import-tile {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);

  &:hover {
    border-color: rgba(126, 87, 194, 0.6);
    background: rgba(126, 87, 194, 0.15);
  }

  &.is-selected {
    border-color: #B39DDB;
    background: rgba(126, 87, 194, 0.25);
  }
}

.body--dark .rune-batch-import-tile--conflict {
  border-color: rgba(255, 193, 7, 0.55);

  &.is-selected {
    border-color: #ffb74d;
    background: rgba(255, 193, 7, 0.18);
  }
}

.body--dark .rune-batch-import-side-empty {
  color: rgba(255, 255, 255, 0.4);
}

.body--dark .rune-batch-import-error {
  background: rgba(244, 67, 54, 0.16);
  color: #ef9a9a;
}

.body--dark .rune-batch-import-result-success {
  background: rgba(76, 175, 80, 0.16);
  color: #81c784;
}

.body--dark .rune-batch-import-result-error {
  background: rgba(244, 67, 54, 0.16);
  color: #ef9a9a;
}

.body--dark .rune-batch-import-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

/* el-tooltip 内层：避免行高/字号被全局样式覆盖 */
.rune-batch-import-tooltip-content {
  font-size: 12px;
  line-height: 1.5;
  max-width: 320px;
  word-break: break-word;
  white-space: pre-wrap;
}

/* el-tooltip popper：与 q-tooltip 视觉对齐 */
.rune-batch-import-tooltip {
  background: rgba(40, 40, 40, 0.92) !important;
  color: #fff !important;
  padding: 6px 10px !important;
  max-width: 320px !important;

  &[x-placement^='top'] .popper__arrow {
    border-top-color: rgba(40, 40, 40, 0.92) !important;
  }
  &[x-placement^='bottom'] .popper__arrow {
    border-bottom-color: rgba(40, 40, 40, 0.92) !important;
  }
}
</style>

<script>
import { RuneCategoryEnum } from 'src/utils/enum'
import runeTemplateService from 'src/services/RuneTemplateService'
import { parseRunePack } from 'src/services/RuneImportService'
import DatabaseClient from 'src/utils/DatabaseClient'

export default {
  name: 'runeBatchImportDialog',
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
      default: ''
    },
    existingRunes: {
      type: Array,
      default: () => []
    },
    builtinNames: {
      type: Array,
      default: () => []
    }
  },
  data () {
    return {
      // v2026-08-01：导入源 Tab（file = 本地 JSON 文件；url = 在线 URL）
      sourceTab: 'file',
      remoteUrl: '',
      fetchingRemote: false,
      selectedFile: null,
      // v2026-08-01 修复：v-if 渲染源已统一到 parsedEntries（与 echo 弹框对齐）；
      //   旧 parsedData 字段曾指向 parsed.runes，但 parseRunePack 不返回该字段 → v-if 永远 false，
      //   用户看到「只显示文件名，下面一片空白」面板。删除以彻底断绝歧义。
      parsedEntries: [],
      newItems: [],
      conflictItems: [],
      builtinFilteredCount: 0,
      totalInvalidCount: 0,
      // v2026-08-01（修复）：data 初始化时立即用 defaultCategory，避免 v-if mount 后 + watch.value 异步触发的
      //   渲染抖动（用户看到下拉框空白 → 一帧后跳到目标分类）。父端 openBatchImport 已先更新
      //   runeImportCategory 再设 visible=true，prop default-category 在组件创建瞬间就是目标值。
      localCategory: this.defaultCategory || '',
      importing: false,
      errorMessage: '',
      importResult: null
    }
  },
  computed: {
    categoryOptions () {
      return RuneCategoryEnum.items.map(c => ({
        value: c.value,
        label: c.label
      }))
    },
    hasSelectedItem () {
      if (this.importing) return false
      return this.newItems.some(it => it.selected) || this.conflictItems.some(it => it.selected)
    }
  },
  watch: {
    // v2026-08-01（修复 defaultCategory 同步）：
    //   watch.defaultCategory 监听 prop 变化——父端如果改了 defaultCategory（罕见，但用户连续切换 tab 后点导入可能
    //   触发时序不一致），子组件 localCategory 立即跟随。
    //   watch.value 仅用于弹框打开瞬间触发 clearState()，localCategory 已经在 data() 初始化时绑好 prop。
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
        // 弹框打开时再校一次 localCategory，覆盖可能的 prop 变化路径
        this.localCategory = this.defaultCategory || RuneCategoryEnum.General
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
      this.builtinFilteredCount = 0
      this.totalInvalidCount = 0
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
      this.builtinFilteredCount = 0
      this.totalInvalidCount = 0
      this.localCategory = this.defaultCategory || RuneCategoryEnum.General
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
     * 调用方在调本方法前应已设置好 sourceTab / selectedFile / remoteUrl 等上下文，
     * 并清空过错误/结果。
     */
    async applyParsedText (text) {
      try {
        const parsed = parseRunePack(text)
        if (!parsed.success) {
          // service 端已给出"误传回响 / 旧版符文 JSON / 文件过大"等友好文案，直接透传
          this.errorMessage = parsed.message || 'JSON 解析失败'
          this.parsedEntries = []
          this.newItems = []
          this.conflictItems = []
          return
        }
        const validEntries = parsed.entries
        if (validEntries.length === 0) {
          this.errorMessage = 'JSON 解析失败：未找到任何有效的符文条目'
          this.parsedEntries = []
          this.newItems = []
          this.conflictItems = []
          this.totalInvalidCount = parsed.invalidItems.length
          return
        }
        // v2026-08-01 修复：v-if 渲染源是 parsedEntries（与 echo 弹框对齐）；
        //   旧版曾用 parsed.runes 作为 parsedData，但 parseRunePack 不返回 runes 字段
        //   （只返回 entries / invalidItems），导致预览区 v-if='parsedData && parsedData.length > 0'
        //   永远为 false，用户看到"选完文件后下面一片空白"。
        this.parsedEntries = validEntries
        this.totalInvalidCount = parsed.invalidItems.length
        try {
          const result = await runeTemplateService.dryRunImport(
            validEntries.map(e => e.normalized),
            this.localCategory || this.defaultCategory || RuneCategoryEnum.General,
            {
              builtinNames: this.builtinNames || [],
              // 把 existingRunes Snapshot 也作为 hint 传给 service（service 内部以 DB 现读为准，hint 仅用于早期切分 + 离线兜底）
              existingRunes: this.existingRunes || []
            }
          )
          this.builtinFilteredCount = result.builtinFiltered
          this.newItems = result.newItems
          this.conflictItems = result.conflictItems
        } catch (e) {
          console.warn('[rune-batch-import-dialog] dryRunImport failed, fallback to local split', e)
          const invalidCount = parsed.invalidItems.length
          this.totalInvalidCount = invalidCount
          // fallback 也走同一份 split（用 validEntries 的 raw 字段构造 entry）
          this.splitParsedIntoGroups(validEntries.map(e => e.raw))
          this.errorMessage = '注意：与服务端同步异常，已用本地缓存切分，结果可能与实际数据不符'
        }
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
      try {
        const text = await this.readFileAsText(file)
        await this.applyParsedText(text)
      } catch (e) {
        this.errorMessage = 'JSON 解析失败: ' + (e && e.message ? e.message : String(e))
        this.parsedEntries = []
        this.newItems = []
        this.conflictItems = []
      }
    },
    async onRemoteUrlSubmit () {
      const url = (this.remoteUrl || '').trim()
      if (!url) {
        this.errorMessage = '请输入 Rune Pack URL'
        return
      }
      this.fetchingRemote = true
      this.errorMessage = ''
      this.importResult = null
      try {
        const res = await DatabaseClient.runePacks.fetchRemote({ sourceUrl: url })
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
    splitParsedIntoGroups (items) {
      const existingNameSet = new Set(
        (this.existingRunes || [])
          .filter(r => r && r.name)
          .map(r => String(r.name || '').trim().toLowerCase())
      )
      const builtinNameSet = new Set(
        (this.builtinNames || [])
          .filter(Boolean)
          .map(n => String(n || '').trim().toLowerCase())
      )
      let builtinFiltered = 0
      const newList = []
      const conflictList = []
      items.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') return
        const name = String(raw.name || '').trim()
        if (!name) return
        const nameKey = name.toLowerCase()
        if (builtinNameSet.has(nameKey)) {
          builtinFiltered += 1
          return
        }
        const entry = {
          key: `${index}-${nameKey}`,
          name,
          desc: String(raw.desc || ''),
          category: raw.category || this.defaultCategory || RuneCategoryEnum.General,
          color: raw.color || '#7E57C2',
          icon: raw.icon || 'star',
          template: raw.template || '',
          selected: false
        }
        if (existingNameSet.has(nameKey)) {
          conflictList.push(entry)
        } else {
          entry.selected = true
          newList.push(entry)
        }
      })
      this.builtinFilteredCount = builtinFiltered
      this.newItems = newList
      this.conflictItems = conflictList
    },
    selectAll (selected, isConflict) {
      const list = isConflict ? this.conflictItems : this.newItems
      list.forEach(it => { it.selected = selected })
    },
    doImport () {
      const newChosen = this.newItems.filter(it => it.selected)
      const conflictChosen = this.conflictItems.filter(it => it.selected)
      if (newChosen.length === 0 && conflictChosen.length === 0) {
        this.errorMessage = '请至少勾选一个符文'
        return
      }
      const merged = newChosen.concat(conflictChosen)
      const items = merged.map(it => ({
        name: it.name,
        desc: it.desc,
        category: it.category,
        color: it.color,
        icon: it.icon,
        template: it.template
      }))
      const conflictMode = conflictChosen.length > 0 ? 'replace' : 'normal'
      this.importing = true
      this.errorMessage = ''
      this.importResult = null
      this.$emit('import', {
        items,
        category: this.localCategory || RuneCategoryEnum.General,
        conflictMode
      })
    },
    onImportSuccess (count) {
      this.importing = false
      this.importResult = { success: true, count }
      this.$nextTick(() => {
        setTimeout(() => {
          this.$emit('input', false)
        }, 1500)
      })
    },
    onImportError (message) {
      this.importing = false
      this.importResult = { success: false, message }
    },
    finishImport () {
      this.importing = false
    }
  }
}
</script>