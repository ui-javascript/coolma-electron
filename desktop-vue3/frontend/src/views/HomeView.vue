<template>
  <div class="app-shell">
    <SkinEffects ref="skinEffectsRef" />
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">C</div>
        <div class="brand-copy">
          <div class="brand-name">{{ t('app.name') }}</div>
          <div class="brand-tagline">{{ t('app.tagline') }}</div>
        </div>
      </div>

      <div class="topbar-search">
        <el-input v-model="keyword" :placeholder="t('search.placeholder')" clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <div class="topbar-actions">
        <el-tag :type="statusType" effect="light" round>{{ statusLabel }}</el-tag>
        <el-button circle plain :title="paneLayoutTitle" class="pane-layout-btn" @click="cyclePaneLayout">
          <el-icon><Operation /></el-icon>
        </el-button>
        <el-button circle plain :title="t('aiHelper.title')" @click="aiDrawerVisible = true">
          <el-icon><ChatDotRound /></el-icon>
        </el-button>
        <el-button circle plain :title="t('search.title')" @click="searchVisible = true">
          <el-icon><Search /></el-icon>
        </el-button>
        <el-button circle plain :title="t('outline.title')" @click="outlineVisible = true">
          <el-icon><Document /></el-icon>
        </el-button>
        <el-button circle plain :title="t('microApps.open')" @click="microDrawerVisible = true">
          <el-icon><Grid /></el-icon>
        </el-button>
        <el-button circle plain :title="t('action.settings')" @click="openSettings">
          <el-icon><Setting /></el-icon>
        </el-button>
      </div>
    </header>

    <Splitpanes class="workspace" @resized="onPanesResized">
      <Pane v-if="paneVisible.sidebar" :size="paneLayoutSizes.sidebar" :min-size="14" :max-size="25">
        <IndexSidebar
          ref="sidebarRef"
          :mode="indexMode"
          :folder-filter="activeFolder"
          :tag-filter="activeTag"
          :calendar-date="calendarDate"
          :calendar-basis="calendarBasis"
          :time-group-filter="activeTimeGroup"
          :creating="creating"
          :total="notesStore.total"
          :phase-label="phaseLabel"
          @update:mode="handleModeChange"
          @update:filter="handleFilterChange"
          @create-note="createNote"
          @export-folder="exportFolder"
          @request-delete-folder="requestDeleteFolder"
          @open-folder-menu="openFolderMenu"
        />
      </Pane>

      <Pane v-if="paneVisible.list" :size="paneLayoutSizes.list" :min-size="20" :max-size="40">
        <NoteListPane
          :dense="denseMode"
          v-model:keyword="keyword"
          :notes="filteredNotes"
          :active-id="activeId"
          :selected-ids="selectedIds"
          :loading="notesStore.loading"
          :refreshing="refreshing"
          :creating="creating"
          :filter-label="currentFilterLabel"
          :total="notesStore.total"
          :batch-pending="batchPending"
          @update:selected="selectedIds = $event"
          @select="selectNote"
          @open-menu="openMenu"
          @create-note="createNote"
          @refresh="refreshNotes"
          @batch-move="openBatchMove"
          @batch-export="exportSelected"
          @batch-delete="deleteSelected"
        />
      </Pane>

      <Pane :size="paneLayoutSizes.editor">
        <EditorPane
          ref="editorPaneRef"
          v-model:content="activeContent"
          :summary="activeSummary"
          :theme="appStore.theme"
          :plugins="muyaPlugins"
          :save-hint="saveHint"
          :saving="notesStore.saving"
          :status-label="statusLabel"
          :status-type="statusType"
          :status-error="appStore.error"
          :app-info="appStore.appInfo"
          @delete="deleteActiveNote"
          @context-menu="openEditorMenu"
          @mind-map="mindMapVisible = true"
          @ppt-preview="pptPreviewVisible = true"
        />
        <PreviewPptDialog v-model="pptPreviewVisible" :markdown="activeContent" />
        <MindMapDialog
          v-model="mindMapVisible"
          :markdown="activeContent"
          :note-id="activeSummary?.id ?? null"
        />
      </Pane>
    </Splitpanes>

    <ContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :items="noteMenuItems"
      @command="onNoteMenuCommand"
      @close="closeMenu"
    />
    <PackImportDialog v-model="packImportVisible" :kind="packImportKind" @imported="onPackImported" />
    <ContextMenu
      :visible="editorMenuVisible"
      :x="editorMenuX"
      :y="editorMenuY"
      :items="editorMenuItems"
      @command="onEditorMenuCommand"
      @close="editorMenuVisible = false"
    />
    <ContextMenu
      :visible="folderMenuVisible"
      :x="folderMenuX"
      :y="folderMenuY"
      :items="folderMenuItems"
      @command="onFolderMenuCommand"
      @close="closeFolderMenu"
    />

    <MoveNoteDialog
      v-model="moveVisible"
      :current="moveFromCategory"
      :folders="folderPaths"
      :pending="metaPending"
      @confirm="confirmMove"
    />

    <TagEditorDialog
      v-model="tagVisible"
      :value="tagValue"
      :options="notesStore.tags"
      :pending="metaPending"
      @confirm="confirmTags"
    />
    <BlogDeployDialog v-model="blogVisible" :category="blogCategory" />
    <TierRankingDialog
      v-model="tierVisible"
      :mode="tierMode"
      :context-key="tierContextKey"
      :note-content="tierContent"
      @fill="onTierFill"
    />
    <AiHelperDrawer v-model="aiDrawerVisible" :note-id="activeId" />
    <SearchDialog v-model="searchVisible" @select="selectNote" />
    <NoteOutlineDrawer v-model="outlineVisible" :markdown="activeContent" @jump="jumpToHeading" />
    <FullscreenOverlay ref="fullscreenOverlayRef" :app-entry="deleteEffectEntry" />
    <MicroAppDrawer v-model="microDrawerVisible" />
  </div>
