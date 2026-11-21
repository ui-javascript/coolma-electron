import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NoteSummary } from '@shared/types/domain';
import { exportNoteMarkdown, exportNotePng, getNote } from '@/services/ipc';
import { useNotesStore } from '@/stores/notes';
import type { NoteMenuCommand } from '@/types/noteMenu';
import { folderName, noteTags } from '@/utils/note';

interface UseNoteActionsOptions {
  /** 当前打开的笔记 id；重命名/移动/删除都要先据此决定是否 flush。 */
  activeId: Ref<number | null>;
  activeSummary: ComputedRef<NoteSummary | null>;
  selectedIds: Ref<number[]>;
  searchResults?: Ref<NoteSummary[] | null>;
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
  const moveMode = ref<'move' | 'copy'>('move');

  const tagVisible = ref(false);
  const tagTarget = ref<NoteSummary | null>(null);
  const tagResetKey = ref(0);
  let tagQueue: Promise<void> = Promise.resolve();

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

  /**
   * 按 vue2 generateUniqueNoteTitleInCategory：同目录撞名时在扩展名前补 ` (n)`，
   * 而不是固定加“副本”。复制到别的目录时通常保留原标题。
   */
  function uniqueTitleInCategory(title: string, category: string): string {
    const baseTitle = title.trim() || t('notes.untitled');
    const normalizedCategory = category || '/';
    const titleSet = new Set(
      notesStore.notes
        .filter((note) => (note.category || '/') === normalizedCategory)
        .map((note) => note.title.trim().toLowerCase()),
    );
    if (!titleSet.has(baseTitle.toLowerCase())) {
      return baseTitle;
    }

    let counter = 1;
    const lastDotIndex = baseTitle.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? baseTitle.slice(0, lastDotIndex) : baseTitle;
    const extension = lastDotIndex > 0 ? baseTitle.slice(lastDotIndex) : '';
    while (titleSet.has(`${baseName} (${counter})${extension}`.toLowerCase())) {
      counter += 1;
    }
    return `${baseName} (${counter})${extension}`;
  }

  function openCopyDialog(note: NoteSummary): void {
    moveIds.value = [note.id];
    moveFromCategory.value = note.category || '/';
    moveMode.value = 'copy';
    moveVisible.value = true;
  }

  async function copyNoteToCategory(note: NoteSummary, category: string): Promise<void> {
    if (note.id === options.activeId.value) {
      await options.flushSave();
    }
    const previousActive = notesStore.activeNote;
    const content = await readNoteContent(note.id);
    const title = uniqueTitleInCategory(note.title || t('notes.untitled'), category);
    const created = await notesStore.create({
      title,
      content,
      category,
      tags: note.tags,
    });
    if (!created) {
      ElMessage.error(notesStore.error || t('notes.copyFailed'));
      return;
    }
    // create 会把 activeNote 指向新副本；复制不应切换当前编辑对象。
    if (previousActive && previousActive.id !== created.id) {
      notesStore.activeNote = previousActive;
    }
    ElMessage.success(t('notes.copyToCategorySuccess', {
      folder: category === '/' ? t('index.all') : folderName(category, t('notes.rootFolder')),
    }));
  }

