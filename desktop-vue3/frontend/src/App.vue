<template>
  <div class="app-frame" :class="{ 'has-window-controls': hasControls }">
    <router-view />
    <WindowControls />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import WindowControls from '@/components/WindowControls.vue';
import { hasIpc } from '@/services/ipc';
import { installBusDialogs } from '@/services/busDialogEntries';
import { loadCdnDeps } from '@/utils/cdnDeps';

const hasControls = hasIpc();

onMounted(() => {
  installBusDialogs();
  document.getElementById('loadingPage')?.remove();
  // 对齐 vue2 boot/cdn-deps.js：DOM 就绪后异步注入，不阻塞首屏。
  void loadCdnDeps();
});
</script>
