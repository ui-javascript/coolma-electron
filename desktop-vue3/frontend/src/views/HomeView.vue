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
        <aside class="sidebar">
          <div class="sidebar-section-head">
            <span>{{ t('index.title') }}</span>
            <el-button text size="small" :loading="creating" @click="createNote">
              <el-icon><Plus /></el-icon>
            </el-button>
          </div>

          <el-radio-group v-model="indexMode" class="index-mode-switch" size="small" @change="handleModeChange">
            <el-radio-button v-for="mode in indexModes" :key="mode.value" :value="mode.value">
              {{ t(mode.label) }}
            </el-radio-button>
          </el-radio-group>

          <button type="button" class="index-row index-all" :class="{ active: isAllScope }" @click="clearFilters">
            <el-icon><Document /></el-icon>
            <span class="index-label">{{ t('index.all') }}</span>
            <span class="side-count">{{ notesStore.total }}</span>
          </button>

          <div class="index-panel">
            <template v-if="indexMode === IndexModeEnum.Folder">
              <button
                v-for="folder in folders"
                :key="folder.category"
                type="button"
                class="index-row"
                :class="{ active: activeFolder === folder.category }"
                @click="selectFolder(folder.category)"
              >
                <el-icon><Folder /></el-icon>
                <span class="index-label">{{ folder.name }}</span>
                <span class="side-count">{{ folder.count }}</span>
              </button>
              <p v-if="folders.length === 0" class="index-empty">{{ t('index.empty') }}</p>
            </template>

            <template v-else-if="indexMode === IndexModeEnum.Tag">
              <div class="tag-cloud">
                <el-tag
                  v-for="tag in tags"
                  :key="tag.name"
                  :effect="activeTag === tag.name ? 'dark' : 'plain'"
                  round
                  class="tag-chip"
                  @click="selectTag(tag.name)"
                >
                  {{ tag.name }} · {{ tag.count }}
                </el-tag>
              </div>
              <p v-if="tags.length === 0" class="index-empty">{{ t('index.empty') }}</p>
            </template>

            <template v-else>
              <button
                v-for="group in timeGroups"
                :key="group.key"
                type="button"
                class="index-row"
                :class="{ active: activeTimeGroup === group.key }"
                @click="selectTimeGroup(group.key)"
              >
                <el-icon><Clock /></el-icon>
                <span class="index-label">{{ t(group.label) }}</span>
                <span class="side-count">{{ group.count }}</span>
              </button>
            </template>
          </div>

          <div class="sidebar-footer">
            <span class="phase-dot" />
            <span>P3 · SQLite</span>
          </div>
        </aside>
      </Pane>

      <Pane :size="27" :min-size="20" :max-size="40">
        <section class="notes-pane">
        <div class="notes-toolbar">
          <div>
            <h1>{{ t('notes.title') }}</h1>
            <p>{{ t('notes.count', { count: filteredNotes.length }) }} · {{ currentFilterLabel }}</p>
          </div>
          <el-button type="primary" size="small" :loading="creating" @click="createNote">
            <el-icon><Plus /></el-icon>
            {{ t('action.newNote') }}
          </el-button>
        </div>

        <el-input v-model="keyword" class="notes-search" :placeholder="t('search.placeholder')" clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <div v-loading="notesStore.loading" class="note-list">
          <button
            v-for="note in filteredNotes"
            :key="note.id"
            type="button"
            class="note-item"
            :class="{ active: note.id === activeId }"
            @click="selectNote(note.id)"
          >
            <div class="note-item-head">
              <span class="note-title">{{ note.title }}</span>
              <el-icon class="note-more"><MoreFilled /></el-icon>
            </div>
            <p class="note-excerpt">{{ note.excerpt }}</p>
            <div class="note-meta">
              <span>{{ formatNoteDate(note) }}</span>
              <el-tag size="small" effect="plain">{{ primaryTag(note) }}</el-tag>
              <span v-if="extraTagCount(note) > 0" class="note-tag-extra">+{{ extraTagCount(note) }}</span>
            </div>
          </button>

          <el-empty
            v-if="!notesStore.loading && filteredNotes.length === 0"
            :description="notesStore.notes.length === 0 ? t('notes.noNotes') : t('notes.empty')"
            :image-size="72"
          />
        </div>
        </section>
      </Pane>

      <Pane :size="55">
        <main class="editor-pane">
        <template v-if="activeSummary">
          <div class="editor-meta">
            <div class="editor-meta-left">
              <el-tag type="success" effect="plain" size="small">Muya</el-tag>
              <span class="editor-meta-title">{{ activeSummary.title }}</span>
            </div>
            <div class="editor-meta-right">
              <span class="editor-meta-note">
                {{ noteTags(activeSummary).join(' · ') || t('notes.untagged') }} · {{ formatNoteDate(activeSummary) }}
              </span>
              <span v-if="saveHint" class="save-hint" :class="{ saving: notesStore.saving }">{{ saveHint }}</span>
              <el-button text type="danger" size="small" :title="t('action.delete')" @click="deleteActiveNote">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
          <MuyaEditor
            v-if="activeSummary"
            v-model="activeContent"
            :theme="appStore.theme"
            :plugins="muyaPlugins"
            class="muya-editor"
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
          <span v-else class="statusbar-right">{{ appStore.error || t('status.unavailable') }}</span>
        </footer>
        </main>
      </Pane>
    </Splitpanes>
  </div>
