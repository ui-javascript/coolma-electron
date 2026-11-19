<template>
  <div class="cdn-deps">
    <el-alert type="info" :closable="false" show-icon class="cdn-hint"
      :title="t('settings.cdnHint')" />
    <div class="cdn-actions">
      <el-button plain type="danger" size="small" @click="openEdit(null)">{{ t('settings.cdnAdd') }}</el-button>
      <el-button type="danger" size="small" :loading="saving" @click="saveAll">{{ t('settings.cdnInject') }}</el-button>
    </div>
    <div v-if="deps.length === 0" class="cdn-empty">{{ t('settings.cdnEmpty') }}</div>
    <div v-for="dep in deps" :key="dep.id" class="cdn-item">
      <el-icon :class="dep.enabled ? 'is-on' : 'is-off'"><Link /></el-icon>
      <div class="cdn-item-main">
        <div class="cdn-item-name">{{ dep.name || t('settings.cdnUnnamed') }}</div>
        <div class="cdn-item-url">{{ dep.url }}</div>
      </div>
      <el-tag v-if="dep.isBuiltIn" size="small" effect="plain">{{ t('settings.cdnBuiltIn') }}</el-tag>
      <el-tag v-if="dep.applyToBlog" size="small" type="danger" effect="plain">{{ t('settings.cdnApplyBlog') }}</el-tag>
      <el-button text size="small" @click="openEdit(dep)">{{ t('action.edit') }}</el-button>
      <el-button v-if="!dep.isBuiltIn" text size="small" type="danger" @click="remove(dep.id)">{{ t('action.delete') }}</el-button>
      <el-icon v-else class="cdn-lock"><Lock /></el-icon>
    </div>

    <el-dialog v-model="editVisible" :title="editing ? t('settings.cdnEditTitle') : t('settings.cdnAddTitle')" width="480px" append-to-body>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item :label="t('settings.cdnName')" prop="name">
          <el-input v-model="form.name" maxlength="64" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('settings.cdnUrl')" prop="url">
          <el-input v-model="form.url" placeholder="https://… 或 //unpkg.com/…" />
        </el-form-item>
        <el-form-item :label="t('settings.cdnEnabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item :label="t('settings.cdnApplyBlog')">
          <el-switch v-model="form.applyToBlog" :disabled="!form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('action.cancel') }}</el-button>
        <el-button type="primary" @click="submitEdit">{{ t('action.ok') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * CDN 依赖编辑（复刻 vue2 SettingsGeneralPanel 的 Cdn 子页 + cdnDepEditDialog）。
 * 存储键 `setting/cdnDeps`（vue2 走 DatabaseClient.cdnDeps.saveAll + localStorage 双写）。
 * vue3 尚未接「运行时注入脚本」这一层（vue2 boot/cdn-deps.js），本批只做清单维护。
 */
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Link, Lock } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';

interface CdnDep {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  applyToBlog: boolean;
  isBuiltIn?: boolean;
}

const STORAGE_KEY = 'setting/cdnDeps';
const { t } = useI18n();
const appStore = useAppStore();
const deps = ref<CdnDep[]>([]);
const saving = ref(false);
const editVisible = ref(false);
const editing = ref<CdnDep | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CdnDep>({ id: '', name: '', url: '', enabled: true, applyToBlog: false });

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const rules: FormRules = {
  name: [{ required: true, message: t('settings.cdnNameRequired'), trigger: 'blur' }],
  url: [
    { required: true, message: t('settings.cdnUrlRequired'), trigger: 'blur' },
    {
      validator: (_rule, value: string, callback: (error?: Error) => void) => {
        const v = String(value || '').trim();
        if (/^(https?:\/\/|\/\/)/i.test(v)) {
          callback();
          return;
        }
        callback(new Error(t('settings.cdnUrlInvalid')));
      },
      trigger: 'blur',
    },
  ],
};

function normalize(raw: unknown): CdnDep[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      id: String(item.id ?? newId()),
      name: String(item.name ?? ''),
      url: String(item.url ?? ''),
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
      applyToBlog: Boolean(item.applyToBlog),
      isBuiltIn: Boolean(item.isBuiltIn),
    }));
}

async function load(): Promise<void> {
  await appStore.loadPrefs();
  deps.value = normalize(appStore.prefs[STORAGE_KEY]);
}

function openEdit(dep: CdnDep | null): void {
  editing.value = dep;
  Object.assign(form, dep ? { ...dep } : { id: newId(), name: '', url: '', enabled: true, applyToBlog: false });
  editVisible.value = true;
  formRef.value?.clearValidate();
}

async function submitEdit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  const payload: CdnDep = { ...form, name: form.name.trim(), url: form.url.trim() };
  const index = deps.value.findIndex((dep) => dep.id === payload.id);
  if (index === -1) {
    deps.value.push(payload);
  } else {
    deps.value.splice(index, 1, { ...payload, isBuiltIn: deps.value[index].isBuiltIn });
  }
  editVisible.value = false;
}

async function saveAll(): Promise<void> {
  saving.value = true;
  await appStore.setPref(STORAGE_KEY, deps.value);
  saving.value = false;
  ElMessage.success(t('settings.cdnSaved'));
}

function remove(id: string): void {
  const dep = deps.value.find((item) => item.id === id);
  if (dep?.isBuiltIn) {
    ElMessage.warning(t('settings.cdnBuiltInLocked'));
    return;
  }
  deps.value = deps.value.filter((item) => item.id !== id);
}

onMounted(load);
</script>

<style scoped>
.cdn-hint { margin-bottom: 10px; }
.cdn-actions { display: flex; gap: 8px; margin-bottom: 10px; }
.cdn-empty { color: var(--el-text-color-secondary); font-size: 13px; padding: 16px; text-align: center; }
.cdn-item { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; margin-bottom: 6px; }
.cdn-item-main { flex: 1; min-width: 0; }
.cdn-item-name { font-size: 13px; font-weight: 500; }
.cdn-item-url { font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-on { color: var(--el-color-danger); }
.is-off { color: var(--el-text-color-secondary); }
.cdn-lock { color: var(--el-text-color-secondary); }
</style>
