<template>
  <div class="app-shell">
    <SkinEffects ref="skinEffectsRef" />
    <HeaderBar
      :mode="indexMode"
      :logged-in="syncLoggedIn"
      :pending-total="syncStore.pendingTotal"
      :busy-kind="syncStore.busyKind"
      :title="headerTitle"
      :dirty="headerDirty"
      :pane-layout-mode="paneLayoutMode"
      :pane-layout-title="paneLayoutTitle"
      :skin="appStore.skin"
      :ai-provider="aiProvider"
      :sync-push-tooltip="syncPushTooltip"
      :sync-pull-tooltip="syncPullTooltip"
      @mode="handleModeChange"
      @search="searchVisible = true"
      @tags="openActiveTags"
      @push="handlePushSync"
      @pull="handlePullSync"
      @account="onAccountCommand"
      @layout="cyclePaneLayout"
      @ai="openAiAssistant"
      @chat="microDrawerVisible = true"
      @settings="openSettings"
    />

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
          :total="notesStore.total"
          @update:mode="handleModeChange"
          @update:filter="handleFilterChange"
          @create-note="openCreateNote"
          @export-folder="exportFolder"
          @request-delete-folder="requestDeleteFolder"
          @open-folder-menu="openFolderMenu"
        />
      </Pane>

      <Pane v-if="paneVisible.list" :size="paneLayoutSizes.list" :min-size="20" :max-size="40">
        <NoteListPane
          :dense="denseMode"
          :notes="filteredNotes"
          :active-id="activeId"
          :selected-ids="selectedIds"
          :loading="notesStore.loading"
          :refreshing="refreshing"
          :filter-label="currentFilterLabel"
          :total="notesStore.total"
          :batch-pending="batchPending"
          @update:selected="selectedIds = $event"
          @select="selectNote"
          @open-menu="openMenu"
          @create-note="openCreateNote"
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
          @save="flushSave"
          @edit-tags="openActiveTags"
          @echo-instance="openEchoInstance"
          @context-menu="openEditorMenu"
          @mind-map="mindMapVisible = true"
          @ppt-preview="pptPreviewVisible = true"
          @create-note="openCreateNote"
          @outline="outlineVisible = true"
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
    <NoteImportDialog v-model="noteImportVisible" :category="noteImportCategory" />
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
    <EchoInstanceDialog
      v-model="echoInstanceVisible"
      :token="echoInstanceToken"
      :echo="echoInstanceCard"
      @save="saveEchoInstance"
      @open-definition="openEchoDefinition"
    />
    <LibraryFormDialog
      v-model="echoDefinitionVisible"
      kind="echo"
      :editing="echoDefinitionCard"
      @saved="onEchoDefinitionSaved"
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
    <AiDoubaoDrawer v-model="doubaoDrawerVisible" />
    <SearchDialog v-model="searchVisible" @select="selectNote" />
    <NoteOutlineDrawer v-model="outlineVisible" :markdown="activeContent" @jump="jumpToHeading" />
    <FullscreenOverlay ref="fullscreenOverlayRef" :app-entry="deleteEffectEntry" />
    <MicroAppDrawer v-model="microDrawerVisible" />
    <NewNoteDialog
      v-model="newNoteVisible"
      :category="activeFolder || '/'"
      :initial-template-id="newNoteTemplateId"
      @submit="submitCreateNote"
    />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { Pane, Splitpanes } from 'splitpanes';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IndexModeEnum, NoteOrderTypeEnum, type CalendarDateBasis, type IndexMode } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import type { EchoCard } from '@shared/types/domain';
