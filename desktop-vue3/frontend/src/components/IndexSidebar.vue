<template>
  <aside class="sidebar">
    <div class="index-panel" @contextmenu="onPanelContextMenu">
      <template v-if="mode === IndexModeEnum.Folder">
        <el-tree
          ref="folderTreeRef"
          class="folder-tree"
          :data="folderTree"
          node-key="key"
          :props="{ children: 'children', label: 'label' }"
          :current-node-key="folderFilter || '/'"
          :default-expanded-keys="expandedKeys"
          :expand-on-click-node="false"
          :indent="20"
          highlight-current
          @node-click="onFolderClick"
          @node-contextmenu="onFolderContextMenu"
          @node-expand="onFolderExpand"
          @node-collapse="onFolderCollapse"
        >
          <template #default="{ node, data }">
            <span
              class="folder-node"
              :class="{ active: (data.isRoot && isAllScope) || folderFilter === data.key }"
            >
              <el-icon class="folder-node-icon">
                <FolderOpened v-if="node.expanded || folderFilter === data.key" />
                <Folder v-else />
              </el-icon>
              <span class="folder-node-label">{{ data.label }}</span>
              <span class="side-count">{{ data.count }}</span>
              <button
                v-if="!data.isRoot"
                type="button"
                class="index-delete folder-node-delete"
                :title="t('folder.delete')"
                @click.stop="removeFolder(data.key)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </span>
          </template>
        </el-tree>
      </template>

      <template v-else-if="mode === IndexModeEnum.Tag">
        <div ref="tagChartRef" class="tag-treemap" />
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

  </aside>
</template>

<script setup lang="ts">
import { Clock, Delete, Folder, FolderOpened } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, ElTree } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { init, use } from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { IndexModeEnum, type CalendarDateBasis, type IndexMode } from '@shared/enums/app';
import { useNotesStore } from '@/stores/notes';
import { useAppStore } from '@/stores/app';
import { buildCategoryTree, buildTagTreemapData, type CategoryTreeNode } from '@/utils/categoryTree';
import { folderName, joinFolderPath, noteTags, noteTimeGroup } from '@/utils/note';
import CalendarPanel from './CalendarPanel.vue';

use([TreemapChart, TooltipComponent, CanvasRenderer]);

const EXPANDED_KEYS_STORAGE = 'coolma.categoryExpandedKeys';

const props = defineProps<{
  mode: IndexMode;
  folderFilter: string;
  tagFilter: string;
  timeGroupFilter: string;
  calendarDate: string;
  calendarBasis: CalendarDateBasis;
  total: number;
}>();

const emit = defineEmits<{
  (event: 'request-delete-folder', category: string): void;
  (event: 'open-folder-menu', payload: { category: string; event: MouseEvent }): void;
  (event: 'update:mode', value: IndexMode): void;
  (event: 'update:filter', value: { folder?: string; tag?: string; timeGroup?: string; calendarDate?: string; calendarBasis?: CalendarDateBasis }): void;
  (event: 'create-note', payload?: { templateId?: string }): void;
  (event: 'export-folder', category: string): void;
}>();

const { t } = useI18n();
const notesStore = useNotesStore();
const appStore = useAppStore();

defineExpose({ startCreateFolder: (parentCategory = '') => { void createFolder(parentCategory); } });



const isAllScope = computed(
  () => !props.folderFilter && !props.tagFilter && !props.timeGroupFilter && !props.calendarDate,
);

const calendarDateProxy = computed({
  get: () => props.calendarDate,
  set: (value: string) => emit('update:filter', { calendarDate: value }),
});

const folderTree = computed<CategoryTreeNode[]>(() => {
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

  const rawPos = appStore.prefs['setting/sync/categoryPos'];
  const pos = rawPos && typeof rawPos === 'object' ? (rawPos as Record<string, number>) : {};
  const children = buildCategoryTree(
    Array.from(counts, ([category, count]) => ({ category, count })),
    (_path, segment) => segment,
    pos,
  );
  // 照 vue2：分类树外面永远套一层可选择的“我的笔记”，点击它等价于全部笔记。
  return [
    {
      key: '/',
      label: t('index.myNotes'),
      count: props.total,
      children,
      isRoot: true,
    },
  ];
});

