<template>
  <main class="editor-pane" @scroll.capture="hideSelectionHint">
    <template v-if="summary">
      <div class="editor-action-bar">
        <div v-if="showAdd" class="editor-add-cluster">
          <button
            type="button"
            class="fab-icon editor-add-trigger"
            :title="addExpanded ? t('action.cancel') : addTitle"
            :aria-label="addExpanded ? t('action.cancel') : addTitle"
            @click="toggleAddActions"
          >
            <el-icon><component :is="addExpanded ? Close : Plus" /></el-icon>
          </button>
          <transition name="editor-add">
            <div v-if="addExpanded" class="editor-add-actions">
              <button
                v-if="addRoot"
                type="button"
                class="fab-icon"
                :title="t('folder.createTitle')"
                :aria-label="t('folder.createTitle')"
                @click="runAddAction('create-category')"
              >
                <el-icon><FolderAdd /></el-icon>
              </button>
              <template v-else>
                <button
                  type="button"
                  class="fab-icon"
                  :title="t('notes.createTitle')"
                  :aria-label="t('notes.createTitle')"
                  @click="runAddAction('create-note')"
                >
                  <el-icon><DocumentAdd /></el-icon>
                </button>
                <button
                  type="button"
                  class="fab-icon"
                  :title="t('notes.importNotes')"
                  :aria-label="t('notes.importNotes')"
                  @click="runAddAction('import-notes')"
                >
                  <el-icon><Upload /></el-icon>
                </button>
              </template>
            </div>
          </transition>
        </div>
        <button v-show="!addExpanded" type="button" class="fab-icon" :title="sourceMode ? t('editor.toWysiwyg') : t('editor.toSource')" @click="toggleSourceMode">
          <el-icon><Switch /></el-icon>
        </button>
        <button
          v-show="!addExpanded"
          type="button"
          class="fab-icon"
          :title="locked ? t('editor.unlock') : t('editor.lock')"
          @click="toggleLock"
        >
          <el-icon><component :is="locked ? Lock : Unlock" /></el-icon>
        </button>
        <el-popover v-if="!addExpanded" trigger="click" placement="top" :width="160">
          <template #reference>
            <button type="button" class="fab-icon" :title="t('editor.statistics')">
              <el-icon><DataAnalysis /></el-icon>
            </button>
          </template>
          <div>{{ t('editor.words', { count: wordCount.word }) }}</div>
          <div>{{ t('editor.characters', { count: wordCount.character }) }}</div>
          <div>{{ t('editor.paragraphs', { count: wordCount.paragraph }) }}</div>
        </el-popover>
        <button v-show="!addExpanded" type="button" class="fab-icon" :title="t('outline.title')" @click="emit('outline')">
          <el-icon><Tickets /></el-icon>
        </button>
        <button v-show="!addExpanded" type="button" class="fab-icon" :title="t('editor.saveNow')" :disabled="saving" @click="emit('save')">
          <el-icon><Finished /></el-icon>
        </button>
        <button v-show="!addExpanded" type="button" class="fab-icon" :title="t('preview.pptPreview')" @click="emit('ppt-preview')">
          <el-icon><Monitor /></el-icon>
        </button>
        <button v-show="!addExpanded" v-if="noteLink" type="button" class="fab-icon" :title="t('editor.copyNoteLink')" @click="copyNoteLink">
          <el-icon><Link /></el-icon>
        </button>
        <button v-show="!addExpanded" type="button" class="fab-icon" :title="t('editor.aiTag')" :disabled="locked" @click="openTagDialog">
          <el-icon><PriceTag /></el-icon>
        </button>
        <span v-if="saveHint && !addExpanded" class="action-save-hint" :class="{ saving }">{{ saveHint }}</span>
      </div>
      <div
        v-show="!sourceMode"
        class="editor-context-host"
        @click.capture="onEditorClick"
        @contextmenu.capture="onContextMenu"
        @mouseup="onMuyaDomSelection"
        @keyup="onMuyaDomSelection"
      >
        <MuyaEditor
          ref="muyaRef"
          v-model="muyaModel"
          :readonly="locked"
          :theme="theme"
          :plugins="plugins"
          :options="editorOptions"
          class="muya-editor"
          @ready="onMuyaReady"
          @selection-change="onMuyaSelectionChange"
        />
      </div>
      <!-- 双编辑器：源码模式用 Monaco，同一份内容，只有激活的视图回写 -->
      <SourceEditor
        ref="monacoRef"
        v-if="sourceMode"
        v-model="contentProxy"
        :readonly="locked"
        :theme="theme"
        class="source-editor-host"
        @ready="onMonacoReady"
        @selection-change="onMonacoSelectionChange"
      />
    </template>

    <div v-else class="editor-empty">
      <svg class="editor-empty-icon" viewBox="0, 0, 400, 400" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd" d="M266.113 119.077 C 265.791 119.248,264.446 120.058,263.124 120.876 C 260.595 122.441,256.273 125.090,253.868 126.549 C 253.083 127.026,251.826 127.801,251.074 128.273 C 247.868 130.285,240.895 134.581,240.638 134.702 C 240.485 134.775,239.407 135.433,238.244 136.165 C 235.925 137.623,232.853 139.510,231.934 140.040 C 231.611 140.226,229.326 141.634,226.855 143.168 C 224.385 144.703,221.572 146.432,220.605 147.011 C 219.639 147.589,218.101 148.524,217.188 149.089 C 216.274 149.653,214.692 150.620,213.672 151.237 C 210.876 152.928,209.749 154.447,210.634 155.333 C 210.853 155.552,216.340 158.899,223.133 162.957 C 223.342 163.082,224.505 163.821,225.718 164.600 C 228.254 166.228,228.611 166.293,230.118 165.409 C 231.107 164.829,235.062 162.277,236.174 161.502 C 236.465 161.299,236.747 161.133,236.802 161.133 C 236.891 161.133,238.537 160.087,242.188 157.711 C 243.449 156.890,245.870 155.343,247.771 154.143 C 248.318 153.798,248.823 153.516,248.895 153.516 C 248.966 153.516,249.024 180.207,249.022 212.829 C 249.019 260.364,249.068 272.174,249.265 272.302 C 249.524 272.470,267.290 272.434,267.434 272.266 C 267.513 272.173,267.863 205.784,268.096 146.552 L 268.202 119.569 267.792 119.160 C 267.307 118.675,266.907 118.655,266.113 119.077 M121.816 119.460 C 121.599 119.678,121.652 141.770,121.871 142.179 C 122.036 142.488,122.918 143.087,124.316 143.839 C 124.822 144.110,127.556 145.732,132.910 148.934 C 135.273 150.348,137.734 151.812,138.379 152.188 C 139.023 152.564,140.386 153.384,141.406 154.011 C 142.427 154.637,143.789 155.452,144.434 155.821 C 145.891 156.657,145.965 156.700,150.488 159.385 C 152.529 160.596,154.668 161.859,155.241 162.190 C 155.814 162.522,156.429 162.881,156.608 162.989 C 161.153 165.718,167.064 169.249,170.508 171.290 C 172.925 172.724,178.022 175.761,181.836 178.039 C 185.649 180.318,189.077 182.355,189.453 182.567 C 190.011 182.881,191.577 183.797,193.555 184.967 C 193.716 185.062,194.766 185.693,195.889 186.369 C 197.011 187.045,198.242 187.776,198.623 187.993 C 199.004 188.211,200.503 189.102,201.953 189.973 C 203.403 190.843,206.084 192.446,207.910 193.535 C 209.736 194.623,211.362 195.597,211.523 195.698 C 211.685 195.800,213.267 196.736,215.039 197.780 C 220.798 201.169,225.421 203.920,228.809 205.971 C 232.776 208.373,233.190 208.558,233.539 208.080 C 233.899 207.587,233.905 186.945,233.545 186.474 C 233.280 186.128,233.115 186.024,225.879 181.686 C 215.705 175.585,212.962 173.935,205.176 169.230 C 200.771 166.568,196.685 164.112,196.094 163.771 C 194.832 163.043,192.185 161.446,191.211 160.825 C 190.835 160.585,188.198 158.987,185.352 157.275 C 182.505 155.562,179.736 153.892,179.199 153.562 C 177.758 152.678,161.970 143.204,153.320 138.034 C 149.185 135.561,145.273 133.209,144.629 132.806 C 143.984 132.404,143.091 131.867,142.643 131.613 C 142.195 131.360,141.185 130.749,140.397 130.257 C 137.190 128.253,131.409 124.779,123.828 120.301 C 122.328 119.415,121.999 119.278,121.816 119.460 M291.193 146.045 C 289.952 146.878,287.973 148.150,278.613 154.133 C 275.333 156.230,274.972 156.494,274.816 156.904 C 274.698 157.215,274.316 242.745,274.316 269.010 C 274.316 272.866,273.198 272.461,283.833 272.461 L 292.591 272.461 292.756 272.021 C 292.847 271.780,292.932 265.474,292.945 258.008 C 292.958 250.542,293.016 242.324,293.073 239.746 C 293.131 237.168,293.263 217.964,293.366 197.070 C 293.469 176.177,293.612 156.213,293.683 152.707 L 293.812 146.333 293.301 145.823 C 292.638 145.160,292.491 145.175,291.193 146.045 M110.470 145.817 C 110.319 146.211,110.368 248.913,110.526 262.305 L 110.645 272.363 119.238 272.418 C 123.965 272.447,128.037 272.422,128.287 272.361 L 128.741 272.251 128.629 256.389 C 128.568 247.665,128.473 236.968,128.420 232.617 C 128.366 228.267,128.275 214.775,128.217 202.637 C 128.160 190.498,128.063 180.061,128.002 179.443 C 127.929 178.702,127.963 178.320,128.102 178.320 C 128.272 178.320,141.069 185.886,143.262 187.283 C 143.584 187.489,145.649 188.727,147.852 190.034 C 150.054 191.342,152.778 192.967,153.906 193.646 C 155.034 194.325,156.265 195.053,156.641 195.264 C 157.017 195.474,157.983 196.042,158.789 196.524 C 159.595 197.007,162.144 198.528,164.453 199.904 C 166.763 201.281,169.180 202.733,169.824 203.131 C 177.009 207.568,182.385 210.624,183.008 210.625 C 183.517 210.625,184.465 210.172,186.719 208.854 C 188.384 207.880,190.757 206.515,191.992 205.820 C 193.228 205.125,194.590 204.357,195.020 204.114 C 195.449 203.871,196.592 203.225,197.559 202.679 C 201.392 200.512,201.373 200.471,194.727 196.433 C 192.524 195.095,189.602 193.307,188.233 192.459 C 186.863 191.611,185.589 190.829,185.401 190.721 C 184.707 190.321,182.666 189.079,180.957 188.017 C 179.990 187.416,178.452 186.478,177.539 185.931 C 176.626 185.384,174.912 184.344,173.730 183.620 C 172.549 182.896,169.824 181.241,167.676 179.943 C 165.527 178.645,162.627 176.877,161.230 176.014 C 159.834 175.151,158.340 174.230,157.910 173.967 C 157.480 173.704,155.942 172.760,154.492 171.869 C 150.227 169.249,142.960 164.821,140.190 163.155 C 139.575 162.785,138.521 162.138,137.847 161.718 C 137.173 161.298,135.830 160.478,134.863 159.895 C 131.898 158.109,123.684 153.096,120.757 151.286 C 111.230 145.394,110.734 145.130,110.470 145.817 M140.129 206.689 C 140.078 206.824,140.059 221.655,140.087 239.648 L 140.137 272.363 148.202 272.414 C 153.540 272.448,156.397 272.396,156.649 272.261 C 157.039 272.052,157.243 219.381,156.860 217.969 C 156.767 217.629,155.870 216.873,153.901 215.478 C 152.346 214.376,150.020 212.709,148.730 211.773 C 142.002 206.885,140.412 205.946,140.129 206.689 " />
      </svg>
    </div>

    <!-- 划词改写：mousedown.prevent 保住编辑器选区，点了才捕获快照 -->
    <div
      v-if="selectionHint && !selectionHint.empty && !locked && summary"
      class="ai-selection-bar"
      :style="selectionBarStyle"
      @mousedown.prevent
    >
      <el-button type="primary" size="small" @mousedown.prevent @click="openRewriteDialog">
        {{ t('editor.aiRewrite') }}
      </el-button>
    </div>
    <AiRewriteDialog v-model="rewriteVisible" :text="rewriteText" @apply="applyRewrite" />
    <AiTagDialog
      v-model="tagVisible"
      :note-id="summary?.id ?? null"
      :title="summary?.title ?? ''"
      :content="content"
      :existing-tags="currentTags"
      :known-tags="knownTags"
      @apply="applyTags"
    />
  </main>
