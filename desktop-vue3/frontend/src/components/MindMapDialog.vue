<template>
  <el-dialog
    v-model="visible"
    width="70vw"
    top="5vh"
    append-to-body
    destroy-on-close
    class="mind-map-dialog"
    @opened="generate"
    @closed="destroy"
  >
    <template #header>
      <div class="mind-map-heading">
        <el-icon class="mind-map-heading__icon"><Share /></el-icon>
        <span>{{ t('editor.mindMap') }}</span>
      </div>
    </template>
    <div ref="containerRef" class="mind-map-container" @contextmenu.prevent="onContextMenu">
      <svg ref="svgRef" class="mind-map-svg" />
      <div class="mind-map-toolbar">
        <el-button-group class="mind-map-zoom">
          <el-button :title="t('editor.zoomIn')" @click="zoomIn">
            <el-icon><ZoomIn /></el-icon>
          </el-button>
          <el-button :title="t('editor.zoomOut')" @click="zoomOut">
            <el-icon><ZoomOut /></el-icon>
          </el-button>
          <el-button :title="t('editor.fitScreen')" @click="fit">
            <el-icon><FullScreen /></el-icon>
          </el-button>
          <el-button :title="t('editor.fullscreen')" @click="toggleFullscreen">
            <el-icon><Aim /></el-icon>
          </el-button>
        </el-button-group>
        <el-button-group class="mind-map-export">
          <el-button :title="t('editor.mindMapPng')" @click="exportPng">
            <el-icon><Picture /></el-icon>
            <span>{{ t('editor.mindMapPng') }}</span>
          </el-button>
          <el-button :title="t('editor.mindMapHtml')" @click="saveAsHtml">
            <el-icon><Document /></el-icon>
            <span>{{ t('editor.mindMapHtml') }}</span>
          </el-button>
        </el-button-group>
      </div>
      <p v-if="errorMessage" class="mind-map-error">{{ errorMessage }}</p>
    </div>
    <ContextMenu
      :visible="menu.visible"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @select="onMenuSelect"
      @close="menu.visible = false"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Aim, Document, FullScreen, Picture, Share, ZoomIn, ZoomOut } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { exportNotePng, exportText } from '@/services/ipc';
import ContextMenu from '@/components/ContextMenu.vue';
import { buildMarkMapMenu } from '@/menus/markMap';
import { useNotesStore } from '@/stores/notes';
import type { ContextMenuItem } from '@/menus/types';

/**
 * 思维导图：与 vue2 同一套 markmap（markmap-lib 转换、markmap-view 渲染），
 * 缩放/适配/全屏交互也对齐 MarkMapToolBar。
 */