</template>

<script setup lang="ts">
import {
  Clock,
  Delete,
  Document,
  Folder,
  MoreFilled,
  Plus,
  Search,
  Setting,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Pane, Splitpanes } from 'splitpanes';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IndexModeEnum, type IndexMode } from '@shared/enums/app';
import type { NoteSummary } from '@shared/types/domain';
import { MuyaEditor } from 'libs-muya';
import { listNotes } from '@/services/ipc';
import { useAppStore } from '@/stores/app';
import { useNotesStore } from '@/stores/notes';
import { muyaPlugins } from '@/muyaPlugins';

const DAY_MS = 24 * 60 * 60 * 1000;

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const notesStore = useNotesStore();

const keyword = ref('');
const activeId = ref<number | null>(null);
const activeTag = ref('');
const activeFolder = ref('');
const activeTimeGroup = ref('');
const activeContent = ref('');
const creating = ref(false);
const lastSavedAt = ref(0);
const searchResults = ref<NoteSummary[] | null>(null);

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
const indexModes = IndexModeEnum.items;

function splitTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function noteTags(note: Pick<NoteSummary, 'tags'>): string[] {
  return splitTags(note.tags);
}

function primaryTag(note: Pick<NoteSummary, 'tags'>): string {
  return noteTags(note)[0] ?? t('notes.untagged');
}

function extraTagCount(note: Pick<NoteSummary, 'tags'>): number {
  return Math.max(0, noteTags(note).length - 1);
}

function folderName(category: string): string {
  const parts = category.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : t('notes.rootFolder');
}