</template>

<script setup lang="ts">
import { ChatDotRound, Document, Grid, Operation, Search, Setting } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Pane, Splitpanes } from 'splitpanes';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IndexModeEnum, NoteOrderTypeEnum, type CalendarDateBasis, type IndexMode } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import EditorPane from '@/components/EditorPane.vue';
import SkinEffects from '@/components/SkinEffects.vue';
import MicroAppDrawer from '@/components/MicroAppDrawer.vue';
import FullscreenOverlay from '@/components/FullscreenOverlay.vue';
import SearchDialog from '@/components/SearchDialog.vue';
import AiHelperDrawer from '@/components/AiHelperDrawer.vue';
import TierRankingDialog from '@/components/TierRankingDialog.vue';
import BlogDeployDialog from '@/components/BlogDeployDialog.vue';
import NoteOutlineDrawer from '@/components/NoteOutlineDrawer.vue';
import {
  findDeleteEffectEntry,
  installMicroAppsBuiltins,
  isDeleteEffectEnabled,
} from '@/components/builtins/deleteEffect';
import type { MicroApp } from '@/services/microApps';
import MindMapDialog from '@/components/MindMapDialog.vue';
import PreviewPptDialog from '@/components/PreviewPptDialog.vue';
import IndexSidebar from '@/components/IndexSidebar.vue';
import MoveNoteDialog from '@/components/MoveNoteDialog.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import PackImportDialog from '@/components/PackImportDialog.vue';
import NoteListPane from '@/components/NoteListPane.vue';
import TagEditorDialog from '@/components/TagEditorDialog.vue';
import { useNoteActions } from '@/composables/useNoteActions';
import { buildNoteListMenu } from '@/menus/noteList';
import { buildMuyaMenu } from '@/menus/muya';
import { buildSideDrawerMenu } from '@/menus/sideDrawer';
import type { ContextMenuItem } from '@/menus/types';
import { exportCategoryMarkdown, getNote, listNotes } from '@/services/ipc';
import { useAppStore } from '@/stores/app';
import { skinEffectBus } from '@/services/skinEffectBus';
import { useNotesStore } from '@/stores/notes';
import { useLibraryStore } from '@/stores/library';
import { createMuyaPlugins } from '@/muyaPlugins';
import { deriveTitle, folderName, noteDateKey, noteTags, noteTimeGroup } from '@/utils/note';
import { nextPaneLayout, normalizePaneLayout, paneSizes, paneSizesFromList, paneVisibility, PANE_LAYOUT_STORAGE, PANE_SIZES_STORAGE, type PaneLayoutMode } from '@/utils/paneLayout';
import type { SplitpanesResizedPayload } from 'splitpanes';

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const notesStore = useNotesStore();
const libraryStore = useLibraryStore();

