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

const hasControls = hasIpc();

onMounted(() => {
  installBusDialogs();
  document.getElementById('loadingPage')?.remove();
});
</script>