function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function noteTimeGroup(note: NoteSummary): 'today' | 'yesterday' | 'week' | 'earlier' {
  const timestamp = note.updatedAt || note.createdAt;
  if (!timestamp) {
    return 'earlier';
  }
  const today = startOfToday();
  if (timestamp >= today) {
    return 'today';
  }
  if (timestamp >= today - DAY_MS) {
    return 'yesterday';
  }
  if (timestamp >= today - 6 * DAY_MS) {
    return 'week';
  }
  return 'earlier';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatNoteDate(note: NoteSummary): string {
  const timestamp = note.updatedAt || note.createdAt;
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = startOfToday();
  if (timestamp >= today) {
    return `${t('time.today')} ${time}`;
  }
  if (timestamp >= today - DAY_MS) {
    return `${t('time.yesterday')} ${time}`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const folders = computed(() => {
  const counts = new Map<string, number>();
  for (const note of notesStore.notes) {
    const category = note.category || '/';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  for (const category of notesStore.categories) {
    if (!counts.has(category.category) && category.noteCount > 0) {
      counts.set(category.category, category.noteCount);
    }
  }

  return Array.from(counts, ([category, count]) => ({
    category,
    name: folderName(category),
    count,
  })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
});

const tags = computed(() => {
  const counts = new Map<string, number>();
  for (const note of notesStore.notes) {
    for (const tag of noteTags(note)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  for (const tag of notesStore.tags) {
    if (!counts.has(tag.name) && tag.noteCount > 0) {
      counts.set(tag.name, tag.noteCount);
    }
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name),
  );
});

const timeGroups = computed(() => {
  const definitions = [
    { key: 'today', label: 'time.today' },
    { key: 'yesterday', label: 'time.yesterday' },
    { key: 'week', label: 'time.week' },
    { key: 'earlier', label: 'time.earlier' },
  ] as const;

  return definitions.map((group) => ({
    ...group,
    count: notesStore.notes.filter((note) => noteTimeGroup(note) === group.key).length,
  }));
});

const filteredNotes = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  const useServerSearch = Boolean(query && searchResults.value);
  const source = useServerSearch ? searchResults.value! : notesStore.notes;
  return source.filter((note) => {
    const noteTagList = noteTags(note);
    const tagMatch = !activeTag.value || noteTagList.includes(activeTag.value);
    const folderMatch = !activeFolder.value || note.category === activeFolder.value;
    const timeMatch = !activeTimeGroup.value || noteTimeGroup(note) === activeTimeGroup.value;
    const textMatch =
      useServerSearch ||
      !query ||
      note.title.toLowerCase().includes(query) ||
      note.excerpt.toLowerCase().includes(query) ||
      noteTagList.some((tag) => tag.toLowerCase().includes(query));
    return tagMatch && folderMatch && timeMatch && textMatch;
  });
});

const activeSummary = computed(
  () => notesStore.notes.find((note) => note.id === activeId.value) ?? null,
);
const isAllScope = computed(
  () => !activeFolder.value && !activeTag.value && !activeTimeGroup.value,
);

const currentFilterLabel = computed(() => {
  if (activeFolder.value) return folderName(activeFolder.value);
  if (activeTag.value) return `#${activeTag.value}`;
  if (activeTimeGroup.value) {
    const group = timeGroups.value.find((item) => item.key === activeTimeGroup.value);
    return group ? t(group.label) : t('index.all');
  }
  return t('index.all');
});

const saveHint = computed(() => {
  if (notesStore.saving) return t('notes.saving');
  if (lastSavedAt.value > 0) return t('notes.saved');
  return '';
});

const statusLabel = computed(() => t(appStore.statusLabel));
const appInfo = computed(() => appStore.appInfo);
const statusType = computed(() => appStore.statusTagType);

watch(
  filteredNotes,
  (list) => {
    if (!list.some((note) => note.id === activeId.value)) {
      activeId.value = list[0]?.id ?? null;
    }
  },
  { immediate: true },
);

function deriveTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || fallback).slice(0, 300);
}

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

function handleModeChange(value: string | number | boolean | undefined): void {
  if (typeof value !== 'string') {
    return;
  }
  indexMode.value = value as IndexMode;
  localStorage.setItem('coolma.indexMode', indexMode.value);
  clearFilters();
}

function clearFilters(): void {
  activeFolder.value = '';
  activeTag.value = '';
  activeTimeGroup.value = '';
}

function selectFolder(category: string): void {
  activeFolder.value = activeFolder.value === category ? '' : category;
  activeTag.value = '';
  activeTimeGroup.value = '';
}

function selectTag(name: string): void {
  activeTag.value = activeTag.value === name ? '' : name;
  activeFolder.value = '';
  activeTimeGroup.value = '';
}

function selectTimeGroup(key: string): void {
  activeTimeGroup.value = activeTimeGroup.value === key ? '' : key;
  activeFolder.value = '';
  activeTag.value = '';
}

async function createNote(): Promise<void> {
  if (creating.value) {
    return;
  }
  creating.value = true;
  try {
    keyword.value = '';
    searchResults.value = null;
    const title = t('notes.untitled');
    const note = await notesStore.create({
      title,
      content: `# ${title}\n\n`,
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

async function deleteActiveNote(): Promise<void> {
  const current = activeSummary.value;
  if (!current) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      t('notes.deleteConfirm', { title: current.title }),
      t('action.delete'),
      { type: 'warning', confirmButtonText: t('action.delete') },
    );
  } catch {
    return;
  }

  await flushSave();
  const deleted = await notesStore.remove(current.id);
  if (!deleted) {
    ElMessage.error(notesStore.error || t('notes.deleteFailed'));
    return;
  }

  ElMessage.success(t('notes.deleteSuccess'));
  if (searchResults.value) {
    searchResults.value = searchResults.value.filter((note) => note.id !== current.id);
  }
  activeId.value = filteredNotes.value[0]?.id ?? null;
}

function openSettings(): void {
  void router.push('/settings');
}

onMounted(async () => {
  void appStore.init();
  const loaded = await notesStore.loadAll();
  if (!loaded) {
    ElMessage.error(notesStore.error || t('notes.loadFailed'));
  }
});

onBeforeUnmount(() => {
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
</script>