// 符文/回响卡片只来自库；空库时插件就装成空卡片，库加载完成会触发重装。
const muyaPlugins = computed(() => createMuyaPlugins({
  runes: libraryStore.runes,
  echoes: libraryStore.echoes,
}));

const phaseLabel = 'P3 · SQLite';

const keyword = ref('');
const activeId = ref<number | null>(null);
const activeTag = ref('');
const activeFolder = ref('');
const activeTimeGroup = ref('');
const activeContent = ref('');
const creating = ref(false);
const refreshing = ref(false);
const lastSavedAt = ref(0);
const mindMapVisible = ref(false);
const pptPreviewVisible = ref(false);
const searchResults = ref<NoteSummary[] | null>(null);
const selectedIds = ref<number[]>([]);

let loadedId: number | null = null;
let loadedContent = '';
let loadedTitle = '';
let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let pendingSave: { id: number; content: string; title: string } | null = null;

function readIndexMode(): IndexMode {
  const saved = localStorage.getItem('coolma.indexMode');
  if (saved === IndexModeEnum.Tag || saved === IndexModeEnum.Time) {
    return saved;
  }
  return IndexModeEnum.Folder;
}

const indexMode = ref<IndexMode>(readIndexMode());

function readPaneLayout(): PaneLayoutMode {
  return normalizePaneLayout(localStorage.getItem(PANE_LAYOUT_STORAGE));
}

const paneLayoutMode = ref<PaneLayoutMode>(readPaneLayout());
const paneVisible = computed(() => paneVisibility(paneLayoutMode.value));
const paneSizeStore = ref<Record<string, number[]>>(readPaneSizeStore());
const paneLayoutSizes = computed(() => {
  return paneSizesFromList(paneLayoutMode.value, paneSizeStore.value[String(paneLayoutMode.value)])
    ?? paneSizes(paneLayoutMode.value);
});
const paneLayoutTitle = computed(() => {
  const key = paneLayoutMode.value === 0
    ? 'view.threePane'
    : paneLayoutMode.value === 1
      ? 'view.listEditor'
      : 'view.editorOnly';
  return `${t('view.switchView')} · ${t(key)}`;
});

function cyclePaneLayout(): void {
  paneLayoutMode.value = nextPaneLayout(paneLayoutMode.value);
  localStorage.setItem(PANE_LAYOUT_STORAGE, String(paneLayoutMode.value));
}