import type { EchoInstancePatch, EchoInstanceToken } from '@/utils/echoToken';
import EditorPane from '@/components/EditorPane.vue';
import SkinEffects from '@/components/SkinEffects.vue';
import HeaderBar from '@/components/HeaderBar.vue';
import NewNoteDialog from '@/components/NewNoteDialog.vue';
import MicroAppDrawer from '@/components/MicroAppDrawer.vue';
import FullscreenOverlay from '@/components/FullscreenOverlay.vue';
import SearchDialog from '@/components/SearchDialog.vue';
import AiHelperDrawer from '@/components/AiHelperDrawer.vue';
import AiDoubaoDrawer from '@/components/AiDoubaoDrawer.vue';
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
import NoteImportDialog from '@/components/NoteImportDialog.vue';
import NoteListPane from '@/components/NoteListPane.vue';
import TagEditorDialog from '@/components/TagEditorDialog.vue';
import EchoInstanceDialog from '@/components/EchoInstanceDialog.vue';
import LibraryFormDialog from '@/components/LibraryFormDialog.vue';
import { useNoteActions } from '@/composables/useNoteActions';
import { buildNoteListMenu } from '@/menus/noteList';
import { buildMuyaMenu } from '@/menus/muya';
import { buildSideDrawerMenu } from '@/menus/sideDrawer';
import type { ContextMenuItem } from '@/menus/types';
import { exportCategoryMarkdown, getNote, listNotes, openDevTools } from '@/services/ipc';
import {
  matchShortcut,
  type AppShortcutCommand,
  type ShortcutAction,
} from '@/utils/shortcuts';
import { syncLogout } from '@/services/sync';
import { notifyLogout, openLoginDialog } from '@/services/loginDialog';
import { useAppStore } from '@/stores/app';
import { skinEffectBus } from '@/services/skinEffectBus';
import { useNotesStore } from '@/stores/notes';
import { useLibraryStore } from '@/stores/library';
import { useSyncStore } from '@/stores/sync';
import { createMuyaPlugins } from '@/muyaPlugins';
import { deriveTitle, folderName, noteDateKey, noteTags, noteTimeGroup } from '@/utils/note';
import { buildFolderMarkdown, type FolderMarkdownNote } from '@/utils/folderMarkdown';
import { nextPaneLayout, normalizePaneLayout, paneSizes, paneSizesFromList, paneVisibility, PANE_LAYOUT_STORAGE, PANE_SIZES_STORAGE, type PaneLayoutMode } from '@/utils/paneLayout';
import type { SplitpanesResizedPayload } from 'splitpanes';

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const notesStore = useNotesStore();
const libraryStore = useLibraryStore();
const syncStore = useSyncStore();

// 符文/回响卡片只来自库；空库时插件就装成空卡片，库加载完成会触发重装。
const muyaPlugins = computed(() => createMuyaPlugins({
  runes: libraryStore.runes,
  echoes: libraryStore.echoes,
}));

const activeId = ref<number | null>(null);
const activeTag = ref('');
const activeFolder = ref('');
const activeTimeGroup = ref('');
const activeContent = ref('');
const creating = ref(false);
const newNoteVisible = ref(false);
const newNoteTemplateId = ref('');
const refreshing = ref(false);
const lastSavedAt = ref(0);
const mindMapVisible = ref(false);
const pptPreviewVisible = ref(false);
const selectedIds = ref<number[]>([]);

