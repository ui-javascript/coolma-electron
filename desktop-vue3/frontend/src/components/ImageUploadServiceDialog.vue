<template>
  <el-dialog v-model="visible" :title="t('settings.imageUploadService')" width="520px" append-to-body>
    <el-form label-width="110px">
      <el-form-item :label="t('settings.apiServerUrl')">
        <el-input v-model="form.apiServerUrl" placeholder="http://127.0.0.1:36677/upload" spellcheck="false" />
      </el-form-item>
      <el-form-item :label="t('settings.postParam')">
        <el-input v-model="form.postParam" placeholder="list" spellcheck="false" />
      </el-form-item>
      <el-form-item :label="t('settings.jsonPath')">
        <el-input v-model="form.jsonPath" placeholder="result" spellcheck="false" />
      </el-form-item>
      <el-form-item :label="t('settings.customHeader')">
        <el-input v-model="form.customHeader" placeholder="{}" spellcheck="false" />
      </el-form-item>
      <el-form-item :label="t('settings.customBody')">
        <el-input v-model="form.customBody" placeholder="{}" spellcheck="false" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('action.cancel') }}</el-button>
      <el-button type="primary" @click="submit">{{ t('action.ok') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 图床上传服务配置（复刻 vue2 ImageUploadServiceDialog）：
 * apiServerUrl / postParam / jsonPath / customHeader / customBody 五个字段，
 * 存 `setting/image/*`。vue2 走 vuex client.updateStateAndStore。
 */
import { onMounted, reactive } from 'vue';
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
