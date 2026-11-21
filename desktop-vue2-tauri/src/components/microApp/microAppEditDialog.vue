<template>
  <q-dialog
    ref="dialog"
    transition-show="fade"
    transition-hide="fade"
    :value="value"
    @input="v => $emit('input', v)"
  >
    <q-card class="micro-app-edit-dialog">
      <q-toolbar class="micro-app-edit-dialog__toolbar">
        <q-icon :name="isEditing ? 'edit' : 'add_circle_outline'" color="green-7" size="1.4em" />
<q-toolbar-title>
            <span class="text-weight-bold">
              {{ isEditing ? $t('microAppsEditTitle') : $t('microAppsAddTitle') }}
            </span>
          </q-toolbar-title>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-toolbar>

      <q-card-section class="micro-app-edit-dialog__body">
        <el-form
          ref="form"
          :model="form"
          :rules="rules"
          label-width="86px"
          label-position="right"
          size="small"
          @submit.native.prevent
        >
          <el-form-item :label="$t('microAppsName')" prop="name">
            <el-input
              v-model="form.name"
              :placeholder="$t('microAppsNamePlaceholder')"
              maxlength="32"
              clearable
            />
          </el-form-item>

          <el-form-item :label="$t('microAppsIcon')" prop="icon">
            <el-input
              v-model="form.icon"
              :placeholder="$t('microAppsIconPlaceholder')"
              clearable
            >
              <template v-slot:append>
                <q-icon :name="iconPreview" size="20px" class="micro-app-edit-dialog__icon-preview">
                  <q-tooltip v-if="!iconPreview" content-class="text-caption">
                    {{ $t('microAppsIconPreviewHint') }}
                  </q-tooltip>
                </q-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item :label="$t('microAppsUrl')" prop="url">
            <el-input
              v-model="form.url"
              :placeholder="$t('microAppsUrlPlaceholder')"
              clearable
            />
          </el-form-item>

          <el-form-item :label="$t('microAppsDevUrl')" prop="devUrl">
            <el-input
              v-model="form.devUrl"
              :placeholder="$t('microAppsDevUrlPlaceholder')"
              clearable
            />
          </el-form-item>

          <el-form-item :label="$t('microAppsEnabled')">
            <el-switch v-model="form.enabled" active-color="green-7" />
          </el-form-item>

          <el-form-item :label="$t('microAppsDefault')">
            <el-radio v-model="form.isDefault" :label="true" :disabled="!form.enabled" border size="mini">
              {{ $t('yes') }}
            </el-radio>
            <el-radio v-model="form.isDefault" :label="false" :disabled="!form.enabled" border size="mini">
              {{ $t('no') }}
            </el-radio>
            <span class="text-caption text-grey-6 q-ml-sm">{{ $t('microAppsDefaultHint') }}</span>
          </el-form-item>

          <el-form-item :label="$t('microAppsIsMobile')">
            <el-switch v-model="form.isMobile" />
            <span class="text-caption text-grey-6 q-ml-sm">{{ $t('microAppsIsMobileHint') }}</span>
          </el-form-item>

          <!-- v2026-08-08 新增：displayMode（抽屉 / 全屏）。内置条目也可编辑。 -->
          <el-form-item :label="$t('microAppsDisplayMode')">
            <el-radio v-model="form.displayMode" :label="'drawer'" border size="mini">
              {{ $t('microAppsDisplayModeDrawer') }}
            </el-radio>
            <el-radio v-model="form.displayMode" :label="'fullscreen'" border size="mini">
              {{ $t('microAppsDisplayModeFullscreen') }}
            </el-radio>
            <span class="text-caption text-grey-6 q-ml-sm">{{ $t('microAppsDisplayModeHint') }}</span>
          </el-form-item>
        </el-form>
      </q-card-section>

      <q-card-actions align="right" class="micro-app-edit-dialog__footer">
        <q-btn flat dense no-caps :label="$t('cancel')" v-close-popup />
        <q-btn
          unelevated
          color="green-7"
          dense
          no-caps
          icon="check"
          :label="$t('ok')"
          :loading="submitting"
          @click="onSubmit"
        >
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
function generateId () {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function buildInitialForm (source) {
  const base = {
    id: generateId(),
    name: '',
    icon: 'el-icon-chat-dot-round',
    url: '',
    devUrl: '',
    isDefault: false,
    enabled: true,
    isMobile: false,
    displayMode: 'drawer',
    // 标记内置：内置条目所有字段只读、不能删除；编辑弹框里看不到这个字段。
    // buildInitialForm 接收 source.isBuiltIn（通常 false，因为用户只能编辑非内置条目），
    // 如果调用方传入的是内置条目，由调用方自己处理。
    isBuiltIn: false
  }
  if (source && typeof source === 'object') {
    return {
      id: String(source.id || base.id),
      name: String(source.name || ''),
      icon: String(source.icon || base.icon),
      url: String(source.url || ''),
      devUrl: String(source.devUrl || ''),
      isDefault: Boolean(source.isDefault),
      enabled: source.enabled === undefined ? true : Boolean(source.enabled),
      isMobile: Boolean(source.isMobile),
      displayMode: source.displayMode === 'fullscreen' ? 'fullscreen' : 'drawer',
      isBuiltIn: Boolean(source.isBuiltIn)
    }
  }
  return base
}

export default {
  name: 'microAppEditDialog',
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
    /**
     * 【v2026-08-08 调整】内置条目也像普通条目一样允许编辑（url/devUrl/displayMode/name 等均可修改），
     * 唯一的限制是「不可删除」（由 SettingsMicroAppsPanel 的删除按钮 v-if 控制）。
     * 此处 readonly 恒为 false，保留 computed 占位以方便未来扩展。
     */
    isBuiltin () {
      return Boolean(this.source && this.source.isBuiltIn)
    },
    readonly () {
      return false
    },
    iconPreview () {
      const icon = String(this.form.icon || '').trim()
      if (!icon) return 'apps'
      if (icon.startsWith('el-icon-')) return 'apps'
      return icon
    },
    rules () {
      return {
        name: [
          { required: true, message: this.$t('microAppsNameRequired'), trigger: 'blur' },
          { max: 32, message: this.$t('microAppsNameMaxLength', { max: 32 }), trigger: 'blur' }
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
    },
    'form.enabled' (val) {
      if (!val) this.form.isDefault = false
    }
  },
  methods: {
    onSubmit () {
      this.$refs.form.validate(async valid => {
        if (!valid) return
        // 至少要填一个 url（生产 / 开发）
        // 例外：内置全屏应用（isBuiltIn && displayMode==='fullscreen'）可以两者都空，
        // 由 fullscreenOverlay 自动解析 _plugins/<id>/dist/index.html。
        const isBuiltinFullscreen =
          this.form.isBuiltIn && this.form.displayMode === 'fullscreen'
        if (!isBuiltinFullscreen && !this.form.url && !this.form.devUrl) {
          this.$q.notify({
            message: this.$t('microAppsUrlRequired'),
            type: 'warning',
            position: 'top'
          })
          return
        }
        this.submitting = true
        try {
          this.$emit('submit', { ...this.form })
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
.micro-app-edit-dialog {
  min-width: 460px;
  max-width: 560px;
  width: 60vw;
}

.micro-app-edit-dialog__toolbar {
  min-height: 42px;
  padding: 4px 8px;
}

.micro-app-edit-dialog__body {
  padding: 12px 18px 4px 18px;
  max-height: 65vh;
  overflow-y: auto;
}

.micro-app-edit-dialog__footer {
  padding: 8px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.micro-app-edit-dialog__icon-preview {
  color: var(--iconColor, #6b7280);
}

.body--dark .micro-app-edit-dialog__footer {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