</template>

<script setup lang="ts">
import { Close, DataAnalysis, DocumentAdd, Finished, FolderAdd, Link, Lock, Monitor, Plus, PriceTag, Switch, Tickets, Unlock, Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  muyaCursorToPosition,
  positionToMuyaCursor,
  type MonacoPosition,
} from '@/utils/cursor';
import { useI18n } from 'vue-i18n';
import type { AppInfo } from '@shared/ipc/contract';
import type { AppTheme } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import { MuyaEditor } from 'libs-muya-vue3';
import { noteTags } from '@/utils/note';
import { createQuickInsertProvider } from '@/editor/quickInsert';
import { quickInsertTypes } from '@/editor/insertHandlers';
import { useLibraryStore } from '@/stores/library';
import { saveAttachmentImage, uploadImageAttachment } from '@/services/ipc';
import type { ImageUploadService } from '@/services/ipc';
import { getSyncStatus } from '@/services/sync';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import SourceEditor from '@/components/SourceEditor.vue';
import { onAiInsert, type AiInsertMode } from '@/editor/aiInsert';
import type { EditorSelectionHint, EditorSelectionSnapshot } from '@/editor/selection';
import AiRewriteDialog from '@/components/AiRewriteDialog.vue';
import AiTagDialog from '@/components/AiTagDialog.vue';
import { normalizeTagName } from '@/utils/autotag';
import { formatDocumentByPangu } from '@/utils/pangu';
import { readEchoInstance, rewriteEchoInstance, type EchoInstancePatch, type EchoInstanceToken } from '@/utils/echoToken';
import { ProofreadError, proofreadMarkdown } from '@/services/aiProofread';
import { RuneTransformer, type RuneResizePayload } from '@/editor/runeTransformer';
import { rewriteRunePlaceholderSizeByNodeId } from '@/editor/runePlaceholderAttrs';
import type { ShortcutAction } from '@/utils/shortcuts';

