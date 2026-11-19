import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NoteSummary } from '@shared/types/domain';
import { exportNoteMarkdown, exportNotePng } from '@/services/ipc';
import { useNotesStore } from '@/stores/notes';
import type { NoteMenuCommand } from '@/types/noteMenu';
import { folderName, noteTags } from '@/utils/note';

interface UseNoteActionsOptions {
  /** 当前打开的笔记 id；重命名/移动/删除都要先据此决定是否 flush。 */
  activeId: Ref<number | null>;
  activeSummary: ComputedRef<NoteSummary | null>;
  selectedIds: Ref<number[]>;
  searchResults: Ref<NoteSummary[] | null>;
  folderPaths: ComputedRef<string[]>;
  /** 落盘当前编辑器内的未保存内容。 */
  flushSave: () => Promise<void>;
  /** 删除当前笔记后应该跳到哪一条。 */
  nextActiveId: () => number | null;
  /** 当前编辑器已加载的笔记 id（用于同步重命名后的标题缓存）。 */
  getLoadedId: () => number | null;
  setLoadedTitle: (title: string) => void;
}

/**
 * 笔记的操作集合：右键菜单、重命名、移动、标签、复制、删除（单条与批量）。
 * 视图只负责触发和展示，业务判断与文案都在这里，避免 HomeView 继续膨胀。
 */