const folderTreeRef = ref<InstanceType<typeof ElTree> | null>(null);
const expandedKeys = ref<string[]>(readExpandedKeys());
const tagChartRef = ref<HTMLElement | null>(null);
let tagChart: ReturnType<typeof init> | null = null;
let tagResizeObserver: ResizeObserver | null = null;

function readExpandedKeys(): string[] {
  try {
    const raw = localStorage.getItem(EXPANDED_KEYS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function persistExpandedKeys(): void {
  localStorage.setItem(EXPANDED_KEYS_STORAGE, JSON.stringify(expandedKeys.value));
}

function onFolderClick(data: CategoryTreeNode): void {
  if (data.isRoot) {
    clearFilters();
    return;
  }
  const next = props.folderFilter === data.key ? '' : data.key;
  emit('update:filter', { folder: next, tag: '', timeGroup: '' });
}

function onPanelContextMenu(event: MouseEvent): void {
  if (props.mode !== IndexModeEnum.Folder) {
    return;
  }
  // 树节点自己的右键菜单已 stopPropagation 前的元素判断：点在节点上就交给 node-contextmenu。
  if ((event.target as HTMLElement | null)?.closest('.el-tree-node__content')) {
    return;
  }
  event.preventDefault();
  emit('open-folder-menu', { category: '', event });
}

function onFolderContextMenu(event: Event, data: CategoryTreeNode): void {
  event.preventDefault();
  emit('open-folder-menu', { category: data.key, event: event as MouseEvent });
}

function onFolderExpand(data: CategoryTreeNode): void {
  if (!expandedKeys.value.includes(data.key)) {
    expandedKeys.value = [...expandedKeys.value, data.key];
    persistExpandedKeys();
  }
}

function onFolderCollapse(data: CategoryTreeNode): void {
  expandedKeys.value = expandedKeys.value.filter((key) => key !== data.key);
  persistExpandedKeys();
}

/** vue2 挂载时会把所有根节点展开，并默认展开 /My Notes/。 */
function ensureRootsExpanded(): void {
  const roots = folderTree.value.map((node) => node.key);
  const pathKeys: string[] = [];
  if (props.folderFilter) {
    const segments = props.folderFilter.split('/').filter(Boolean);
    let path = '';
    for (const segment of segments) {
      path += `/${segment}`;
      pathKeys.push(`${path}/`);
    }
  }
  const merged = new Set([...expandedKeys.value, ...roots, ...pathKeys]);
  if (merged.size !== expandedKeys.value.length) {
    expandedKeys.value = Array.from(merged);
    persistExpandedKeys();
  }
  void nextTick(() => {
    folderTreeRef.value?.setCurrentKey(props.folderFilter || '/');
  });
}

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

function selectTag(name: string): void {
  emit('update:filter', { tag: name, folder: '', timeGroup: '' });
}

function selectTimeGroup(key: string): void {
  const next = props.timeGroupFilter === key ? '' : key;
  emit('update:filter', { timeGroup: next, folder: '', tag: '' });
}

function palette(): string[] {
  const dark = document.documentElement.classList.contains('dark');
  return dark
    ? ['#4a9eff', '#50c9a8', '#f5a623', '#e74c3c', '#9b59b6', '#1abc9c', '#3498db']
    : ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#1890ff'];
}

function themeColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary').trim();
  return value || '#409eff';
}

function buildTreemapOption(): Record<string, unknown> {
  const dark = document.documentElement.classList.contains('dark');
  const selected = props.tagFilter;
  return {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params: { data?: { name?: string; noteCount?: number } }) =>
        `${params.data?.name ?? ''}（${params.data?.noteCount ?? 0}）`,
    },
    series: [
      {
        type: 'treemap',
        width: '100%',
        height: '100%',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        sort: 'desc',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        upperLabel: { show: false },
        label: {
          show: true,
          formatter: (params: { data: { name: string; noteCount: number } }) =>
            `{name|${params.data.name}}\n{count|(${params.data.noteCount})}`,
          rich: {
            name: { color: '#fff', fontSize: 12, lineHeight: 16, overflow: 'truncate' },
            count: { color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 14 },
          },
          align: 'center',
          verticalAlign: 'middle',
          minSize: 8,
        },
        itemStyle: { borderColor: dark ? '#2d2d2d' : '#fff', borderWidth: 2, gapWidth: 2 },
        emphasis: {
          upperLabel: { show: false },
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
        },
        levels: [
          {
            itemStyle: { borderColor: dark ? '#2d2d2d' : '#fff', borderWidth: 2, gapWidth: 2 },
            color: palette(),
          },
        ],
        data: buildTagTreemapData(tags.value).map((item) => ({
          ...item,
          itemStyle: {
            borderColor: item.tagGuid === selected ? themeColor() : dark ? '#2d2d2d' : '#fff',
            borderWidth: item.tagGuid === selected ? 3 : 2,
            gapWidth: 2,
          },
        })),
      },
    ],
  };
}

