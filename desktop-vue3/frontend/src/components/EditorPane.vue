<template>
  <main class="editor-pane" @scroll.capture="hideSelectionHint">
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
          <el-button text size="small" :title="t('editor.aiTag')" :disabled="locked" @click="openTagDialog">
            <el-icon><PriceTag /></el-icon>
            <span>{{ t('editor.aiTag') }}</span>
          </el-button>
          <el-button text size="small" :title="t('editor.mindMap')" @click="emit('mind-map')">
            <el-icon><Share /></el-icon>
            <span>{{ t('editor.mindMap') }}</span>
          </el-button>
          <el-button text size="small" :title="t('preview.pptPreview')" @click="emit('ppt-preview')">
            <el-icon><Monitor /></el-icon>
            <span>{{ t('preview.pptPreview') }}</span>
          </el-button>
          <button
            type="button"
            class="editor-meta-title editor-title-button"
            :title="t('notes.tagsEdit')"
            @click="emit('edit-tags')"
          >{{ summary.title }}</button>
        </div>
        <div class="editor-meta-right">
          <button
            type="button"
            class="editor-meta-note editor-tags-button"
            :title="t('notes.tagsEdit')"
            @click="emit('edit-tags')"
          >
            {{ noteTags(summary).join(' · ') || t('notes.untagged') }} · {{ formatNoteDate(summary, t) }}
          </button>
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
          v-model="contentProxy"
          :readonly="locked"
          :theme="theme"
          :plugins="plugins"
          :options="editorOptions"
          class="muya-editor"
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
        @selection-change="onMonacoSelectionChange"
      />
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
import { DataAnalysis, Delete, Finished, Link, Lock, Monitor, PriceTag, Share, Switch, Unlock } from '@element-plus/icons-vue';
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
import { onAiInsert, type AiInsertMode } from '@/editor/aiInsert';
import type { EditorSelectionHint, EditorSelectionSnapshot } from '@/editor/selection';
import AiRewriteDialog from '@/components/AiRewriteDialog.vue';
import AiTagDialog from '@/components/AiTagDialog.vue';
import { normalizeTagName } from '@/utils/autotag';
import { formatDocumentByPangu } from '@/utils/pangu';
import { readEchoInstance, rewriteEchoInstance, type EchoInstancePatch, type EchoInstanceToken } from '@/utils/echoToken';
import { ProofreadError, proofreadMarkdown } from '@/services/aiProofread';
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
}>();

const emit = defineEmits<{
  (event: 'update:content', value: string): void;
  (event: 'delete'): void;
  (event: 'save'): void;
  (event: 'edit-tags'): void;
  (event: 'echo-instance', payload: EchoInstanceToken): void;
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
