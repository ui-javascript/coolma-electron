<template>
  <div class="micro-apps">
    <div class="micro-apps-toolbar">
      <el-button text size="small" @click="openCreate">
        <el-icon><Plus /></el-icon>
        <span>{{ t('microApps.add') }}</span>
      </el-button>
      <el-button text size="small" :loading="loading" @click="refresh">{{ t('microApps.refresh') }}</el-button>
      <span class="micro-apps-gap" />
      <span class="micro-apps-hint">{{ t('microApps.hint') }}</span>
    </div>

    <div v-if="loading" class="micro-apps-empty">{{ t('microApps.loading') }}</div>
    <div v-else-if="apps.length === 0" class="micro-apps-empty">{{ t('microApps.empty') }}</div>
    <div v-else class="micro-apps-list">
      <div v-for="app in apps" :key="app.id" class="micro-apps-row" :class="{ disabled: !app.enabled }">
        <div class="micro-apps-main">
          <span class="micro-apps-name">{{ app.name }}</span>
          <el-tag v-if="app.isDefault" size="small" type="success" effect="plain">{{ t('microApps.defaultTag') }}</el-tag>
          <el-tag v-if="app.isBuiltIn" size="small" type="warning" effect="plain">{{ t('microApps.builtinTag') }}</el-tag>
          <el-tag size="small" effect="plain">{{ app.loadMode === 'module' ? 'hel-micro' : 'wujie' }}</el-tag>
          <span class="micro-apps-meta">{{ describe(app) }}</span>
        </div>
        <div class="micro-apps-actions">
          <el-switch v-model="app.enabled" size="small" @change="persist" />
          <el-button text size="small" @click="openEdit(app)">{{ t('microApps.edit') }}</el-button>
          <el-button v-if="!app.isDefault" text size="small" type="success" @click="setDefault(app)">
            {{ t('microApps.setDefault') }}
          </el-button>
          <el-button v-if="!app.isBuiltIn" text size="small" type="danger" @click="remove(app)">
            {{ t('microApps.delete') }}
          </el-button>
        </div>
      </div>
    </div>

    <MicroAppEditDialog v-model="dialogVisible" :app="editing" @submit="onSubmit" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import MicroAppEditDialog from '@/components/MicroAppEditDialog.vue';
import {
  loadMicroApps,
  saveMicroApps,
  normalizeMicroApps,
  type MicroApp,
} from '@/services/microApps';

/**
 * 微应用列表卡（复刻 vue2 microAppPanelList / 管理区）。
 * 列表存在 settings 表 setting/microApps，内置条目不可删。
 */
const { t } = useI18n();

const apps = ref<MicroApp[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editing = ref<MicroApp | null>(null);

onMounted(refresh);

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    apps.value = await loadMicroApps();
  } finally {
    loading.value = false;
  }
}

function describe(app: MicroApp): string {
  if (app.loadMode === 'module') {
    return [app.libName, app.exportName || 'default', app.version].filter(Boolean).join(' · ');
  }
  return app.url || app.devUrl || t('microApps.noUrl');
}

async function persist(): Promise<void> {
  const saved = await saveMicroApps(apps.value);
  if (!saved) {
    ElMessage.error(t('microApps.saveFailed'));
  }
}

function openCreate(): void {
  editing.value = null;
  dialogVisible.value = true;
}

function openEdit(app: MicroApp): void {
  editing.value = { ...app };
  dialogVisible.value = true;
}

async function onSubmit(app: MicroApp): Promise<void> {
  const next = apps.value.filter((item) => item.id !== app.id);
  next.push(app);
  apps.value = normalizeMicroApps(next);
  await persist();
  ElMessage.success(t('microApps.saved'));
}

async function setDefault(app: MicroApp): Promise<void> {
  apps.value = apps.value.map((item) => ({ ...item, isDefault: item.id === app.id }));
  await persist();
}

async function remove(app: MicroApp): Promise<void> {
  try {
    await ElMessageBox.confirm(t('microApps.deleteConfirm', { name: app.name }), t('microApps.delete'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  apps.value = apps.value.filter((item) => item.id !== app.id);
  await persist();
}
</script>

<style scoped>
.micro-apps-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.micro-apps-gap {
  flex: 1;
}

.micro-apps-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.micro-apps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.micro-apps-row.disabled {
  opacity: 0.55;
}

.micro-apps-main {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
  flex: 1;
}

.micro-apps-name {
  font-weight: 600;
}

.micro-apps-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.micro-apps-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.micro-apps-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
