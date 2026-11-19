<template>
  <div class="app-shell">
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
        <el-button circle plain :title="t('action.settings')" @click="openSettings">
          <el-icon><Setting /></el-icon>
        </el-button>
      </div>
    </header>

    <Splitpanes class="workspace">
      <Pane :size="18" :min-size="14" :max-size="25">
        <IndexSidebar
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
        />
      </Pane>

      <Pane :size="27" :min-size="20" :max-size="40">
        <NoteListPane
          :dense="denseMode"
          v-model:keyword="keyword"
          :notes="filteredNotes"
          :active-id="activeId"
          :selected-ids="selectedIds"
          :loading="notesStore.loading"
          :creating="creating"
          :filter-label="currentFilterLabel"
          :total="notesStore.total"
          :batch-pending="batchPending"
          @update:selected="selectedIds = $event"
          @select="selectNote"
          @open-menu="openMenu"
          @create-note="createNote"
          @batch-move="openBatchMove"
          @batch-export="exportSelected"
          @batch-delete="deleteSelected"
        />
      </Pane>

      <Pane :size="55">
        <EditorPane
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

    <NoteContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      @command="handleMenuCommand"
      @close="closeMenu"
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
  </div>
</template>

<script setup lang="ts">
import { Search, Setting } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { Pane, Splitpanes } from 'splitpanes';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IndexModeEnum, NoteOrderTypeEnum, type CalendarDateBasis, type IndexMode } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import EditorPane from '@/components/EditorPane.vue';
import MindMapDialog from '@/components/MindMapDialog.vue';
import PreviewPptDialog from '@/components/PreviewPptDialog.vue';
import IndexSidebar from '@/components/IndexSidebar.vue';
import MoveNoteDialog from '@/components/MoveNoteDialog.vue';
import NoteContextMenu from '@/components/NoteContextMenu.vue';
import NoteListPane from '@/components/NoteListPane.vue';
import TagEditorDialog from '@/components/TagEditorDialog.vue';
import { useNoteActions } from '@/composables/useNoteActions';
import { exportCategoryMarkdown, listNotes } from '@/services/ipc';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import { useLibraryStore } from '@/stores/library';
import { createMuyaPlugins } from '@/muyaPlugins';
import { deriveTitle, folderName, noteDateKey, noteTags, noteTimeGroup } from '@/utils/note';

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
  handleMenuCommand,
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

onMounted(async () => {
  window.addEventListener('keydown', handleShortcut);
  void appStore.init();
  const loaded = await notesStore.loadAll();
  if (!loaded) {
    ElMessage.error(notesStore.error || t('notes.loadFailed'));
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut);
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  void flushSave();
});
onMounted(async () => {
  await appStore.loadPrefs();
  applyEditorPrefs();
});
</script>
