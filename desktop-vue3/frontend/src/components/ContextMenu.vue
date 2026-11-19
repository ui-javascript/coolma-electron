<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="ctx-menu"
      :style="menuStyle"
      @contextmenu.prevent
      @mousedown.stop
    >
      <template v-for="(item, index) in items" :key="`${item.id ?? item.type}-${index}`">
        <div v-if="item.type === 'separator'" class="ctx-sep" />
        <div v-else-if="item.children?.length" class="ctx-group">
          <button type="button" class="ctx-item" :disabled="item.enabled === false" @click="toggleSub(item.id)">
            <span class="ctx-label">{{ item.label }}</span>
            <span class="ctx-arrow">›</span>
          </button>
          <div v-if="openSub === item.id" class="ctx-sub">
            <button
              v-for="child in item.children"
              :key="child.id"
              type="button"
              class="ctx-item"
              :disabled="child.enabled === false"
              @click="pick(child)"
            >
              <span class="ctx-label">{{ child.label }}</span>
            </button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="ctx-item"
          :class="{ danger: item.danger }"
          :disabled="item.enabled === false"
          @click="pick(item)"
        >
          <span class="ctx-label">{{ item.label }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * 通用右键菜单（配置驱动）：item 支持 separator / children（二级菜单）/ enabled / danger。
 *
 * vue2 走的是 Electron 原生 Menu（主进程 popContextMenu）；vue3 统一用渲染层菜单，
 * 原因是：原生菜单在无 Electron 的静态验收链路里完全不可验证，而 vue3 现有
 * NoteContextMenu 也是渲染层实现。行为对齐（项、顺序、启用条件、动作）为准，渲染方式不同。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ContextMenuItem } from '@/menus/types';

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{
  (event: 'command', id: string): void;
  (event: 'close'): void;
}>();

const menuRef = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });
const openSub = ref<string | null>(null);

const menuStyle = computed(() => {
  const margin = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  // 二级菜单展开后宽度会变，这里按容器实测值夹紧，避免出屏
  const left = Math.min(props.x, viewportWidth - Math.max(size.value.width, 160) - margin);
  const top = Math.min(props.y, viewportHeight - Math.max(size.value.height, 120) - margin);
  return { left: `${Math.max(margin, left)}px`, top: `${Math.max(margin, top)}px` };
});

function pick(item: ContextMenuItem): void {
  if (item.enabled === false) {
    return;
  }
  emit('command', item.id ?? '');
  emit('close');
}

function toggleSub(id?: string): void {
  if (!id) {
    return;
  }
  openSub.value = openSub.value === id ? null : id;
  void nextTick(measure);
}

function measure(): void {
  if (!menuRef.value) {
    return;
  }
  size.value = { width: menuRef.value.offsetWidth, height: menuRef.value.offsetHeight };
}

function onGlobalDown(event: MouseEvent): void {
  if (menuRef.value && menuRef.value.contains(event.target as Node)) {
    return;
  }
  emit('close');
}

watch(
  () => props.visible,
  (value) => {
    if (value) {
      openSub.value = null;
      void nextTick(measure);
    }
  },
);

onMounted(() => {
  window.addEventListener('mousedown', onGlobalDown, true);
  window.addEventListener('resize', measure);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onGlobalDown, true);
  window.removeEventListener('resize', measure);
});
</script>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 3000;
  min-width: 160px;
  padding: 4px;
  border-radius: 8px;
  background: var(--el-bg-color-overlay, #fff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  border: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--el-text-color-regular, #303133);
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
}

.ctx-item:hover:not(:disabled) {
  background: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
}

.ctx-item:disabled {
  color: var(--el-text-color-disabled, #c0c4cc);
  cursor: not-allowed;
}

.ctx-item.danger {
  color: var(--el-color-danger, #f56c6c);
}

.ctx-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
}

.ctx-arrow {
  margin-left: 12px;
  opacity: 0.6;
}

.ctx-sub {
  margin-left: 8px;
  padding-left: 6px;
  border-left: 2px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
}
</style>