function renderTagTreemap(): void {
  if (props.mode !== IndexModeEnum.Tag || !tagChartRef.value) {
    return;
  }
  if (!tagChart) {
    tagChart = init(tagChartRef.value, undefined, { renderer: 'canvas' });
    tagChart.on('click', (params) => {
      const data = params.data as { tagGuid?: string } | undefined;
      if (data?.tagGuid) {
        selectTag(data.tagGuid);
      }
    });
    tagChart.on('contextmenu', (params) => {
      (params.event as unknown as MouseEvent | undefined)?.preventDefault();
      const name = (params.data as { tagGuid?: string } | undefined)?.tagGuid;
      if (!name) {
        return;
      }
      const id = tags.value.find((item) => item.name === name)?.id ?? null;
      void removeTag(name, id);
    });
    tagResizeObserver = new ResizeObserver(() => tagChart?.resize());
    tagResizeObserver.observe(tagChartRef.value);
  }
  tagChart.setOption(buildTreemapOption(), true);
}

function disposeTagTreemap(): void {
  tagResizeObserver?.disconnect();
  tagResizeObserver = null;
  tagChart?.dispose();
  tagChart = null;
}

async function createFolder(parentCategory = ''): Promise<void> {
  const parent = parentCategory.trim();
  let value = '';
  try {
    const result = await ElMessageBox.prompt(
      parent
        ? t('folder.createChildPlaceholder', { name: folderName(parent, t('notes.rootFolder')) })
        : t('folder.createPlaceholder'),
      parent ? t('folder.createChildTitle') : t('folder.createTitle'),
      {
        inputValidator: (input: string) => Boolean(input.trim()) || t('folder.createRequired'),
        confirmButtonText: t('action.confirm'),
        cancelButtonText: t('action.cancel'),
      },
    );
    value = result.value.trim();
  } catch {
    return;
  }
  if (!value) {
    return;
  }

  // 右键父节点时只输子目录名；父路径由这里拼，避免用户再手打 `/父/子`。
  const category = joinFolderPath(parent, value);
  if (!category) {
    return;
  }
  const created = await notesStore.createFolder(category);
  if (!created) {
    ElMessage.error(notesStore.error || t('folder.createFailed'));
    return;
  }
  emit('update:filter', { folder: category, tag: '', timeGroup: '' });
  ElMessage.success(t('folder.createSuccess'));
}

async function removeFolder(category: string): Promise<void> {
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
onMounted(() => {
  void notesStore.loadTemplates();
  ensureRootsExpanded();
  if (props.mode === IndexModeEnum.Tag) {
    void nextTick(renderTagTreemap);
  }
});

watch(
  () => props.mode,
  (mode) => {
    if (mode === IndexModeEnum.Tag) {
      void nextTick(renderTagTreemap);
    } else {
      disposeTagTreemap();
    }
  },
);

watch(
  () => props.tagFilter,
  () => {
    if (props.mode === IndexModeEnum.Tag) {
      void nextTick(renderTagTreemap);
    }
  },
);

watch(
  tags,
  () => {
    if (props.mode === IndexModeEnum.Tag) {
      void nextTick(renderTagTreemap);
    }
  },
  { deep: true },
);

watch(folderTree, () => ensureRootsExpanded(), { deep: true });

watch(
  () => props.folderFilter,
  (value) => {
    void nextTick(() => folderTreeRef.value?.setCurrentKey(value || undefined));
  },
);

onBeforeUnmount(disposeTagTreemap);
</script>
