<template>
  <el-dialog
    v-model="visible"
    fullscreen
    :title="t('preview.pptPreview')"
    class="ppt-preview-dialog"
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

<style scoped>
.ppt-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ppt-title {
  font-weight: 600;
}

.ppt-split {
  margin-left: auto;
}

.ppt-preview-container {
  height: calc(100vh - 120px);
  background: #111827;
}
</style>