const props = defineProps<{
  modelValue: boolean;
  markdown: string;
  noteId: number | null;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const { t } = useI18n();
// markmap 体积不小，只有真正打开导图时才加载（不拖累首屏）
type MarkmapLibModule = typeof import('markmap-lib');
type MarkmapViewModule = typeof import('markmap-view');
let libPromise: Promise<MarkmapLibModule> | null = null;
let viewPromise: Promise<MarkmapViewModule> | null = null;
let transformer: InstanceType<MarkmapLibModule['Transformer']> | null = null;
const loadLib = (): Promise<MarkmapLibModule> => (libPromise ??= import('markmap-lib'));
const loadView = (): Promise<MarkmapViewModule> => (viewPromise ??= import('markmap-view'));
const containerRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const errorMessage = ref('');
let markmap: ReturnType<MarkmapViewModule['Markmap']['create']> | null = null;

const notesStore = useNotesStore();
const menu = ref({ visible: false, x: 0, y: 0 });
const menuItems = computed<ContextMenuItem[]>(() => buildMarkMapMenu({ htmlReady: true }));

function onContextMenu(event: MouseEvent): void {
  menu.value = { visible: true, x: event.clientX, y: event.clientY };
}

async function onMenuSelect(itemId: string): Promise<void> {
  menu.value.visible = false;
  if (itemId === 'saveAsHtml') {
    await saveAsHtml();
  }
}

async function saveAsHtml(): Promise<void> {
  const inner = containerRef.value?.innerHTML ?? '';
  if (!inner) {
    return;
  }
  const result = await exportText({
    content: inner,
    fileName: notesStore.activeNote?.title || 'mindmap',
    fileType: 'html',
  });
  if (result.ok && !result.data.canceled) {
    ElMessage.success(t('editor.mindMapHtmlSaved'));
  }
}

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

async function generate(): Promise<void> {
  errorMessage.value = '';
  await nextTick();
  if (!svgRef.value) {
    return;
  }
  try {
    const [lib, view] = await Promise.all([loadLib(), loadView()]);
    transformer = transformer ?? new lib.Transformer();
    const { root, features } = transformer.transform(props.markdown || '# ');
    const { scripts } = transformer.getUsedAssets(features);
    if (scripts?.length) {
      // 与 vue2 一致：markmap 需要的资源就地加载，loader 回传 markmap 模块
      await view.loadJS(scripts, { getMarkmap: () => view });
    }
    markmap?.destroy();
    markmap = view.Markmap.create(svgRef.value, undefined, root);
    window.setTimeout(() => fit(), 300);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

function destroy(): void {
  markmap?.destroy();
  markmap = null;
}

function zoomIn(): void {
  markmap?.rescale(1.25);
}

function zoomOut(): void {
  markmap?.rescale(0.8);
}

function fit(): void {
  markmap?.fit();
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  containerRef.value?.requestFullscreen().then(() => fit()).catch(() => undefined);
}

async function exportPng(): Promise<void> {
  if (!containerRef.value || !props.noteId) {
    return;
  }
  try {
    const { default: html2canvas } = await import('html2canvas');
    const isDark = Boolean(document.querySelector('.libs-muya-theme-dark'));
    const canvas = await html2canvas(containerRef.value, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: isDark ? '#35373e' : '#ffffff',
    });
    const result = await exportNotePng(props.noteId, canvas.toDataURL('image/png'));
    if (result.ok === false) {
      ElMessage.error(result.error.message || t('notes.exportFailed'));
      return;
    }
    if (!result.data.canceled) {
      ElMessage.success(t('notes.exportSuccess', { path: result.data.filePath }));
    }
  } catch {
    ElMessage.error(t('notes.exportPngFailed'));
  }
}
</script>

<style>
.mind-map-dialog {
  width: 70vw !important;
  min-width: 70vw;
  max-height: 90vh;
  min-height: 70vh;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
}

.mind-map-dialog .el-dialog__header {
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--coolma-border, #ebeef5);
}

.mind-map-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 16px;
  overflow: hidden;
}
</style>

<style scoped>
.mind-map-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--coolma-text, #303133);
  font-size: 16px;
  font-weight: 700;
}

.mind-map-heading__icon {
  color: var(--themeColor, #409eff);
  font-size: 22px;
}

.mind-map-container {
  position: relative;
  height: 68vh;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.mind-map-svg {
  width: 100%;
  height: 100%;
}

.mind-map-toolbar {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.mind-map-zoom {
  border-radius: 99px;
  overflow: hidden;
  box-shadow: 0 3px 12px rgb(0 0 0 / 16%);
}

.mind-map-zoom :deep(.el-button) {
  width: 36px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--themeColor, #409eff);
  color: floralwhite;
}

.mind-map-zoom :deep(.el-button:hover) {
  background: color-mix(in srgb, var(--themeColor, #409eff) 82%, #fff);
  color: floralwhite;
}

.mind-map-export {
  border-radius: 99px;
  overflow: hidden;
  box-shadow: 0 3px 12px rgb(0 0 0 / 16%);
}

.mind-map-export :deep(.el-button) {
  border-color: transparent;
  background: var(--coolma-panel, #fff);
  color: var(--coolma-text, #303133);
  font-size: 12px;
}

.mind-map-error {
  position: absolute;
  left: 12px;
  top: 12px;
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
