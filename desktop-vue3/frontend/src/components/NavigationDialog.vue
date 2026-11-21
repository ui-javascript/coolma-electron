<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    width="80vw"
    top="7vh"
    class="nav-dialog"
    append-to-body
    @closed="onClosed"
  >
    <template #header>
      <div class="nav-head">
        <el-icon class="nav-head-icon"><Compass /></el-icon>
        <span class="nav-head-title">{{ t('nav.title') }}</span>
        <span v-if="!loading && !loadError && cards.length" class="nav-head-count">
          {{ t('nav.count', { count: cards.length }) }}
        </span>
        <span class="nav-head-spacer" />
        <button
          type="button"
          class="nav-head-btn"
          :class="{ 'is-loading': loading }"
          :title="t('nav.retry')"
          @click="load(true)"
        >
          <el-icon><Refresh /></el-icon>
        </button>
        <button type="button" class="nav-head-btn" :title="t('action.close')" @click="visible = false">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </template>

    <div class="nav-body">
      <div v-if="loadError" class="nav-error">
        <el-icon class="nav-error-icon"><WarningFilled /></el-icon>
        <div class="nav-error-text">{{ loadError.message }}</div>
        <div class="nav-error-actions">
          <button type="button" class="nav-text-btn" @click="load(true)">{{ t('nav.retry') }}</button>
          <button
            v-if="loadError.code === 'NO_BASE_URL'"
            type="button"
            class="nav-text-btn"
            @click="emit('go-config')"
          >
            {{ t('nav.goConfig') }}
          </button>
        </div>
      </div>

      <div v-if="loading && cards.length === 0" class="nav-loading">
        <el-icon class="is-loading nav-spinner"><Loading /></el-icon>
        <span>{{ t('nav.loading') }}</span>
      </div>

      <div v-else-if="!loadError && cards.length === 0" class="nav-empty">
        <el-icon class="nav-empty-icon"><Compass /></el-icon>
        <span>{{ t('nav.empty') }}</span>
      </div>

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
import {
  Close,
  Compass,
  Loading,
  Picture,
  Refresh,
  TopRight,
  WarningFilled,
} from '@element-plus/icons-vue';
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
  gap: 8px;
  min-height: 52px;
  padding: 0 8px;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  color: #fff;
}

.nav-head-icon {
  flex: 0 0 auto;
  font-size: 21px;
}

.nav-head-title {
  flex: 0 0 auto;
  font-size: 15px;
  font-weight: 500;
}

.nav-head-spacer {
  flex: 1 1 auto;
}

.nav-head-count {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 10px;
  background: #fff;
  color: #00acc1;
  font-size: 12px;
  line-height: 18px;
}

.nav-head-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}

.nav-head-btn:hover {
  background: rgb(255 255 255 / 18%);
}

.nav-head-btn.is-loading {
  pointer-events: none;
}

.nav-head-btn.is-loading :deep(.el-icon) {
  animation: nav-spin 1s linear infinite;
}

@keyframes nav-spin {
  to {
    transform: rotate(360deg);
  }
}

.nav-body {
  min-height: 260px;
  max-height: calc(86vh - 52px);
  padding: 14px;
  overflow: auto;
  background: #fafafa;
}

.nav-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid rgb(236 72 153 / 30%);
  border-radius: 8px;
  background: #e0f7fa;
  color: #006064;
}

.nav-error-icon {
  flex: 0 0 auto;
  color: #00acc1;
  font-size: 20px;
}

.nav-error-text {
  flex: 1 1 240px;
  font-size: 13px;
  line-height: 1.5;
}

.nav-error-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-text-btn {
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #00838f;
  font-size: 13px;
  cursor: pointer;
}

.nav-text-btn:hover {
  background: rgb(0 172 193 / 12%);
}

.nav-loading,
.nav-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 64px 16px;
  color: var(--el-text-color-secondary);
  font-size: 15px;
  text-align: center;
}

.nav-spinner {
  color: #26c6da;
  font-size: 38px;
}

.nav-empty-icon {
  color: #80deea;
  font-size: 56px;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.nav-card {
  overflow: hidden;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.nav-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgb(139 92 246 / 25%);
}

.nav-card-image {
  position: relative;
  width: 100%;
  padding-top: 75%;
  overflow: hidden;
  background: linear-gradient(135deg, rgb(236 72 153 / 8%) 0%, rgb(139 92 246 / 12%) 100%);
}

.nav-card-image img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.nav-card-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #80deea;
  font-size: 40px;
}

.nav-card-overlay {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  color: #fff;
  font-size: 17px;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.nav-card:hover .nav-card-overlay {
  opacity: 1;
}

.nav-card-text {
  padding: 8px 10px;
}

.nav-card-title {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-card-desc {
  margin-top: 2px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .nav-dialog {
    width: 96vw !important;
    min-width: 0;
  }

  .nav-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>
