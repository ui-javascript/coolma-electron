<template>
  <el-dialog
    v-model="visible"
    fullscreen
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    class="fullscreen-overlay-dialog"
    append-to-body
  >
    <div class="fs-overlay">
      <header class="fs-overlay-header">
        <div class="fs-overlay-title">
          <span>{{ t('fullscreen.title') }}</span>
          <span v-if="subtitle" class="fs-overlay-sub">{{ subtitle }}</span>
        </div>
        <div class="fs-overlay-status">
          <span class="fs-overlay-label">{{ t('fullscreen.stage') }}</span>
          <code>{{ stage }}</code>
          <el-button text circle size="small" @click="onCloseClick">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </header>

      <div class="fs-overlay-body">
        <MicroAppHost v-if="appEntry && wujieUrl && visible" :app="appEntry" :app-props="wujieProps" :reload-key="String(mountKey)" />
      </div>

      <footer class="fs-overlay-footer">
        <span class="fs-overlay-label">{{ t('fullscreen.state') }}</span>
        <code>{{ lastLog }}</code>
        <span class="fs-overlay-spacer" />
        <span class="fs-overlay-tag" :class="{ 'is-warn': !readyAt }">{{ readyAt ? 'bus ✓' : 'bus …' }}</span>
      </footer>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * FullscreenOverlay —— 全屏透明 wujie 子应用壳（移植 vue2 fullscreenOverlay.vue）。
 *
 * 本身不读任何业务配置：宿主条目由父组件通过 prop 传进来（appEntry），
 * 桥的生命周期跟本组件绑定（mount 装、unmount 卸），不在应用启动时装。
 *
 * 对外 imperative API：
 *   - summon({ target, mousePos }) → Promise<{ outcome: 'destroyed' | 'cancelled' }>
 *   - teardown()
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Close } from '@element-plus/icons-vue';
import MicroAppHost from '@/components/MicroAppHost.vue';
import { resolveActiveUrl, type MicroApp } from '@/services/microApps';
import {
  installGenericMicroAppIpcBridge,
  isGenericMicroAppIpcBridgeInstalled,
} from '@/services/genericMicroAppBridge';
import {
  installFullscreenBridge,
  summonFullscreen,
  teardownFullscreen,
  updateCursorPosCache,
  type FullscreenBridgeOptions,
} from '@/services/fullscreenBridge';

const props = defineProps<{ appEntry?: MicroApp | null }>();
const emit = defineEmits<{ (event: 'closed'): void }>();
const { t } = useI18n();

const visible = ref(false);
const mountKey = ref(0);
const summonNonce = ref(0);
const readyAt = ref<number | null>(null);
const stage = ref('IDLE');
const lastLog = ref(t('fullscreen.idle'));
const subtitle = ref('');
const busy = ref(false);

const currentTarget = ref<unknown>(null);
const currentMousePos = ref<{ x: number; y: number } | null>(null);
const summonFlag = ref(false);

type PendingResolve = (payload: { outcome: string; reason?: string }) => void;
let pendingCompleteds: PendingResolve[] = [];
let effectUninstall: (() => void) | null = null;
let genericUninstall: (() => void) | null = null;
let mouseListener: ((event: MouseEvent) => void) | null = null;

const wujieUrl = computed(() => {
  const entry = props.appEntry;
  if (!entry || !entry.enabled) {
    return '';
  }
  return resolveActiveUrl(entry);
});

const wujieProps = computed(() => ({
  target: currentTarget.value,
  summon: summonFlag.value === true,
  mousePos: currentMousePos.value,
  theme: 'dark',
  locale: 'zh-CN',
  nonce: summonNonce.value,
}));

watch(visible, (value) => {
  if (value) {
    summonNonce.value += 1;
    return;
  }
  busy.value = false;
  currentTarget.value = null;
  currentMousePos.value = null;
  summonFlag.value = false;
  stage.value = 'IDLE';
  // Esc / 点遮罩都会让弹窗自己关闭，这里兜底把挂着的 promise 全部取消，
  // 否则调用方会一直等到超时。
  resolveAllPending('overlay-hidden');
});