const props = defineProps<{
  summary: NoteSummary | null;
  content: string;
  theme: AppTheme;
  // Muya 插件实例由上层注入，这里只透传，不做类型约束。
  plugins: any;
  saveHint: string;
  saving: boolean;
  statusLabel: string;
  statusType: string;
  statusError: string;
  appInfo: AppInfo | null;
  showAdd?: boolean;
  addRoot?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:content', value: string): void;
  (event: 'delete'): void;
  (event: 'save'): void;
  (event: 'edit-tags'): void;
  (event: 'echo-instance', payload: EchoInstanceToken): void;
  (event: 'mind-map'): void;
  (event: 'ppt-preview'): void;
  (event: 'create-note'): void;
  (event: 'create-category'): void;
  (event: 'import-notes'): void;
  (event: 'outline'): void;
  (event: 'context-menu', payload: { x: number; y: number; selectionEmpty: boolean; locked: boolean }): void;
}>();

const { t } = useI18n();
const locked = ref(false);
const noteLink = ref('');
const addExpanded = ref(false);
const showAdd = computed(() => props.showAdd !== false);
const addTitle = computed(() => (
  props.addRoot
    ? t('folder.createTitle')
    : `${t('notes.createTitle')} / ${t('notes.importNotes')}`
));

function toggleAddActions(): void {
  addExpanded.value = !addExpanded.value;
}

function runAddAction(action: 'create-note' | 'create-category' | 'import-notes'): void {
  addExpanded.value = false;
  if (action === 'create-note') {
    emit('create-note');
  } else if (action === 'create-category') {
    emit('create-category');
  } else {
    emit('import-notes');
  }
}

watch(
  () => [props.summary?.id, props.showAdd],
  () => {
    addExpanded.value = false;
  },
);

