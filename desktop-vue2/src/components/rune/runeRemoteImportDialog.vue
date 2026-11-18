<!--
  RuneRemoteImportDialog - rune 远端导入子表单
  从 RuneFormDialog 内触发，承载 GitHub URL 输入 + 分类选择 + 错误提示。
  视觉/交互风格与 RuneFormDialog 保持一致（Element-UI 表单 + quasar 弹层外框）。
-->
<template>
  <q-dialog
    :value='value'
    @input='v => $emit("input", v)'
    transition-show='fade'
    transition-hide='fade'
  >
    <q-card class='remote-import-card'>
      <q-toolbar class='remote-import-toolbar'>
        <q-icon name='cloud_download' color='primary' size='1.4em' class='q-mr-xs' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>从 GitHub 导入 rune 模板</span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='remote-import-body'>
        <div class='remote-import-field'>
          <div class='remote-import-label'>GitHub URL</div>
          <el-input
            v-model='localUrl'
            placeholder='https://github.com/<u>/<r>/blob/<b>/<p>.vue 或 raw 形式'
            clearable
            size='small'
            class='remote-import-input'
          />
          <div class='remote-import-hint'>
            支持 <code>github.com/.../blob/...</code>、<code>github.com/.../raw/...</code>、
            <code>raw.githubusercontent.com</code>、<code>gist.githubusercontent.com</code>
          </div>
        </div>

        <div class='remote-import-field'>
          <div class='remote-import-label'>分类（可选，缺省自动推断）</div>
          <q-select
            v-model='localCategory'
            dense
            outlined
            :options='categoryOptions'
            option-label='label'
            option-value='value'
            emit-value
            map-options
            clearable
            placeholder='自动推断'
            class='remote-import-input'
          >
            <template v-slot:selected-item='scope'>
              <span>{{ scope.opt ? scope.opt.label : '自动推断' }}</span>
            </template>
            <template v-slot:option='scope'>
              <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>

        <div v-if='errorMessage' class='remote-import-error'>
          <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
          {{ errorMessage }}
        </div>
      </q-card-section>

      <q-card-actions align='right' class='remote-import-footer'>
        <q-btn flat dense no-caps label='取消' v-close-popup />
        <q-btn
          flat
          dense
          no-caps
          color='primary'
          icon='cloud_download'
          label='导入'
          :loading='submitting'
          :disable='!localUrl'
          @click='submit'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.remote-import-card {
  min-width: 460px;
  max-width: 92vw;
  width: 520px;
}

.remote-import-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.remote-import-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.remote-import-field {
  display: flex;
  flex-direction: column;
}

.remote-import-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  font-weight: 500;
  margin-bottom: 4px;
}

.remote-import-input {
  width: 100%;
}

.remote-import-hint {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  line-height: 1.5;
}

.remote-import-hint code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(126, 87, 194, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
  color: #6A1B9A;
}

.remote-import-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.remote-import-footer {
  padding: 10px 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

.body--dark .remote-import-toolbar {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.body--dark .remote-import-label {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .remote-import-hint {
  color: rgba(255, 255, 255, 0.45);
}

.body--dark .remote-import-error {
  background: rgba(244, 67, 54, 0.16);
  color: #ef9a9a;
}

.body--dark .remote-import-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}
</style>

<script>
export default {
  name: 'runeRemoteImportDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    url: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      default: ''
    },
    categoryOptions: {
      type: Array,
      default: () => []
    },
    submitting: {
      type: Boolean,
      default: false
    },
    errorMessage: {
      type: String,
      default: ''
    }
  },
  data () {
    return {
      localUrl: '',
      localCategory: ''
    }
  },
  watch: {
    url: {
      immediate: true,
      handler (v) { this.localUrl = v || '' }
    },
    category: {
      immediate: true,
      handler (v) { this.localCategory = v || '' }
    },
    value (v) {
      if (v) {
        // 打开时同步父组件传入的 url/category，避免父组件引用错位
        this.localUrl = this.url || ''
        this.localCategory = this.category || ''
      }
    }
  },
  methods: {
    submit () {
      this.$emit('submit', {
        url: this.localUrl,
        category: this.localCategory
      })
    }
  }
}
</script>