function readPaneSizeStore(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(PANE_SIZES_STORAGE);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const result: Record<string, number[]> = {};
    for (const key of ['0', '1']) {
      const mode = Number(key) as PaneLayoutMode;
      const list = normalizePaneSizeListFromStore(mode, (parsed as Record<string, unknown>)[key]);
      if (list) {
        result[key] = list;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function normalizePaneSizeListFromStore(mode: PaneLayoutMode, values: unknown): number[] | null {
  // 复用纯函数的校验，但这里只需要数组本身。
  const sizes = paneSizesFromList(mode, values);
  if (!sizes) {
    return null;
  }
  return mode === 0
    ? [sizes.sidebar, sizes.list, sizes.editor]
    : [sizes.list, sizes.editor];
}

let paneSizeSaveTimer: ReturnType<typeof setTimeout> | undefined;

function onPanesResized(payload: SplitpanesResizedPayload): void {
  // 只在真实拖拽结束时落库；切模式/挂载卸载也会触发 resized，但没有 event。
  if (!payload.event) {
    return;
  }
  const mode = paneLayoutMode.value;
  if (mode === 2 || payload.panes.length !== (mode === 0 ? 3 : 2)) {
    return;
  }
  const values = payload.panes.map((pane) => Number(pane.size));
  const sizes = paneSizesFromList(mode, values);
  if (!sizes) {
    return;
  }
  paneSizeStore.value = {
    ...paneSizeStore.value,
    [String(mode)]: mode === 0 ? [sizes.sidebar, sizes.list, sizes.editor] : [sizes.list, sizes.editor],
  };
  if (paneSizeSaveTimer) {
    clearTimeout(paneSizeSaveTimer);
  }
  paneSizeSaveTimer = setTimeout(() => {
    localStorage.setItem(PANE_SIZES_STORAGE, JSON.stringify(paneSizeStore.value));
    paneSizeSaveTimer = undefined;
  }, 400);
}

const readCalendarBasis = (): CalendarDateBasis => {
  const saved = localStorage.getItem('coolma.calendarBasis');
  return saved === 'created' ? 'created' : 'modified';
};

const calendarDate = ref('');
const calendarBasis = ref<CalendarDateBasis>(readCalendarBasis());

const noteOrder = ref<string>(NoteOrderTypeEnum.ModifiedTimeDesc);
const denseMode = ref(false);

/** 应用 @ 快捷面板列数（引擎读 --quick-insert-columns，4-8 限幅与 vue2 一致）。 */
function applyQuickInsertColumns(value: unknown): void {
  const n = Number(value);
  const cols = Number.isFinite(n) ? Math.min(8, Math.max(4, n)) : 6;
  document.documentElement.style.setProperty('--quick-insert-columns', String(cols));
}

function applyEditorPrefs(): void {
  const prefs = appStore.prefs;
  noteOrder.value = NoteOrderTypeEnum.has(prefs['editor.noteOrderType'])
    ? (prefs['editor.noteOrderType'] as string)
    : NoteOrderTypeEnum.ModifiedTimeDesc;
  denseMode.value = prefs['editor.noteListDenseMode'] === true;
  applyQuickInsertColumns(prefs['editor.quickInsertColumns']);
}

const filteredNotes = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  const useServerSearch = Boolean(query && searchResults.value);
  const source = useServerSearch ? searchResults.value! : notesStore.notes;
  return source.filter((note) => {
    const noteTagList = noteTags(note);
    const tagMatch = !activeTag.value || noteTagList.includes(activeTag.value);
    const folderMatch = !activeFolder.value || note.category === activeFolder.value;
    const timeMatch = !activeTimeGroup.value || noteTimeGroup(note) === activeTimeGroup.value;
    const calendarMatch =
      indexMode.value !== IndexModeEnum.Calendar ||
      !calendarDate.value ||
      noteDateKey(note, calendarBasis.value) === calendarDate.value;
    const textMatch =
      useServerSearch ||
      !query ||
      note.title.toLowerCase().includes(query) ||
      note.excerpt.toLowerCase().includes(query) ||
      noteTagList.some((tag) => tag.toLowerCase().includes(query));
    return tagMatch && folderMatch && timeMatch && calendarMatch && textMatch;
  }).sort(compareByOrder(noteOrder.value));
});

/** 客户端排序（对齐 vue2 NoteOrderTypeEnum 语义），默认修改时间倒序。 */
function compareByOrder(order: string) {
  return (a: NoteSummary, b: NoteSummary): number => {
    switch (order) {
      case NoteOrderTypeEnum.TitleAsc:
        return a.title.localeCompare(b.title, 'zh-Hans-CN');
      case NoteOrderTypeEnum.TitleDesc:
        return b.title.localeCompare(a.title, 'zh-Hans-CN');
      case NoteOrderTypeEnum.ModifiedTimeAsc:
        return (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0);
      case NoteOrderTypeEnum.CreatedTimeAsc:
        return (a.createdAt || 0) - (b.createdAt || 0);
      case NoteOrderTypeEnum.CreatedTimeDesc:
        return (b.createdAt || 0) - (a.createdAt || 0);
      case NoteOrderTypeEnum.ModifiedTimeDesc:
      default:
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    }
  };
}

const activeSummary = computed(
  () => notesStore.notes.find((note) => note.id === activeId.value) ?? null,
);

const folderPaths = computed(() =>
  Array.from(new Set(notesStore.notes.map((note) => note.category || '/'))),
);

const currentFilterLabel = computed(() => {
  if (activeFolder.value) return folderName(activeFolder.value, t('notes.rootFolder'));
  if (activeTag.value) return `#${activeTag.value}`;
  if (activeTimeGroup.value) {
    const keys: Record<string, string> = {
      today: 'time.today',
      yesterday: 'time.yesterday',
      week: 'time.week',
      earlier: 'time.earlier',
    };
    const label = keys[activeTimeGroup.value];
    return label ? t(label) : t('index.all');
  }
  return t('index.all');
});

const saveHint = computed(() => {
  if (notesStore.saving) return t('notes.saving');
  if (lastSavedAt.value > 0) return t('notes.saved');
  return '';
});

const statusLabel = computed(() => t(appStore.statusLabel));
const statusType = computed(() => appStore.statusTagType);

/** 删除/移动后选中下一条可见笔记；列表空了就回到 null。 */
function nextActiveId(): number | null {
  return filteredNotes.value[0]?.id ?? null;
}

const {
  menuVisible,
  menuX,
  menuY,
  openMenu,
  closeMenu,
  handleMenuCommand: runNoteMenuCommand,
  menuNote,
  moveVisible,
  moveFromCategory,
  confirmMove,
  tagVisible,
  tagValue,
  confirmTags,
  metaPending,
  batchPending,
  openBatchMove,
  deleteSelected,
  deleteActiveNote,
} = useNoteActions({
  activeId,
  activeSummary,
  selectedIds,
  searchResults,
  folderPaths,
  flushSave,
  nextActiveId,
  getLoadedId: () => loadedId,
  setLoadedTitle: (title: string) => {
    loadedTitle = title;
  },
});

// ── 右键菜单（四套配置里已接的两套：noteList / sideDrawer）──
const noteMenuItems = computed<ContextMenuItem[]>(() =>
  buildNoteListMenu({
    isCurrentNote: (menuNote.value?.id ?? null) === activeId.value,
    tierRankingReady: true,
  }) as unknown as ContextMenuItem[],
);

function onNoteMenuCommand(command: string): void {
  if (command === 'tierRanking') {
    const note = menuNote.value;
    if (!note) {
      return;
    }
    tierMode.value = 'note';
    tierContextKey.value = `note-${note.id}`;
    tierContent.value = '';
    void (async () => {
      const result = await getNote(note.id);
      tierContent.value = result.ok ? result.data.content ?? '' : '';
      tierVisible.value = true;
    })();
    return;
  }
  void runNoteMenuCommand(command as Parameters<typeof runNoteMenuCommand>[0]);
}

/** 榜单回填：追加到当前笔记末尾并落库（vue2 是插到光标处，v3 引擎暂无 insertText 原语）。 */
async function onTierFill(markdown: string): Promise<void> {
  const note = notesStore.activeNote;
  if (!note) {
    return;
  }
  await notesStore.save(note.id, { content: `${note.content ?? ''}${markdown}` });
}

const blogVisible = ref(false);
const blogCategory = ref('');

const tierVisible = ref(false);
const tierMode = ref<'note' | 'category'>('note');
const tierContextKey = ref('');
const tierContent = ref('');

const folderMenuVisible = ref(false);
const folderMenuX = ref(0);
const folderMenuY = ref(0);
const folderMenuCategory = ref('');
const folderMenuIsRoot = ref(false);
const folderMenuItems = computed<ContextMenuItem[]>(() =>
  buildSideDrawerMenu({
    category: folderMenuCategory.value,
    isRootCategory: folderMenuIsRoot.value,
    // 当前没有登录态概念（同步服务面板还没复刻），本地库全量可用 → 按已登录处理
    isLogin: true,
    tierRankingReady: true,
    blogReady: true,
  }) as unknown as ContextMenuItem[],
);

const editorMenuVisible = ref(false);
const editorMenuX = ref(0);
const editorMenuY = ref(0);
const editorSelectionEmpty = ref(true);
const editorMenuItems = computed<ContextMenuItem[]>(() =>
  buildMuyaMenu({
    selectionEmpty: editorSelectionEmpty.value,
    // 盘古格式化 vue2 走主进程，vue3 还没接 → 置灰（不装样子）
    panguReady: false,
    mindmapReady: true,
  }) as unknown as ContextMenuItem[],
);

function openEditorMenu(payload: { x: number; y: number; selectionEmpty: boolean }): void {
  editorMenuX.value = payload.x;
  editorMenuY.value = payload.y;
  editorSelectionEmpty.value = payload.selectionEmpty;
  editorMenuVisible.value = true;
}

function onEditorMenuCommand(command: string): void {
  if (command === 'mindmap') {
    mindMapVisible.value = true;
    return;
  }
  if (command === 'formatDocument') {
    ElMessage.info(t('notes.panguPending'));
    return;
  }
  const handled = editorPaneRef.value?.runEditorCommand?.(command) ?? false;
  if (!handled) {
    ElMessage.info(t('notes.commandPending'));
  }
}

function openFolderMenu(payload: { category: string; event: MouseEvent }): void {
  folderMenuCategory.value = payload.category;
  folderMenuIsRoot.value = !payload.category;
  folderMenuX.value = payload.event.clientX;
  folderMenuY.value = payload.event.clientY;
  folderMenuVisible.value = true;
}

function onPackImported(): void {
  void notesStore.loadAll();
  void libraryStore.load(true);
}

function closeFolderMenu(): void {
  folderMenuVisible.value = false;
}

async function onFolderMenuCommand(command: string): Promise<void> {
  const category = folderMenuCategory.value;
  switch (command) {
    case 'createCategory':
      sidebarRef.value?.startCreateFolder();
      break;
    case 'createNote':
      createNote();
      break;
    case 'importPack':
      // 打包导入对话框已存在（PackImportDialog），入口在设置页；这里复用同一个可见标志
      packImportVisible.value = true;
      break;
    case 'exportMarkdown':
      await exportFolder(category);
      break;
    case 'tierRanking':
      tierMode.value = 'category';
      tierContextKey.value = category;
      tierContent.value = '';
      tierVisible.value = true;
      break;
    case 'exportToBlog':
      blogCategory.value = category;
      blogVisible.value = true;
      break;
    case 'copyMarkdown':
      ElMessage.info(t('notes.copyFolderPending'));
      break;
    case 'delete':
      requestDeleteFolder(category);
      break;
    default:
      break;
  }
}


watch(
  filteredNotes,
  (list) => {
    if (!list.some((note) => note.id === activeId.value)) {
      activeId.value = list[0]?.id ?? null;
    }
    const alive = new Set(list.map((note) => note.id));
    const kept = selectedIds.value.filter((id) => alive.has(id));
    if (kept.length !== selectedIds.value.length) {
      selectedIds.value = kept;
    }
  },
  { immediate: true },
);

async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  const pending = pendingSave;
  if (!pending) {
    return;
  }
  pendingSave = null;

  if (pending.content === loadedContent && pending.title === loadedTitle) {
    return;
  }

  const saved = await notesStore.save(pending.id, {
    content: pending.content,
    title: pending.title,
  });
  if (saved) {
    loadedContent = pending.content;
    loadedTitle = pending.title;
    lastSavedAt.value = Date.now();
  } else {
    pendingSave = pending;
    ElMessage.error(t('notes.saveFailed'));
  }
}