let loadedId: number | null = null;
let loadedContent = '';
let loadedTitle = '';
let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
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
  return notesStore.notes.filter((note) => {
    const noteTagList = noteTags(note);
    const tagMatch = !activeTag.value || noteTagList.includes(activeTag.value);
    const folderMatch = !activeFolder.value || note.category === activeFolder.value;
    const timeMatch = !activeTimeGroup.value || noteTimeGroup(note) === activeTimeGroup.value;
    const calendarMatch =
      indexMode.value !== IndexModeEnum.Calendar ||
      !calendarDate.value ||
      noteDateKey(note, calendarBasis.value) === calendarDate.value;
    return tagMatch && folderMatch && timeMatch && calendarMatch;
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

const headerTitle = computed(() => activeSummary.value?.title || t('notes.untitled'));
const headerDirty = computed(() => notesStore.saving || activeSummary.value?.dirty === 1);
const aiProvider = ref(localStorage.getItem('coolma.aiProvider') === 'doubao' ? 'doubao' : 'builtin');

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
  openTagDialog,
  metaPending,
  batchPending,
  openBatchMove,
  deleteSelected,
  deleteActiveNote,
} = useNoteActions({
  activeId,
  activeSummary,
  selectedIds,
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
const syncLoggedIn = computed(() => syncStore.loggedIn);
const syncPushTooltip = computed(() => {
  if (syncStore.busyKind === 'push') {
    return t('syncPanel.syncing');
  }
  return syncStore.pendingTotal > 0
    ? `${t('syncPanel.push')} (${syncStore.pendingTotal})`
    : t('syncPanel.push');
});
const syncPullTooltip = computed(() => (
  syncStore.busyKind === 'pull' ? t('syncPanel.syncing') : t('syncPanel.pull')
));
const folderMenuItems = computed<ContextMenuItem[]>(() =>
  buildSideDrawerMenu({
    category: folderMenuCategory.value,
    isRootCategory: folderMenuIsRoot.value,
    isLogin: syncLoggedIn.value,
    tierRankingReady: true,
    blogReady: true,
  }) as unknown as ContextMenuItem[],
);

const editorMenuVisible = ref(false);
const editorMenuX = ref(0);
const editorMenuY = ref(0);
const editorSelectionEmpty = ref(true);
const editorMenuLocked = ref(false);
const editorMenuItems = computed<ContextMenuItem[]>(() =>
  buildMuyaMenu({
    selectionEmpty: editorSelectionEmpty.value,
    locked: editorMenuLocked.value,
    panguReady: true,
    mindmapReady: true,
  }) as unknown as ContextMenuItem[],
);

function openEditorMenu(payload: { x: number; y: number; selectionEmpty: boolean; locked: boolean }): void {
  editorMenuX.value = payload.x;
  editorMenuY.value = payload.y;
  editorSelectionEmpty.value = payload.selectionEmpty;
  editorMenuLocked.value = payload.locked;
  editorMenuVisible.value = true;
}

function onEditorMenuCommand(command: string): void {
  if (command === 'mindmap') {
    mindMapVisible.value = true;
    return;
  }
  if (command === 'formatDocument') {
    void editorPaneRef.value?.formatDocument?.().then((handled) => {
      if (!handled) {
        ElMessage.warning(t('notes.panguFailed'));
      }
    });
    return;
  }
  const handled = editorPaneRef.value?.runEditorCommand?.(command) ?? false;
  if (!handled) {
    ElMessage.info(t('notes.commandPending'));
  }
}

async function refreshSyncLoginState(): Promise<void> {
  const loggedIn = await syncStore.refreshStatus();
  if (loggedIn) {
    await syncStore.refreshPending();
  }
}

/** 顶栏 push：先落盘当前笔记，再走与自动上传同一把锁。 */
async function handlePushSync(): Promise<void> {
  if (!syncLoggedIn.value) {
    openLoginDialog();
    return;
  }
  await flushSave();
  const result = await syncStore.push();
  if (!result) {
    ElMessage.error(syncStore.lastError || t('syncPanel.failed'));
    return;
  }
  const message = t('syncPanel.pushDone', {
    pushed: result.pushed,
    created: result.created,
    failed: result.failed,
  });
  if (result.failed > 0 || result.errors.length) {
    ElMessage.warning(message);
  } else {
    ElMessage.success(message);
  }
}

async function handlePullSync(): Promise<void> {
  if (!syncLoggedIn.value) {
    openLoginDialog();
    return;
  }
  await flushSave();
  const result = await syncStore.pull();
  if (!result) {
    ElMessage.error(syncStore.lastError || t('syncPanel.failed'));
    return;
  }
  const message = t('syncPanel.pullDone', {
    imported: result.imported,
    skipped: result.skipped,
    backfilled: result.backfilled,
    failed: result.failed,
  });
  if (result.failed > 0) {
    ElMessage.warning(message);
  } else {
    ElMessage.success(message);
  }
}

function onAccountCommand(command: string): void {
  if (command === 'login') {
    openLoginDialog();
    return;
  }
  if (command === 'logout') {
    void confirmLogout();
  }
}

async function confirmLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('login.logoutHint'), t('login.logout'), {
      type: 'warning',
      confirmButtonText: t('login.logout'),
      cancelButtonText: t('action.cancel'),
    });
  } catch {
    return;
  }
  const result = await syncLogout();
  if (!result.ok) {
    ElMessage.error(result.error.message);
    return;
  }
  syncStore.setLoggedIn(false);
  await notesStore.loadAll();
  // 对齐 vue2 Header watch isLogin：登出后立即弹登录框，用户可跳过继续离线用。
  notifyLogout();
  ElMessage.success(t('login.logoutDone'));
}

async function openFolderMenu(payload: { category: string; event: MouseEvent }): Promise<void> {
  // vue2 侧栏菜单按 isLogin 决定是否显示导入/导出/榜单/博客/复制 Markdown；
  // 登录弹窗/设置页登录或登出后这里不缓存旧状态，每次打开菜单重新读。
  await refreshSyncLoginState();
  folderMenuCategory.value = payload.category;
  folderMenuIsRoot.value = !payload.category;
  folderMenuX.value = payload.event.clientX;
  folderMenuY.value = payload.event.clientY;
  folderMenuVisible.value = true;
}

function openActiveTags(): void {
  if (activeSummary.value) {
    openTagDialog(activeSummary.value);
  }
}

