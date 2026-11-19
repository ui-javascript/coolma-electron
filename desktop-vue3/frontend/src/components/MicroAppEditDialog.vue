<template>
  <el-dialog v-model="visible" :title="editing ? t('microApps.editTitle') : t('microApps.addTitle')" width="560px">
    <el-form label-width="96px" label-position="left">
      <el-form-item :label="t('microApps.mode')">
        <el-radio-group v-model="form.loadMode">
          <el-radio-button value="iframe">{{ t('microApps.modeIframe') }}</el-radio-button>
          <el-radio-button value="module">{{ t('microApps.modeModule') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="t('microApps.name')" required>
        <el-input v-model="form.name" maxlength="32" />
      </el-form-item>

      <template v-if="form.loadMode === 'iframe'">
        <el-form-item :label="t('microApps.url')">
          <el-input v-model="form.url" placeholder="https://example.com/" />
        </el-form-item>
        <el-form-item :label="t('microApps.devUrl')">
          <el-input v-model="form.devUrl" placeholder="http://localhost:3333/" />
        </el-form-item>
      </template>

      <template v-else>
        <el-form-item :label="t('microApps.libName')" required>
          <el-input v-model="form.libName" placeholder="hel-demo-lib" />
        </el-form-item>
        <el-form-item :label="t('microApps.exportName')">
          <el-input v-model="form.exportName" placeholder="default" />
        </el-form-item>
        <el-form-item :label="t('microApps.libVersion')">
          <el-input v-model="form.version" placeholder="1.0.0（留空取最新）" />
        </el-form-item>
      </template>

      <el-form-item :label="t('microApps.displayMode')">
        <el-select v-model="form.displayMode" class="w-full">
          <el-option :label="t('microApps.displayDrawer')" value="drawer" />
          <el-option :label="t('microApps.displayFullscreen')" value="fullscreen" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('microApps.icon')">
        <el-input v-model="form.icon" placeholder="chat-dot-round" />
      </el-form-item>

      <el-form-item :label="t('microApps.enabled')">
        <el-switch v-model="form.enabled" />
      </el-form-item>

      <el-form-item :label="t('microApps.setDefault')">
        <el-switch v-model="form.isDefault" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" @click="submit">{{ t('action.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { MicroApp } from '@/services/microApps';
import { normalizeMicroApp } from '@/services/microApps';

/**
 * 微应用编辑框（复刻 vue2 microAppEditDialog）。
 * 相比 vue2 多了「装载模式」：iframe（wujie）/ module（hel-micro）。
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

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = props.app ? { ...props.app } : emptyForm();
    }
  },
);

function submit(): void {
  if (!form.value.name.trim()) {
    ElMessage.warning(t('microApps.nameRequired'));
    return;
  }
  const id = form.value.id || `micro-app-${Date.now().toString(36)}`;
  const normalized = normalizeMicroApp({ ...form.value, id, name: form.value.name.trim() });
  if (!normalized) {
    ElMessage.warning(t('microApps.invalid'));
    return;
  }
  if (normalized.loadMode === 'module' && !normalized.libName.trim()) {
    ElMessage.warning(t('microApps.libNameRequired'));
    return;
  }
  emit('submit', normalized);
  visible.value = false;
}
</script>