watch(
  [() => props.summary?.docGuid, () => props.summary?.kbGuid],
  async ([docGuid, kbGuid], _previous, onCleanup) => {
    noteLink.value = '';
    if (!docGuid || docGuid.startsWith('local_') || !kbGuid) {
      return;
    }

    let stale = false;
    onCleanup(() => { stale = true; });
    try {
      const status = await getSyncStatus();
      if (stale || !status.ok || !status.data.loggedIn || status.data.kbGuid !== kbGuid) {
        return;
      }

      const url = new URL(status.data.kbServer);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        return;
      }
      const basePath = url.pathname.replace(/\/ks\/note\/view(?:\/.*)?$/, '').replace(/\/+$/, '');
      url.pathname = `${basePath}/ks/note/view/${encodeURIComponent(kbGuid)}/${encodeURIComponent(docGuid)}/`;
      url.search = '';
      url.hash = '';
      noteLink.value = url.href;
    } catch {
      // 状态不可读或知识库地址无效时，不显示复制入口。
    }
  },
  { immediate: true },
);

async function copyNoteLink(): Promise<void> {
  if (!noteLink.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(noteLink.value);
    ElMessage.success(t('notes.copySuccess'));
  } catch {
    ElMessage.error(t('notes.copyFailed'));
  }
}

function toggleLock(): void {
  if (!props.summary) {
    return;
  }
  locked.value = !locked.value;
  ElMessage.info(t(locked.value ? 'editor.locked' : 'editor.unlocked'));
}

const contentProxy = computed({
  get: () => props.content,
  set: (value: string) => {
    if (!locked.value) {
      emit('update:content', value);
    }
  },
});

const sourceMode = ref(false);

/** 源码模式下给 Muya 的"冻结"内容：隐藏的 Muya 不再接收 Monaco 的实时内容。 */
const muyaFrozen = ref('');

/**
 * Muya 的 v-model。
 *
 * 源码模式必须冻结：Muya 是用 v-show 保活的，如果照常跟着 contentProxy 走，
 * 在 Monaco 里每敲一个字符都会触发 Muya `setMarkdown` → 整篇重新解析渲染，
 * 渲染结束再把 Muya 序列化的 markdown 当作用户输入 emit 回来（core.setMarkdown
 * 的 change 派发在渲染之后异步发生，防回声标记挡不住）。这个回声回到 Monaco
 * 就是外部整体写值：光标被重置到文首（回车换行必现）、或者第二次按键落到错位置。
 */
const muyaModel = computed({
  get: () => (sourceMode.value ? muyaFrozen.value : props.content),
  set: (value: string) => {
    if (!sourceMode.value) {
      contentProxy.value = value;
    }
  },
});

/** 双编辑器切换：不销毁 Muya（v-show），避免来回切换丢撤销栈与滚动位置。 */
function toggleSourceMode(): void {
  // 光标同步（复刻 vue2 isSourceMode watcher）：切换前记下当前视图光标，切换后落到另一视图
  if (!sourceMode.value) {
    const cursor = muyaRef.value?.getCursor?.();
    pendingCursor.value = cursor ? muyaCursorToPosition(cursor) : { lineNumber: 1, column: 1 };
    // 进源码模式前冻住 Muya 的内容，切回来时再按当时正文解冻。
    muyaFrozen.value = props.content;
    runeTransformer?.hide();
    sourceMode.value = true;
    // Monaco 是 v-if 新挂载且异步 import，等 SourceEditor 的 ready 事件再落位
    return;
  }
  const position = monacoRef.value?.getCursor?.() ?? { lineNumber: 1, column: 1 };
  pendingCursor.value = position;
  sourceMode.value = false;
  void nextTick(() => {
    // 引擎收 0-based { line, ch }，与 Monaco 的 1-based 差 1，走 utils/cursor 统一换算
    muyaRef.value?.setCursor?.(positionToMuyaCursor(pendingCursor.value));
  });
}

/** Monaco 异步实例真正创建后再落光标；否则 nextTick 时 editor 还是 null。 */
function onMonacoReady(): void {
  if (!pendingCursor.value) {
    return;
  }
  monacoRef.value?.setCursor?.(pendingCursor.value);
  pendingCursor.value = null;
}

const muyaRef = ref<InstanceType<typeof MuyaEditor> | null>(null);
let runeTransformer: RuneTransformer | null = null;

/**
 * Rune 拖拽落点：只改 data-rune-width/height，保留 props 与其它属性。
 *
 * 这里不用 setMarkdownWithCursor：拖拽控制点时选区通常落在 Rune 宿主内，
 * 把该光标位置带进重载会让 raw HTML 块退化成裸文本，卡片直接消失。
 * 尺寸提交不需要恢复 Rune 内选区，普通 setMarkdown 更稳定。
 */
function commitRuneResize({ nodeId, width, height }: RuneResizePayload): boolean {
  if (locked.value || !nodeId) {
    return false;
  }
  const markdown = sourceMode.value
    ? props.content
    : String(muyaRef.value?.getMarkdown?.() ?? props.content ?? '');
  const next = rewriteRunePlaceholderSizeByNodeId(markdown, nodeId, { width, height });
  if (next === markdown) {
    return false;
  }
  if (sourceMode.value) {
    emit('update:content', next);
    return true;
  }
  muyaRef.value?.setMarkdown?.(next);
  return true;
}

/** 引擎就绪后挂 Rune 尺寸调整器；重复 ready 时先销毁旧实例，避免重复监听。 */
function onMuyaReady(editor: unknown): void {
  runeTransformer?.destroy();
  const container = (editor as { container?: HTMLElement } | null)?.container
    ?? (muyaRef.value?.getEditor?.()?.container as HTMLElement | undefined)
    ?? null;
  runeTransformer = new RuneTransformer(editor, {
    canEdit: () => !locked.value,
    onCommit: commitRuneResize,
    scrollContainer: container,
  });
}

