<template>
  <div class="micro-app-host">
    <template v-if="app">
      <!-- iframe 模式：wujie 2.x 沙箱 -->
      <WujieVue
        v-if="app.loadMode === 'iframe' && resolvedUrl"
        :key="hostKey"
        :name="app.id"
        :url="resolvedUrl"
        :alive="true"
        :sync="false"
        :attrs="wujieAttrs"
        class="micro-app-frame"
      />

      <!-- module 模式：hel-micro 远程组件 -->
      <div v-else-if="app.loadMode === 'module'" :key="hostKey" class="micro-app-module">
        <div v-if="moduleError" class="micro-app-state is-error">{{ moduleError }}</div>
        <div v-else-if="moduleLoading" class="micro-app-state">{{ t('microApps.loading') }}</div>
        <component :is="remoteComp" v-else-if="remoteComp" class="micro-app-remote" />
        <div v-else class="micro-app-state">{{ t('microApps.moduleEmpty') }}</div>
      </div>

      <div v-else class="micro-app-state">{{ t('microApps.noUrl') }}</div>
    </template>

    <div v-else class="micro-app-state">
      <div class="micro-app-empty-title">{{ t('microApps.empty') }}</div>
      <div class="micro-app-empty-hint">{{ t('microApps.emptyHint') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import WujieVue from 'wujie-vue3';
import { preFetchLib } from 'hel-micro';
import type { MicroApp } from '@/services/microApps';
import { resolveActiveUrl } from '@/services/microApps';
import { installMicroAppParseBridge } from '@/services/microAppBridge';

/**
 * 微应用宿主（复刻 vue2 microAppHost.vue，并扩展 hel-micro 远程组件模式）。
 *
 * - iframe：wujie 2.x 沙箱（:name/:url/:alive/:sync/:attrs 与 vue2 完全同构）
 * - module：hel-micro preFetchLib 拉远程模块，取 exportName（空 = default）渲染
 *
 * key 里带 reloadKey：保存配置后递增可强制重建，wujie 子应用与远程组件都会重新初始化。
 */
const props = defineProps<{
  app: MicroApp | null;
  reloadKey?: string;
}>();

const { t } = useI18n();
const moduleLoading = ref(false);
const moduleError = ref('');
const remoteComp = ref<unknown>(null);

const resolvedUrl = computed(() => resolveActiveUrl(props.app));
const wujieAttrs = computed(() => ({ data: {} }));
const hostKey = computed(
  () => `${props.app?.id ?? 'empty'}::${props.app?.loadMode ?? ''}::${resolvedUrl.value || props.app?.libName || ''}::${props.reloadKey ?? '0'}`,
);

let uninstallBridge: (() => void) | null = null;

onMounted(() => {
  // wujie bus 上的 /parse 桥：子应用可通过 bus 调主进程能力
  uninstallBridge = installMicroAppParseBridge();
});

onBeforeUnmount(() => {
  if (typeof uninstallBridge === 'function') {
    uninstallBridge();
    uninstallBridge = null;
  }
});

/** 远程组件加载：hel-micro 只负责拉模块，渲染交给 Vue 的 component :is。 */
async function loadRemote(app: MicroApp): Promise<void> {
  moduleError.value = '';
  remoteComp.value = null;
  if (!app.libName) {
    moduleError.value = t('microApps.moduleMissingLib');
    return;
  }
  moduleLoading.value = true;
  try {
    const options: { version?: string } = {};
    if (app.version) {
      options.version = app.version;
    }
    const mod = (await preFetchLib(app.libName, options as never)) as Record<string, unknown> & { default?: unknown };
    const picked = app.exportName ? mod[app.exportName] : (mod.default ?? mod);
    if (!picked || (typeof picked !== 'object' && typeof picked !== 'function')) {
      moduleError.value = t('microApps.moduleMissingExport', { name: app.exportName || 'default' });
      return;
    }
    remoteComp.value = picked;
  } catch (error) {
    moduleError.value = `${t('microApps.moduleLoadFailed')}: ${(error as Error)?.message ?? String(error)}`;
  } finally {
    moduleLoading.value = false;
  }
}

watch(
  hostKey,
  () => {
    if (props.app?.loadMode === 'module') {
      void loadRemote(props.app);
    } else {
      remoteComp.value = null;
      moduleError.value = '';
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.micro-app-host {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  height: 100%;
  background: var(--el-bg-color);
}

.micro-app-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.micro-app-module {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.micro-app-remote {
  min-height: 100%;
}

.micro-app-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding: 16px;
}

.micro-app-state.is-error {
  color: var(--el-color-danger);
}

.micro-app-empty-title {
  font-size: 15px;
  color: var(--el-text-color-regular);
}
</style>
