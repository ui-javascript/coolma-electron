<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    size="72%"
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
            <span class="micro-app-tab-name">{{ item.name }}</span>
            <el-tag v-if="item.loadMode === 'module'" size="small" effect="plain">hel</el-tag>
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
import { Close } from '@element-plus/icons-vue';
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
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 6px;
}

.micro-app-tabs-scroll {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
}

.micro-app-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.micro-app-tab.active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.micro-app-body {
  flex: 1;
  min-height: 0;
  position: relative;
  margin-top: 8px;
}
</style>