watch(locked, (value) => {
  if (value) {
    runeTransformer?.hide();
  }
});
const selectionHint = ref<EditorSelectionHint | null>(null);
const rewriteVisible = ref(false);
const rewriteText = ref('');
const rewriteTarget = ref<{ snapshot: EditorSelectionSnapshot; sourceMode: boolean; noteId: number } | null>(null);
const tagVisible = ref(false);
const currentTags = computed(() => (props.summary ? noteTags(props.summary) : []));
const knownTags = computed(() => notesStore.tags.map((tag) => tag.name));
const monacoRef = ref<InstanceType<typeof SourceEditor> | null>(null);
const pendingCursor = ref<MonacoPosition | null>(null);
const wordCount = computed(() => {
  const markdown = props.content.replace(/\r\n/g, '\n');
  return muyaRef.value?.getEditor()?.getWordCount(markdown) ?? { word: 0, character: 0, paragraph: 0 };
});

/**
 * AI 回复落到当前编辑器。
 * append 保持 vue2 行为：Muya 保留光标拼到文末，Monaco 在末行插入。
 * replace 是新增强：整篇覆盖正文（AiHelperPanel 已做过二次确认）。
 */
function applyAiText(text: string, mode: AiInsertMode = 'append'): boolean {
  const clean = String(text ?? '').trim();
  if (!clean || !props.summary || locked.value) {
    return false;
  }
  if (mode === 'replace') {
    if (sourceMode.value) {
      return monacoRef.value?.replaceAllText?.(clean) === true;
    }
    if (!muyaRef.value) {
      return false;
    }
    muyaRef.value.setMarkdown?.(clean);
    return true;
  }
  if (sourceMode.value) {
    return monacoRef.value?.appendText?.(clean) === true;
  }
  const current = String(muyaRef.value?.getMarkdown?.() ?? props.content ?? '');
  const cursor = muyaRef.value?.getCursor?.() ?? null;
  const next = `${current}${clean}`;
  if (cursor && typeof muyaRef.value?.setMarkdownWithCursor === 'function') {
    muyaRef.value.setMarkdownWithCursor(next, cursor);
  } else {
    muyaRef.value?.setMarkdown?.(next);
  }
  return true;
}

/** Muya 选区事件：有选中的 block 才亮悬浮条；坐标是视口坐标，可直接 fixed 定位。 */
function onMuyaSelectionChange(payload: unknown): void {
  const info = payload as {
    start?: { key?: unknown; offset?: number };
    end?: { key?: unknown; offset?: number };
    cursorCoords?: { x?: number; y?: number };
  } | null;
  if (!info?.start || !info?.end) {
    selectionHint.value = null;
    return;
  }
  const empty = info.start.key === info.end.key &&
    Number(info.start.offset ?? 0) === Number(info.end.offset ?? 0);
  if (empty) {
    selectionHint.value = null;
    return;
  }
  const x = Number(info.cursorCoords?.x ?? 0);
  const y = Number(info.cursorCoords?.y ?? 0);
  selectionHint.value = x === 0 && y === 0 ? null : { empty: false, x, y };
}

function hideSelectionHint(): void {
  selectionHint.value = null;
}

/** Muya 拖选/Shift 选择不一定派发引擎事件；这里直接读 DOM 选区补悬浮条。 */
function onMuyaDomSelection(event: MouseEvent | KeyboardEvent): void {
  const host = event.currentTarget as HTMLElement | null;
  const selection = window.getSelection();
  if (!host || !selection || selection.rangeCount === 0) {
    selectionHint.value = null;
    return;
  }
  if (selection.isCollapsed ||
      !host.contains(selection.anchorNode) || !host.contains(selection.focusNode)) {
    selectionHint.value = null;
    return;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  selectionHint.value = { empty: false, x: rect.left, y: rect.top };
}

function onMonacoSelectionChange(payload: EditorSelectionHint): void {
  selectionHint.value = payload.empty ? null : payload;
}

const selectionBarStyle = computed(() => {
  const hint = selectionHint.value;
  const x = Number(hint?.x ?? 0);
  const y = Number(hint?.y ?? 0);
  const width = 108;
  const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth;
  return {
    left: `${Math.min(Math.max(8, x - width / 2), Math.max(8, viewportWidth - width - 8))}px`,
    top: `${y > 64 ? y - 42 : y + 22}px`,
  };
});

/** 点悬浮条：先抓稳定快照，再开弹窗；弹窗抢焦点也不影响替换。 */
function openRewriteDialog(): void {
  if (locked.value || !props.summary) {
    return;
  }
  const snapshot = sourceMode.value
    ? monacoRef.value?.captureSelection?.() ?? null
    : muyaRef.value?.captureSelection?.() ?? null;
  if (!snapshot || !String(snapshot.text ?? '').trim()) {
    ElMessage.warning(t('editor.aiRewriteEmpty'));
    return;
  }
  rewriteTarget.value = { snapshot, sourceMode: sourceMode.value, noteId: props.summary.id };
  rewriteText.value = snapshot.text;
  rewriteVisible.value = true;
  selectionHint.value = null;
}

/** 弹窗里点“替换选区”：快照和当前编辑器都对得上才写回。 */
function applyRewrite(value: string): void {
  const target = rewriteTarget.value;
  if (!target || target.noteId !== props.summary?.id) {
    ElMessage.warning(t('editor.aiRewriteStale'));
    return;
  }
  const ok = target.sourceMode
    ? monacoRef.value?.replaceSelectionSnapshot?.(target.snapshot, value) === true
    : muyaRef.value?.replaceSelectionSnapshot?.(target.snapshot, value) === true;
  if (!ok) {
    ElMessage.warning(t('editor.aiRewriteStale'));
    return;
  }
  rewriteVisible.value = false;
  rewriteTarget.value = null;
  ElMessage.success(t('editor.aiRewriteApplied'));
}

watch(
  [() => props.summary?.id, sourceMode, () => locked.value],
  () => {
    selectionHint.value = null;
    if (rewriteVisible.value) {
      rewriteVisible.value = false;
      rewriteTarget.value = null;
    }
  },
);

function openTagDialog(): void {
  if (locked.value || !props.summary) {
    return;
  }
  tagVisible.value = true;
}

/** 单篇打标应用：旧标签保留，新标签按大小写不敏感去重，缺失的标签先建库。 */
async function applyTags(names: string[]): Promise<void> {
  if (!props.summary) {
    return;
  }
  const noteId = props.summary.id;
  const merged = [...currentTags.value];
  const seen = new Set(merged.map((name) => name.toLowerCase()));
  for (const raw of names) {
    const name = normalizeTagName(raw);
    if (name && !seen.has(name.toLowerCase())) {
      merged.push(name);
      seen.add(name.toLowerCase());
    }
  }
  for (const name of merged) {
    const exists = notesStore.tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      await notesStore.createTag(name);
    }
  }
  const saved = await notesStore.setTags(noteId, merged);
  tagVisible.value = false;
  if (saved) {
    ElMessage.success(t('aiTag.applied'));
  } else {
    ElMessage.error(notesStore.error || t('aiTag.applyFailed'));
  }
}

