<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    width="80vw"
    top="6vh"
    class="nav-dialog"
    append-to-body
    @closed="onClosed"
  >
    <template #header>
      <div class="nav-head">
        <div class="nav-head-left">
          <el-icon class="nav-head-icon"><Compass /></el-icon>
          <span class="nav-head-title">{{ t('nav.title') }}</span>
          <span v-if="!loading && !loadError && cards.length" class="nav-head-count">{{ t('nav.count', { count: cards.length }) }}</span>
        </div>
        <div class="nav-head-right">
          <el-button text circle :loading="loading" :title="t('nav.retry')" @click="load(true)">
            <el-icon><Refresh /></el-icon>
          </el-button>
          <el-button text circle :title="t('action.close')" @click="visible = false">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </template>

    <div class="nav-body">
      <el-alert v-if="loadError" type="error" :closable="false" show-icon class="nav-error">
        <template #title>
          <span>{{ loadError.message }}</span>
          <el-button v-if="loadError.code === 'NO_BASE_URL'" link type="primary" @click="emit('go-config')">{{ t('nav.goConfig') }}</el-button>
        </template>
      </el-alert>

      <div v-if="loading && cards.length === 0" class="nav-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ t('nav.loading') }}</span>
      </div>

      <el-empty v-else-if="!loadError && cards.length === 0" :description="t('nav.empty')" />

      <div v-else class="nav-grid">
        <article v-for="item in cards" :key="item.id" class="nav-card" @click="openTarget(item)">
          <div class="nav-card-image">
            <img
              v-if="item.imageUrl && !brokenImages.includes(item.id)"
              :src="item.imageUrl"
              :alt="item.title"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="markBroken(item.id)"
            />
            <div v-else class="nav-card-placeholder">
              <el-icon><Picture /></el-icon>
            </div>
            <div class="nav-card-overlay"><el-icon><TopRight /></el-icon></div>
          </div>
          <div class="nav-card-text">
            <div class="nav-card-title">{{ item.title || item.targetUrl }}</div>
            <div v-if="item.desc" class="nav-card-desc">{{ item.desc }}</div>
          </div>
        </article>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 导航中心（复刻 vue2 components/navigation/NavigationDialog.vue，355 行）。
 *
 * 数据源与 vue2 完全一致：云函数 `admin/vkfiles/pub/listFiles`，
 * 返回字段名不固定，按 vue2 `normalizeItem` 的兜底顺序归一化（见 services/cloudfn.ts）。
 * 唯一架构差异：HTTP 走主进程代理（`controller/cloudfn`），渲染层不直连，避免 CORS。
 *
 * 未做：分类/标题过滤参数没入口（vue2 也只有 props，实际由设置页固定传空）。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Close, Compass, Loading, Picture, Refresh, TopRight } from '@element-plus/icons-vue';
import { listNavFiles, openExternal } from '@/services/cloudfn';
import type { NavCard } from '@/services/cloudfn';

const props = defineProps<{
  modelValue: boolean;
  categoryNo?: string;
  title?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'go-config'): void;
}>();

const { t } = useI18n();
const cards = ref<NavCard[]>([]);
const loading = ref(false);
const loadError = ref<{ code: string; message: string } | null>(null);
const brokenImages = ref<string[]>([]);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

function markBroken(id: string): void {
  if (!brokenImages.value.includes(id)) {
    brokenImages.value.push(id);
  }
}

async function load(force = false): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    cards.value = await listNavFiles({ categoryNo: props.categoryNo, title: props.title });
    brokenImages.value = [];
    if (force) {
      ElMessage.success(t('nav.count', { count: cards.value.length }));
    }
  } catch (error) {
    const code = (error as { code?: string }).code || 'UNKNOWN';
    const raw = (error as Error)?.message || String(error);
    let message = t('nav.loadFailed', { message: raw });
    if (code === 'NO_BASE_URL') {
      message = t('nav.needBaseUrl');
    } else if (code === 'TOKEN_REQUIRED' || code === 'HTTP_401' || code === 'HTTP_403') {
      message = t('nav.needToken');
    }
    loadError.value = { code, message };
  } finally {
    loading.value = false;
  }
}

async function openTarget(item: NavCard): Promise<void> {
  if (!item.targetUrl) {
    ElMessage.error(t('nav.loadFailed', { message: 'targetUrl missing' }));
    return;
  }
  const result = await openExternal(item.targetUrl);
  if (!result.ok) {
    ElMessage.error(result.error.message);
  }
}

function onClosed(): void {
  cards.value = [];
  loadError.value = null;
  brokenImages.value = [];
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void load(false);
    }
  },
);
</script>

<style scoped>
.nav-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 10px 14px;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  color: #fff;
}

.nav-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nav-head-icon { font-size: 20px; }
.nav-head-title { font-weight: 600; }
.nav-head-count { font-size: 12px; background: #ffffff2e; border-radius: 10px; padding: 2px 8px; }
.nav-head-right { display: flex; align-items: center; color: #fff; }
.nav-head-right :deep(.el-button) { color: #fff; }

.nav-body { min-height: 240px; max-height: 70vh; overflow-y: auto; padding: 4px 2px; }

.nav-error { margin-bottom: 12px; }

.nav-loading {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--el-text-color-secondary);
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 12px;
}

.nav-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--el-bg-color);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.nav-card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12); }

.nav-card-image {
  position: relative;
  aspect-ratio: 16 / 10;
  background: #0f172a0d;
}

.nav-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }

.nav-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #93c5fd;
  font-size: 28px;
}

.nav-card-overlay {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #00000066;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.nav-card:hover .nav-card-overlay { opacity: 1; }

.nav-card-text { padding: 8px 10px 10px; }
.nav-card-title { font-size: 13px; font-weight: 600; line-height: 1.4; }
.nav-card-desc { margin-top: 3px; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.45; }
</style>