onMounted(() => {
  if (!isGenericMicroAppIpcBridgeInstalled()) {
    genericUninstall = installGenericMicroAppIpcBridge();
  }
  const bridgeOptions: FullscreenBridgeOptions = {
    onReady: (payload) => {
      readyAt.value = payload.ts ?? Date.now();
      lastLog.value = `${t('fullscreen.ready')} · v${payload.version ?? '?'} · ${(payload.capabilities ?? []).join(',')}`;
    },
    onStageChange: (payload) => {
      if (payload.stage) {
        stage.value = payload.stage;
        lastLog.value = `${t('fullscreen.stage')}：${payload.stage}`;
      }
    },
    onClickAt: () => {
      /* 坐标透传，调试用，不刷日志 */
    },
    onChoice: (payload) => {
      if (payload.label) {
        lastLog.value = `${t('fullscreen.choice')}：${payload.label}`;
      }
    },
    onCompleted: (payload) => {
      busy.value = false;
      lastLog.value = payload?.outcome === 'destroyed' ? t('fullscreen.done') : t('fullscreen.cancelled');
      stage.value = 'IDLE';
      visible.value = false;
      const list = pendingCompleteds.slice();
      pendingCompleteds = [];
      list.forEach((resolve) => {
        try {
          resolve(payload ? { outcome: payload.outcome ?? 'cancelled' } : { outcome: 'cancelled' });
        } catch {
          /* noop */
        }
      });
    },
  };
  effectUninstall = installFullscreenBridge(bridgeOptions);

  mouseListener = (event: MouseEvent) => {
    updateCursorPosCache(0, event.clientX, event.clientY);
  };
  window.addEventListener('mousemove', mouseListener);
});

onBeforeUnmount(() => {
  try {
    effectUninstall?.();
  } catch {
    /* noop */
  }
  effectUninstall = null;
  try {
    genericUninstall?.();
  } catch {
    /* noop */
  }
  genericUninstall = null;
  if (mouseListener) {
    window.removeEventListener('mousemove', mouseListener);
    mouseListener = null;
  }
  resolveAllPending('overlay-destroyed');
});

function resolveAllPending(reason: string): void {
  const list = pendingCompleteds.slice();
  pendingCompleteds = [];
  list.forEach((resolve) => {
    try {
      resolve({ outcome: 'cancelled', reason });
    } catch {
      /* noop */
    }
  });
}

/** 召唤全屏效果，返回演出结果。 */
function summon(payload: { target: { guid: string; name?: string }; mousePos?: { x: number; y: number } }): Promise<{ outcome: string }> {
  const target = payload?.target;
  if (!target?.guid) {
    return Promise.reject(new Error('summon() requires target.guid'));
  }
  // 每次召唤硬重置：先 teardown 清子应用内部状态，再清上一轮 pending
  try {
    teardownFullscreen();
  } catch {
    /* noop */
  }
  resolveAllPending('superseded-by-new-summon');

  stage.value = 'IDLE';
  currentTarget.value = target;
  currentMousePos.value = payload.mousePos ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  summonFlag.value = true;
  busy.value = true;
  subtitle.value = `${t('fullscreen.aiming')}：${target.name ?? target.guid}`;
  lastLog.value = `${t('fullscreen.trigger')} → ${target.name ?? target.guid}`;
  mountKey.value += 1;
  visible.value = true;
  summonNonce.value += 1;

  try {
    summonFullscreen({ target, mousePos: currentMousePos.value });
  } catch {
    /* noop */
  }

  return new Promise((resolve) => {
    pendingCompleteds.push(resolve as unknown as PendingResolve);
    window.setTimeout(() => {
      const index = pendingCompleteds.indexOf(resolve as unknown as PendingResolve);
      if (index >= 0) {
        pendingCompleteds.splice(index, 1);
        busy.value = false;
        stage.value = 'IDLE';
        lastLog.value = t('fullscreen.timeout');
        resolve({ outcome: 'cancelled' });
      }
    }, 5 * 60 * 1000);
  });
}

/** 主动关闭（不召唤效果）。 */
function teardown(): void {
  busy.value = false;
  visible.value = false;
  try {
    teardownFullscreen();
  } catch {
    /* noop */
  }
  resolveAllPending('user-closed-overlay');
}

function onCloseClick(): void {
  if (busy.value) {
    lastLog.value = t('fullscreen.interrupted');
  }
  teardown();
  emit('closed');
}

defineExpose({ summon, teardown });
</script>

<style scoped>
.fs-overlay {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: transparent;
}

.fs-overlay-header,
.fs-overlay-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  background: rgba(20, 20, 22, 0.55);
  backdrop-filter: blur(8px);
  color: #e6e6e6;
}

.fs-overlay-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-weight: 600;
}

.fs-overlay-sub {
  font-weight: 400;
  font-size: 11px;
  opacity: 0.7;
}

.fs-overlay-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.fs-overlay-label {
  opacity: 0.7;
}

.fs-overlay-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.fs-overlay-spacer {
  flex: 1;
}

.fs-overlay-tag {
  font-size: 11px;
  color: #62c46a;
}

.fs-overlay-tag.is-warn {
  color: #d8a23a;
}
</style>

<style>
.fullscreen-overlay-dialog {
  background: transparent !important;
  box-shadow: none !important;
}

.fullscreen-overlay-dialog .el-dialog__body {
  padding: 0;
  height: 100vh;
  background: transparent;
}
</style>
