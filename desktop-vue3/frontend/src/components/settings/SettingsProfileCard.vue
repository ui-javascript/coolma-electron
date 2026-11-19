<template>
  <div class="profile-card">
    <el-alert type="error" :closable="false" show-icon class="profile-hint" :title="t('settings.profileHint')" />
    <el-form label-position="top">
      <el-form-item :label="t('settings.profileCity')">
        <div class="city-row">
          <el-input v-model="city.province" :placeholder="t('settings.profileProvince')" />
          <el-input v-model="city.city" :placeholder="t('settings.profileCityName')" />
          <el-input v-model="city.district" :placeholder="t('settings.profileDistrict')" />
        </div>
        <div class="field-hint">{{ t('settings.profileCityHint') }}</div>
      </el-form-item>
    </el-form>
    <div class="profile-current">
      <div class="profile-current-label">{{ t('settings.profileCurrent') }}</div>
      <div v-if="hasCity" class="profile-current-value">
        <el-icon><Location /></el-icon>
        {{ [city.province, city.city, city.district].filter(Boolean).join(' / ') }}
      </div>
      <div v-else class="profile-current-empty">{{ t('settings.profileEmpty') }}</div>
      <div v-if="saving" class="profile-status">{{ t('settings.profileSaving') }}</div>
      <div v-else-if="lastSavedAt" class="profile-status">{{ t('settings.profileSavedAt', { time: lastSavedAt }) }}</div>
      <div v-if="saveError" class="profile-status is-error">{{ saveError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 个人资料（复刻 vue2 settingsProfilePanel）：只维护「常驻城市」一项，
 * 存 `setting/profile/city`，选择即保存（组件内防抖 400ms）。
 * vue2 用 CDN city-picker 三级联动；vue3 暂时退化成三个文本输入（城市库注入未迁移）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Location } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';

const STORAGE_KEY = 'setting/profile/city';
const { t } = useI18n();
const appStore = useAppStore();

const city = reactive({ province: '', city: '', district: '' });
const loaded = ref(false);
const saving = ref(false);
const lastSavedAt = ref('');
const saveError = ref('');
let timer: ReturnType<typeof setTimeout> | null = null;

const hasCity = computed(() => Boolean(city.province || city.city || city.district));

function normalize(raw: unknown): { province: string; city: string; district: string } {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    province: String(value.province ?? ''),
    city: String(value.city ?? ''),
    district: String(value.district ?? ''),
  };
}

async function load(): Promise<void> {
  await appStore.loadPrefs();
  Object.assign(city, normalize(appStore.prefs[STORAGE_KEY]));
  loaded.value = true;
  const saved = appStore.prefs[`${STORAGE_KEY}/savedAt`];
  lastSavedAt.value = typeof saved === 'string' ? saved : '';
}

async function persist(): Promise<void> {
  saving.value = true;
  saveError.value = '';
  const savedAt = new Date().toLocaleTimeString();
  await appStore.setPref(STORAGE_KEY, { ...city });
  await appStore.setPref(`${STORAGE_KEY}/savedAt`, savedAt);
  lastSavedAt.value = savedAt;
  saving.value = false;
}

watch(
  city,
  () => {
    if (!loaded.value) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void persist();
    }, 400);
  },
  { deep: true },
);

onMounted(load);
</script>

<style scoped>
.profile-hint { margin-bottom: 12px; }
.city-row { display: flex; gap: 8px; }
.field-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.profile-current { margin-top: 12px; padding: 12px; border-radius: 8px; background: var(--el-fill-color-light, #f5f7fa); }
.profile-current-label { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px; }
.profile-current-value { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.profile-current-empty { font-size: 13px; color: var(--el-text-color-secondary); }
.profile-status { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 6px; }
.profile-status.is-error { color: var(--el-color-danger); }
</style>