/** 顶栏 AI 入口按设置里的 provider 分流：doubao → 豆包 WebApp，builtin → 内置助手。 */
function openAiAssistant(): void {
  if (localStorage.getItem('coolma.aiProvider') === 'doubao') {
    if (appStore.appInfo?.doubaoUrl) {
      doubaoDrawerVisible.value = true;
      return;
    }
    ElMessage.warning(t('aiDoubao.missingBuild'));
    return;
  }
  aiDrawerVisible.value = true;
}

function findEchoCard(token: EchoInstanceToken): EchoCard | null {
  const byDefinition = token.definitionId
    ? libraryStore.echoes.find((card) => card.id === token.definitionId)
    : undefined;
  if (byDefinition) {
    return byDefinition;
  }
  return libraryStore.echoes.find((card) => card.name === token.echoName) ?? null;
}

function openEchoInstance(token: EchoInstanceToken): void {
  echoInstanceToken.value = token;
  echoInstanceCard.value = findEchoCard(token);
  echoInstanceVisible.value = true;
}

function saveEchoInstance(patch: EchoInstancePatch): void {
  const applied = editorPaneRef.value?.applyEchoInstance(patch) ?? false;
  if (!applied) {
    ElMessage.error(t('echoInstance.saveFailed'));
  }
}

function openEchoDefinition(token: EchoInstanceToken): void {
  const card = findEchoCard(token);
  if (!card) {
    ElMessage.warning(t('echoInstance.definitionMissing'));
    return;
  }
  echoDefinitionCard.value = card;
  echoDefinitionVisible.value = true;
}

function onEchoDefinitionSaved(): void {
  void libraryStore.load(true);
}

function closeFolderMenu(): void {
  folderMenuVisible.value = false;
}