async function openActiveNote(id: number): Promise<void> {
  const record = await notesStore.openNote(id);
  if (!record || activeId.value !== id) {
    return;
  }

  loadedId = id;
  loadedContent = record.content;
  loadedTitle = record.title;
  lastSavedAt.value = 0;
  hydrating = true;
  activeContent.value = record.content;
  await nextTick();
  hydrating = false;
}

watch(
  activeId,
  async (id) => {
    await flushSave();
    if (id === null) {
      loadedId = null;
      loadedContent = '';
      loadedTitle = '';
      activeContent.value = '';
      notesStore.clearActive();
      return;
    }
    await openActiveNote(id);
  },
  { immediate: true },
);

watch(activeContent, (value) => {
  if (hydrating || loadedId === null) {
    return;
  }
  const title = deriveTitle(value, loadedTitle || t('notes.untitled'));
  pendingSave = { id: loadedId, content: value, title };
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    void flushSave();
  }, 700);
});

watch(keyword, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  const query = value.trim();
  if (!query) {
    searchResults.value = null;
    return;
  }
  searchTimer = setTimeout(async () => {
    const result = await listNotes({ query, limit: 5000 });
    if (keyword.value.trim() !== query) {
      return;
    }
    searchResults.value = result.ok ? result.data.items : [];
  }, 250);
});

