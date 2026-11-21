<template>
  <el-dialog
    v-model="visible"
    fullscreen
    :title="t('preview.pptPreview')"
    class="ppt-preview-dialog"
    modal-class="ppt-preview-overlay"
    @opened="initReveal"
    @closed="destroyReveal"
  >
    <template #header>
      <div class="ppt-toolbar">
        <el-icon><Monitor /></el-icon>
        <span class="ppt-title">{{ t('preview.pptPreview') }}</span>
        <el-radio-group v-model="splitMode" size="small" class="ppt-split">
          <el-radio-button value="manual">{{ t('preview.pptSplitManual') }}</el-radio-button>
          <el-radio-button value="auto">{{ t('preview.pptSplitAuto') }}</el-radio-button>
        </el-radio-group>
        <el-dropdown trigger="click" @command="exportDeck">
          <el-button size="small">
            <el-icon><Download /></el-icon>
            <span>{{ t('preview.pptExport') }}</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="native">{{ t('preview.pptExportNativeOption') }}</el-dropdown-item>
              <el-dropdown-item command="pdf">{{ t('preview.pptExportRevealOption') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </template>
    <div ref="containerRef" class="reveal ppt-preview-container">
      <div class="slides" v-html="slidesHtml" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Monitor } from '@element-plus/icons-vue';
import { buildPrintDocument, buildSlidesHtml, type SlideSplitMode } from '@/utils/slides';
import 'reveal.js/dist/reveal.css';
import 'reveal.js/dist/theme/white.css';
import 'reveal.js/plugin/highlight/monokai.css';

/**
 * PPT 预览：把笔记 Markdown 按 `---` / `--` 或标题切片，交给 reveal.js 演示。
 * 与 vue2 previewPptDialog 对齐：embedded reveal、智能分片、双模式导出。
 */
const props = defineProps<{
  modelValue: boolean;
  markdown: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const { t } = useI18n();
const containerRef = ref<HTMLDivElement | null>(null);
const splitMode = ref<SlideSplitMode>('manual');
let deck: { destroy?: () => void; layout?: () => void } | null = null;
let initToken = 0;

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const slidesHtml = computed(() =>
  buildSlidesHtml({
    markdown: props.markdown,
    splitMode: splitMode.value,
    emptyTitle: t('preview.pptEmptyTitle'),
    emptyHint: t('preview.pptEmptyHint'),
  }),
);

async function initReveal(): Promise<void> {
  destroyReveal();
  await nextTick();
  if (!containerRef.value) {
    return;
  }
  const token = ++initToken;
  try {
    const [{ default: Reveal }, { default: Markdown }, { default: Highlight }, { default: Notes }] = await Promise.all([
      import('reveal.js'),
      import('reveal.js/plugin/markdown/markdown'),
      import('reveal.js/plugin/highlight/highlight'),
      import('reveal.js/plugin/notes/notes'),
    ]);
    if (token !== initToken) {
      return;
    }
    const instance = new Reveal(containerRef.value, {
      embedded: true,
      hash: false,
      controls: true,
      progress: true,
      center: true,
      transition: 'slide',
      plugins: [Markdown, Highlight, Notes],
      markdown: { smartypants: true },
      pdfSeparateFragments: false,
    } as never);
    deck = instance as never;
    await instance.initialize();
    if (token !== initToken) {
      (instance as { destroy?: () => void }).destroy?.();
      return;
    }
    instance.layout();
  } catch (error) {
    deck = null;
  }
}

function destroyReveal(): void {
  initToken += 1;
  if (deck) {
    deck.destroy?.();
    deck = null;
  }
}

watch(splitMode, async () => {
  if (visible.value) {
    await initReveal();
  }
});

watch(
  () => props.markdown,
  async () => {
    if (visible.value) {
      await initReveal();
    }
  },
);

/** 导出：开一个独立窗口写完整 reveal 页面，交给系统打印 / Reveal PDF 流程。 */
function exportDeck(mode: 'native' | 'pdf'): void {
  const win = window.open('', '_blank', 'width=1400,height=900');
  if (!win) {
    return;
  }
  win.document.open();
  win.document.write(
    buildPrintDocument({
      slidesHtml: slidesHtml.value,
      title: t('preview.pptPreview'),
      mode,
    }),
  );
  win.document.close();
}
</script>

<style>
.ppt-preview-overlay {
  z-index: 9999 !important;
}

.ppt-preview-dialog {
  display: flex;
  height: 100vh;
  flex-direction: column;
  margin: 0;
  border-radius: 0;
  background: #0f172a;
}

.ppt-preview-dialog .el-dialog__header {
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
  background: rgb(15 23 42 / 92%);
}

.ppt-preview-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.ppt-preview-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #cbd5e1;
}
</style>

<style scoped>
.ppt-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  color: #f8fafc;
}

.ppt-toolbar > .el-icon {
  color: var(--themeColor, #409eff);
  font-size: 22px;
}

.ppt-title {
  color: #f8fafc;
  font-size: 16px;
  font-weight: 700;
}

.ppt-split {
  margin-left: auto;
  border-radius: 4px;
  overflow: hidden;
}

.ppt-split :deep(.el-radio-button__inner) {
  border-color: transparent;
  background: #4b5563;
  color: #fff;
  font-size: 12px;
}

.ppt-split :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: var(--themeColor, #409eff);
  color: #fff;
  box-shadow: none;
}

.ppt-toolbar :deep(.el-button) {
  border-color: rgb(255 255 255 / 18%);
  background: transparent;
  color: #e2e8f0;
}

.ppt-toolbar :deep(.el-button:hover) {
  border-color: var(--themeColor, #409eff);
  background: rgb(255 255 255 / 8%);
  color: #fff;
}

.ppt-preview-container {
  height: 100%;
  background: radial-gradient(circle at top, #1e293b 0%, #020617 70%);
}

.ppt-preview-container :deep(.reveal),
.ppt-preview-container :deep(.reveal-viewport) {
  width: 100%;
  height: 100%;
  background: transparent !important;
  color: #e2e8f0;
}

.ppt-preview-container :deep(.slides) {
  color: #cbd5e1;
  text-align: left;
}

.ppt-preview-container :deep(.slides section) {
  color: #cbd5e1;
  font-size: 0.9em;
}

.ppt-preview-container :deep(.slides h1),
.ppt-preview-container :deep(.slides h2),
.ppt-preview-container :deep(.slides h3) {
  color: #f8fafc !important;
  text-transform: none;
}

.ppt-preview-container :deep(.slides p),
.ppt-preview-container :deep(.slides li),
.ppt-preview-container :deep(.slides blockquote) {
  color: #cbd5e1;
}

.ppt-preview-container :deep(.slides code) {
  color: #f8fafc;
}

.ppt-preview-container :deep(.controls),
.ppt-preview-container :deep(.progress) {
  color: var(--themeColor, #409eff);
}
</style>