async function onFolderMenuCommand(command: string): Promise<void> {
  const category = folderMenuCategory.value;
  switch (command) {
    case 'createCategory':
      sidebarRef.value?.startCreateFolder(category || '');
      break;
    case 'createNote':
      openCreateNote();
      break;
    case 'importNotes':
      noteImportCategory.value = category || '';
      noteImportVisible.value = true;
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
      await copyFolderMarkdown(category);
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
  // vue2 切到标签/日历模式会收起左侧文件树，让列表占满整栏。
  if (mode !== IndexModeEnum.Folder && paneLayoutMode.value !== 0) {
    paneLayoutMode.value = 0;
    localStorage.setItem(PANE_LAYOUT_STORAGE, '0');
  }
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
    return;
  }
  // vue2：只有当前选中目录属于被删子树时才重置筛选，笔记仍在原分类下。
  if (activeFolder.value && (activeFolder.value === category || activeFolder.value.startsWith(`${category}/`))) {
    activeFolder.value = '';
  }
  ElMessage.success(t('folder.deleteSuccess'));
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
 * 复制整个文件夹的 Markdown 到剪贴板（对齐 vue2 `copyMarkdownHandler`）：
 * 每篇拼成 `## 标题\n\n正文`，篇间用 `\n\n---\n\n` 分隔，不写文件。
 */
async function copyFolderMarkdown(category: string): Promise<void> {
  if (!category) {
    return;
  }
  const listed = await listNotes({ category, limit: 5000, offset: 0 });
  if (listed.ok === false) {
    ElMessage.error(listed.error.message);
    return;
  }
  if (!listed.data.items.length) {
    ElMessage.warning(t('notes.copyFolderEmpty'));
    return;
  }
  const sections: FolderMarkdownNote[] = [];
  for (const summary of listed.data.items) {
    const full = await getNote(summary.id);
    if (full.ok === false) {
      continue;
    }
    sections.push({ title: summary.title, content: full.data.content || '' });
  }
  if (!sections.length) {
    ElMessage.warning(t('notes.copyFolderEmpty'));
    return;
  }
  try {
    await navigator.clipboard.writeText(buildFolderMarkdown(sections));
    ElMessage.success(t('notes.copyFolderDone', { count: sections.length }));
  } catch {
    ElMessage.error(t('notes.copyFolderFailed'));
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

async function openCreateNote(payload?: { templateId?: string }): Promise<void> {
  if (creating.value) {
    return;
  }
  newNoteTemplateId.value = payload?.templateId || '';
  newNoteVisible.value = true;
}

async function submitCreateNote(payload: { title: string; templateId?: string }): Promise<void> {
  if (creating.value) {
    return;
  }
  creating.value = true;
  try {
    // 模板正文由主进程拼在 `# 标题` 之后；无模板时也由主进程补 H1，和 vue2 createNote 一致。
    const note = await notesStore.create({
      title: payload.title || t('notes.untitled'),
      ...(payload.templateId ? { templateId: payload.templateId } : {}),
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
 * 键盘 accelerator：匹配表在 `utils/shortcuts.ts` 里逐条对齐 vue2 KeyBindings。
 * 文件菜单类快捷键（cut/copy/paste/mc.*）交给浏览器或 macOS appMenu；
 * 其余命中后统一 preventDefault，避免 Chromium 把 Ctrl+Shift+I/R 等当成开发者工具或刷新。
 */
function runAppShortcut(command: AppShortcutCommand): void {
  switch (command) {
    case 'save':
      void flushSave();
      return;
    case 'createNote':
      void openCreateNote();
      return;
    case 'focusListSearch':
      searchVisible.value = true;
      return;
    case 'searchNote':
      // vue2 Header 的 searchDialog.toggle()：再按一次关闭。
      searchVisible.value = !searchVisible.value;
      return;
    case 'switchView':
      cyclePaneLayout();
      return;
    case 'toggleSourceMode':
      if (activeSummary.value) {
        editorPaneRef.value?.toggleSourceMode();
      }
      return;
    case 'toggleLock':
      if (activeSummary.value) {
        editorPaneRef.value?.toggleLock();
      }
      return;
    case 'openDevTools':
      void openDevTools().then((result) => {
        if (!result.ok) {
          ElMessage.error(result.error.message);
        }
      });
      return;
    default:
      return;
  }
}

function dispatchEditorShortcut(action: Extract<ShortcutAction, { scope: 'editor' }>): void {
  const result = editorPaneRef.value?.executeShortcut?.(action);
  if (result && typeof (result as Promise<boolean>).then === 'function') {
    void (result as Promise<boolean>).catch(() => false);
  }
}

function handleShortcut(event: KeyboardEvent): void {
  const binding = matchShortcut(event, appStore.appInfo?.platform ?? '');
  if (!binding) {
    return;
  }

  // 原生菜单 / 剪贴板动作不抢默认行为。
  if (binding.action.scope === 'native') {
    return;
  }

  // 捕获阶段先于 Muya/Monaco 的 keydown，挡掉 Chromium 与编辑器内置的同键动作
  // （例如 Ctrl+Shift+P 在 Monaco 是命令面板，在 vue2 是 DevTools）。
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) {
    return;
  }

  if (binding.action.scope === 'app') {
    runAppShortcut(binding.action.command);
    return;
  }

  dispatchEditorShortcut(binding.action);
}

const microDrawerVisible = ref(false);
const searchVisible = ref(false);
const aiDrawerVisible = ref(false);
const doubaoDrawerVisible = ref(false);
const outlineVisible = ref(false);
const editorPaneRef = ref<InstanceType<typeof EditorPane> | null>(null);
const sidebarRef = ref<InstanceType<typeof IndexSidebar> | null>(null);
const noteImportVisible = ref(false);
const noteImportCategory = ref('');
const echoInstanceVisible = ref(false);
const echoInstanceToken = ref<EchoInstanceToken | null>(null);
const echoInstanceCard = ref<EchoCard | null>(null);
const echoDefinitionVisible = ref(false);
const echoDefinitionCard = ref<EchoCard | null>(null);
const deleteEffectEntry = ref<MicroApp | null>(null);
const fullscreenOverlayRef = ref<InstanceType<typeof FullscreenOverlay> | null>(null);
const skinEffectsRef = ref<any>(null);
let detachSkinEffect: (() => void) | null = null;

onMounted(async () => {
  // 内置微应用条目只注册一次（幂等），再取「删除特效」当前配置给 overlay 用
  installMicroAppsBuiltins();
  // 首页首屏稳定后预取设置页 chunk，避免第一次点齿轮时现下载现挂载
  window.setTimeout(() => {
    void import('@/views/SettingsView.vue');
  }, 800);
  void findDeleteEffectEntry().then((entry) => {
    deleteEffectEntry.value = entry;
  });
  detachSkinEffect = skinEffectBus.on((skin) => skinEffectsRef.value?.play?.(skin));
  window.addEventListener('keydown', handleShortcut, true);
  void appStore.init();
  const loaded = await notesStore.loadAll();
  if (!loaded) {
    ElMessage.error(notesStore.error || t('notes.loadFailed'));
  }
});

onBeforeUnmount(() => {
  detachSkinEffect?.();
  window.removeEventListener('keydown', handleShortcut, true);
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
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
  void refreshSyncLoginState();
});
</script>
