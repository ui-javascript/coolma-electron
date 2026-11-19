<template>
  <AiHelperPanel :note-id="noteId" class="ai-bus-panel" />
</template>

<script setup lang="ts">
/**
 * busDialog 内容组件（对应 vue2 AiHelperBusDialog）：全局任何位置都能
 * `busDialogBus.emit('AiHelperBusDialog.open', { noteId })` 拉起对话抽屉。
 * 容器（el-drawer）由 busDialog 注册时的 defaults 决定。
 */
import AiHelperPanel from '@/components/AiHelperPanel.vue';

defineProps<{ noteId?: number | null }>();
</script>

<style scoped>
.ai-bus-panel {
  height: 100%;
}
</style>
