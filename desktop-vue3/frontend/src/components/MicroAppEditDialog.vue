<template>
  <el-dialog
    v-model="visible"
    width="60vw"
    top="10vh"
    append-to-body
    :show-close="false"
    class="micro-app-edit-dialog"
  >
    <div class="micro-app-edit-toolbar">
      <el-icon class="micro-app-edit-toolbar-icon">
        <Edit v-if="editing" />
        <CirclePlus v-else />
      </el-icon>
      <span class="micro-app-edit-toolbar-title">
        {{ editing ? t('microApps.editTitle') : t('microApps.addTitle') }}
      </span>
      <button type="button" class="micro-app-edit-close" :title="t('action.close')" @click="visible = false">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="micro-app-edit-body">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="86px"
        label-position="right"
        size="small"
        @submit.prevent
      >
        <el-form-item :label="t('microApps.mode')">
          <el-radio-group v-model="form.loadMode" size="small">
            <el-radio-button value="iframe">{{ t('microApps.modeIframe') }}</el-radio-button>
            <el-radio-button value="module">{{ t('microApps.modeModule') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="t('microApps.name')" prop="name">
          <el-input v-model="form.name" :placeholder="t('microApps.namePlaceholder')" maxlength="32" clearable />
        </el-form-item>

        <el-form-item :label="t('microApps.icon')" prop="icon">
          <el-input v-model="form.icon" :placeholder="t('microApps.iconPlaceholder')" clearable>
            <template #append>
              <el-icon class="micro-app-edit-icon-preview">
                <component :is="iconPreview" />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <template v-if="form.loadMode === 'iframe'">
          <el-form-item :label="t('microApps.url')" prop="url">
            <el-input v-model="form.url" :placeholder="t('microApps.urlPlaceholder')" clearable />
          </el-form-item>
          <el-form-item :label="t('microApps.devUrl')" prop="devUrl">
            <el-input v-model="form.devUrl" :placeholder="t('microApps.devUrlPlaceholder')" clearable />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item :label="t('microApps.libName')" prop="libName">
            <el-input v-model="form.libName" placeholder="hel-demo-lib" clearable />
          </el-form-item>
          <el-form-item :label="t('microApps.exportName')">
            <el-input v-model="form.exportName" placeholder="default" clearable />
          </el-form-item>
          <el-form-item :label="t('microApps.libVersion')">
            <el-input v-model="form.version" :placeholder="t('microApps.libVersionPlaceholder')" clearable />
          </el-form-item>
        </template>

        <el-form-item :label="t('microApps.enabled')">
          <el-switch v-model="form.enabled" active-color="#21ba45" />
        </el-form-item>

        <el-form-item :label="t('microApps.setDefault')">
          <div class="micro-app-edit-inline">
            <el-radio-group v-model="form.isDefault" :disabled="!form.enabled">
              <el-radio :value="true" border size="small">{{ t('action.yes') }}</el-radio>
              <el-radio :value="false" border size="small">{{ t('action.no') }}</el-radio>
            </el-radio-group>
            <span class="micro-app-edit-hint">{{ t('microApps.defaultHint') }}</span>
          </div>
        </el-form-item>

        <el-form-item :label="t('microApps.isMobile')">
          <div class="micro-app-edit-inline">
            <el-switch v-model="form.isMobile" />
            <span class="micro-app-edit-hint">{{ t('microApps.isMobileHint') }}</span>
          </div>
        </el-form-item>

        <el-form-item :label="t('microApps.displayMode')">
          <div class="micro-app-edit-inline">
            <el-radio-group v-model="form.displayMode">
              <el-radio value="drawer" border size="small">{{ t('microApps.displayDrawer') }}</el-radio>
              <el-radio value="fullscreen" border size="small">{{ t('microApps.displayFullscreen') }}</el-radio>
            </el-radio-group>
            <span class="micro-app-edit-hint">{{ t('microApps.displayModeHint') }}</span>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="micro-app-edit-footer">
        <el-button text @click="visible = false">{{ t('action.cancel') }}</el-button>
        <el-button class="micro-app-edit-submit" :loading="submitting" @click="submit">
          <el-icon><Check /></el-icon>
          {{ t('action.ok') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import {
  ChatDotRound,
  Check,
  CirclePlus,
  Close,
  Cloudy,
  Cpu,
  Edit,
  Grid,
} from '@element-plus/icons-vue';
import type { MicroApp } from '@/services/microApps';
import { normalizeMicroApp } from '@/services/microApps';

/**
 * 微应用编辑框（复刻 vue2 microAppEditDialog）。
 * 保留 v3 独有的装载模式；其余字段、顺序、绿色确定按钮与尺寸按 vue2 对齐。
 */
const props = defineProps<{ modelValue: boolean; app: MicroApp | null }>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'submit', value: MicroApp): void;
}>();

const { t } = useI18n();
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
const editing = computed(() => Boolean(props.app?.id));
const formRef = ref<FormInstance>();
const submitting = ref(false);

const emptyForm = (): MicroApp => ({
  id: '',
  name: '',
  icon: 'chat-dot-round',
  url: '',
  devUrl: '',
  libName: '',
  exportName: '',
  version: '',
  loadMode: 'iframe',
  isDefault: false,
  enabled: true,
  isMobile: false,
  displayMode: 'drawer',
  isBuiltIn: false,
});

const form = ref<MicroApp>(emptyForm());

const rules: FormRules = {
  name: [
    { required: true, message: t('microApps.nameRequired'), trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (String(value ?? '').length > 32) {
          callback(new Error(t('microApps.nameMaxLength', { max: 32 })));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

const iconPreview = computed(() => {
  const name = String(form.value.icon || '').trim().replace(/^el-icon-/, '');
  const icons: Record<string, typeof Grid> = {
    'chat-dot-round': ChatDotRound,
    cloudy: Cloudy,
    cpu: Cpu,
    grid: Grid,
  };
  return icons[name] ?? Grid;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = props.app ? { ...props.app } : emptyForm();
      formRef.value?.clearValidate();
    }
  },
);

watch(
  () => form.value.enabled,
  (enabled) => {
    if (!enabled) {
      form.value.isDefault = false;
    }
  },
);

async function submit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (valid === false) {
    return;
  }
  const isBuiltinFullscreen = form.value.isBuiltIn && form.value.displayMode === 'fullscreen';
  if (form.value.loadMode === 'iframe' && !isBuiltinFullscreen && !form.value.url && !form.value.devUrl) {
    ElMessage.warning(t('microApps.urlRequired'));
    return;
  }
  if (form.value.loadMode === 'module' && !form.value.libName.trim()) {
    ElMessage.warning(t('microApps.libNameRequired'));
    return;
  }
  const id = form.value.id || `micro-app-${Date.now().toString(36)}`;
  const normalized = normalizeMicroApp({ ...form.value, id, name: form.value.name.trim() });
  if (!normalized) {
    ElMessage.warning(t('microApps.invalid'));
    return;
  }
  submitting.value = true;
  try {
    emit('submit', normalized);
    visible.value = false;
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.micro-app-edit-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.micro-app-edit-toolbar-icon {
  color: #21ba45;
  font-size: 20px;
}

.micro-app-edit-toolbar-title {
  flex: 1;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 700;
}

.micro-app-edit-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.micro-app-edit-close:hover {
  background: var(--el-fill-color);
}

.micro-app-edit-body {
  max-height: 65vh;
  padding: 12px 18px 4px;
  overflow-y: auto;
}

.micro-app-edit-icon-preview {
  color: var(--el-text-color-secondary);
  font-size: 18px;
}

.micro-app-edit-inline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.micro-app-edit-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.micro-app-edit-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.micro-app-edit-submit {
  border-color: #21ba45;
  background: #21ba45;
  color: #fff;
}

.micro-app-edit-submit:hover,
.micro-app-edit-submit:focus {
  border-color: #1a9e3a;
  background: #1a9e3a;
  color: #fff;
}
</style>