const stopAiInsert = onAiInsert(applyAiText);
onBeforeUnmount(stopAiInsert);

interface LuckyChantPayload {
  node?: HTMLElement;
  props?: Record<string, unknown>;
}

interface EchoChantWindow {
  __memocastEchoChantHandlers?: Record<string, (payload: LuckyChantPayload) => Promise<void>>;
}

/**
 * 对齐 vue2 Muya.handleLuckyChantTrigger：
 * 强运回调读当前 Markdown → AI 校对 → 内容有变化才整篇替换 → 触发自动保存。
 */
async function handleLuckyChantTrigger(payload: LuckyChantPayload = {}): Promise<void> {
  if (locked.value || !props.summary) {
    return;
  }
  const noteId = props.summary.id;
  const source = sourceMode.value;
  const before = source
    ? String(props.content ?? '')
    : String(muyaRef.value?.getMarkdown?.() ?? props.content ?? '');
  if (!before.trim()) {
    ElMessage.warning(t('aiLucky.empty'));
    return;
  }

  const node = payload.node;
  node?.classList.add('ag-rune-lucky-loading');
  try {
    const result = await proofreadMarkdown(before, {
      model: typeof payload.props?.model === 'string' ? payload.props.model : '',
    });
    if (!result.corrected || result.corrected === before) {
      ElMessage.info(t('aiLucky.noChange'));
      return;
    }
    if (result.truncated) {
      ElMessage.error(t('aiLucky.truncated'));
      return;
    }

    // 请求期间切了笔记 / 切了源码模式 / 又改了正文，不能把旧结果盖上去。
    const current = source
      ? String(props.content ?? '')
      : String(muyaRef.value?.getMarkdown?.() ?? props.content ?? '');
    if (locked.value || props.summary?.id !== noteId || sourceMode.value !== source || current !== before) {
      ElMessage.warning(t('aiLucky.changed'));
      return;
    }

    if (source) {
      emit('update:content', result.corrected);
    } else {
      const cursor = muyaRef.value?.getCursor?.() ?? null;
      if (cursor && typeof muyaRef.value?.setMarkdownWithCursor === 'function') {
        muyaRef.value.setMarkdownWithCursor(result.corrected, cursor);
      } else {
        muyaRef.value?.setMarkdown?.(result.corrected);
      }
      emit('update:content', result.corrected);
    }
    ElMessage.success(`${t('aiLucky.done')}（model=${result.model}）`);
  } catch (error) {
    const code = error instanceof ProofreadError ? error.code : '';
    if (code.includes('NO_DEFAULT_CONFIG') || code.includes('AI_PROOFREAD_NO_MODEL')) {
      ElMessage.error(t('aiLucky.noConfig'));
    } else if (code.includes('CONFIG_INCOMPLETE') || code.includes('AI_MODEL_INCOMPLETE')) {
      ElMessage.error(`${t('aiLucky.configIncomplete')}（${error instanceof Error ? error.message : ''}）`);
    } else if (code === 'AI_PROOFREAD_EMPTY') {
      ElMessage.warning(t('aiLucky.empty'));
    } else {
      const detail = error instanceof Error && error.message ? `：${error.message}` : '';
      ElMessage.error(`${t('aiLucky.failed')}${detail}`);
    }
  } finally {
    node?.classList.remove('ag-rune-lucky-loading');
  }
}

function registerLuckyHandler(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const host = window as unknown as EchoChantWindow;
  host.__memocastEchoChantHandlers = Object.assign(host.__memocastEchoChantHandlers || {}, {
    lucky: handleLuckyChantTrigger,
  });
}

function unregisterLuckyHandler(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const host = window as unknown as EchoChantWindow;
  if (host.__memocastEchoChantHandlers?.lucky === handleLuckyChantTrigger) {
    delete host.__memocastEchoChantHandlers.lucky;
  }
}

