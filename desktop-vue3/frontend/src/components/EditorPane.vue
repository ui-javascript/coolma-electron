<template>
  <main class="editor-pane">
    <template v-if="summary">
      <div class="editor-meta">
        <div class="editor-meta-left">
          <el-tag type="success" effect="plain" size="small">{{ sourceMode ? 'Monaco' : 'Muya' }}</el-tag>
          <el-button text size="small" class="mode-toggle" @click="toggleSourceMode">
            <el-icon><Switch /></el-icon>
            <span>{{ sourceMode ? t('editor.toWysiwyg') : t('editor.toSource') }}</span>
          </el-button>
          <el-button
            text
            size="small"
            :title="t(locked ? 'editor.unlock' : 'editor.lock')"
            :aria-label="t('editor.lock')"
            :aria-pressed="locked"
            @click="toggleLock"
          >
            <el-icon><component :is="locked ? Lock : Unlock" /></el-icon>
          </el-button>
          <el-popover trigger="click" placement="bottom">
            <template #reference>
              <el-button text size="small" :title="t('editor.statistics')" :aria-label="t('editor.statistics')">
                <el-icon><DataAnalysis /></el-icon>
              </el-button>
            </template>
            <div>{{ t('editor.words', { count: wordCount.word }) }}</div>
            <div>{{ t('editor.characters', { count: wordCount.character }) }}</div>
            <div>{{ t('editor.paragraphs', { count: wordCount.paragraph }) }}</div>
          </el-popover>
          <el-button text size="small" :title="t('editor.mindMap')" @click="emit('mind-map')">
            <el-icon><Share /></el-icon>
            <span>{{ t('editor.mindMap') }}</span>
          </el-button>
          <el-button text size="small" :title="t('preview.pptPreview')" @click="emit('ppt-preview')">
            <el-icon><Monitor /></el-icon>
            <span>{{ t('preview.pptPreview') }}</span>
          </el-button>
          <span class="editor-meta-title">{{ summary.title }}</span>
        </div>
        <div class="editor-meta-right">
          <span class="editor-meta-note">
            {{ noteTags(summary).join(' · ') || t('notes.untagged') }} · {{ formatNoteDate(summary, t) }}
          </span>
          <span v-if="saveHint" class="save-hint" :class="{ saving }">{{ saveHint }}</span>
          <el-button
            v-if="noteLink"
            text
            size="small"
            :title="t('editor.copyNoteLink')"
            :aria-label="t('editor.copyNoteLink')"
            @click="copyNoteLink"
          >
            <el-icon><Link /></el-icon>
          </el-button>
          <el-button
            text
            size="small"
            :title="t('editor.saveNow')"
            :aria-label="t('editor.saveNow')"
            :disabled="saving"
            @click="emit('save')"
          >
            <el-icon><Finished /></el-icon>
          </el-button>
          <el-button text type="danger" size="small" :title="t('action.delete')" @click="emit('delete')">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
      <div v-show="!sourceMode" class="editor-context-host" @contextmenu.capture="onContextMenu">
        <MuyaEditor
          ref="muyaRef"
          v-model="contentProxy"
          :readonly="locked"
          :theme="theme"
          :plugins="plugins"
          :options="editorOptions"
          class="muya-editor"
        />
      </div>
      <!-- 双编辑器：源码模式用 Monaco，同一份内容，只有激活的视图回写 -->
      <SourceEditor ref="monacoRef" v-if="sourceMode" v-model="contentProxy" :readonly="locked" :theme="theme" class="source-editor-host" />
    </template>

    <el-empty v-else :description="t('editor.emptyHint')">
      <template #image>
        <div class="empty-mark">C</div>
      </template>
      <p class="empty-title">{{ t('editor.emptyTitle') }}</p>
    </el-empty>

    <footer class="statusbar">
      <span class="statusbar-left">
        <span class="status-dot" :class="statusType" />
        {{ statusLabel }}
      </span>
      <span v-if="appInfo" class="statusbar-right">
        v{{ appInfo.version }} · Electron {{ appInfo.electron }} · {{ appInfo.platform }}/{{ appInfo.arch }}
      </span>
      <span v-else class="statusbar-right">{{ statusError || t('status.unavailable') }}</span>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { DataAnalysis, Delete, Finished, Link, Lock, Monitor, Share, Switch, Unlock } from '@element-plus/icons-vue';
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
import { formatNoteDate, noteTags } from '@/utils/note';
import { createQuickInsertProvider } from '@/editor/quickInsert';
import { quickInsertTypes } from '@/editor/insertHandlers';
import { useLibraryStore } from '@/stores/library';
import { saveAttachmentImage, uploadImageAttachment } from '@/services/ipc';
import type { ImageUploadService } from '@/services/ipc';
import { getSyncStatus } from '@/services/sync';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import SourceEditor from '@/components/SourceEditor.vue';
import { onAiInsert } from '@/editor/aiInsert';
import { formatDocumentByPangu } from '@/utils/pangu';

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
}>();

const emit = defineEmits<{
  (event: 'update:content', value: string): void;
  (event: 'delete'): void;
  (event: 'save'): void;
  (event: 'mind-map'): void;
  (event: 'ppt-preview'): void;
  (event: 'context-menu', payload: { x: number; y: number; selectionEmpty: boolean; locked: boolean }): void;
}>();

const { t } = useI18n();
const locked = ref(false);
const noteLink = ref('');

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

/** 双编辑器切换：不销毁 Muya（v-show），避免来回切换丢撤销栈与滚动位置。 */
function toggleSourceMode(): void {
  // 光标同步（复刻 vue2 isSourceMode watcher）：切换前记下当前视图光标，切换后落到另一视图
  if (!sourceMode.value) {
    const cursor = muyaRef.value?.getCursor?.();
    pendingCursor.value = cursor ? muyaCursorToPosition(cursor) : { lineNumber: 1, column: 1 };
    sourceMode.value = true;
    // Monaco 是 v-if 新挂载，等它 onMounted 完成后落位
    void nextTick(() => {
      monacoRef.value?.setCursor?.(pendingCursor.value);
    });
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

const muyaRef = ref<InstanceType<typeof MuyaEditor> | null>(null);
const monacoRef = ref<InstanceType<typeof SourceEditor> | null>(null);
const pendingCursor = ref<MonacoPosition | null>(null);
const wordCount = computed(() => {
  const markdown = props.content.replace(/\r\n/g, '\n');
  return muyaRef.value?.getEditor()?.getWordCount(markdown) ?? { word: 0, character: 0, paragraph: 0 };
});

/**
 * AI 回复追加到末尾（对齐 vue2 Muya/Monaco 的 INSERT_AI_TEXT 处理器）。
 * Muya 保留当前光标、把整段拼到文末；Monaco 在末行执行一次 insert 并把光标落到新增段尾。
 */
function appendAiText(text: string): boolean {
  const clean = String(text ?? '').trim();
  if (!clean || !props.summary || locked.value) {
    return false;
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

const stopAiInsert = onAiInsert(appendAiText);
onBeforeUnmount(stopAiInsert);

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

defineExpose({ scrollToHeading, toggleSourceMode, toggleLock, runEditorCommand, formatDocument });
</script>
