<template>
  <el-drawer
    v-model="visible"
    :title="t('aiDoubao.title')"
    direction="rtl"
    size="600px"
    class="ai-chat-drawer"
    :z-index="9999"
    append-to-body
    destroy-on-close
  >
    <div class="doubao-host">
      <WujieVue
        v-if="visible && url"
        :key="mountKey"
        name="coolma-doubao-chat"
        :url="url"
        :sync="false"
        :props="wujieProps"
        class="doubao-frame"
      />
      <el-empty v-else :description="t('aiDoubao.missingBuild')" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * 豆包 WebApp 抽屉（移植 vue2 AiDoubaoDrawer）：
 * 本地 `_plugins/doubao-input/dist` 作为 wujie 子应用挂载，每次打开重建沙箱。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import WujieVue from 'wujie-vue3';
import { useAppStore } from '@/stores/app';

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (event: 'message', data: unknown): void }>();
const { t, locale } = useI18n();
const appStore = useAppStore();
const mountKey = ref(0);

watch(visible, (open) => {
  if (open) {
    mountKey.value += 1;
  }
});

const url = computed(() => appStore.appInfo?.doubaoUrl || '');
const wujieProps = computed(() => ({
  data: {
    theme: appStore.theme,
    locale: locale.value,
  },
  onMessage: (data: unknown) => emit('message', data),
}));
</script>

<style>
.ai-chat-drawer {
  overflow: hidden;
  border-radius: 8px 0 0 8px;
  background: var(--coolma-panel, #fff);
  box-shadow: -4px 0 24px rgb(0 0 0 / 12%);
}

.ai-chat-drawer .el-drawer__header {
  height: 44px;
  margin: 0;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--coolma-border, #e8e8e8);
  color: var(--coolma-text, #333);
  font-size: 14px;
  font-weight: 600;
}

.ai-chat-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
</style>

<style scoped>
.doubao-host {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.doubao-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
