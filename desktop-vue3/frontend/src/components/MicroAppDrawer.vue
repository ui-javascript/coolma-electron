<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    :size="drawerSize"
    :z-index="9999"
    :with-header="false"
    class="micro-app-drawer"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <div class="micro-app-drawer-body">
      <div class="micro-app-tabs">
        <div class="micro-app-tabs-scroll">
          <button
            v-for="item in enabledApps"
            :key="item.id"
            type="button"
            class="micro-app-tab"
            :class="{ active: item.id === activeId }"
            @click="activeId = item.id"
          >
            <el-icon class="micro-app-tab-icon"><component :is="appIcon(item.icon)" /></el-icon>
            <span class="micro-app-tab-name">{{ item.name }}</span>
          </button>
        </div>
        <el-button text size="small" @click="emit('update:modelValue', false)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <div class="micro-app-body">
        <MicroAppHost :app="activeApp" :reload-key="String(reloadNonce)" />
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChatDotRound, Close, Cloudy, Cpu, Grid } from '@element-plus/icons-vue';
import MicroAppHost from '@/components/MicroAppHost.vue';
import { loadMicroApps, pickDefaultApp, type MicroApp } from '@/services/microApps';

/**
 * 微应用抽屉（复刻 vue2 microAppDrawer）：顶部横向 Tab 切换 enabled 应用 + 关闭按钮。
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>();

const apps = ref<MicroApp[]>([]);
const activeId = ref('');
const reloadNonce = ref(0);

const enabledApps = computed(() => apps.value.filter((app) => app.enabled));
const activeApp = computed(() => enabledApps.value.find((app) => app.id === activeId.value) ?? null);
const drawerSize = computed(() => (activeApp.value?.isMobile ? '480px' : '80%'));

function appIcon(name: string) {
  if (name === 'chat-dot-round') return ChatDotRound;
  if (name === 'cloudy') return Cloudy;
  if (name === 'cpu') return Cpu;
  if (name === 'grid' || name === 'apps') return Grid;
  return ChatDotRound;
}

async function refresh(): Promise<void> {
  apps.value = await loadMicroApps();
  const preferred = pickDefaultApp(apps.value);
  if (!activeId.value || !apps.value.some((app) => app.id === activeId.value && app.enabled)) {
    activeId.value = preferred?.id ?? '';
  }
}

onMounted(refresh);
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void refresh();
      reloadNonce.value += 1;
    }
  },
);
</script>

<style scoped>
.micro-app-drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.micro-app-tabs {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--coolma-border, #e8e8e8);
  padding-right: 8px;
  background: var(--coolma-panel, rgb(255 255 255 / 40%));
}

.micro-app-tabs-scroll {
  display: flex;
  flex: 1;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  padding: 6px 12px;
  scrollbar-width: none;
}

.micro-app-tabs-scroll::-webkit-scrollbar {
  display: none;
}

.micro-app-tab {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--coolma-text, #333);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: all 0.18s ease;
}

.micro-app-tab:hover {
  background: var(--themeColor10, rgb(64 158 255 / 8%));
}

.micro-app-tab.active {
  background: linear-gradient(135deg, rgb(67 160 71 / 18%) 0%, rgb(67 160 71 / 8%) 100%);
  color: #2e7d32;
}

.micro-app-tab-icon {
  color: var(--coolma-muted, #6b7280);
  font-size: 18px;
}

.micro-app-tab.active .micro-app-tab-icon {
  color: #2e7d32;
}

.micro-app-tab-name {
  color: var(--coolma-text, #333);
  font-size: 13px;
  font-weight: 500;
}

.micro-app-tab.active .micro-app-tab-name {
  color: #2e7d32;
}

.micro-app-drawer-body {
  border-radius: 8px 0 0 8px;
  background: var(--coolma-panel, #fff);
  box-shadow: -4px 0 24px rgb(0 0 0 / 12%);
}

.micro-app-body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.micro-app-drawer :deep(.el-drawer__body) {
  padding: 0;
}
</style>