export function useNoteActions(options: UseNoteActionsOptions) {
  const { t } = useI18n();
  const notesStore = useNotesStore();

  const menuVisible = ref(false);
  const menuX = ref(0);
  const menuY = ref(0);
  const menuNoteId = ref<number | null>(null);

  const moveVisible = ref(false);
  const moveIds = ref<number[]>([]);
  const moveFromCategory = ref('/');

  const tagVisible = ref(false);
  const tagTarget = ref<NoteSummary | null>(null);

  const metaPending = ref(false);
  const batchPending = ref(false);

  const menuNote = computed(
    () => notesStore.notes.find((note) => note.id === menuNoteId.value) ?? null,
  );

  function openMenu(note: NoteSummary, event: MouseEvent): void {
    menuNoteId.value = note.id;
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    menuVisible.value = true;
    if (note.id !== options.activeId.value) {
      options.activeId.value = note.id;
    }
  }

  function closeMenu(): void {
    menuVisible.value = false;
  }

  async function copyMarkdown(note: NoteSummary): Promise<void> {
    try {
      const record = await notesStore.openNote(note.id);
      const text = record?.content ?? note.excerpt;
      await navigator.clipboard.writeText(text);
      ElMessage.success(t('notes.copySuccess'));
    } catch {
      ElMessage.error(t('notes.copyFailed'));
    }
  }

  /**
   * 导出为 Markdown 文件（对齐 vue2：保存框由主进程弹，结果只回来路径）。
   */
  async function exportMarkdown(note: NoteSummary): Promise<void> {
    try {
      await options.flushSave();
      const result = await exportNoteMarkdown(note.id);
      if (result.ok === false) {
        ElMessage.error(result.error.message || t('notes.exportFailed'));
        return;
      }
      if (result.data.canceled) {
        return;
      }
      ElMessage.success(t('notes.exportSuccess', { path: result.data.filePath }));
    } catch {
      ElMessage.error(t('notes.exportFailed'));
    }
  }

  /**
   * 导出整篇长图（对齐 vue2 exportPng）：用 html2canvas 抓整个编辑器元素，
   * 背景色跟随主题（暗色 #35373e / 亮色 #ffffff），再交给主进程落盘。
   */
  async function exportPng(note: NoteSummary): Promise<void> {
    const host = document.querySelector('div#ag-editor-id');
    if (!host) {
      ElMessage.error(t('notes.exportPngUnavailable'));
      return;
    }
    try {
      await options.flushSave();
      const { default: html2canvas } = await import('html2canvas');
      const isDark = Boolean(document.querySelector('.libs-muya-theme-dark'));
      const canvas = await html2canvas(host as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: isDark ? '#35373e' : '#ffffff',
        // 整篇长图：按元素完整高度出图，不按可视区域裁
        height: (host as HTMLElement).scrollHeight,
        windowHeight: (host as HTMLElement).scrollHeight,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const result = await exportNotePng(note.id, dataUrl);
      if (result.ok === false) {
        ElMessage.error(result.error.message || t('notes.exportFailed'));
        return;
      }
      if (result.data.canceled) {
        return;
      }
      ElMessage.success(t('notes.exportSuccess', { path: result.data.filePath }));
    } catch {
      ElMessage.error(t('notes.exportPngFailed'));
    }
  }

  async function renameNote(note: NoteSummary): Promise<void> {
    let value = '';
    try {
      const result = await ElMessageBox.prompt(t('notes.renamePlaceholder'), t('notes.renameTitle'), {
        inputValue: note.title,
        inputValidator: (input: string) => Boolean(input.trim()) || t('notes.renameRequired'),
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
    if (note.id === options.activeId.value) {
      await options.flushSave();
    }
    const renamed = await notesStore.rename(note.id, value);
    if (!renamed) {
      ElMessage.error(notesStore.error || t('notes.saveFailed'));
      return;
    }
    if (options.getLoadedId() === note.id) {
      options.setLoadedTitle(value);
    }
    ElMessage.success(t('notes.renameSuccess'));
  }

  async function deleteNote(note: NoteSummary): Promise<void> {
    try {
      await ElMessageBox.confirm(
        t('notes.deleteConfirm', { title: note.title }),
        t('action.delete'),
        { type: 'warning', confirmButtonText: t('action.delete'), cancelButtonText: t('action.cancel') },
      );
    } catch {
      return;
    }

    if (note.id === options.activeId.value) {
      await options.flushSave();
    }
    const deleted = await notesStore.remove(note.id);
    if (!deleted) {
      ElMessage.error(notesStore.error || t('notes.deleteFailed'));
      return;
    }

    ElMessage.success(t('notes.deleteSuccess'));
    if (options.searchResults.value) {
      options.searchResults.value = options.searchResults.value.filter((item) => item.id !== note.id);
    }
    if (options.activeId.value === note.id) {
      options.activeId.value = options.nextActiveId();
    }
  }

  async function deleteActiveNote(): Promise<void> {
    const current = options.activeSummary.value;
    if (!current) {
      return;
    }
    await deleteNote(current);
  }

  async function handleMenuCommand(command: NoteMenuCommand): Promise<void> {
    const note = menuNote.value;
    if (!note) {
      return;
    }

    switch (command) {
      case 'rename':
        await renameNote(note);
        break;
      case 'move':
        moveIds.value = [note.id];
        moveFromCategory.value = note.category || '/';
        moveVisible.value = true;
        break;
      case 'tags':
        tagTarget.value = note;
        tagVisible.value = true;
        break;
      case 'copy':
        await copyMarkdown(note);
        break;
      case 'export':
        await exportMarkdown(note);
        break;
      case 'exportPng':
        await exportPng(note);
        break;
      case 'delete':
        await deleteNote(note);
        break;
      default:
        break;
    }
  }

  function openBatchMove(): void {
    const ids = options.selectedIds.value;
    if (ids.length === 0) {
      return;
    }
    const first = notesStore.notes.find((note) => note.id === ids[0]);
    moveIds.value = [...ids];
    moveFromCategory.value = ids.length === 1 ? (first?.category ?? '/') : '/';
    moveVisible.value = true;
  }

  async function confirmMove(category: string): Promise<void> {
    const ids = moveIds.value;
    if (ids.length === 0) {
      return;
    }

    metaPending.value = true;
    try {
      const exists = category === '/' || options.folderPaths.value.includes(category);
      if (!exists) {
        const created = await notesStore.createFolder(category);
        if (!created) {
          ElMessage.error(notesStore.error || t('folder.createFailed'));
          return;
        }
      }

      const moved =
        ids.length === 1
          ? ((await notesStore.move(ids[0], category)) ? 1 : 0)
          : await notesStore.moveMany(ids, category);

      if (moved === 0) {
        ElMessage.error(notesStore.error || t('notes.saveFailed'));
        return;
      }

      moveVisible.value = false;
      if (ids.length === 1) {
        ElMessage.success(t('notes.moveSuccess', { folder: folderName(category, t('notes.rootFolder')) }));
      } else {
        ElMessage.success(t('board.moveSuccess', { count: moved }));
        options.selectedIds.value = [];
      }
    } finally {
      metaPending.value = false;
    }
  }

  async function confirmTags(tags: string[]): Promise<void> {
    const note = tagTarget.value;
    if (!note) {
      return;
    }
    metaPending.value = true;
    try {
      const saved = await notesStore.setTags(note.id, tags);
      if (!saved) {
        ElMessage.error(notesStore.error || t('notes.saveFailed'));
        return;
      }
      tagVisible.value = false;
      ElMessage.success(t('notes.tagsSuccess'));
    } finally {
      metaPending.value = false;
    }
  }

  async function deleteSelected(): Promise<void> {
    const ids = [...options.selectedIds.value];
    if (ids.length === 0) {
      return;
    }

    try {
      await ElMessageBox.confirm(
        t('board.deleteConfirm', { count: ids.length }),
        t('board.delete'),
        { type: 'warning', confirmButtonText: t('board.delete'), cancelButtonText: t('action.cancel') },
      );
    } catch {
      return;
    }

    batchPending.value = true;
    try {
      if (options.activeId.value !== null && ids.includes(options.activeId.value)) {
        await options.flushSave();
      }
      const removed = await notesStore.removeMany(ids);
      if (options.searchResults.value) {
        options.searchResults.value = options.searchResults.value.filter((note) => !ids.includes(note.id));
      }
      options.selectedIds.value = [];
      if (options.activeId.value !== null && ids.includes(options.activeId.value)) {
        options.activeId.value = options.nextActiveId();
      }
      if (removed === ids.length) {
        ElMessage.success(t('board.deleteSuccess', { count: removed }));
      } else {
        ElMessage.warning(t('board.deletePartial', { count: removed }));
      }
    } finally {
      batchPending.value = false;
    }
  }

  const tagValue = computed(() => (tagTarget.value ? noteTags(tagTarget.value) : []));

  return {
    menuVisible,
    menuX,
    menuY,
    openMenu,
    closeMenu,
    handleMenuCommand,
    moveVisible,
    moveIds,
    moveFromCategory,
    confirmMove,
    tagVisible,
    tagTarget,
    tagValue,
    confirmTags,
    metaPending,
    batchPending,
    openBatchMove,
    deleteSelected,
    deleteActiveNote,
    deleteNote,
  };
}
