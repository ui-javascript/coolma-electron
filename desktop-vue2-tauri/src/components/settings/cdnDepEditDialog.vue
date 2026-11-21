<template>
  <q-dialog
    ref="dialog"
    transition-show="fade"
    transition-hide="fade"
    :value="value"
    @input="v => $emit('input', v)"
  >
    <q-card class="cdn-dep-edit-dialog">
      <q-toolbar class="cdn-dep-edit-dialog__toolbar">
        <q-icon :name="isEditing ? 'edit' : 'add_circle_outline'" color="red-7" size="1.4em" />
        <q-toolbar-title>
          <span class="text-weight-bold">
            {{ isEditing ? $t('cdnDepsEditTitle') : $t('cdnDepsAddTitle') }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-toolbar>

      <q-card-section class="cdn-dep-edit-dialog__body">
        <el-form
          ref="form"
          :model="form"
          :rules="rules"
          label-width="86px"
          label-position="right"
          size="small"
          @submit.native.prevent
        >
          <el-form-item :label="$t('cdnDepsName')" prop="name">
            <el-input
              v-model="form.name"
              :placeholder="$t('cdnDepsNamePlaceholder')"
              maxlength="64"
              clearable
            />
          </el-form-item>

          <el-form-item :label="$t('cdnDepsUrl')" prop="url">
            <el-input
              v-model="form.url"
              :placeholder="$t('cdnDepsUrlPlaceholder')"
              clearable
            />
          </el-form-item>

          <el-form-item :label="$t('cdnDepsEnabled')">
            <el-switch v-model="form.enabled" active-color="red-7" />
          </el-form-item>

          <el-form-item :label="$t('cdnDepsApplyToBlog')">
            <el-switch
              v-model="form.applyToBlog"
              active-color="red-7"
              :disabled="!form.enabled"
            />
            <span class="text-caption text-grey-6 q-ml-sm">{{ $t('cdnDepsApplyToBlogHint') }}</span>
          </el-form-item>
        </el-form>
      </q-card-section>

      <q-card-actions align="right" class="cdn-dep-edit-dialog__footer">
        <q-btn flat dense no-caps :label="$t('cancel')" v-close-popup />
        <q-btn
          unelevated
          color="red-7"
          dense
          no-caps
          icon="check"
          :label="$t('ok')"
          :loading="submitting"
          @click="onSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
function generateId () {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 把传入的 dep 归一化成弹框表单。
 * - 新增（source 为 null）→ 生成新 id
 * - 编辑 → 沿用 source.id，并保留内置标记（isBuiltIn 由父组件持有，弹框只关心可编辑字段）
 */
function buildInitialForm (source) {
  const base = {
    id: generateId(),
    name: '',
    url: '',
    enabled: true,
    applyToBlog: false
  }
  if (source && typeof source === 'object') {
    return {
      id: String(source.id || base.id),
      name: String(source.name || ''),
      url: String(source.url || ''),
      enabled: source.enabled === undefined ? true : Boolean(source.enabled),
      applyToBlog: Boolean(source.applyToBlog)
    }
  }
  return base
}

export default {
  name: 'cdnDepEditDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    // 编辑时传入源；新增时为 null
    source: {
      type: Object,
      default: null
    }
  },
  data () {
    return {
      form: buildInitialForm(this.source),
      submitting: false
    }
  },
  computed: {
    isEditing () {
      return !!(this.source && this.source.id)
    },
    rules () {
      return {
        name: [
          { required: true, message: this.$t('cdnDepsNameRequired'), trigger: 'blur' },
          { max: 64, message: this.$t('cdnDepsNameMaxLength', { max: 64 }), trigger: 'blur' }
        ],
        url: [
          { required: true, message: this.$t('cdnDepsUrlRequired'), trigger: 'blur' },
          {
            validator: (rule, value, cb) => {
              const v = String(value || '').trim()
              if (!v) return cb()
              // 允许 //unpkg.com/xxx 或 http(s)://xxx 这两种最常见形式
              if (/^(https?:\/\/|\/\/)/i.test(v)) return cb()
              cb(new Error(this.$t('cdnDepsInvalidUrl')))
            },
            trigger: 'blur'
          }
        ]
      }
    }
  },
  watch: {
    value (visible) {
      if (visible) {
        // 打开时重置表单
        this.form = buildInitialForm(this.source)
        this.$nextTick(() => {
          if (this.$refs.form && typeof this.$refs.form.clearValidate === 'function') {
            this.$refs.form.clearValidate()
          }
        })
      }
    },
    source: {
      deep: true,
      handler () {
        if (this.value) this.form = buildInitialForm(this.source)
      }
    }
  },
  methods: {
    onSubmit () {
      this.$refs.form.validate(valid => {
        if (!valid) return
        // 前置 trim
        const payload = {
          ...this.form,
          name: String(this.form.name || '').trim(),
          url: String(this.form.url || '').trim()
        }
        this.submitting = true
        try {
          this.$emit('submit', payload)
        } finally {
          // submit 完成后由父组件关弹框
          this.submitting = false
        }
      })
    }
  }
}
</script>

<style scoped>
.cdn-dep-edit-dialog {
  min-width: 460px;
  max-width: 560px;
  width: 60vw;
}

.cdn-dep-edit-dialog__toolbar {
  min-height: 42px;
  padding: 4px 8px;
}

.cdn-dep-edit-dialog__body {
  padding: 12px 18px 4px 18px;
  max-height: 65vh;
  overflow-y: auto;
}

.cdn-dep-edit-dialog__footer {
  padding: 8px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.body--dark .cdn-dep-edit-dialog__footer {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>