  async function readNoteContent(id: number): Promise<string> {
    const result = await getNote(id);
    return result.ok === false ? '' : result.data.content;
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
    if (options.searchResults?.value) {
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
        moveMode.value = 'move';
        moveVisible.value = true;
        break;
      case 'tags':
        tagTarget.value = note;
        tagVisible.value = true;
        break;
      case 'duplicate':
        openCopyDialog(note);
        break;
      case 'copyMarkdown':
        await copyMarkdown(note);
        break;
      case 'exportMarkdown':
        await exportMarkdown(note);
        break;
      case 'tierRanking':
        // 榜单分层还没复刻（P0 清单第 13 项），这里不静默吞掉，给个明确提示
        ElMessage.info(t('notes.tierRankingPending'));
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
    moveMode.value = 'move';
    moveVisible.value = true;
  }

  async function confirmMove(category: string): Promise<void> {
    const ids = moveIds.value;
    if (ids.length === 0) {
      return;
    }

    if (moveMode.value === 'copy') {
      const note = notesStore.notes.find((item) => item.id === ids[0]);
      if (!note) {
        return;
      }
      metaPending.value = true;
      try {
        await copyNoteToCategory(note, category);
        moveVisible.value = false;
      } finally {
        metaPending.value = false;
        moveMode.value = 'move';
      }
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

  /**
   * 标签即时保存：弹窗每次勾选/取消/输入新标签都提交完整列表。
   * 串行队列保证快速连点时后一次覆盖前一次，不会因乱序回退。
   */
  function applyTags(tags: string[]): void {
    const noteId = tagTarget.value?.id;
    if (noteId == null) {
      return;
    }
    const snapshot = [...tags];
    tagQueue = tagQueue
      .then(async () => {
        try {
          for (const name of snapshot) {
            const known = notesStore.tags.some(
              (tag) => tag.name.toLowerCase() === name.toLowerCase(),
            );
            if (!known) {
              const created = await notesStore.createTag(name);
              if (!created) {
                throw new Error(notesStore.error || t('tag.createFailed'));
              }
            }
          }
          const saved = await notesStore.setTags(noteId, snapshot);
          if (!saved) {
            throw new Error(notesStore.error || t('notes.saveFailed'));
          }
        } catch (error) {
          ElMessage.error((error as Error).message || t('notes.saveFailed'));
          // 写失败时让弹窗按笔记里的真实标签回滚乐观勾选。
          tagResetKey.value += 1;
        }
      })
      .catch(() => undefined);
  }

  async function deleteTagFromDialog(tag: { id: number; name: string }): Promise<void> {
    const noteCount = notesStore.tags.find((item) => item.id === tag.id)?.noteCount ?? 0;
    try {
      await ElMessageBox.confirm(
        t('aiTagDeleteConfirm', { name: tag.name, count: noteCount }),
        t('aiTagDelete'),
        { type: 'warning', confirmButtonText: t('action.confirm'), cancelButtonText: t('action.cancel') },
      );
    } catch {
      return;
    }

    tagQueue = tagQueue
      .then(async () => {
        try {
          const deleted = await notesStore.deleteTag(tag.id);
          if (!deleted) {
            throw new Error(notesStore.error || t('tag.deleteFailed'));
          }
          // 后端会同时从各笔记 tags 串里摘掉该标签，重载列表让弹窗与列表同步。
          await notesStore.loadAll();
          tagResetKey.value += 1;
          ElMessage.success(t('tag.deleteSuccess'));
        } catch (error) {
          ElMessage.error((error as Error).message || t('tag.deleteFailed'));
        }
      })
      .catch(() => undefined);
  }

  /** 打开当前笔记的标签编辑器（复刻 vue2 点标题开 TagDialog）。 */
  function openTagDialog(note?: NoteSummary | null): void {
    const target = note ?? options.activeSummary.value ?? menuNote.value;
    if (!target) {
      return;
    }
    tagTarget.value = target;
    tagVisible.value = true;
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
      if (options.searchResults?.value) {
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

  const tagValue = computed(() => {
    const id = tagTarget.value?.id;
    if (id == null) {
      return [];
    }
    const note = notesStore.notes.find((item) => item.id === id);
    return note ? noteTags(note) : [];
  });

  return {
    menuNote,
    menuVisible,
    menuX,
    menuY,
    openMenu,
    closeMenu,
    handleMenuCommand,
    moveVisible,
    moveIds,
    moveFromCategory,
    moveMode,
    confirmMove,
    tagVisible,
    tagTarget,
    tagValue,
    tagResetKey,
    applyTags,
    deleteTagFromDialog,
    openTagDialog,
    metaPending,
    batchPending,
    openBatchMove,
    deleteSelected,
    deleteActiveNote,
    deleteNote,
  };
}