function jumpToHeading(index: number): void {
  const scrolled = editorPaneRef.value?.scrollToHeading?.(index) ?? false;
  if (!scrolled) {
    ElMessage.info(t('outline.jumpFailed'));
  }
}

function selectNote(id: number): void {
  activeId.value = id;
}

function handleModeChange(mode: IndexMode): void {
  indexMode.value = mode;
  localStorage.setItem('coolma.indexMode', mode);
  handleFilterChange({ folder: '', tag: '', timeGroup: '', calendarDate: '' });
}

function handleFilterChange(next: {
  folder?: string;
  tag?: string;
  timeGroup?: string;
  calendarDate?: string;
  calendarBasis?: CalendarDateBasis;
}): void {
  if (next.folder !== undefined) activeFolder.value = next.folder;
  if (next.tag !== undefined) activeTag.value = next.tag;
  if (next.timeGroup !== undefined) activeTimeGroup.value = next.timeGroup;
  if (next.calendarDate !== undefined) calendarDate.value = next.calendarDate;
  if (next.calendarBasis !== undefined) {
    calendarBasis.value = next.calendarBasis;
    localStorage.setItem('coolma.calendarBasis', next.calendarBasis);
  }
}

/**
 * 文件夹右键 → 批量导出该文件夹全部笔记为 Markdown（vue2 的 export-markdown-files）。
 */