onBeforeUnmount(unregisterLuckyHandler);
onBeforeUnmount(() => {
  runeTransformer?.destroy();
  runeTransformer = null;
});

/** 盘古格式化当前文档；源码模式直接回抛 update，Muya 走 setMarkdown。 */
async function formatDocument(): Promise<boolean> {
  if (locked.value || !props.summary) {
    return false;
  }
  const noteId = props.summary.id;
  const source = sourceMode.value;
  const before = sourceMode.value
    ? String(props.content ?? '')
    : String(muyaRef.value?.getMarkdown?.() ?? props.content ?? '');
  if (!before.trim()) {
    return true;
  }
  try {
    const after = await formatDocumentByPangu(before);
    if (locked.value || props.summary?.id !== noteId || sourceMode.value !== source ||
        (source ? props.content : muyaRef.value?.getMarkdown() ?? props.content) !== before) {
      return false;
    }
    if (after === before) {
      return true;
    }
    if (sourceMode.value) {
      emit('update:content', after);
    } else {
      muyaRef.value?.setMarkdown?.(after);
    }
    return true;
  } catch {
    return false;
  }
}


const libraryStore = useLibraryStore();
const notesStore = useNotesStore();
const appStore = useAppStore();

/**
 * @ 快捷面板的数据源：符文与回响。
 * provider 每次打开都读 store 里的内存缓存，不在按键路径上发 IPC。
 */
const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const extOfFile = (file: File): string => {
  const fromName = file.name?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) {
    return `.${fromName.toLowerCase()}`;
  }
  const fromType = file.type?.split('/')[1];
  return fromType ? `.${fromType.toLowerCase()}` : '.png';
};

/**
 * 粘贴/拖入图片 → 先本地落盘，再按设置走图床（PicGo / 为知官方 / 本地）。
 * 图床失败时主进程返回本地 url + error，这里提示后照常插图，不让图片变空。
 */
async function savePastedImage(file: File): Promise<string> {
  const summary = props.summary;
  if (!summary) {
    return '';
  }
  const base64 = await readFileAsBase64(file);
  const configured = String(appStore.prefs['setting/server/imageUploadService'] || 'none');
  const service: ImageUploadService =
    configured === 'picgoServer' || configured === 'wizOfficialImageUploadService' ? configured : 'none';
  const uploaded = await uploadImageAttachment({
    base64,
    ext: extOfFile(file),
    name: file.name,
    service,
    kbGuid: summary.kbGuid,
    docGuid: summary.docGuid,
    noteId: summary.id,
  });
  if (uploaded.ok) {
    if (uploaded.data.error) {
      ElMessage.warning(t('editor.imageUploadFailed', { message: uploaded.data.error }));
    }
    return uploaded.data.url;
  }
  // IPC 本身失败（旧版本主进程 / 通道异常）→ 退回纯本地落盘
  const result = await saveAttachmentImage({
    base64,
    ext: extOfFile(file),
    kbGuid: summary.kbGuid,
    docGuid: summary.docGuid,
    noteId: summary.id,
  });
  if (result.ok === false) {
    return '';
  }
  ElMessage.warning(t('editor.imageUploadFailed', { message: uploaded.error.message }));
  return result.data.url;
}

const editorOptions = {
  quickInsertProvider: createQuickInsertProvider(
    () => ({
      runes: libraryStore.runes,
      echoes: libraryStore.echoes,
      notes: notesStore.notes,
    }),
    (key: string) => t(key),
  ),
  // 领域插入语义由 app 注入，引擎只负责定位 @ 和调用这里。
  quickInsertTypes,
  // 图片落盘：引擎把 File 交过来，应用侧存盘并回写 coolma:// 地址
  imageAction: async (file: File | string) => {
    if (typeof File !== 'undefined' && file instanceof File) {
      return savePastedImage(file);
    }
    return '';
  },
};

onMounted(() => {
  registerLuckyHandler();
  void libraryStore.load();
  void appStore.loadPrefs();
});
/** 右键：把坐标与「选区是否为空」交给父级——菜单项启用条件按 vue2 依赖这个。 */
function onContextMenu(event: MouseEvent): void {
  event.preventDefault();
  const selection = window.getSelection();
  const host = event.currentTarget as HTMLElement;
  const selectionEmpty = !selection || selection.isCollapsed ||
    !host.contains(selection.anchorNode) || !host.contains(selection.focusNode);
  emit('context-menu', { x: event.clientX, y: event.clientY, selectionEmpty, locked: locked.value });
}

/**
 * 点击正文回响 → 交父级打开实例弹窗。
 * 只认渲染层打的 data-echo-host，避免普通文本点击被截走；强运是按钮，保留它自己的 AI 点击。
 */
function onEditorClick(event: MouseEvent): void {
  if (locked.value) {
    return;
  }
  const target = event.target as HTMLElement | null;
  const host = target?.closest?.('[data-echo-host="true"]') as HTMLElement | null;
  if (!host) {
    return;
  }
  if (host.classList.contains('ag-rune-lucky-active') || target?.closest?.('.ag-rune-lucky-active')) {
    return;
  }
  if (target?.closest?.('a, button, input, textarea, select, [role="button"]')) {
    return;
  }

  const echoId = String(host.dataset.echoId || '').trim();
  if (!echoId) {
    return;
  }
  const markdown = String(muyaRef.value?.getMarkdown?.() ?? props.content ?? '');
  const found = readEchoInstance(markdown, echoId);
  let token = found;

  if (!token) {
    let props: Record<string, unknown> = { value: host.dataset.echoValue || '' };
    try {
      const parsed = JSON.parse(String(host.dataset.echoPropsJson || '{}'));
      if (parsed && typeof parsed === 'object') {
        props = parsed as Record<string, unknown>;
      }
    } catch {
      // dataset 损坏时用 value 兜底，仍允许打开弹窗。
    }
    token = {
      echoId,
      nodeId: String(host.dataset.echoNodeId || ''),
      echoName: String(host.dataset.echoName || '').trim() || '回响',
      definitionId: String(host.dataset.echoDefinitionId || '').trim(),
      props,
      prompt: String(host.dataset.echoValue || ''),
      raw: '',
    };
  }

  event.preventDefault();
  event.stopPropagation();
  emit('echo-instance', token);
}

