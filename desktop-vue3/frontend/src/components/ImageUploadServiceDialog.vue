<template>
  <el-dialog
    v-model="visible"
    width="500px"
    top="10vh"
    append-to-body
    :show-close="false"
    class="image-service-dialog"
  >
    <div class="image-service-toolbar">
      <el-icon class="image-service-icon"><Picture /></el-icon>
      <span class="image-service-title">{{ t('settings.imageUploadService') }}</span>
      <button type="button" class="image-service-close" :title="t('action.close')" @click="visible = false">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="image-service-body">
      <el-form label-position="top" class="image-service-form" @submit.prevent>
        <el-form-item :label="t('settings.apiServerUrl')">
          <el-input v-model="form.apiServerUrl" clearable spellcheck="false" />
        </el-form-item>
        <el-form-item :label="t('settings.postParam')">
          <el-input v-model="form.postParam" clearable spellcheck="false" />
        </el-form-item>
        <el-form-item :label="t('settings.jsonPath')">
          <el-input v-model="form.jsonPath" clearable spellcheck="false" />
        </el-form-item>
        <el-form-item :label="t('settings.customHeader')">
          <el-input v-model="form.customHeader" clearable spellcheck="false" />
        </el-form-item>
        <el-form-item :label="t('settings.customBody')">
          <el-input v-model="form.customBody" clearable spellcheck="false" />
        </el-form-item>
      </el-form>
      <div class="image-service-actions">
        <el-button type="primary" @click="submit">{{ t('action.submit') }}</el-button>
        <el-button text type="primary" @click="visible = false">{{ t('action.cancel') }}</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 图床上传服务配置（复刻 vue2 ImageUploadServiceDialog）：
 * apiServerUrl / postParam / jsonPath / customHeader / customBody 五个字段，
 * 存 `setting/image/*`。vue2 走 vuex client.updateStateAndStore。
 */
import { onMounted, reactive } from 'vue';
import { Close, Picture } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useAppStore } from '@/stores/app';

const visible = defineModel<boolean>({ default: false });
const { t } = useI18n();
const appStore = useAppStore();
const form = reactive({
  apiServerUrl: '',
  postParam: 'list',
  jsonPath: 'result',
  customHeader: '',
  customBody: '',
});

const KEYS = {
  apiServerUrl: 'setting/image/apiServerUrl',
  postParam: 'setting/image/postParam',
  jsonPath: 'setting/image/jsonPath',
  customHeader: 'setting/image/customHeader',
  customBody: 'setting/image/customBody',
};

async function load(): Promise<void> {
  await appStore.loadPrefs();
  Object.entries(KEYS).forEach(([field, key]) => {
    const value = appStore.prefs[key];
    if (typeof value === 'string') {
      form[field as keyof typeof form] = value;
    }
  });
}

async function submit(): Promise<void> {
  Object.entries(KEYS).forEach(([field, key]) => {
    void appStore.setPref(key, form[field as keyof typeof form]);
  });
  ElMessage.success(t('settings.imageSaved'));
  visible.value = false;
}

onMounted(load);
</script>
