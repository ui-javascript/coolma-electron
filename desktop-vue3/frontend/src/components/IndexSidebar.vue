<template>
  <aside class="sidebar">
    <div class="sidebar-section-head">
      <span>{{ t('index.title') }}</span>
      <el-dropdown trigger="click" @command="createWithTemplate">
        <el-button text size="small" :loading="creating" :title="t('action.newNote')">
          <el-icon><Plus /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="">{{ t('noteTemplateEmptyOption') }}</el-dropdown-item>
            <el-dropdown-item
              v-for="tpl in notesStore.templates"
              :key="tpl.id"
              :command="tpl.id"
            >
              {{ tpl.name }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <el-radio-group v-model="modeProxy" class="index-mode-switch" size="small">
      <el-radio-button v-for="item in indexModes" :key="item.value" :value="item.value">
        {{ t(item.label) }}
      </el-radio-button>
    </el-radio-group>

    <button type="button" class="index-row index-all" :class="{ active: isAllScope }" @click="clearFilters">
      <el-icon><Document /></el-icon>
      <span class="index-label">{{ t('index.all') }}</span>
      <span class="side-count">{{ total }}</span>
    </button>

    <div class="index-panel">
      <template v-if="mode === IndexModeEnum.Folder">
        <div class="index-toolbar">
          <el-button text size="small" :title="t('folder.create')" @click="createFolder">
            <el-icon><FolderAdd /></el-icon>
            <span>{{ t('folder.create') }}</span>
          </el-button>
        </div>
        <div v-for="folder in folders" :key="folder.category" class="index-row-wrap">
          <button
            type="button"
            class="index-row"
            :class="{ active: folderFilter === folder.category }"
            @click="selectFolder(folder.category)"
            @contextmenu.prevent="emit('export-folder', folder.category)"
          >
            <el-icon><Folder /></el-icon>
            <span class="index-label">{{ folder.name }}</span>
            <span class="side-count">{{ folder.count }}</span>
          </button>
          <button
            v-if="folder.category !== '/'"
            type="button"
            class="index-delete"
            :title="t('folder.delete')"
            @click.stop="removeFolder(folder.category)"
          >
            <el-icon><Delete /></el-icon>
          </button>
        </div>
        <p v-if="folders.length === 0" class="index-empty">{{ t('index.empty') }}</p>
      </template>

      <template v-else-if="mode === IndexModeEnum.Tag">
        <div class="index-toolbar">
          <el-button text size="small" :title="t('tag.create')" @click="createTag">
            <el-icon><Plus /></el-icon>
            <span>{{ t('tag.create') }}</span>
          </el-button>
        </div>
        <div class="tag-cloud">
          <el-tag
            v-for="item in tags"
            :key="item.name"
            :effect="tagFilter === item.name ? 'dark' : 'plain'"
            round
            class="tag-chip"
            @click="selectTag(item.name)"
            @contextmenu.prevent="removeTag(item.name, item.id)"
          >
            {{ item.name }} · {{ item.count }}
          </el-tag>
        </div>
        <p v-if="tags.length === 0" class="index-empty">{{ t('index.empty') }}</p>
      </template>

      <template v-else-if="mode === IndexModeEnum.Calendar">
        <CalendarPanel
          v-model="calendarDateProxy"
          :basis="calendarBasis"
          :notes="notesStore.notes"
          @update:basis="emit('update:filter', { calendarBasis: $event })"
        />
      </template>

      <template v-else>
        <button
          v-for="group in timeGroups"
          :key="group.key"
          type="button"
          class="index-row"
          :class="{ active: timeGroupFilter === group.key }"
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
      <span>{{ phaseLabel }}</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Clock, Delete, Document, Folder, FolderAdd, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { IndexModeEnum, type CalendarDateBasis, type IndexMode } from '@shared/enums/app';
import { useNotesStore } from '@/stores/notes';
import { folderName, noteTags, noteTimeGroup } from '@/utils/note';
import CalendarPanel from './CalendarPanel.vue';

const props = defineProps<{
  mode: IndexMode;
  folderFilter: string;
  tagFilter: string;
  timeGroupFilter: string;
  calendarDate: string;
  calendarBasis: CalendarDateBasis;
  creating: boolean;
  total: number;
  phaseLabel: string;
}>();

const emit = defineEmits<{
  (event: 'request-delete-folder', category: string): void;
  (event: 'update:mode', value: IndexMode): void;
  (event: 'update:filter', value: { folder?: string; tag?: string; timeGroup?: string; calendarDate?: string; calendarBasis?: CalendarDateBasis }): void;
  (event: 'create-note', payload?: { templateId?: string }): void;
  (event: 'export-folder', category: string): void;
}>();

const { t } = useI18n();
const notesStore = useNotesStore();

onMounted(() => {
  void notesStore.loadTemplates();
});

/** 新建笔记：command 空串=空模板，否则为模板 id（对齐 vue2 buildTemplateOptions）。 */
function createWithTemplate(command: string): void {
  emit('create-note', command ? { templateId: command } : undefined);
}

const indexModes = IndexModeEnum.items;

const modeProxy = computed({
  get: () => props.mode,
  set: (value: IndexMode) => emit('update:mode', value),
});

const isAllScope = computed(
  () => !props.folderFilter && !props.tagFilter && !props.timeGroupFilter && !props.calendarDate,
);

const calendarDateProxy = computed({
  get: () => props.calendarDate,
  set: (value: string) => emit('update:filter', { calendarDate: value }),
});

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
    name: folderName(category, t('notes.rootFolder')),
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
  const idByName = new Map<string, number>();
  for (const tag of notesStore.tags) {
    idByName.set(tag.name, tag.id);
    if (!counts.has(tag.name) && tag.noteCount > 0) {
      counts.set(tag.name, tag.noteCount);
    }
  }

  return Array.from(counts, ([name, count]) => ({
    name,
    count,
    id: idByName.get(name) ?? null,
  })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
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

function clearFilters(): void {
  emit('update:filter', { folder: '', tag: '', timeGroup: '' });
}

function selectFolder(category: string): void {
  const next = props.folderFilter === category ? '' : category;
  emit('update:filter', { folder: next, tag: '', timeGroup: '' });
}

function selectTag(name: string): void {
  const next = props.tagFilter === name ? '' : name;
  emit('update:filter', { tag: next, folder: '', timeGroup: '' });
}

function selectTimeGroup(key: string): void {
  const next = props.timeGroupFilter === key ? '' : key;
  emit('update:filter', { timeGroup: next, folder: '', tag: '' });
}

async function createFolder(): Promise<void> {
  let value = '';
  try {
    const result = await ElMessageBox.prompt(t('folder.createPlaceholder'), t('folder.createTitle'), {
      inputValidator: (input: string) => Boolean(input.trim()) || t('folder.createRequired'),
      confirmButtonText: t('action.confirm'),
      cancelButtonText: t('action.cancel'),
    });
    value = result.value.trim();
  } catch {
    return;
  }
  if (!value) {
    return;
  }

  const category = value.startsWith('/') ? value : `/${value}`;
  const created = await notesStore.createFolder(category);
  if (!created) {
    ElMessage.error(notesStore.error || t('folder.createFailed'));
    return;
  }
  emit('update:filter', { folder: category, tag: '', timeGroup: '' });
  ElMessage.success(t('folder.createSuccess'));
}

async function removeFolder(category: string): Promise<void> {
  const count = notesStore.notes.filter((note) => note.category === category).length;
  if (count > 0) {
    ElMessage.warning(t('folder.deleteNotEmpty', { count }));
    return;
  }

  try {
    await ElMessageBox.confirm(
      t('folder.deleteConfirm', { name: folderName(category, t('notes.rootFolder')) }),
      t('folder.delete'),
      { type: 'warning', confirmButtonText: t('folder.delete'), cancelButtonText: t('action.cancel') },
    );
  } catch {
    return;
  }

  const deleted = await notesStore.deleteFolder(category);
  if (!deleted) {
    ElMessage.error(notesStore.error || t('folder.deleteFailed'));
    return;
  }
  if (props.folderFilter === category) {
    emit('update:filter', { folder: '' });
  }
  ElMessage.success(t('folder.deleteSuccess'));
}

async function createTag(): Promise<void> {
  let value = '';
  try {
    const result = await ElMessageBox.prompt(t('tag.createPlaceholder'), t('tag.createTitle'), {
      inputValidator: (input: string) => Boolean(input.trim()),
      confirmButtonText: t('action.confirm'),
      cancelButtonText: t('action.cancel'),
    });
    value = result.value.trim();
  } catch {
    return;
  }
  if (!value) {
    return;
  }

  const created = await notesStore.createTag(value);
  if (!created) {
    ElMessage.error(notesStore.error || t('tag.createFailed'));
    return;
  }
  ElMessage.success(t('tag.createSuccess'));
}

async function removeTag(name: string, id: number | null): Promise<void> {
  if (id === null) {
    ElMessage.warning(t('tag.deleteMissing'));
    return;
  }
  try {
    await ElMessageBox.confirm(
      t('tag.deleteConfirm', { name }),
      t('tag.delete'),
      { type: 'warning', confirmButtonText: t('tag.delete'), cancelButtonText: t('action.cancel') },
    );
  } catch {
    return;
  }

  const deleted = await notesStore.deleteTag(id);
  if (!deleted) {
    ElMessage.error(notesStore.error || t('tag.deleteFailed'));
    return;
  }
  if (props.tagFilter === name) {
    emit('update:filter', { tag: '' });
  }
  ElMessage.success(t('tag.deleteSuccess'));
}
</script>