/** 实例弹窗保存：只替换当前 echoId 的 token，保留 prompt 和其它实例。 */
function applyEchoInstance(patch: EchoInstancePatch): boolean {
  const markdown = sourceMode.value
    ? props.content
    : String(muyaRef.value?.getMarkdown?.() ?? props.content ?? '');
  const next = rewriteEchoInstance(markdown, patch.echoId, patch.props);
  if (!next) {
    return false;
  }
  if (sourceMode.value) {
    emit('update:content', next);
    return true;
  }
  muyaRef.value?.setMarkdown?.(next);
  emit('update:content', next);
  return true;
}

/** 右键菜单动作：直接转给引擎（copyAsMarkdown / copyAsHtml / pasteAsPlainText / insertParagraph）。 */
function runEditorCommand(command: string): boolean {
  if (locked.value && !['copy', 'copyAsHtml', 'copyAsMarkdown'].includes(command)) {
    return false;
  }
  const editor = muyaRef.value?.getEditor?.();
  if (!editor) {
    return false;
  }
  switch (command) {
    case 'copyAsMarkdown':
      editor.copyAsMarkdown?.();
      return true;
    case 'copyAsHtml':
      editor.copyAsHtml?.();
      return true;
    case 'pasteAsPlainText':
      editor.pasteAsPlainText?.();
      return true;
    case 'insertBefore':
      editor.insertParagraph?.('before');
      return true;
    case 'insertAfter':
      editor.insertParagraph?.('after');
      return true;
    case 'cut':
      document.execCommand('cut');
      return true;
    case 'copy':
      document.execCommand('copy');
      return true;
    case 'paste':
      document.execCommand('paste');
      return true;
    default:
      return false;
  }
}

/**
 * 键盘 accelerator 的编辑器分发（vue2 menu → editor-*-action → Muya/Monaco）。
 * 源码模式只保留撤销/重做/全选/复制为 Markdown/纯文本粘贴和盘古格式化，
 * 段落/格式命令与 vue2 一样只在 Muya 生效。
 */
function executeShortcut(
  action: Extract<ShortcutAction, { scope: 'editor' }>,
): boolean | Promise<boolean> {
  if (action.command === 'formatDocument') {
    return formatDocument();
  }

  if (sourceMode.value) {
    switch (action.command) {
      case 'undo':
        return monacoRef.value?.undo?.() ?? false;
      case 'redo':
        return monacoRef.value?.redo?.() ?? false;
      case 'selectAll':
        return monacoRef.value?.selectAll?.() ?? false;
      case 'copyAsMarkdown':
        return monacoRef.value?.copyAsMarkdown?.() ?? false;
      case 'pasteAsPlainText':
        return monacoRef.value?.pasteAsPlainText?.() ?? false;
      default:
        return false;
    }
  }

  const editor = muyaRef.value?.getEditor?.();
  if (!editor) {
    return false;
  }

  // 锁定只放行只读命令；与右键菜单的 copyAsMarkdown 例外保持一致。
  if (locked.value && !['copyAsMarkdown', 'selectAll'].includes(action.command)) {
    return false;
  }

  switch (action.command) {
    case 'undo':
      editor.undo();
      return true;
    case 'redo':
      editor.redo();
      return true;
    case 'copyAsMarkdown':
      editor.copyAsMarkdown();
      return true;
    case 'pasteAsPlainText':
      editor.pasteAsPlainText();
      return true;
    case 'selectAll':
      editor.selectAll();
      return true;
    case 'duplicate':
      editor.duplicate();
      return true;
    case 'createParagraph':
      // vue2 editParagraphHandler: insertParagraph('after', '', true)
      editor.insertParagraph('after', '', true);
      return true;
    case 'deleteParagraph':
      editor.deleteParagraph();
      return true;
    case 'paragraph':
      editor.updateParagraph(action.value ?? '');
      return true;
    case 'format':
      editor.format(action.value ?? '');
      return true;
    default:
      return false;
  }
}

/**
 * 大纲跳转：按标题序号滚动到对应块。
 * 引擎没有 scrollToHeader API（vue2 是走 bus 让 contentState 自己滚），
 * 这里按 DOM 里第 n 个 h1-h6 定位——标题顺序与 buildOutline 的展平顺序一致。
 */
function scrollToHeading(index: number): boolean {
  const container = muyaRef.value?.getEditor?.()?.container as HTMLElement | undefined;
  const headings = container?.querySelectorAll?.('h1,h2,h3,h4,h5,h6') ?? [];
  const target = headings[index] as HTMLElement | undefined;
  if (!target) {
    return false;
  }
  target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return true;
}

defineExpose({
  scrollToHeading,
  toggleSourceMode,
  toggleLock,
  runEditorCommand,
  executeShortcut,
  formatDocument,
  applyEchoInstance,
});
</script>
