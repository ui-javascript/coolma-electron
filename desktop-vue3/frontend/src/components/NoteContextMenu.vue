<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="note-context-menu"
      :style="menuStyle"
      @contextmenu.prevent
      @mousedown.stop
    >
      <button type="button" class="menu-item" @click="pick('rename')">
        <el-icon><EditPen /></el-icon>
        <span>{{ t('notes.rename') }}</span>
      </button>
      <button type="button" class="menu-item" @click="pick('move')">
        <el-icon><FolderOpened /></el-icon>
        <span>{{ t('notes.move') }}</span>
      </button>
      <button type="button" class="menu-item" @click="pick('tags')">
        <el-icon><PriceTag /></el-icon>
        <span>{{ t('notes.tagsEdit') }}</span>
      </button>
      <div class="menu-separator" />
      <button type="button" class="menu-item" @click="pick('copy')">
        <el-icon><CopyDocument /></el-icon>
        <span>{{ t('notes.copyMarkdown') }}</span>
      </button>
      <button type="button" class="menu-item danger" @click="pick('delete')">
        <el-icon><Delete /></el-icon>
        <span>{{ t('action.delete') }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CopyDocument, Delete, EditPen, FolderOpened, PriceTag } from '@element-plus/icons-vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NoteMenuCommand } from '@/types/noteMenu';

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (event: 'command', command: NoteMenuCommand): void;
  (event: 'close'): void;
}>();

const { t } = useI18n();
const menuRef = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });

const menuStyle = computed(() => {
  const margin = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.min(props.x, viewportWidth - size.value.width - margin);
  const top = Math.min(props.y, viewportHeight - size.value.height - margin);
  return {
    left: `${Math.max(margin, left)}px`,
    top: `${Math.max(margin, top)}px`,
  };
});

function pick(command: NoteMenuCommand): void {
  emit('command', command);
  emit('close');
}

function handlePointerDown(event: MouseEvent): void {
  if (!props.visible) {
    return;
  }
  const target = event.target as Node | null;
  if (target && menuRef.value?.contains(target)) {
    return;
  }
  emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  }
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return;
    }
    await nextTick();
    const rect = menuRef.value?.getBoundingClientRect();
    if (rect) {
      size.value = { width: rect.width, height: rect.height };
    }
  },
);

onMounted(() => {
  window.addEventListener('mousedown', handlePointerDown, true);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('blur', handlePointerDown as unknown as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handlePointerDown, true);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('blur', handlePointerDown as unknown as EventListener);
});
</script>

<style scoped>
.note-context-menu {
  position: fixed;
  z-index: 3200;
  min-width: 168px;
  padding: 6px;
  border-radius: 10px;
  background: var(--el-bg-color-overlay, #ffffff);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular, #606266);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-color-primary, #409eff);
}

.menu-item.danger:hover {
  background: rgba(245, 108, 108, 0.12);
  color: var(--el-color-danger, #f56c6c);
}

.menu-separator {
  height: 1px;
  margin: 4px 6px;
  background: var(--el-border-color-lighter, #ebeef5);
}
</style>