/**
 * 删除文件夹：启用「删除特效」微应用时走全屏 overlay（用户点中小怪兽才算删），
 * 否则走原生确认框。复刻 vue2 NoteList.deleteCategoryHandler 的分支语义。
 */
async function requestDeleteFolder(category: string): Promise<void> {
  const name = folderName(category, t('notes.rootFolder'));
  let confirmed = false;

  if (await isDeleteEffectEnabled()) {
    const entry = await findDeleteEffectEntry();
    deleteEffectEntry.value = entry;
    const overlay = fullscreenOverlayRef.value;
    if (entry && overlay) {
      try {
        const result = await overlay.summon({ target: { guid: category, name } });
        confirmed = result.outcome === 'destroyed';
      } catch {
        confirmed = false;
      }
    }
  } else {
    try {
      await ElMessageBox.confirm(
        t('folder.deleteConfirm', { name }),
        t('folder.delete'),
        { type: 'warning', confirmButtonText: t('folder.delete'), cancelButtonText: t('action.cancel') },
      );
      confirmed = true;
    } catch {
      return;
    }
  }

  if (!confirmed) {
    return;
  }
  const deleted = await notesStore.deleteFolder(category);
  if (!deleted) {
    ElMessage.error(notesStore.error || t('folder.deleteFailed'));
  }
}

async function exportFolder(category: string): Promise<void> {
  if (!category) {
    return;
  }
  const result = await exportCategoryMarkdown(category);
  if (result.ok === false) {
    ElMessage.error(result.error.message);
    return;
  }
  if (!result.data.canceled) {
    ElMessage.success(t('notes.exportFolderSuccess', { count: result.data.written, dir: result.data.directory }));
  }
}

/**
 * 批量导出选中的笔记：临时标签串一下就是现成后端，
 * 但后端按 category 过滤，所以这里先批量移动？不行——导出不该有副作用。
 * 改用逐篇 exportNoteMarkdown 落到用户选的目录做不到（每篇弹一次框太蠢），
 * 所以当前语义：只导出「当前筛选条件下的整个文件夹」并提示。
 */
