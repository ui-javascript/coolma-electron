<template>
  <div v-if="available" class="window-controls" aria-label="Window controls">
    <button
      type="button"
      class="window-control"
      :title="t('window.minimize')"
      :aria-label="t('window.minimize')"
      @click="minimize"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5 10h10" />
      </svg>
    </button>

    <button
      type="button"
      class="window-control"
      :title="maximized ? t('window.restore') : t('window.maximize')"
      :aria-label="maximized ? t('window.restore') : t('window.maximize')"
      @click="toggleMaximize"
    >
      <svg v-if="!maximized" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="5" y="5" width="10" height="10" rx="1.5" />
      </svg>
      <svg v-else viewBox="0 0 20 20" aria-hidden="true">
        <rect x="7" y="4" width="9" height="9" rx="1.5" />
        <path d="M4 7v7a2 2 0 0 0 2 2h7" />
      </svg>
    </button>

    <button
      type="button"
      class="window-control window-control-close"
      :title="t('window.close')"
      :aria-label="t('window.close')"
      @click="close"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="m6 6 8 8M14 6l-8 8" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  closeWindow,
  getWindowState,
  hasIpc,
  minimizeWindow,
  toggleMaximizeWindow,
} from '@/services/ipc';

const { t } = useI18n();
const available = hasIpc();
const maximized = ref(false);

let resizeTimer: ReturnType<typeof setTimeout> | undefined;

async function syncState(): Promise<void> {
  const result = await getWindowState();
  if (result.ok) {
    maximized.value = result.data.maximized;
  }
}

function scheduleSync(): void {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = setTimeout(() => {
    void syncState();
  }, 80);
}

async function minimize(): Promise<void> {
  await minimizeWindow();
}

async function toggleMaximize(): Promise<void> {
  const result = await toggleMaximizeWindow();
  if (result.ok) {
    maximized.value = result.data;
  } else {
    await syncState();
  }
}

async function close(): Promise<void> {
  await closeWindow();
}

onMounted(() => {
  if (!available) {
    return;
  }
  void syncState();
  window.addEventListener('resize', scheduleSync);
});

onBeforeUnmount(() => {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  window.removeEventListener('resize', scheduleSync);
});
</script>

<style scoped>
.window-controls {
  position: fixed;
  z-index: 1000;
  top: 0;
  right: 0;
  display: flex;
  height: 64px;
  align-items: center;
  gap: 2px;
  padding-right: 10px;
  -webkit-app-region: no-drag;
}

.window-control {
  display: flex;
  width: 40px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--coolma-muted);
  cursor: default;
  transition: background 0.15s ease, color 0.15s ease;
}

.window-control:hover {
  background: var(--coolma-hover);
  color: var(--coolma-text);
}

.window-control:active {
  background: var(--coolma-primary-soft);
  color: var(--coolma-primary);
}

.window-control-close:hover {
  background: #e5484d;
  color: #fff;
}

.window-control svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.25;
}

@media (max-width: 720px) {
  .window-controls {
    padding-right: 4px;
  }

  .window-control {
    width: 34px;
  }
}
</style>