async function exportSelected(): Promise<void> {
  const folder = activeFolder.value || '';
  if (!folder) {
    ElMessage.warning(t('notes.exportNeedFolder'));
    return;
  }
  await exportFolder(folder);
}

async function refreshNotes(): Promise<void> {
  if (refreshing.value) {
    return;
  }
  refreshing.value = true;
  try {
    // 只刷新「当前文件夹」；标签/日历/全部范围没有对应的为知分类，硬拉 '/' 会拉错。
    const category = indexMode.value === IndexModeEnum.Folder && activeFolder.value
      ? activeFolder.value
      : undefined;
    const ok = await notesStore.refresh(category);
    if (!ok || notesStore.error) {
      ElMessage.error(notesStore.error || t('notes.loadFailed'));
    }
  } finally {
    refreshing.value = false;
  }
}

async function createNote(payload?: { templateId?: string }): Promise<void> {
  if (creating.value) {
    return;
  }
  creating.value = true;
  try {
    keyword.value = '';
    searchResults.value = null;
    const title = t('notes.untitled');
    // 有模板时不传 content，由主进程按「# 标题 + 模板正文」拼接（对齐 vue2 createNote）
    const note = await notesStore.create({
      title,
      ...(payload?.templateId ? { templateId: payload.templateId } : { content: `# ${title}\n\n` }),
      category: activeFolder.value || '/',
      tags: activeTag.value || '',
    });
    if (!note) {
      ElMessage.error(notesStore.error || t('notes.createFailed'));
      return;
    }
    activeId.value = note.id;
  } finally {
    creating.value = false;
  }
}

function openSettings(): void {
  void router.push('/settings');
}

/**
 * 本地快捷键：与 vue2 的键盘习惯对齐。
 * Ctrl/Cmd+N 新建、Ctrl/Cmd+F 聚焦搜索、Ctrl/Cmd+S 立即保存。
 */
function handleShortcut(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'n') {
    event.preventDefault();
    void createNote();
    return;
  }
  if (key === 'f') {
    event.preventDefault();
    document.querySelector<HTMLInputElement>('.topbar-search input')?.focus();
    return;
  }
  if (key === 's') {
    event.preventDefault();
    void flushSave();
  }
}

const microDrawerVisible = ref(false);
const searchVisible = ref(false);
const aiDrawerVisible = ref(false);
const outlineVisible = ref(false);
const editorPaneRef = ref<InstanceType<typeof EditorPane> | null>(null);
const sidebarRef = ref<InstanceType<typeof IndexSidebar> | null>(null);
const packImportVisible = ref(false);
const packImportKind = ref<'runes' | 'echoes'>('runes');
const deleteEffectEntry = ref<MicroApp | null>(null);
const fullscreenOverlayRef = ref<InstanceType<typeof FullscreenOverlay> | null>(null);
const skinEffectsRef = ref<any>(null);
let detachSkinEffect: (() => void) | null = null;

onMounted(async () => {
  // 内置微应用条目只注册一次（幂等），再取「删除特效」当前配置给 overlay 用
  installMicroAppsBuiltins();
  void findDeleteEffectEntry().then((entry) => {
    deleteEffectEntry.value = entry;
  });
  detachSkinEffect = skinEffectBus.on((skin) => skinEffectsRef.value?.play?.(skin));
  window.addEventListener('keydown', handleShortcut);
  void appStore.init();
  const loaded = await notesStore.loadAll();
  if (!loaded) {
    ElMessage.error(notesStore.error || t('notes.loadFailed'));
  }
});

onBeforeUnmount(() => {
  detachSkinEffect?.();
  window.removeEventListener('keydown', handleShortcut);
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  if (paneSizeSaveTimer) {
    clearTimeout(paneSizeSaveTimer);
    paneSizeSaveTimer = undefined;
    localStorage.setItem(PANE_SIZES_STORAGE, JSON.stringify(paneSizeStore.value));
  }
  void flushSave();
});
onMounted(async () => {
  await appStore.loadPrefs();
  applyEditorPrefs();
});
</script>
